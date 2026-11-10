import * as THREE from 'three';
import { QUESTIONS } from './questions.js';

// =====================================================================================
// Config & helpers
// =====================================================================================
const CFG = await fetch('/config.json').then(r => r.json()).catch(() => ({}));
const C = {
  cityName: CFG.cityName || 'Wissens-City',
  roundMinutes: CFG.roundMinutes || 20,
  timerBonus: CFG.timerBonus || { enabled: true, coinsPerSecond: 30 },
  coinGoal: CFG.coinGoal || { names: ['Stadion'], target: 5000 },
  likeGoal: CFG.likeGoal || { names: ['Löwen-Statue'], target: 10000 },
  quiz: Object.assign({ everySeconds: 70, answerSeconds: 20, pointsCorrect: 10, pointsFirst: 0, timeCorrectSeconds: 0.2, timeWrongSeconds: 0.5, minSecondsLeft: 30 }, CFG.quiz || {}),
  likesPerBP: CFG.likesPerBuildPoint || 50,
  levels: Object.assign({ pointsPerLevel: 100, bonusEveryLevels: 1, bonusSecondsPerLevel: 1 }, CFG.levels || {}),
  bigGifts: CFG.bigGifts || { fireworksFrom: 100, megaFrom: 1000 },
  follow: CFG.follow || { bonusPoints: 0 },
  share: CFG.share || { bonusPoints: 10, maxPerUserPerRound: 3 },
  happy: CFG.happyHour || { multiplier: 2, randomEveryMinutes: [2, 2], randomDurationMinutes: [1, 2, 3, 4], triggerCoins: 1000, triggerMinutes: 4 },
  joinWords: (CFG.joinWords || ['haus', 'join', 'mitmachen']).map(s => s.toLowerCase()),
};
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('de-DE');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const DEMO = new URLSearchParams(location.search).has('demo');
$('cityName').textContent = C.cityName;

// stage scaling (1080x1920 stage fitted into any window)
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  $('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit); fit();

// =====================================================================================
// Game rules
// =====================================================================================
// Level = every 100 build points (Level 10 = 1.000, Level 20 = 2.000 …), no upper limit
const PPL = () => C.levels.pointsPerLevel;
const levelFor = bp => Math.floor(bp / PPL());
const levelProgress = bp => (bp % PPL()) / PPL();
function levelName(l) {
  if (l <= 0) return 'Baustelle';
  const small = ['', 'Zelt', 'Hütte', 'Häuschen', 'Stadthaus', 'Villa'];
  if (l <= 5) return small[l];
  if (l < 10) return 'Große Villa';
  if (l < 20) return 'Hochhaus';
  if (l < 30) return 'Gold-Turm';
  if (l < 40) return 'Löwen-Turm';
  if (l < 50) return 'Diamant-Turm';
  return 'Weltwunder';
}

const state = {
  players: new Map(),            // id -> {id, nick, avatar, bp, level, plot, likes}
  coins: 0, likes: 0, coinGoalIdx: 0, likeGoalIdx: 0, coinBase: 0, likeBase: 0,
  coinTarget: C.coinGoal.target, likeTarget: C.likeGoal.target,
  roundEnd: Date.now() + C.roundMinutes * 60000,
  lastGifts: [], built: [],      // community buildings
  happyUntil: 0,                 // Happy Hour end (timestamp)
};

// =====================================================================================
// THREE.js city
// =====================================================================================
const canvas = $('city');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(1080, 1920, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1024);
scene.fog = new THREE.Fog(0x0b1024, 90, 210);
const camera = new THREE.PerspectiveCamera(42, 1080 / 1920, 1, 600);

scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x2a3a24, 1.0));
const moon = new THREE.DirectionalLight(0xc8d4ff, 1.5);
moon.position.set(-60, 90, 40); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 260 });
scene.add(moon);
const warm = new THREE.PointLight(0xffb060, 1.2, 140, 1.2); warm.position.set(0, 25, 0); scene.add(warm);
const partyLights = [0, 1, 2].map(() => { const L = new THREE.PointLight(0xff00ff, 0, 120, 1.1); scene.add(L); return L; });
const nightBg = new THREE.Color(0x0b1024), happyBg = new THREE.Color();

// layout: blocks of 2x2 plots separated by roads
const BX = 6, BZ = 8;               // blocks
const PLOT = 7, ROAD = 6;           // sizes
const BLOCK = PLOT * 2;
const W = BX * BLOCK + (BX + 1) * ROAD, D = BZ * BLOCK + (BZ + 1) * ROAD;
const plots = [];                   // {x, z, owner, group}
const PLAZA = { bx: [2, 3], bz: [3, 4] };   // central blocks reserved for community buildings
for (let bz = 0; bz < BZ; bz++) for (let bx = 0; bx < BX; bx++) {
  if (PLAZA.bx.includes(bx) && PLAZA.bz.includes(bz)) continue;
  const x0 = -W / 2 + ROAD + bx * (BLOCK + ROAD), z0 = -D / 2 + ROAD + bz * (BLOCK + ROAD);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) plots.push({ x: x0 + PLOT * (i + .5), z: z0 + PLOT * (j + .5), owner: null, group: null });
}
// sort plots by distance to the centre -> first players get central plots
plots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
$('statPlots').textContent = plots.length;

// ground, roads, plaza
const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, D + 80), new THREE.MeshStandardMaterial({ color: 0x24382a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: .95 });
const lineMat = new THREE.MeshBasicMaterial({ color: 0x9aa0aa });
for (let bx = 0; bx <= BX; bx++) {
  const x = -W / 2 + ROAD / 2 + bx * (BLOCK + ROAD);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, D), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, .02, 0); r.receiveShadow = true; scene.add(r);
  for (let z = -D / 2 + 2; z < D / 2; z += 5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(.25, 2), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, .04, z); scene.add(l); }
}
for (let bz = 0; bz <= BZ; bz++) {
  const z = -D / 2 + ROAD / 2 + bz * (BLOCK + ROAD);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(W, ROAD), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(0, .03, z); r.receiveShadow = true; scene.add(r);
  for (let x = -W / 2 + 2; x < W / 2; x += 5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(2, .25), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, .05, z); scene.add(l); }
}
const plotMat = new THREE.MeshStandardMaterial({ color: 0x3f7a45, roughness: 1 });
for (const p of plots) { const g = new THREE.Mesh(new THREE.BoxGeometry(PLOT - .8, .2, PLOT - .8), plotMat); g.position.set(p.x, .1, p.z); g.receiveShadow = true; scene.add(g); }
const plazaSize = 2 * BLOCK + ROAD;
const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaSize, .3, plazaSize), new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: .8 }));
plaza.receiveShadow = true; scene.add(plaza);
const plazaCenter = new THREE.Vector3(-W / 2 + ROAD + 2 * (BLOCK + ROAD) + plazaSize / 2, 0, -D / 2 + ROAD + 3 * (BLOCK + ROAD) + plazaSize / 2);
plaza.position.set(plazaCenter.x, .15, plazaCenter.z);

// glow sprite texture
function radialTexture(inner = 'rgba(255,220,150,1)', outer = 'rgba(255,160,60,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(.25, inner.replace(/[\d.]+\)$/, '.5)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const glowTex = radialTexture();
const sparkTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

// street lamps (cheap: pole + glowing sprite)
const poleMat = new THREE.MeshStandardMaterial({ color: 0x333842 });
for (let bx = 0; bx <= BX; bx++) for (let bz = 0; bz <= BZ; bz++) {
  const x = -W / 2 + ROAD / 2 + bx * (BLOCK + ROAD) + ROAD / 2 - .6, z = -D / 2 + ROAD / 2 + bz * (BLOCK + ROAD) + ROAD / 2 - .6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 4.5), poleMat); pole.position.set(x, 2.25, z); scene.add(pole);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(5, 5, 1); s.position.set(x, 4.6, z); scene.add(s);
}
// trees
const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: .9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22 });
for (let i = 0; i < 60; i++) {
  const r = hash('tree' + i);
  const x = (r % 1000) / 1000 * (W + 60) - (W + 60) / 2, z = ((r >> 10) % 1000) / 1000 * (D + 60) - (D + 60) / 2;
  if (Math.abs(x) < W / 2 + 2 && Math.abs(z) < D / 2 + 2) continue;
  const t = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, 2), trunkMat); tr.position.y = 1; t.add(tr);
  const cr = new THREE.Mesh(new THREE.ConeGeometry(2, 4.5, 7), treeMat); cr.position.y = 4; cr.castShadow = true; t.add(cr);
  t.position.set(x, 0, z); scene.add(t);
}

// ---------- house generator ----------
const PALETTE = [0xe8d5b0, 0xd98b6a, 0x8fb3d9, 0xf2c14e, 0xb7d98f, 0xd9a3c7, 0xf0f0f0, 0x9a8fd9, 0xe07a5f, 0x81b29a];
const ROOFS = [0x8a2d2d, 0x3a3f5a, 0x5a3a22, 0x2d5a4a, 0x7a4a8a];
const winTexCache = new Map();
function windowTexture(floors, cols) {
  const k = floors + 'x' + cols;
  if (winTexCache.has(k)) return winTexCache.get(k);
  const c = document.createElement('canvas'); c.width = 64 * cols; c.height = 64 * floors;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let f = 0; f < floors; f++) for (let w = 0; w < cols; w++) {
    const lit = (hash(k + f + '_' + w) % 10) < 7;
    g.fillStyle = lit ? '#ffcf70' : '#1a1f30'; g.fillRect(w * 64 + 16, f * 64 + 14, 32, 34);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; winTexCache.set(k, t); return t;
}
function box(w, h, d, color, floors = 0, cols = 0) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .8 });
  if (floors) { mat.emissiveMap = windowTexture(floors, cols); mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.1; }
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function roof(w, d, h, color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .75, h, 4), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  m.rotation.y = Math.PI / 4; m.castShadow = true; return m;
}
function buildHouse(level, seed) {
  const g = new THREE.Group();
  const col = PALETTE[seed % PALETTE.length], rc = ROOFS[(seed >>> 4) % ROOFS.length];
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const glowSprite = (color, size, y) => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.set(size, size, 1); return add(h, 0, y, 0); };
  const beam = (color, height, y0) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.35, 1.2, height, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); return add(b, 0, y0 + height / 2, 0); };
  const L = level;
  if (L <= 6) {
    switch (L) {
      case 0:
        add(box(4.5, .3, 4.5, 0x8a6a3a), 0, .15, 0);
        for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) add(box(.25, 2.2, .25, 0xf2c14e), x, 1.1, z);
        add(box(4, .25, .25, 0xf2c14e), 0, 2.1, -1.8); break;
      case 1: { const t = new THREE.Mesh(new THREE.ConeGeometry(2, 2.8, 4), new THREE.MeshStandardMaterial({ color: col })); t.castShadow = true; add(t, 0, 1.4, 0); break; }
      case 2: add(box(3.2, 2.2, 3.2, col, 1, 2), 0, 1.1, 0); add(roof(3.2, 3.2, 1.8, rc), 0, 3.1, 0); break;
      case 3: add(box(4, 3, 3.6, col, 1, 3), 0, 1.5, 0); add(roof(4, 3.6, 2.2, rc), 0, 4.1, 0); add(box(.5, 1.6, .5, 0x777777), 1.2, 4.6, .6); break;
      case 4: add(box(4.2, 5.2, 4.2, col, 2, 3), 0, 2.6, 0); add(roof(4.2, 4.2, 2.4, rc), 0, 6.4, 0); break;
      case 5: add(box(5.6, 4, 4, col, 2, 4), 0, 2, -.4); add(roof(5.6, 4, 2.2, rc), 0, 5.1, -.4); add(box(2.4, .2, 1.6, 0x3aa0ff), 1.5, .25, 2.2); break;
      default: add(box(5.8, 6, 3.8, col, 3, 4), 0, 3, -.6); add(box(2.6, 4, 2.6, col, 2, 2), -1.6, 2, 1.8);
        add(roof(5.8, 3.8, 2.4, rc), 0, 7.2, -.6); add(roof(2.6, 2.6, 1.6, rc), -1.6, 4.8, 1.8); add(box(2.4, .2, 1.6, 0x3aa0ff), 1.8, .25, 2.2);
    }
    return g;
  }
  if (L < 10) { // Große Villa + growing garden (hedge, trees, lights)
    add(box(5.8, 6, 3.8, col, 3, 4), 0, 3, -.6); add(box(2.6, 4, 2.6, col, 2, 2), -1.6, 2, 1.8);
    add(roof(5.8, 3.8, 2.4, rc), 0, 7.2, -.6); add(roof(2.6, 2.6, 1.6, rc), -1.6, 4.8, 1.8);
    add(box(2.4, .2, 1.6, 0x3aa0ff), 1.8, .25, 2.2);
    add(box(6.4, .8, .4, 0x2f7a3a), 0, .4, 3.1); add(box(.4, .8, 6.4, 0x2f7a3a), -3.1, .4, 0); add(box(.4, .8, 6.4, 0x2f7a3a), 3.1, .4, 0);
    for (let i = 0; i < L - 6; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(.7, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9a4a })); add(t, -2.6 + i * 1.7, 1.4, -2.8); }
    if (L >= 8) { glowSprite(0xffd890, 3, 1.5).position.set(2.6, 1.5, 2.6); glowSprite(0xffd890, 3, 1.5).position.set(-2.6, 1.5, 2.6); }
    if (L >= 9) add(box(.15, 2.5, .15, 0xdddddd), 2.6, 8.5, -.6), glowSprite(0xff4040, 2, 9.8).position.set(2.6, 9.8, -.6);
    return g;
  }
  if (L < 20) { // Hochhaus – grows one floor per level
    const floors = 6 + (L - 10), h = floors * 2;
    add(box(4.6, h, 4.6, 0x9fb0c8, floors, 3), 0, h / 2, 0);
    add(box(5.2, .4, 5.2, 0x5a6478), 0, h + .2, 0);
    if (L >= 13) { const a = add(box(.2, 3.5, .2, 0xcccccc), 1.4, h + 2, 1.4); glowSprite(0xff3030, 2.2, h + 3.8).position.set(1.4, h + 3.8, 1.4); }
    if (L >= 16) { const hp = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, .2, 24), new THREE.MeshStandardMaterial({ color: 0x333a48 })); add(hp, -.6, h + .5, -.6); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, .08, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f })); ring.rotation.x = Math.PI / 2; add(ring, -.6, h + .65, -.6); }
    if (L >= 18) add(box(3, 4, 3, 0x8a9cb8, 2, 2), 0, h + 2.4, 0);
    return g;
  }
  const gold = 0xffc23a;
  const goldMat = new THREE.MeshStandardMaterial({ color: gold, emissive: 0xff9a00, emissiveIntensity: .7, metalness: .6, roughness: .3 });
  if (L < 30) { // Gold-Turm
    const floors = 14 + (L - 20), h = floors * 2;
    add(box(5, h, 5, gold, floors, 3), 0, h / 2, 0); add(box(3.8, 3, 3.8, 0xfff0b0, 1, 2), 0, h + 1.5, 0);
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) add(new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 8), goldMat), x, h + .5, z);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1, 5, 8), goldMat); add(spire, 0, h + 5.5, 0);
    glowSprite(0xffc040, 10, h + 5);
    if (L >= 25) beam(0xffd070, 40, h + 6);
    return g;
  }
  if (L < 40) { // Löwen-Turm
    const floors = 20 + Math.floor((L - 30) / 1), h = floors * 2;
    add(box(5.2, h, 5.2, gold, floors, 3), 0, h / 2, 0); add(box(4, 3, 4, 0xfff0b0, 1, 2), 0, h + 1.5, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 16), goldMat), 0, h + 4.6, 0);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(1.9, .6, 10, 24), new THREE.MeshStandardMaterial({ color: 0xc87a1a, metalness: .5, roughness: .4, emissive: 0x552200 })); add(mane, 0, h + 4.6, 0);
    glowSprite(0xffc040, 18, h + 4.6);
    if (L >= 35) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, .15, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe080 })); ring.rotation.x = Math.PI / 2.4; add(ring, 0, h + 4.6, 0); }
    beam(0xffd070, 50, h + 6);
    return g;
  }
  // Diamant-Turm (40+) / Weltwunder (50+)
  const floors = Math.min(40, 30 + Math.floor((L - 40) / 2)), h = floors * 2;
  const crystal = new THREE.MeshStandardMaterial({ color: 0x9ef0ff, emissive: 0x2299cc, emissiveIntensity: .8, metalness: .3, roughness: .1, transparent: true, opacity: .9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, h, 6), crystal); body.castShadow = true; add(body, 0, h / 2, 0);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), crystal); add(gem, 0, h + 3.2, 0);
  glowSprite(0x7fe8ff, 20, h + 3.2);
  beam(L >= 50 ? 0xff7ad9 : 0x7fe8ff, 60, h + 5);
  if (L >= 50) { glowSprite(0xff5aa0, 26, h + 3.2); glowSprite(0xffd23f, 32, h + 3.2); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(4 + i, .12, 8, 48), new THREE.MeshBasicMaterial({ color: [0xff5aa0, 0xffd23f, 0x3ddc84][i] })); r.rotation.x = Math.PI / 2 + i * .4; add(r, 0, h + 3.2, 0); } }
  return g;
}


// name labels
function label(text, level, prog = 0) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 168;
  const g = c.getContext('2d');
  const big = level >= 20;
  g.font = '700 52px Fredoka, Arial'; const w = Math.min(500, Math.max(260, g.measureText(text).width + 70));
  g.fillStyle = big ? 'rgba(120,80,0,.88)' : level >= 10 ? 'rgba(30,50,90,.88)' : 'rgba(10,12,28,.82)';
  g.beginPath(); g.roundRect((512 - w) / 2, 8, w, 150, 34); g.fill();
  g.strokeStyle = big ? '#ffd23f' : level >= 10 ? '#7fc8ff' : 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 56, w - 40);
  g.font = '700 34px Fredoka, Arial'; g.fillStyle = big ? '#ffe9a0' : '#ffd23f'; g.fillText(`Lv ${level}`, 256 - w / 2 + 70, 118);
  const bx = 256 - w / 2 + 130, bw = w - 160;                       // progress to next level
  g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.roundRect(bx, 106, bw, 24, 12); g.fill();
  g.fillStyle = '#3ddc84'; g.beginPath(); g.roundRect(bx, 106, Math.max(24, bw * prog), 24, 12); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, sizeAttenuation: false }));
  const k = big ? 1.2 : 1; s.scale.set(.095 * k, .031 * k, 1); s.renderOrder = 10; return s;
}
function refreshLabel(pl) {
  const g = pl.plot?.group; if (!g || !g.userData.label) return;
  const old = g.userData.label; const lb = label(pl.nick.slice(0, 16), Math.max(0, pl.level), levelProgress(pl.bp));
  lb.position.copy(old.position); g.remove(old); old.material.map.dispose(); old.material.dispose(); g.add(lb); g.userData.label = lb;
}

// animations registry
const anims = [];
function animate(dur, fn, done) { anims.push({ t0: performance.now(), dur, fn, done }); }
const easeOutBack = x => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// particles
const particles = [];
function burst(pos, color = 0xffd23f, n = 40, speed = 14, size = 1.4) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
    const a = Math.random() * Math.PI * 2, e = Math.random() * .9 + .2;
    particles.push({ s, v: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e) * 1.3, Math.sin(a) * Math.cos(e)).multiplyScalar(speed * (.5 + Math.random())), life: 1.2 + Math.random() * .6, age: 0 });
  }
}
function fireworks(center, count = 6) {
  for (let k = 0; k < count; k++) setTimeout(() => {
    const p = center.clone().add(new THREE.Vector3((Math.random() - .5) * 40, 25 + Math.random() * 15, (Math.random() - .5) * 40));
    burst(p, [0xff5aa0, 0xffd23f, 0x33d6d6, 0x8a7dff, 0x3ddc84][k % 5], 60, 16, 1.8); sfx('boom');
  }, k * 380);
}

// =====================================================================================
// Players & building
// =====================================================================================
function freePlot() {
  let p = plots.find(p => !p.owner);
  if (!p) { // city full -> replace the smallest house
    let worst = null;
    for (const pl of state.players.values()) if (pl.plot && (!worst || pl.bp < worst.bp)) worst = pl;
    if (worst) { removeHouse(worst); p = plots.find(p => !p.owner); }
  }
  return p;
}
function removeHouse(pl) { if (!pl.plot) return; scene.remove(pl.plot.group); pl.plot.owner = null; pl.plot.group = null; pl.plot = null; }

function ensurePlayer(id, nick, avatar) {
  let pl = state.players.get(id);
  if (!pl) {
    pl = { id, nick: nick || id, avatar: avatar || '', bp: 0, level: -1, plot: null, likes: 0, shares: 0 };
    state.players.set(id, pl);
    const p = freePlot(); if (!p) return pl;
    pl.plot = p; p.owner = pl;
    placeHouse(pl, 0, false);
    toast(`👋 <b>${esc(pl.nick)}</b> zieht in die Stadt!`);
  } else if (nick) pl.nick = nick;
  return pl;
}
function placeHouse(pl, level, celebrate) {
  const p = pl.plot; if (!p) return;
  if (p.group) scene.remove(p.group);
  const g = new THREE.Group(); g.position.set(p.x, .2, p.z);
  const h = buildHouse(level, hash(pl.id)); g.add(h);
  const top = Math.min(new THREE.Box3().setFromObject(h).max.y, level >= 25 ? 60 : 200);
  pl.top = top;
  const lb = label(pl.nick.slice(0, 16), level, levelProgress(pl.bp)); lb.position.y = top + 2.2; g.add(lb); g.userData.label = lb;
  scene.add(g); p.group = g; pl.level = level;
  h.scale.set(1, .01, 1);
  animate(900, x => h.scale.set(1, Math.max(.01, easeOutBack(x)), 1));
  if (celebrate) {
    burst(new THREE.Vector3(p.x, top * .6, p.z), level >= 20 ? 0xffd23f : 0x8affc8, Math.min(120, 30 + level * 4));
    if (level >= 1) { if (level >= 3) focusOn(new THREE.Vector3(p.x, 0, p.z), Math.min(top, 50)); banner(`LEVEL ${level}!`, `${levelName(level)} · ${pl.nick}${celebrate.bonus ? ` · +${celebrate.bonus} Sek.` : ''}`); sfx('level'); }
    else sfx('build');
  }
}
function addBP(pl, amount) {
  if (!pl) return;
  pl.bp += amount;
  const lv = levelFor(pl.bp), before = Math.max(0, pl.level);
  if (lv !== pl.level) {
    // level bonus for the whole city: reaching level N adds N seconds (Level 9 = +9 s, Level 10 = +10 s …)
    let bonus = 0; const every = C.levels.bonusEveryLevels;
    for (let m = Math.floor(before / every) + 1; m <= Math.floor(lv / every); m++) bonus += m * every * C.levels.bonusSecondsPerLevel;
    placeHouse(pl, lv, { bonus });
    if (bonus > 0) {
      state.roundEnd += bonus * 1000;
      timerBonus(`+${bonus} Sek. · ${pl.nick} Lv ${lv}`);
      // big shout-out only for the round numbers (10, 20, 30 …) so it doesn't get spammy
      if (Math.floor(lv / 10) > Math.floor(before / 10))
        shout(`🏆 <b>${esc(pl.nick)}</b> erreicht Level ${lv}! <b>+${bonus} Sekunden</b> für die ganze Stadt ⏳`, 'gold', pl.avatar);
    }
  } else refreshLabel(pl);
  dirty = true;
  scheduleRanking();
}

// =====================================================================================
// Top-3 announcements (friendly shout-outs when someone climbs or drops)
// =====================================================================================
const RANK_TEXT = {
  0: [
    '👑 <b>{new}</b> erobert den Thron! <b>{old}</b> wird ganz sanft vom Thron geschubst – Revanche gefällig? 😄',
    '👑 Neue Nummer 1 der Stadt: <b>{new}</b>! <b>{old}</b>, dein Thron wartet schon auf dich 😉',
    '👑 <b>{new}</b> sitzt jetzt ganz oben! <b>{old}</b> macht höflich Platz – noch ist nichts entschieden 💪',
    '👑 Thronwechsel! <b>{new}</b> regiert jetzt die Stadt – <b>{old}</b>, das war ein starkes Duell 👏',
  ],
  1: [
    '🥈 <b>{new}</b> schiebt sich auf Platz 2! <b>{old}</b> rutscht kurz eins runter – weiter geht’s! 🙌',
    '🥈 Platz 2 für <b>{new}</b>! <b>{old}</b>, den holst du dir bestimmt zurück 😄',
    '🥈 <b>{new}</b> überholt <b>{old}</b> und ist jetzt Zweite/r – Respekt! ✨',
  ],
  2: [
    '🥉 <b>{new}</b> ist neu in den Top 3! <b>{old}</b>, bleib dran – das war knapp! 🍀',
    '🥉 Willkommen in den Top 3, <b>{new}</b>! <b>{old}</b> macht kurz Pause auf Platz 4 😉',
    '🥉 <b>{new}</b> klettert aufs Treppchen! <b>{old}</b>, gleich zurückholen? 💪',
  ],
};
let lastTop = [], rankTimer = null, lastRankShout = 0;
const top3Ids = () => [...state.players.values()].filter(p => p.bp > 0).sort((a, b) => b.bp - a.bp).slice(0, 3).map(p => p.id);
function scheduleRanking() { clearTimeout(rankTimer); rankTimer = setTimeout(checkRanking, 1500); }  // wait until combos are done
function checkRanking() {
  const now = top3Ids();
  if (Date.now() - lastRankShout < 5000) { rankTimer = setTimeout(checkRanking, 5000 - (Date.now() - lastRankShout)); return; }
  for (let r = 0; r < 3; r++) {
    const neu = now[r], old = lastTop[r];
    if (!neu || !old || neu === old) continue;
    const pNew = state.players.get(neu), pOld = state.players.get(old);
    if (!pNew || !pOld) continue;
    const pool = RANK_TEXT[r];
    const text = pool[Math.floor(Math.random() * pool.length)].replace('{new}', esc(pNew.nick)).replace('{old}', esc(pOld.nick));
    shout(text, r === 0 ? 'gold' : r === 1 ? 'teal' : 'pink', pNew.avatar);
    if (pNew.plot) burst(new THREE.Vector3(pNew.plot.x, (pNew.top || 4) + 3, pNew.plot.z), r === 0 ? 0xffd23f : 0xc0e8ff, r === 0 ? 70 : 35);
    sfx(r === 0 ? 'throne' : 'rank');
    lastRankShout = Date.now();
    break;                                        // only the most important change at a time
  }
  lastTop = now;
}

// =====================================================================================
// Events from TikTok (or simulator)
// =====================================================================================
function handle(ev) {
  switch (ev.type) {
    case 'status': {
      const el = $('conn');
      if (ev.demo) { el.classList.add('hidden'); if (!DEMO) showSim(true); break; }
      el.textContent = (ev.connected ? '✅ ' : '⚠️ ') + ev.message; el.classList.toggle('ok', !!ev.connected); el.classList.remove('hidden');
      if (ev.connected) setTimeout(() => el.classList.add('hidden'), 5000);
      break;
    }
    case 'chat': {
      const t = (ev.text || '').trim().toLowerCase();
      const m = t.match(/^(?:antwort\s*)?([abc])\s*[).!:]*\s*$/);
      if (m && quiz.active) { quizAnswer(ev, 'abc'.indexOf(m[1])); break; }
      if (C.joinWords.some(w => t.includes(w))) ensurePlayer(ev.user, ev.nick, ev.avatar);
      break;
    }
    case 'gift': {
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar);
      const coins = ev.coins || 1;
      addBP(pl, coins * mult());
      state.coins += coins;
      if (C.timerBonus.enabled) {
        // coins are collected, so small gifts (e.g. single roses) also add time
        state.timerCarry = (state.timerCarry || 0) + coins;
        const secs = Math.floor(state.timerCarry / C.timerBonus.coinsPerSecond);
        if (secs > 0) { state.timerCarry -= secs * C.timerBonus.coinsPerSecond; state.roundEnd += secs * 1000; timerBonus(`+${secs} Sek. · ${pl.nick}`); }
      }
      state.lastGifts.unshift({ nick: pl.nick, gift: ev.giftName, count: ev.count, bp: coins, img: ev.giftImage || '' });
      state.lastGifts.length = Math.min(state.lastGifts.length, 3);
      toast(`${giftHtml(ev.giftName, ev.giftImage)} <b>${esc(pl.nick)}</b> hat ${esc(ev.giftName)} gesendet${happyOn() ? ' · <b>x' + C.happy.multiplier + '</b> 🎉' : ''}`, ev.count > 1 ? `×${ev.count}` : '', ev.avatar);
      if (coins >= C.happy.triggerCoins) startHappy(C.happy.triggerMinutes, pl.nick, coins >= C.bigGifts.megaFrom ? 3700 : 0);
      if (coins >= C.bigGifts.megaFrom) megaGift(pl, ev, coins);
      else if (coins >= C.bigGifts.fireworksFrom) {
        if (pl.plot) fireworks(new THREE.Vector3(pl.plot.x, 0, pl.plot.z).add(new THREE.Vector3(0, -15, 0)), 3);
        shout(`🎆 <b>${esc(pl.nick)}</b> schickt ${giftHtml(ev.giftName, ev.giftImage)} ${esc(ev.giftName)}! Danke! 🦁`, 'gold');
      }
      checkGoals(); dirty = true; sfx('gift');
      break;
    }
    case 'follow': {
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar);
      if (C.follow.bonusPoints) addBP(pl, C.follow.bonusPoints);
      shout(`❤️ Danke fürs Folgen, <b>${esc(pl.nick)}</b>!${C.follow.bonusPoints ? ` +${C.follow.bonusPoints} Baupunkte` : ' Willkommen in der Stadt 🏠'}`, 'pink', ev.avatar);
      sfx('follow');
      break;
    }
    case 'share': {
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar);
      if (pl.shares < C.share.maxPerUserPerRound) {
        pl.shares++; addBP(pl, C.share.bonusPoints * mult());
        shout(`🔁 <b>${esc(pl.nick)}</b> hat geteilt! +${C.share.bonusPoints} Baupunkte 🏗️`, 'teal', ev.avatar);
        if (pl.plot) burst(new THREE.Vector3(pl.plot.x, 6, pl.plot.z), 0x33d6d6, 40);
      } else shout(`🔁 Danke fürs Teilen, <b>${esc(pl.nick)}</b>!`, 'teal', ev.avatar);
      sfx('share');
      break;
    }
    case 'like': {
      state.likes += ev.count || 1;
      const pl = state.players.get(ev.user);
      if (pl) { pl.likes += ev.count || 1; while (pl.likes >= C.likesPerBP) { pl.likes -= C.likesPerBP; addBP(pl, 1); } }
      checkGoals(); dirty = true;
      break;
    }
  }
}
// =====================================================================================
// Happy Hour
// =====================================================================================
const happyOn = () => Date.now() < state.happyUntil;
const mult = () => happyOn() ? C.happy.multiplier : 1;
let nextRandomHappy = Date.now() + randMinutes(C.happy.randomEveryMinutes);
function randMinutes([a, b]) { return (a + Math.random() * (b - a)) * 60000; }
function startHappy(minutes, byNick = '', delay = 0) {
  const wasOn = happyOn();
  state.happyUntil = Math.max(state.happyUntil, Date.now() + minutes * 60000);
  const total = Math.round((state.happyUntil - Date.now()) / 60000);
  setTimeout(() => {
    if (!happyOn()) return;                       // city was reset in the meantime
    banner('🎉 HAPPY HOUR!', `${total} Minute${total === 1 ? '' : 'n'} · alle Baupunkte x${C.happy.multiplier}${byNick ? ' · dank ' + byNick : ''}`, wasOn ? '' : 'happy');
    if (byNick) shout(`🎉 <b>${esc(byNick)}</b> startet ${minutes} Min. Happy Hour – alles x${C.happy.multiplier}!`, 'pink');
    fireworks(plazaCenter, 6); sfx('happy');
  }, delay);
  dirty = true;
  nextRandomHappy = state.happyUntil + randMinutes(C.happy.randomEveryMinutes);
}
function updateHappy(t) {
  const on = happyOn(), el = $('happy');
  if (!on && Date.now() > nextRandomHappy && !quiz.active) {
    const d = C.happy.randomDurationMinutes; startHappy(d[Math.floor(Math.random() * d.length)]);
  }
  if (on) {
    const rest = state.happyUntil - Date.now();
    $('happyTime').textContent = `${Math.floor(rest / 60000)}:${String(Math.floor(rest / 1000) % 60).padStart(2, '0')}`;
    $('happyMult').textContent = 'x' + C.happy.multiplier;
    el.classList.remove('hidden');
  } else if (!el.classList.contains('hidden')) {
    el.classList.add('hidden'); shout('⏰ Happy Hour vorbei – danke an alle! 🦁', 'teal');
  }
  // party lights over the city
  const k = on ? 1 : 0;
  partyLights.forEach((L, i) => {
    L.intensity += ((on ? 2.2 : 0) - L.intensity) * .05;
    const a = t * .0007 + i * 2.09;
    L.position.set(Math.cos(a) * 45, 22, Math.sin(a) * 55);
    L.color.setHSL((t * .0001 + i / 3) % 1, 1, .55);
  });
  scene.background.lerp(on ? happyBg.setHSL((t * .00005) % 1, .55, .12) : nightBg, .03);
  return k;
}
const giftHtml = (name, img) => img ? `<img class="gimg" src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : giftIcon(name);
function megaGift(pl, ev, coins) {
  // city-wide fireworks + flash + big thank-you
  const flash = $('flash'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  for (let k = 0; k < 4; k++) setTimeout(() => fireworks(new THREE.Vector3((Math.random() - .5) * 80, -10, (Math.random() - .5) * 100), 5), k * 900);
  banner(`${giftIcon(ev.giftName) === '🎁' ? '🎁' : giftIcon(ev.giftName)} ${String(ev.giftName).toUpperCase()}!`, `von ${pl.nick} – DANKE! 🦁`, 'mega');
  shout(`👑 <b>${esc(pl.nick)}</b> ist ein Held der Stadt! ${giftHtml(ev.giftName, ev.giftImage)} ${fmt(coins)} Coins`, 'gold', ev.avatar);
  sfx('mega');
}
const shoutQueue = []; let shoutBusy = false;
function shout(html, color = 'gold', avatar = '') { shoutQueue.push({ html, color, avatar }); if (!shoutBusy) nextShout(); }
function nextShout() {
  const it = shoutQueue.shift(); const el = $('shout');
  if (!it) { shoutBusy = false; el.classList.add('hidden'); return; }
  shoutBusy = true;
  el.className = 'shout ' + it.color;
  el.innerHTML = (it.avatar ? `<img src="${esc(it.avatar)}" alt="" referrerpolicy="no-referrer">` : '') + `<span>${it.html}</span>`;
  void el.offsetWidth; el.classList.add('in');
  setTimeout(nextShout, shoutQueue.length > 3 ? 1600 : 3000);
}
const giftIcon = n => /rose/i.test(n || '') ? '🌹' : /lion|löwe/i.test(n || '') ? '🦁' : /universe|universum|galaxy|galaxie/i.test(n || '') ? '🌌' : '🎁';

function checkGoals() {
  while (state.coins >= state.coinTarget) {
    const name = C.coinGoal.names[state.coinGoalIdx % C.coinGoal.names.length];
    buildCommunity('coin', name); state.coinGoalIdx++; state.coinBase = state.coinTarget; state.coinTarget += Math.round(C.coinGoal.target * Math.pow(1.5, state.coinGoalIdx));
  }
  while (state.likes >= state.likeTarget) {
    const name = C.likeGoal.names[state.likeGoalIdx % C.likeGoal.names.length];
    buildCommunity('like', name); state.likeGoalIdx++; state.likeBase = state.likeTarget; state.likeTarget += Math.round(C.likeGoal.target * Math.pow(1.5, state.likeGoalIdx));
  }
}
const communitySlots = [[-9, -9], [9, 9], [9, -9], [-9, 9], [0, 0]];
const communityGroups = [];
function buildCommunity(kind, name) {
  const i = state.built.length % communitySlots.length;
  const [dx, dz] = communitySlots[i];
  const g = new THREE.Group(); g.position.set(plazaCenter.x + dx, .3, plazaCenter.z + dz);
  if (kind === 'coin') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 4, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d8e8, side: THREE.DoubleSide }));
    ring.position.y = 2; ring.castShadow = true; g.add(ring);
    const field = new THREE.Mesh(new THREE.CircleGeometry(6.8, 28), new THREE.MeshStandardMaterial({ color: 0x3ca04a })); field.rotation.x = -Math.PI / 2; field.position.y = .3; g.add(field);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); l.scale.set(6, 6, 1); l.position.set(Math.cos(a) * 8, 7, Math.sin(a) * 8); g.add(l); }
  } else {
    const base = box(3.5, 2, 3.5, 0x9a9aa8); base.position.y = 1; g.add(base);
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: .7, roughness: .3, emissive: 0x663300 }));
    body.position.y = 4.2; g.add(body);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(1.6, .7, 10, 20), new THREE.MeshStandardMaterial({ color: 0xc87a1a, metalness: .5, roughness: .4 }));
    mane.position.set(0, 5.6, .6); g.add(mane);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 14), body.material); head.position.set(0, 5.6, .9); g.add(head);
  }
  const lb = label(name, 8); lb.position.y = 10; g.add(lb);
  scene.add(g); state.built.push({ kind, name }); communityGroups.push(g);
  g.scale.setScalar(.01); animate(1200, x => g.scale.setScalar(Math.max(.01, easeOutBack(x))));
  focusOn(g.position, 8); fireworks(g.position, 8);
  banner(kind === 'coin' ? 'COIN-ZIEL!' : 'LIKE-ZIEL!', `${name} wurde gebaut! 🎉`);
}

// =====================================================================================
// Quiz
// =====================================================================================
const quiz = { active: false, next: performance.now() + 15000, q: null, answers: new Map(), first: null, end: 0, deck: [] };
// Questions are drawn from a shuffled deck that is saved in the browser:
// no question repeats until ALL questions were asked – even across reloads, new cities and new streams.
function nextQuestion() {
  let used = [];
  try { used = JSON.parse(localStorage.getItem('wissenscity_used') || '[]'); } catch { }
  let left = QUESTIONS.filter(q => !used.includes(q.q));
  if (!left.length) { used = []; left = [...QUESTIONS]; }
  const q = left[Math.floor(Math.random() * left.length)];
  used.push(q.q);
  try { localStorage.setItem('wissenscity_used', JSON.stringify(used)); } catch { }
  quiz.left = left.length - 1;
  return q;
}
function startQuiz() {
  quiz.q = nextQuestion(); quiz.active = true; quiz.answers.clear(); quiz.first = null;
  quiz.end = performance.now() + C.quiz.answerSeconds * 1000;
  $('qText').textContent = quiz.q.q;
  ['qA', 'qB', 'qC'].forEach((id, i) => $(id).textContent = quiz.q.a[i]);
  ['qCA', 'qCB', 'qCC'].forEach(id => $(id).textContent = '0');
  document.querySelectorAll('.qopt').forEach(o => o.classList.remove('right', 'wrong'));
  $('qHint').innerHTML = `Schreib <b>A</b>, <b>B</b> oder <b>C</b> in den Chat! Nur die erste Antwort zählt · richtig = <b>+${C.quiz.pointsCorrect * mult()}</b> Baupunkte 🌹`;
  $('quizLion').src = 'assets/lionQ.png';
  $('qFill').style.transition = 'none'; $('qFill').style.width = '100%';
  requestAnimationFrame(() => { $('qFill').style.transition = `width ${C.quiz.answerSeconds}s linear`; $('qFill').style.width = '0%'; });
  $('quiz').classList.remove('hidden'); $('howto').classList.add('hidden'); sfx('quiz');
}
function quizAnswer(ev, idx) {
  if (quiz.answers.has(ev.user)) return;                 // first answer counts
  quiz.answers.set(ev.user, { idx, nick: ev.nick, avatar: ev.avatar });
  if (idx === quiz.q.c && !quiz.first) quiz.first = ev.user;
  const counts = [0, 0, 0]; for (const a of quiz.answers.values()) counts[a.idx]++;
  ['qCA', 'qCB', 'qCC'].forEach((id, i) => $(id).textContent = counts[i]);
}
function endQuiz() {
  quiz.active = false;
  const right = [...quiz.answers.entries()].filter(([, a]) => a.idx === quiz.q.c);
  document.querySelectorAll('.qopt').forEach(o => o.classList.add(+o.dataset.i === quiz.q.c ? 'right' : 'wrong'));
  $('quizLion').src = 'assets/lionA.png';
  for (const [id, a] of right) { const pl = ensurePlayer(id, a.nick, a.avatar); addBP(pl, (C.quiz.pointsCorrect + (id === quiz.first ? C.quiz.pointsFirst : 0)) * mult()); }
  const firstNick = quiz.first && C.quiz.pointsFirst ? quiz.answers.get(quiz.first).nick : null;
  const pts = C.quiz.pointsCorrect * mult();
  const names = right.slice(0, 6).map(([, a]) => esc(a.nick)).join(', ') + (right.length > 6 ? ` +${right.length - 6} weitere` : '');
  $('qHint').innerHTML = right.length
    ? `✅ Richtig (<b>${'ABC'[quiz.q.c]}</b>): <b>${names}</b> – je +${pts} Baupunkte 🌹${firstNick ? ` · ⚡ Schnellste/r: <b>${esc(firstNick)}</b> +${C.quiz.pointsFirst}` : ''}`
    : `Richtig war <b>${'ABC'[quiz.q.c]}</b> – diesmal hatte es niemand! 😮`;
  // round timer: every correct answer +0.2 s, every wrong answer −0.5 s (never below minSecondsLeft)
  const wrongN = quiz.answers.size - right.length;
  const delta = right.length * C.quiz.timeCorrectSeconds - wrongN * C.quiz.timeWrongSeconds;
  if (quiz.answers.size) {
    const minEnd = Date.now() + C.quiz.minSecondsLeft * 1000;
    const before = state.roundEnd;
    state.roundEnd = delta < 0 ? Math.max(Math.min(before, minEnd), before + delta * 1000) : before + delta * 1000;
    const real = (state.roundEnd - before) / 1000;
    const f = x => (Math.round(Math.abs(x) * 10) / 10).toLocaleString('de-DE');
    timerBonus(`${real >= 0 ? '+' : '−'}${f(real)} Sek. · Quiz (✅ ${right.length} · ❌ ${wrongN})`, real < 0);
    $('qHint').innerHTML += `<br>⏳ ✅ ${right.length}× +${f(C.quiz.timeCorrectSeconds)} s · ❌ ${wrongN}× −${f(C.quiz.timeWrongSeconds)} s = <b>${real >= 0 ? '+' : '−'}${f(real)} Sek.</b>`;
  }
  if (right.length) shout(`🧠 ${right.length === 1 ? '<b>' + names + '</b> hatte' : '<b>' + right.length + '</b> hatten'} die richtige Antwort – je +${pts} Baupunkte! 🎉`, 'teal');
  sfx(right.length ? 'right' : 'wrong');
  setTimeout(() => { $('quiz').classList.add('hidden'); $('howto').classList.remove('hidden'); }, 6000);
  quiz.next = performance.now() + C.quiz.everySeconds * 1000;
}

// =====================================================================================
// HUD
// =====================================================================================
let dirty = true;
function renderHUD() {
  const players = [...state.players.values()];
  $('statPlayers').textContent = fmt(players.length);
  $('statBuilt').textContent = fmt(players.filter(p => p.plot).length);
  const cBase = state.coinBase, lBase = state.likeBase;
  $('coinGoalName').textContent = C.coinGoal.names[state.coinGoalIdx % C.coinGoal.names.length];
  $('likeGoalName').textContent = C.likeGoal.names[state.likeGoalIdx % C.likeGoal.names.length];
  $('coinFill').style.width = clamp((state.coins - cBase) / (state.coinTarget - cBase) * 100, 0, 100) + '%';
  $('likeFill').style.width = clamp((state.likes - lBase) / (state.likeTarget - lBase) * 100, 0, 100) + '%';
  $('coinText').textContent = `${fmt(state.coins)} / ${fmt(state.coinTarget)}`;
  $('likeText').textContent = `${fmt(state.likes)} / ${fmt(state.likeTarget)}`;
  const top = players.sort((a, b) => b.bp - a.bp).slice(0, 3);
  $('top3').innerHTML = top.map((p, i) => `<div class="entry"><span class="medal">${['🥇', '🥈', '🥉'][i]}</span><span class="n">${esc(p.nick)}</span><span class="lv">Lv ${Math.max(0, p.level)}</span></div>`).join('')
    || '<div class="entry"><span class="n">Schreib „Haus“ 🏠</span></div>';
  $('lastGifts').innerHTML = state.lastGifts.map(g => `<div class="entry"><span class="medal">${giftHtml(g.gift, g.img)}</span><span class="n">${esc(g.nick)}<small>${g.count > 1 ? g.count + '× ' : ''}${esc(g.gift)} · +${fmt(g.bp)} BP</small></span></div>`).join('')
    || '<div class="entry"><span class="n">Noch keine 🌹</span></div>';
  $('timerSub').textContent = C.timerBonus.enabled ? `${C.timerBonus.coinsPerSecond} Coins = +1 Sek.` : 'Runde läuft';
  dirty = false;
}
function toast(html, x = '', avatar = '') {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = (avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : '') + `<span>${html}</span>` + (x ? `<span class="x">${esc(x)}</span>` : '');
  $('toasts').prepend(el); while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  setTimeout(() => el.remove(), 4200);
}
const bannerQueue = []; let bannerBusy = false, bannerCur = null, bannerTimer = null;
function banner(title, sub, kind = '') {
  const it = { title, sub, kind };
  if (kind === 'mega' || kind === 'happy') {   // big gifts / happy hour interrupt everything and show immediately
    if (bannerCur && bannerCur.kind !== 'mega' && bannerCur.kind !== 'happy') bannerQueue.unshift(bannerCur);
    bannerQueue.unshift(it); clearTimeout(bannerTimer); nextBanner(); return;
  }
  bannerQueue.push(it); if (bannerQueue.length > 4) bannerQueue.length = 4;
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const it = bannerQueue.shift(); const b = $('banner');
  bannerCur = it || null;
  if (!it) { bannerBusy = false; b.classList.add('hidden'); return; }
  bannerBusy = true;
  $('bTitle').textContent = it.title; $('bSub').textContent = it.sub;
  b.className = 'hidden'; void b.offsetWidth; b.className = it.kind;
  bannerTimer = setTimeout(nextBanner, it.kind === 'mega' || it.kind === 'happy' ? 3600 : 2600);
}
let bonusTimer = null;
function timerBonus(text, bad = false) { const el = $('timerBonus'); el.textContent = text; el.classList.toggle('bad', bad); el.classList.add('show'); clearTimeout(bonusTimer); bonusTimer = setTimeout(() => el.classList.remove('show'), 2500); }

// =====================================================================================
// Round reset
// =====================================================================================
function newCity() {
  const top = [...state.players.values()].sort((a, b) => b.bp - a.bp).slice(0, 3);
  banner('NEUE STADT!', top.length ? `🏆 ${top.map(p => p.nick).join(' · ')}` : 'Bau mit!');
  fireworks(plazaCenter, 10);
  setTimeout(() => {
    // complete fresh start: houses, players, goals, community buildings, Happy Hour, lists
    for (const pl of state.players.values()) removeHouse(pl);
    state.players.clear(); state.lastGifts = []; lastTop = [];
    for (const g of communityGroups) scene.remove(g); communityGroups.length = 0; state.built = [];
    Object.assign(state, { coins: 0, likes: 0, coinGoalIdx: 0, likeGoalIdx: 0, coinBase: 0, likeBase: 0,
      coinTarget: C.coinGoal.target, likeTarget: C.likeGoal.target, timerCarry: 0, happyUntil: 0 });
    nextRandomHappy = Date.now() + randMinutes(C.happy.randomEveryMinutes);
    state.roundEnd = Date.now() + C.roundMinutes * 60000; dirty = true;
    save();
    shout('🏗️ Eine neue Stadt beginnt! Schreib <b>„Haus“</b> und bau mit! 🦁', 'teal');
  }, 2500);
}

// =====================================================================================
// Camera
// =====================================================================================
let focus = null;
function focusOn(pos, height) { focus = { pos: pos.clone(), h: height, until: performance.now() + 3200 }; }
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateCamera(t, dt) {
  const ang = t * 0.00004;
  const ideal = new THREE.Vector3(Math.sin(ang) * 105, 92, Math.cos(ang) * 105 + 18);
  const look = new THREE.Vector3(0, 0, 8);
  if (focus && performance.now() < focus.until) {
    ideal.set(focus.pos.x + Math.sin(ang) * 30, focus.h + 22, focus.pos.z + Math.cos(ang) * 30 + 10);
    look.set(focus.pos.x, focus.h * .5, focus.pos.z);
  }
  const k = 1 - Math.pow(.02, dt / 1000);
  camPos.lerp(ideal, k); camTarget.lerp(look, k);
  camera.position.copy(camPos); camera.lookAt(camTarget);
}
camPos.set(0, 105, 140);

// =====================================================================================
// Sound (small synthesized effects, no files needed)
// =====================================================================================
let actx = null;
addEventListener('pointerdown', () => { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); }, { once: true });
function tone(f, d, type = 'sine', vol = .15, slide = 0) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
}
function sfx(k) {
  if (k === 'gift') tone(880, .15, 'triangle', .08, 1.5);
  if (k === 'build') tone(520, .2, 'square', .05, 1.6);
  if (k === 'level') { tone(523, .2, 'triangle', .12); setTimeout(() => tone(659, .2, 'triangle', .12), 120); setTimeout(() => tone(784, .4, 'triangle', .12), 240); }
  if (k === 'quiz') { tone(660, .15, 'sine', .1); setTimeout(() => tone(990, .25, 'sine', .1), 150); }
  if (k === 'right') { tone(784, .15, 'triangle', .12); setTimeout(() => tone(1046, .3, 'triangle', .12), 140); }
  if (k === 'wrong') tone(220, .4, 'sawtooth', .06, .7);
  if (k === 'boom') tone(90, .5, 'sine', .2, .5);
  if (k === 'follow') { tone(660, .12, 'sine', .1); setTimeout(() => tone(880, .2, 'sine', .1), 110); }
  if (k === 'share') { tone(500, .1, 'triangle', .1, 1.8); setTimeout(() => tone(900, .2, 'triangle', .1), 120); }
  if (k === 'throne') { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .11), i * 90)); }
  if (k === 'rank') { tone(700, .12, 'triangle', .09); setTimeout(() => tone(940, .18, 'triangle', .09), 100); }
  if (k === 'happy') { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .22, 'square', .07), i * 120)); }
  if (k === 'mega') { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, .35, 'triangle', .13), i * 110)); }
}

// =====================================================================================
// Connection to the local server
// =====================================================================================
function connectWS() {
  let ws;
  try { ws = new WebSocket(`ws://${location.host}`); } catch { return; }
  ws.onmessage = m => { try { handle(JSON.parse(m.data)); } catch (e) { console.warn(e); } };
  ws.onclose = () => setTimeout(connectWS, 3000);
}
connectWS();

// =====================================================================================
// Simulator / test mode
// =====================================================================================
const BOT_NAMES = ['Mia', 'Leon', 'Emma', 'Noah', 'Lina', 'Elias', 'Hannah', 'Paul', 'Lea', 'Ben', 'Sofia', 'Finn', 'Marie', 'Luis', 'Clara', 'Jonas', 'Ella', 'Max', 'Nele', 'Tom'];
const bot = () => { const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + Math.floor(Math.random() * 90 + 10); return { user: n.toLowerCase(), nick: n }; };
let autoDemo = null;
const SIM = {
  join: () => handle({ type: 'chat', ...bot(), text: 'Ich will ein Haus' }),
  rose: () => handle({ type: 'gift', ...bot(), giftName: 'Rose', count: 1, coins: 1 }),
  rose10: () => handle({ type: 'gift', ...bot(), giftName: 'Rose', count: 10, coins: 10 }),
  big: () => handle({ type: 'gift', ...bot(), giftName: 'Löwe', count: 1, coins: 99 }),
  huge: () => handle({ type: 'gift', ...bot(), giftName: 'Universum', count: 1, coins: 500 }),
  likes: () => handle({ type: 'like', ...bot(), count: 500 }),
  galaxy: () => handle({ type: 'gift', ...bot(), giftName: 'Galaxy', count: 1, coins: 1000 }),
  follow: () => handle({ type: 'follow', ...bot() }),
  happy: () => startHappy([1, 2, 3, 4][Math.floor(Math.random() * 4)]),
  share: () => handle({ type: 'share', ...bot() }),
  quiz: () => { if (!quiz.active) startQuiz(); },
  answers: () => { if (!quiz.active) startQuiz(); for (let i = 0; i < 14; i++) setTimeout(() => quiz.active && handle({ type: 'chat', ...bot(), text: Math.random() < .6 ? 'abc'[quiz.q.c] : 'abc'[Math.floor(Math.random() * 3)] }), i * 400); },
  auto: () => {
    if (autoDemo) { clearInterval(autoDemo); autoDemo = null; }
    else autoDemo = setInterval(() => {
      const r = Math.random();
      const known = [...state.players.values()];
      const who = known.length && Math.random() < .5 ? known[Math.floor(Math.random() * known.length)] : null;
      const u = who ? { user: who.id, nick: who.nick } : bot();
      if (r < .3) handle({ type: 'chat', ...u, text: 'Ich will ein Haus' });
      else if (r < .75) { const n = [1, 1, 5, 10][Math.floor(Math.random() * 4)]; handle({ type: 'gift', ...u, giftName: 'Rose', count: n, coins: n }); }
      else if (r < .9) handle({ type: 'like', ...u, count: 50 + Math.floor(Math.random() * 300) });
      else handle({ type: 'gift', ...u, giftName: 'Löwe', count: 1, coins: 99 });
      if (quiz.active && Math.random() < .7) handle({ type: 'chat', ...bot(), text: 'abc'[Math.random() < .6 ? quiz.q.c : Math.floor(Math.random() * 3)] });
    }, 900);
    document.querySelector('[data-sim="auto"]').classList.toggle('on', !!autoDemo);
  },
  time: () => { state.roundEnd -= 60000; },
  reset: () => newCity(),
};
document.querySelectorAll('#sim button').forEach(b => b.addEventListener('click', () => SIM[b.dataset.sim]()));
function showSim(on) { $('sim').classList.toggle('hidden', !on); }
addEventListener('keydown', e => { if (e.key === 'd' || e.key === 'D') $('sim').classList.toggle('hidden'); });
if (DEMO) showSim(true);
if (new URLSearchParams(location.search).has('auto')) SIM.auto();

// =====================================================================================
// Persistence (survives a page reload during the stream)
// =====================================================================================
function save() {
  try {
    localStorage.setItem('wissenscity', JSON.stringify({
      players: [...state.players.values()].map(p => ({ id: p.id, nick: p.nick, avatar: p.avatar, bp: p.bp, likes: p.likes })),
      coins: state.coins, likes: state.likes, coinGoalIdx: state.coinGoalIdx, likeGoalIdx: state.likeGoalIdx,
      coinTarget: state.coinTarget, likeTarget: state.likeTarget, coinBase: state.coinBase, likeBase: state.likeBase, roundEnd: state.roundEnd, lastGifts: state.lastGifts, happyUntil: state.happyUntil, savedAt: Date.now(),
    }));
  } catch { /* storage not available */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('wissenscity') || 'null');
    if (!s || Date.now() - s.savedAt > 6 * 3600e3 || s.roundEnd < Date.now()) return;
    Object.assign(state, { coins: s.coins, likes: s.likes, coinGoalIdx: s.coinGoalIdx, likeGoalIdx: s.likeGoalIdx, coinTarget: s.coinTarget, likeTarget: s.likeTarget, coinBase: s.coinBase || 0, likeBase: s.likeBase || 0, roundEnd: s.roundEnd, lastGifts: s.lastGifts || [], happyUntil: s.happyUntil || 0 });
    for (const p of s.players) {
      const pl = { id: p.id, nick: p.nick, avatar: p.avatar, bp: p.bp, likes: p.likes || 0, level: -1, plot: null };
      state.players.set(pl.id, pl); const plot = freePlot(); if (plot) { pl.plot = plot; plot.owner = pl; placeHouse(pl, levelFor(pl.bp), false); }
    }
  } catch { /* ignore broken save */ }
}
load();
setInterval(save, 5000);

// =====================================================================================
// Main loop
// =====================================================================================
let last = performance.now(), lastHud = 0;
function loop(t) {
  const dt = Math.min(100, t - last); last = t;
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]; const x = clamp((t - a.t0) / a.dur, 0, 1); a.fn(x);
    if (x >= 1) { anims.splice(i, 1); a.done && a.done(); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt / 1000; p.v.y -= 18 * dt / 1000;
    p.s.position.addScaledVector(p.v, dt / 1000); p.s.material.opacity = Math.max(0, 1 - p.age / p.life);
    if (p.age > p.life) { scene.remove(p.s); p.s.material.dispose(); particles.splice(i, 1); }
  }
  // quiz scheduling
  if (!quiz.active && t > quiz.next) startQuiz();
  if (quiz.active) { const left = Math.max(0, Math.ceil((quiz.end - t) / 1000)); $('qTimer').textContent = left; if (t >= quiz.end) endQuiz(); }
  // round timer
  const rest = Math.max(0, state.roundEnd - Date.now());
  $('timer').textContent = `${Math.floor(rest / 60000)}:${String(Math.floor(rest / 1000) % 60).padStart(2, '0')}`;
  if (rest <= 0 && !newCity.pending) { newCity.pending = true; newCity(); setTimeout(() => newCity.pending = false, 4000); }
  updateHappy(t);
  if (dirty && t - lastHud > 250) { renderHUD(); lastHud = t; }
  warm.intensity = 1.1 + Math.sin(t / 900) * .1;
  updateCamera(t, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__game = { state, SIM, handle, nextQuestion, checkRanking, ensurePlayer, addBP, focusOn: (x, z, h) => focusOn(new THREE.Vector3(x, 0, z), h) };
