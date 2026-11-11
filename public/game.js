import * as THREE from 'three';
import { QUESTIONS } from './questions.js';

// =====================================================================================
// Config & helpers
// =====================================================================================
const CFG = await fetch('/config.json').then(r => r.json()).catch(() => ({}));
const C = {
  cityName: CFG.cityName || 'Wissens-City',
  endless: CFG.endless ?? true,                    // true = the city is never reset (no timer) – good for the start
  roundMinutes: CFG.roundMinutes || 20,
  keepTop: CFG.keepTop ?? 5,                       // the best N houses survive a new city …
  keepTopFactor: CFG.keepTopFactor ?? 0.5,          // … but only with this share of their build points (0.5 = half)
  timerBonus: CFG.timerBonus || { enabled: true, coinsPerSecond: 30 },
  coinGoal: CFG.coinGoal || { names: ['Stadion'], target: 5000 },
  likeGoal: CFG.likeGoal || { names: ['Riesenrad', 'Bushaltestelle', 'Lampen', 'Feuerwerk'], target: 5000 },
  generator: Object.assign({ everyLikes: 20000, intervalSeconds: 10, bonusSeconds: 2 }, CFG.generator || {}),
  quiz: Object.assign({ everySeconds: 40, answerSeconds: 5, graceSeconds: 2, harderEvery: 10, firstAfterSeconds: 15, pointsCorrect: 10, pointsFirst: 0, timeCorrectSeconds: 0.2, timeWrongSeconds: 0.5, minSecondsLeft: 30 }, CFG.quiz || {}),
  likesPerBP: CFG.likesPerBuildPoint || 50,
  mentions: Object.assign({ minCoinsPerGift: 2 }, CFG.mentions || {}),
  voice: Object.assign({ enabled: true, minCoinsPerGift: 2, rate: 1.05, pitch: 1, volume: 1, voiceName: '', preferVoices: ['Seraphina', 'Florian', 'Katja Online', 'Conrad Online', 'Natural', 'Online', 'Google', 'Katja', 'Conrad', 'Hedda', 'Stefan'] }, CFG.voice || {}),
  levels: Object.assign({ pointsPerLevel: 100, firstSteps: [10, 30, 60, 100], bonusEveryLevels: 1, bonusSecondsPerLevel: 1 }, CFG.levels || {}),
  bigGifts: CFG.bigGifts || { fireworksFrom: 100, megaFrom: 1000 },
  follow: CFG.follow || { bonusPoints: 0 },
  share: CFG.share || { bonusPoints: 10, maxPerUserPerRound: 3 },
  happy: CFG.happyHour || { multiplier: 2, randomEveryMinutes: [2, 2], randomDurationMinutes: [1, 2, 3, 4], triggerCoins: 1000, triggerMinutes: 4 },
  joinWords: (CFG.joinWords || ['haus', 'join', 'mitmachen']).map(s => s.toLowerCase()),
  welcome: Object.assign({ enabled: true, collectSeconds: 3, maxNames: 3, speak: true }, CFG.welcome || {}),
};
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('de-DE');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const DEMO = new URLSearchParams(location.search).has('demo');
$('cityName').textContent = C.cityName;
if (C.endless) document.querySelector('.timer .ttitle').textContent = '🏙️ STADT BESTEHT SEIT';

// stage scaling (1080x1920 stage fitted into any window)
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  $('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit); fit();

// =====================================================================================
// Game rules
// =====================================================================================
// Every player starts right away with Level 1 (small farmhouse).
// The first levels come quickly (firstSteps = build points for Level 2, 3, 4, 5 …),
// after that every `pointsPerLevel` build points = 1 level, no upper limit.
const PPL = () => C.levels.pointsPerLevel;
const STEPS = () => C.levels.firstSteps || [];
function levelStart(l) {                    // build points needed for level l
  const s = STEPS();
  if (l <= 1) return 0;
  if (l - 2 < s.length) return s[l - 2];
  return (s.length ? s[s.length - 1] : 0) + (l - 1 - s.length) * PPL();
}
function levelFor(bp) { let l = 1; while (bp >= levelStart(l + 1)) l++; return l; }
const levelProgress = bp => { const l = levelFor(bp), a = levelStart(l), b = levelStart(l + 1); return (bp - a) / (b - a); };
function levelName(l) {
  const small = ['', 'Bauernhaus', 'Bauernhof', 'Landhaus', 'Stadthaus', 'Villa'];
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
  cityStart: Date.now(),         // when this city was founded (shown in endless mode)
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
scene.fog = new THREE.Fog(0x0b1024, 150, 360);
const camera = new THREE.PerspectiveCamera(42, 1080 / 1920, 1, 900);

scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x2a3a24, 1.0));
const moon = new THREE.DirectionalLight(0xc8d4ff, 1.5);
moon.position.set(-90, 135, 60); moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 380 });
scene.add(moon);
const warm = new THREE.PointLight(0xffb060, 1.2, 140, 1.2); warm.position.set(0, 25, 0); scene.add(warm);
const partyLights = [0, 1, 2].map(() => { const L = new THREE.PointLight(0xff00ff, 0, 120, 1.1); scene.add(L); return L; });
const nightBg = new THREE.Color(0x0b1024), happyBg = new THREE.Color();

// layout: blocks of 2x2 plots separated by roads
const BX = 10, BZ = 10;             // blocks (10 x 10 minus the plaza = 96 blocks = 384 plots)
const PLOT = 7, ROAD = 6;           // sizes
const BLOCK = PLOT * 2;
const W = BX * BLOCK + (BX + 1) * ROAD, D = BZ * BLOCK + (BZ + 1) * ROAD;
const plots = [];                   // {x, z, owner, group}
const PLAZA = { bx: [4, 5], bz: [4, 5] };   // central blocks reserved for community buildings
for (let bz = 0; bz < BZ; bz++) for (let bx = 0; bx < BX; bx++) {
  if (PLAZA.bx.includes(bx) && PLAZA.bz.includes(bz)) continue;
  const x0 = -W / 2 + ROAD + bx * (BLOCK + ROAD), z0 = -D / 2 + ROAD + bz * (BLOCK + ROAD);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) plots.push({ x: x0 + PLOT * (i + .5), z: z0 + PLOT * (j + .5), owner: null, group: null });
}
// sort plots by distance to the centre -> first players get central plots
plots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
$('statPlots').textContent = plots.length;

// ground, roads, plaza
const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 160, D + 160), new THREE.MeshStandardMaterial({ color: 0x24382a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: .95 });
const lineMat = new THREE.MeshBasicMaterial({ color: 0x9aa0aa });
const dashes = [];
for (let bx = 0; bx <= BX; bx++) {
  const x = -W / 2 + ROAD / 2 + bx * (BLOCK + ROAD);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, D), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(x, .02, 0); r.receiveShadow = true; scene.add(r);
  for (let z = -D / 2 + 2; z < D / 2; z += 5) dashes.push([x, .04, z, 0]);
}
for (let bz = 0; bz <= BZ; bz++) {
  const z = -D / 2 + ROAD / 2 + bz * (BLOCK + ROAD);
  const r = new THREE.Mesh(new THREE.PlaneGeometry(W, ROAD), roadMat); r.rotation.x = -Math.PI / 2; r.position.set(0, .03, z); r.receiveShadow = true; scene.add(r);
  for (let x = -W / 2 + 2; x < W / 2; x += 5) dashes.push([x, .05, z, 1]);
}
{
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(.25, 2).rotateX(-Math.PI / 2), lineMat, dashes.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  dashes.forEach(([x, y, z, rot], i) => dash.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rot ? Math.PI / 2 : 0), one)));
  scene.add(dash);
}
const plotMat = new THREE.MeshStandardMaterial({ color: 0x3f7a45, roughness: 1 });
{
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(PLOT - .8, .2, PLOT - .8), plotMat, plots.length);
  const m = new THREE.Matrix4(); plots.forEach((p, i) => im.setMatrixAt(i, m.makeTranslation(p.x, .1, p.z)));
  im.receiveShadow = true; scene.add(im);
}
const plazaSize = 2 * BLOCK + ROAD;
const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaSize, .3, plazaSize), new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: .8 }));
plaza.receiveShadow = true; scene.add(plaza);
const plazaCenter = new THREE.Vector3(-W / 2 + ROAD + PLAZA.bx[0] * (BLOCK + ROAD) + plazaSize / 2, 0, -D / 2 + ROAD + PLAZA.bz[0] * (BLOCK + ROAD) + plazaSize / 2);
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
for (let i = 0; i < 140; i++) {
  const r = hash('tree' + i);
  const x = (r % 1000) / 1000 * (W + 110) - (W + 110) / 2, z = ((r >> 10) % 1000) / 1000 * (D + 110) - (D + 110) / 2;
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
// gable (saddle) roof: triangle w wide, h high, d deep, bottom at y = 0
function gable(w, d, h, color) {
  const s = new THREE.Shape(); s.moveTo(-w / 2 - .2, 0); s.lineTo(w / 2 + .2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: d + .3, bevelEnabled: false }); geo.translate(0, 0, -(d + .3) / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .9 })); m.castShadow = true; return m;
}
function buildHouse(level, seed) {
  const g = new THREE.Group();
  const col = PALETTE[seed % PALETTE.length], rc = ROOFS[(seed >>> 4) % ROOFS.length];
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const glowSprite = (color, size, y) => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); h.scale.set(size, size, 1); return add(h, 0, y, 0); };
  const beam = (color, height, y0) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.35, 1.2, height, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); return add(b, 0, y0 + height / 2, 0); };
  const L = Math.max(1, level);
  // farm pieces (Level 1–3)
  const fence = () => {
    const wood = 0xc89a5a;
    for (const s of [-1, 1]) { add(box(6.2, .12, .12, wood), 0, .55, s * 3.05); add(box(6.2, .12, .12, wood), 0, .25, s * 3.05); add(box(.12, .12, 6.2, wood), s * 3.05, .55, 0); add(box(.12, .12, 6.2, wood), s * 3.05, .25, 0); }
    for (let i = -3; i <= 3; i += 1.5) for (const s of [-1, 1]) { add(box(.18, .8, .18, wood), i, .4, s * 3.05); add(box(.18, .8, .18, wood), s * 3.05, .4, i); }
  };
  const farmhouse = (x, z, s = 1) => {
    add(box(2.8 * s, 1.8 * s, 2.4 * s, 0xf3ead8, 1, 2), x, .9 * s, z);
    add(gable(2.8 * s, 2.4 * s, 1.3 * s, 0xb23a2a), x, 1.8 * s, z);
    add(box(.6 * s, 1.1 * s, .08, 0x6b4423), x + .5 * s, .55 * s, z + 1.22 * s);           // door
    add(box(.35 * s, 1 * s, .35 * s, 0x8a5a44), x - .8 * s, 2.6 * s, z - .4 * s);            // chimney
  };
  const hay = (x, z) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .7, 12), new THREE.MeshStandardMaterial({ color: 0xe8c45a, roughness: 1 })); h.rotation.z = Math.PI / 2; h.castShadow = true; add(h, x, .45, z); };
  const barn = (x, z) => { add(box(2.4, 2, 2.8, 0xa8322a), x, 1, z); add(gable(2.4, 2.8, 1.2, 0x5a3a22), x, 2, z); add(box(1.1, 1.3, .06, 0xf3ead8), x, .65, z + 1.42); };
  const tree = (x, z, s = 1) => { add(box(.3, 1.2 * s, .3, 0x5a3a22), x, .6 * s, z); const c = new THREE.Mesh(new THREE.SphereGeometry(.9 * s, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9a4a })); c.castShadow = true; add(c, x, 1.7 * s, z); };
  if (L <= 6) {
    switch (L) {
      case 1: fence(); farmhouse(-.4, -.3); hay(1.9, 1.7); tree(2, -1.8, .8); break;
      case 2: fence(); farmhouse(-1.3, -.5, 1.05); barn(1.5, -.3); hay(-1.8, 2); hay(-.9, 2.2); tree(2.3, 2.3, .8); break;
      case 3: fence();
        add(box(3.4, 3.2, 3, 0xf3ead8, 2, 3), -1, 1.6, -.6); add(gable(3.4, 3, 1.6, 0xb23a2a), -1, 3.2, -.6);
        add(box(.4, 1.4, .4, 0x8a5a44), -2, 4.2, -1); barn(1.8, .2); hay(-2, 2.1); hay(-1, 2.3); tree(2.4, -2.3, .9); tree(-2.4, -2.4, .7); break;
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
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (level === null) { g.fillText(text, 256, 83, w - 40); }
  else { g.fillText(text, 256, 56, w - 40);
  g.font = '700 34px Fredoka, Arial'; g.fillStyle = big ? '#ffe9a0' : '#ffd23f'; g.fillText(`Lv ${level}`, 256 - w / 2 + 70, 118);
  const bx = 256 - w / 2 + 130, bw = w - 160;                       // progress to next level
  g.fillStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.roundRect(bx, 106, bw, 24, 12); g.fill();
  g.fillStyle = '#3ddc84'; g.beginPath(); g.roundRect(bx, 106, Math.max(24, bw * prog), 24, 12); g.fill(); }
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
function disposeGroup(g) {
  scene.remove(g);
  g.traverse(o => { if (o.isMesh) o.geometry.dispose(); if (o.isSprite) { if (o === g.userData.label) o.material.map?.dispose(); o.material.dispose(); } });
}
function removeHouse(pl) { if (!pl.plot) return; if (pl.plot.group) disposeGroup(pl.plot.group); pl.plot.owner = null; pl.plot.group = null; pl.plot = null; }

function ensurePlayer(id, nick, avatar, quiet = false) {
  let pl = state.players.get(id);
  if (!pl) {
    pl = { id, nick: nick || id, avatar: avatar || '', bp: 0, level: -1, plot: null, likes: 0, shares: 0 };
    state.players.set(id, pl);
    const p = freePlot(); if (!p) return pl;
    pl.plot = p; p.owner = pl;
    placeHouse(pl, 1, false);                       // everybody starts with a small farmhouse (Level 1)
    burst(new THREE.Vector3(p.x, 3, p.z), 0x8affc8, 30); sfx('build');
    focusHouse(pl);
    if (!quiet) toast(`👋 <b>${esc(pl.nick)}</b> zieht in die Stadt – 🏡 Bauernhaus!`);
  } else if (nick) pl.nick = nick;
  return pl;
}
// merge all parts of a house that share the same look into one mesh -> a few draw calls per house
// (keeps a city with ~400 houses smooth)
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = o.material;
    const key = [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.emissiveMap?.uuid, m.map?.uuid, m.transparent, m.opacity, m.metalness, m.roughness, m.side, m.blending, m.depthWrite].join('|');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [], cast: o.castShadow, recv: o.receiveShadow });
    const b = buckets.get(key); b.geos.push(g); b.cast ||= o.castShadow; b.recv ||= o.receiveShadow;
    drop.push(o);
  });
  for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }
  for (const b of buckets.values()) {
    const merged = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
      const total = b.geos.reduce((n, g) => n + g.attributes[name].array.length, 0), arr = new Float32Array(total);
      let off = 0; for (const g of b.geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    b.geos.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; root.add(mesh);
  }
  return root;
}
const withArticle = n => ({ 'Villa': 'eine Villa', 'Große Villa': 'eine große Villa' }[n] || 'ein ' + n);
function placeHouse(pl, level, celebrate) {
  const p = pl.plot; if (!p) return;
  const prevLevel = pl.level;
  if (p.group) disposeGroup(p.group);
  const g = new THREE.Group(); g.position.set(p.x, .2, p.z);
  const h = mergeStatic(buildHouse(level, hash(pl.id))); g.add(h);
  const top = Math.min(new THREE.Box3().setFromObject(h).max.y, level >= 25 ? 60 : 200);
  pl.top = top;
  const lb = label(pl.nick.slice(0, 16), level, levelProgress(pl.bp)); lb.position.y = top + 2.2; g.add(lb); g.userData.label = lb;
  scene.add(g); p.group = g; pl.level = level;
  h.scale.set(1, .01, 1);
  animate(900, x => h.scale.set(1, Math.max(.01, easeOutBack(x)), 1));
  if (celebrate) {
    burst(new THREE.Vector3(p.x, top * .6, p.z), level >= 20 ? 0xffd23f : 0x8affc8, Math.min(120, 30 + level * 4));
    focusHouse(pl, true);
    // small level-ups (2–4) as a toast, bigger ones as the big banner
    if (level < 5) toast(`🏡 <b>${esc(pl.nick)}</b>: Level ${level} · ${levelName(level)}${celebrate.bonus ? ` · +${celebrate.bonus} Sek.` : ''}`, `Lv ${level}`, pl.avatar);
    else banner(`LEVEL ${level}!`, `${levelName(level)} · ${pl.nick}${celebrate.bonus ? ` · +${celebrate.bonus} Sek.` : ''}`);
    sfx('level');
    // new house type (Bauernhaus → Bauernhof → Landhaus → Stadthaus → Villa → Große Villa → Hochhaus → Gold-Turm …) is announced
    const nm = levelName(level), n = speakName(pl.nick);
    if (prevLevel >= 1 && nm !== levelName(prevLevel)) say(pick([`${n}, dein Haus ist jetzt ${withArticle(nm)}!`, `Wow, ${n}! Aus deinem Haus wird ${withArticle(nm)}!`]), 'house');
    else if (level <= 10 || level % 5 === 0) say(`${n}, dein Haus ist jetzt Level ${level}!`, 'level');
  }
}
// zoom the camera to a player's house so everybody sees it being built
function focusHouse(pl, important = false) {
  if (!pl?.plot) return;
  focusOn(new THREE.Vector3(pl.plot.x, 0, pl.plot.z), Math.min(pl.top || 4, 50), important);
}
function addBP(pl, amount) {
  if (!pl) return;
  pl.bp += amount;
  const lv = levelFor(pl.bp), before = Math.max(1, pl.level);
  if (lv !== pl.level) {
    // level bonus for the whole city: reaching level N adds N seconds (Level 9 = +9 s, Level 10 = +10 s …)
    let bonus = 0; const every = C.levels.bonusEveryLevels;
    if (!C.endless) for (let m = Math.floor(before / every) + 1; m <= Math.floor(lv / every); m++) bonus += m * every * C.levels.bonusSecondsPerLevel;
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
      if (m && quizBusy()) { quizAnswer(ev, 'abc'.indexOf(m[1])); break; }
      if (C.joinWords.some(w => t.includes(w))) ensurePlayer(ev.user, ev.nick, ev.avatar);
      break;
    }
    case 'gift': {
      const unitPrice = ev.unit || Math.max(1, Math.round((ev.coins || 1) / (ev.count || 1)));
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar, unitPrice < C.mentions.minCoinsPerGift);
      const coins = ev.coins || 1;
      if (unitPrice >= C.voice.minCoinsPerGift) sayThanks(pl.nick, ev.giftName, ev.count || 1, coins);   // thank first, then build
      addBP(pl, coins * mult());
      if (pl.plot) { focusHouse(pl); burst(new THREE.Vector3(pl.plot.x, (pl.top || 4) + 1, pl.plot.z), 0xff5aa0, Math.min(40, 6 + coins * 2), 7, 1); }
      state.coins += coins;
      if (C.timerBonus.enabled) {
        // coins are collected, so small gifts (e.g. single roses) also add time
        state.timerCarry = (state.timerCarry || 0) + coins;
        const secs = Math.floor(state.timerCarry / C.timerBonus.coinsPerSecond);
        if (secs > 0) { state.timerCarry -= secs * C.timerBonus.coinsPerSecond; state.roundEnd += secs * 1000; timerBonus(`+${secs} Sek. · ${pl.nick}`); }
      }
      const unit = ev.unit || Math.max(1, Math.round(coins / (ev.count || 1)));
      const mention = unit >= C.mentions.minCoinsPerGift;          // single roses (1 coin) count, but are not announced
      if (mention) {
        state.lastGifts.unshift({ nick: pl.nick, gift: ev.giftName, count: ev.count, bp: coins, img: ev.giftImage || '' });
        state.lastGifts.length = Math.min(state.lastGifts.length, 3);
      }
      if (mention) toast(`${giftHtml(ev.giftName, ev.giftImage)} <b>${esc(pl.nick)}</b> hat ${esc(ev.giftName)} gesendet${happyOn() ? ' · <b>x' + C.happy.multiplier + '</b> 🎉' : ''}`, ev.count > 1 ? `×${ev.count}` : '', ev.avatar);
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
      say(pick([`Danke fürs Folgen, ${speakName(pl.nick)}!`, `${speakName(pl.nick)}, danke fürs Folgen! Willkommen in der Stadt!`]), 'follow');
      if (C.follow.bonusPoints) addBP(pl, C.follow.bonusPoints);
      shout(`❤️ Danke fürs Folgen, <b>${esc(pl.nick)}</b>!${C.follow.bonusPoints ? ` +${C.follow.bonusPoints} Baupunkte` : ' Willkommen in der Stadt 🏠'}`, 'pink', ev.avatar);
      focusHouse(pl);
      sfx('follow');
      break;
    }
    case 'share': {
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar);
      say(pick([`Danke fürs Teilen, ${speakName(pl.nick)}!`, `${speakName(pl.nick)}, danke fürs Teilen!`]), 'share');
      if (pl.shares < C.share.maxPerUserPerRound) {
        pl.shares++; addBP(pl, C.share.bonusPoints * mult());
        shout(`🔁 <b>${esc(pl.nick)}</b> hat geteilt! +${C.share.bonusPoints} Baupunkte 🏗️`, 'teal', ev.avatar);
        if (pl.plot) burst(new THREE.Vector3(pl.plot.x, 6, pl.plot.z), 0x33d6d6, 40);
      } else shout(`🔁 Danke fürs Teilen, <b>${esc(pl.nick)}</b>!`, 'teal', ev.avatar);
      focusHouse(pl);
      sfx('share');
      break;
    }
    case 'member': {                                 // someone joined the LIVE -> greet them
      welcomeViewer(ev);
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
// Welcome new viewers (good for small streams). Joins are collected for a few seconds and
// greeted together ("Hallo Lisa, Tom und Mia!"), everybody only once per stream.
// =====================================================================================
const welcome = { seen: new Set(), pending: [], timer: null };
function welcomeViewer(ev) {
  if (!C.welcome.enabled || !ev.user || welcome.seen.has(ev.user)) return;
  welcome.seen.add(ev.user);
  welcome.pending.push(ev);
  if (!welcome.timer) welcome.timer = setTimeout(flushWelcome, C.welcome.collectSeconds * 1000);
}
function flushWelcome() {
  welcome.timer = null;
  if (quizBusy()) { welcome.timer = setTimeout(flushWelcome, 1000); return; }   // greet after the quiz
  const list = welcome.pending.splice(0); if (!list.length) return;
  const shown = list.slice(0, C.welcome.maxNames), more = list.length - shown.length;
  const join = arr => arr.length > 1 ? arr.slice(0, -1).join(', ') + ' und ' + arr[arr.length - 1] : arr[0];
  toast(`👋 Willkommen <b>${shown.map(v => esc(v.nick)).join('</b>, <b>')}</b>${more > 0 ? ` +${more}` : ''}! Schreib <b>„Haus“</b> 🏡`, '', shown.length === 1 ? shown[0].avatar : '');
  if (!C.welcome.speak) return;
  const names = join(shown.map(v => speakName(v.nick))) + (more > 0 ? ` und ${more} weitere` : '');
  const hint = state.players.size < 5 || Math.random() < .5;     // remind new viewers how to join
  say(pick([`Hallo ${names}, willkommen im Live!`, `Hey ${names}! Schön, dass ihr da seid!`.replace('ihr da seid', list.length > 1 ? 'ihr da seid' : 'du da bist'), `Willkommen ${names}!`])
    + (hint ? ' Schreib Haus in den Chat und bau mit!' : ''), 'welcome');
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
// =====================================================================================
// Spoken thank-you (browser speech synthesis – on Windows/Edge natural German voices)
// =====================================================================================
const speech = { voice: null, queue: [], later: [], busy: false, unlocked: false };
// importance of spoken sentences: the most important waiting sentence is spoken next
const RANK = { level: 0, gift: 1, house: 1.5, welcome: 2, follow: 2, share: 2, biggift: 3, goal: 3, quiz: 4 };
// Voice: 1. the one chosen in the test panel (saved in the browser), 2. config voice.voiceName,
// 3. the first available of voice.preferVoices. Best free voices: Microsoft Edge "… Online (Natural)" (Seraphina, Florian, Katja, Conrad).
const germanVoices = () => speechSynthesis.getVoices().filter(v => /^de(-|_|$)/i.test(v.lang) && !/undefined/i.test(v.name));
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const de = germanVoices(); let chosen = '';
  try { chosen = localStorage.getItem('wissenscity_voice') || ''; } catch { }
  speech.voice = null;
  for (const pref of [chosen, C.voice.voiceName, ...C.voice.preferVoices].filter(Boolean)) {
    const v = de.find(v => v.name === pref) || de.find(v => v.name.toLowerCase().includes(pref.toLowerCase()));
    if (v) { speech.voice = v; break; }
  }
  if (!speech.voice) speech.voice = de[0] || null;
  if (speech.voice) console.log('[Stimme]', speech.voice.name);
  fillVoiceSelect();
}
function fillVoiceSelect() {
  const sel = $('voiceSel'); if (!sel) return;
  const de = germanVoices();
  sel.innerHTML = de.length ? de.map(v => `<option value="${esc(v.name)}"${speech.voice && v.name === speech.voice.name ? ' selected' : ''}>${esc(v.name.replace(/^Microsoft /, '').replace(/ - German.*$/, ''))}</option>`).join('')
    : '<option>Keine deutsche Stimme gefunden</option>';
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
$('voiceSel')?.addEventListener('change', e => { try { localStorage.setItem('wissenscity_voice', e.target.value); } catch { } pickVoice(); });
$('voiceTest')?.addEventListener('click', () => { unlockAudio(); say('Danke fürs Folgen, Lisa! Willkommen in der Wissens-City!', 'quiz'); });
// make usernames speakable: "lisa_mueller99" -> "lisa mueller"
const speakName = n => (String(n).normalize('NFKC').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/[_.\-]+/g, ' ').replace(/\s+/g, ' ').trim()).replace(/^(.*?)$/, m => m.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || m) || 'du';
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function sayThanks(nick, gift, count, coins) {
  if (!C.voice.enabled || !('speechSynthesis' in window)) return;
  const n = speakName(nick), g = String(gift || 'das Geschenk');
  const what = count > 1 ? `${count} mal ${g}` : g;
  let text;
  if (coins >= 1000) text = pick([`Unglaublich! ${n}, tausend Dank für ${what}! Du bist ein Held der Stadt!`, `Wow, ${n}! Vielen, vielen Dank für ${what}! Das ist der Wahnsinn!`]);
  else if (coins >= 100) text = pick([`Wahnsinn, ${n}! Vielen Dank für ${what}!`, `${n}, du bist super! Danke für ${what}!`]);
  else if (coins >= 30) text = pick([`Wow, danke ${n} für ${what}! Dein Haus wächst!`, `Danke dir, ${n}, für ${what}!`]);
  else text = pick([`Danke, ${n}!`, `Lieben Dank, ${n}!`, `Danke dir, ${n}, das ist lieb!`]);
  say(text, coins >= 100 ? 'biggift' : 'gift');      // big gifts (≥ 100 coins) are thanked before everything else except quiz/goals
}
// speak any sentence (follow, share, level, goals …) – queued so nothing overlaps
function say(text, kind = '') {
  if (!C.voice.enabled || !('speechSynthesis' in window) || !text) return;
  // while the quiz runs it has priority: thank-yous are skipped, goal announcements wait until afterwards
  if (quizBusy() && kind !== 'quiz') { if (kind === 'goal') speech.later.push({ text, kind }); return; }
  // don't fall behind: level-ups are only spoken when nothing else is waiting,
  // and when the queue gets long the least important sentences are dropped first
  if (kind === 'level' && (speech.queue.length || speech.busy)) return;
  speech.queue.push({ text, kind });
  while (speech.queue.length > 3) {
    let k = 0; speech.queue.forEach((q, i) => { if ((RANK[q.kind] ?? 1) < (RANK[speech.queue[k].kind] ?? 1)) k = i; });
    speech.queue.splice(k, 1);
  }
  nextSpeech();
}
function quietForQuiz() {
  for (const q of speech.queue) if (q.kind === 'goal') speech.later.push(q);   // goals are kept for later
  speech.queue = [];
  if (speech.busy) { speech.cur = (speech.cur || 0) + 1; speech.busy = false; try { speechSynthesis.cancel(); } catch { } }
}
function releaseQuizSpeech() { const l = speech.later.splice(0); for (const q of l) say(q.text, q.kind); }
function nextSpeech() {
  if (speech.busy || !speech.queue.length) return;
  let k = 0; speech.queue.forEach((q, i) => { if ((RANK[q.kind] ?? 1) > (RANK[speech.queue[k].kind] ?? 1)) k = i; });
  const u = new SpeechSynthesisUtterance(speech.queue.splice(k, 1)[0].text);
  u.lang = 'de-DE'; if (speech.voice) u.voice = speech.voice;
  u.rate = C.voice.rate; u.pitch = C.voice.pitch; u.volume = C.voice.volume;
  speech.busy = true; const id = speech.cur = (speech.cur || 0) + 1;
  const done = () => { if (speech.cur !== id || !speech.busy) return; speech.busy = false; setTimeout(nextSpeech, 250); };
  u.onend = u.onerror = done;
  speechSynthesis.speak(u);
  setTimeout(done, 15000); // safety – only for THIS sentence
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
  const done = { coin: [], like: [] };
  while (state.coins >= state.coinTarget) {
    const name = C.coinGoal.names[state.coinGoalIdx % C.coinGoal.names.length];
    buildCommunity('coin', name); done.coin.push(name); state.coinGoalIdx++; state.coinBase = state.coinTarget; state.coinTarget += Math.round(C.coinGoal.target * Math.pow(1.5, state.coinGoalIdx));
  }
  // like goals: always every 5.000 likes (config likeGoal.target) something new the city needs
  while (state.likes >= state.likeTarget) {
    const name = C.likeGoal.names[state.likeGoalIdx % C.likeGoal.names.length];
    buildCommunity('like', name); done.like.push(name); state.likeGoalIdx++; state.likeBase = state.likeTarget; state.likeTarget += C.likeGoal.target;
  }
  // every 20.000 likes: one more time generator
  const gens = C.generator.everyLikes > 0 ? Math.floor(state.likes / C.generator.everyLikes) : 0;
  for (const kind of ['coin', 'like']) {
    const n = done[kind]; if (!n.length) continue;
    const list = n.length > 1 ? n.slice(0, -1).join(', ') + ' und ' + n[n.length - 1] : n[0];
    say(`${kind === 'coin' ? 'Coin' : 'Like'}-Ziel${n.length > 1 ? 'e' : ''} geschafft! Neu in der Stadt: ${list}!`, 'goal');
  }
  if (!C.endless) while ((state.generators || 0) < gens) addGenerator();
}

// ---------- community buildings on the central plaza ----------
const communitySlots = [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, -11], [0, 11], [-11, 0], [11, 0], [0, 0]];
const communityGroups = [];
const glow = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); return s; };
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const RAINBOW = [0xff5aa0, 0xffd23f, 0x3ddc84, 0x33d6ff, 0xb05bff, 0xff8a3d];

const MODELS = {
  riesenrad(g) {
    const steel = std(0xe8e8f0, { metalness: .4 });
    for (const s of [-1, 1]) for (const z of [-1.2, 1.2]) { const leg = mesh(new THREE.CylinderGeometry(.18, .25, 7.2), steel, s * 1.9, 3.3, z); leg.rotation.z = s * .28; g.add(leg); }
    const wheel = new THREE.Group(); wheel.position.y = 6.6; g.add(wheel);
    wheel.add(mesh(new THREE.TorusGeometry(4.6, .14, 8, 48), steel));
    wheel.add(mesh(new THREE.TorusGeometry(.5, .2, 8, 16), steel));
    const cabins = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const sp = mesh(new THREE.BoxGeometry(.08, 4.6, .08), steel, Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
      const cab = mesh(new THREE.BoxGeometry(.9, .8, .9), std(RAINBOW[i % RAINBOW.length], { emissive: RAINBOW[i % RAINBOW.length], emissiveIntensity: .35 }), Math.cos(a) * 4.6, Math.sin(a) * 4.6 - .55, 0);
      wheel.add(cab); cabins.push(cab);
      const l = glow(RAINBOW[(i + 2) % RAINBOW.length], 1.6); l.position.set(Math.cos(a + .31) * 4.6, Math.sin(a + .31) * 4.6, .2); wheel.add(l);
    }
    g.userData.tick = (t, dt) => { wheel.rotation.z += dt * .00035; for (const c of cabins) c.rotation.z = -wheel.rotation.z; };
    return 12;
  },
  bushaltestelle(g) {
    g.add(mesh(new THREE.BoxGeometry(7, .2, 3), std(0x8a8a96), 0, .1, -1));                    // platform
    g.add(mesh(new THREE.BoxGeometry(3.6, 2.4, .1), std(0x9fd8ff, { transparent: true, opacity: .45 }), -1, 1.4, -2.2));
    g.add(mesh(new THREE.BoxGeometry(4, .15, 1.6), std(0x2d6cdf), -1, 2.65, -1.6));           // roof
    for (const x of [-2.8, .8]) g.add(mesh(new THREE.BoxGeometry(.12, 2.5, .12), std(0x555a66), x, 1.35, -.9));
    g.add(mesh(new THREE.BoxGeometry(2.6, .15, .6), std(0xc89a5a), -1, .7, -1.8));             // bench
    g.add(mesh(new THREE.CylinderGeometry(.08, .08, 3), std(0x555a66), 2.6, 1.5, -.4));
    const sign = mesh(new THREE.CylinderGeometry(.55, .55, .1, 24), std(0xffd23f, { emissive: 0x806000 }), 2.6, 3.1, -.4); sign.rotation.x = Math.PI / 2; g.add(sign);
    const sl = glow(0xffe08a, 3); sl.position.set(-1, 2.4, -1.4); g.add(sl);
    const bus = new THREE.Group(); bus.position.set(0, 0, 1.8); g.add(bus);
    const body = new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: .5, emissiveMap: windowTexture(1, 6), emissive: 0xffffff, emissiveIntensity: .9 });
    bus.add(mesh(new THREE.BoxGeometry(6, 2, 1.8), body, 0, 1.4, 0));
    for (const x of [-2, 2]) for (const z of [-.9, .9]) { const w = mesh(new THREE.CylinderGeometry(.4, .4, .3, 14), std(0x222222), x, .45, z); w.rotation.x = Math.PI / 2; bus.add(w); }
    const head = glow(0xffffff, 2); head.position.set(3.1, 1, 0); bus.add(head);
    g.userData.tick = t => { const p = (t / 9000) % 1; bus.position.x = p < .35 ? 14 * (1 - p / .35) : p < .7 ? 0 : -14 * (p - .7) / .3; bus.visible = Math.abs(bus.position.x) < 13; };
    return 4;
  },
  lampen(g) {   // a ring of colourful lamps around the plaza + light chains
    g.position.set(plazaCenter.x, .3, plazaCenter.z); g.userData.noSlot = true;
    const lights = [];
    const R = plazaSize / 2 - .8;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      g.add(mesh(new THREE.CylinderGeometry(.12, .16, 4), std(0x333842), x, 2, z));
      const l = glow(RAINBOW[i % RAINBOW.length], 4); l.position.set(x, 4.2, z); g.add(l); lights.push(l);
      const b = mesh(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshBasicMaterial({ color: RAINBOW[i % RAINBOW.length] }), x, 4.1, z); g.add(b);
    }
    g.userData.tick = t => lights.forEach((l, i) => { const k = 3.2 + Math.sin(t / 300 + i) * 1.2; l.scale.set(k, k, 1); });
    return 6;
  },
  feuerwerk(g) {
    g.add(mesh(new THREE.BoxGeometry(4, .6, 4), std(0x5a3a6a), 0, .3, 0));
    for (let i = 0; i < 5; i++) { const tube = mesh(new THREE.CylinderGeometry(.35, .35, 2.2, 10), std(RAINBOW[i], { emissive: RAINBOW[i], emissiveIntensity: .3 }), -1.4 + i * .7, 1.6, (i % 2 ? .6 : -.6)); tube.rotation.z = (i - 2) * .12; g.add(tube); }
    g.userData.nextFw = performance.now() + 6000;
    g.userData.tick = t => { if (t > g.userData.nextFw) { g.userData.nextFw = t + 12000; fireworks(g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -10, 0)), 3); } };
    setTimeout(() => fireworks(plazaCenter, 10), 600);
    return 4;
  },
  springbrunnen(g) {
    g.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, .9, 28), std(0xc8c8d0), 0, .45, 0));
    g.add(mesh(new THREE.CylinderGeometry(3, 3, .2, 28), std(0x33a8ff, { emissive: 0x115588, transparent: true, opacity: .85 }), 0, .85, 0));
    g.add(mesh(new THREE.CylinderGeometry(.4, .6, 2.4), std(0xc8c8d0), 0, 1.6, 0));
    const jet = mesh(new THREE.ConeGeometry(.9, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: .5 }), 0, 3.8, 0); g.add(jet);
    g.userData.tick = t => jet.scale.set(1, 1 + Math.sin(t / 250) * .15, 1);
    return 6;
  },
  spielplatz(g) {
    g.add(mesh(new THREE.BoxGeometry(7, .1, 6), std(0xe8c88a), 0, .05, 0));
    g.add(mesh(new THREE.BoxGeometry(1.6, 2.4, 1.6), std(0xff5aa0), -2, 1.2, -1));
    const slide = mesh(new THREE.BoxGeometry(1, .15, 3.4), std(0xffd23f), -2, 1.3, 1.2); slide.rotation.x = -.6; g.add(slide);
    for (const x of [1, 3.2]) g.add(mesh(new THREE.BoxGeometry(.15, 2.6, .15), std(0x33d6ff), x, 1.3, 0));
    g.add(mesh(new THREE.BoxGeometry(2.4, .15, .15), std(0x33d6ff), 2.1, 2.6, 0));
    const swing = new THREE.Group(); swing.position.set(2.1, 2.6, 0); g.add(swing);
    swing.add(mesh(new THREE.BoxGeometry(.05, 1.8, .05), std(0x999999), -.3, -.9, 0), mesh(new THREE.BoxGeometry(.05, 1.8, .05), std(0x999999), .3, -.9, 0), mesh(new THREE.BoxGeometry(.8, .1, .4), std(0x3ddc84), 0, -1.8, 0));
    g.userData.tick = t => swing.rotation.x = Math.sin(t / 500) * .5;
    return 4;
  },
  leuchtturm(g) {
    g.add(mesh(new THREE.CylinderGeometry(1.2, 1.8, 9, 16), std(0xf0f0f0, { emissiveMap: windowTexture(3, 1), emissive: 0xffffff, emissiveIntensity: .4 }), 0, 4.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, 1, 16), std(0xd03030), 0, 6.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(1, 1, 1.4, 16), std(0xfff3b0, { emissive: 0xffd060, emissiveIntensity: 1 }), 0, 9.7, 0));
    g.add(mesh(new THREE.ConeGeometry(1.4, 1.4, 16), std(0xd03030), 0, 11.1, 0));
    const beam = mesh(new THREE.ConeGeometry(2.4, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 8);
    beam.rotation.x = -Math.PI / 2; const bg = new THREE.Group(); bg.position.y = 9.7; bg.add(beam); g.add(bg);
    g.userData.tick = (t, dt) => bg.rotation.y += dt * .0012;
    return 12;
  },
  stadion(g) {
    g.add(mesh(new THREE.CylinderGeometry(4.4, 5, 2.6, 28, 1, true), std(0xd8d8e8, { side: THREE.DoubleSide }), 0, 1.3, 0));
    const field = mesh(new THREE.CircleGeometry(4.3, 28), std(0x3ca04a), 0, .2, 0); field.rotation.x = -Math.PI / 2; g.add(field);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; const l = glow(0xffffff, 5); l.position.set(Math.cos(a) * 5, 5, Math.sin(a) * 5); g.add(l); g.add(mesh(new THREE.CylinderGeometry(.1, .1, 5), std(0x555a66), Math.cos(a) * 5, 2.5, Math.sin(a) * 5)); }
    return 5;
  },
  flughafen(g) {
    const rw = mesh(new THREE.BoxGeometry(8, .1, 2), std(0x2a2d36), 0, .1, 1); g.add(rw);
    g.add(mesh(new THREE.CylinderGeometry(.5, .6, 5), std(0xd8d8e8), -3, 2.5, -2), mesh(new THREE.CylinderGeometry(1, .8, 1, 12), std(0x9fd8ff, { emissive: 0x3388aa }), -3, 5.4, -2));
    const plane = new THREE.Group(); plane.position.set(1, 1, 1); g.add(plane);
    plane.add(mesh(new THREE.CylinderGeometry(.35, .35, 3.6, 12), std(0xffffff), 0, 0, 0)); plane.children[0].rotation.z = Math.PI / 2;
    plane.add(mesh(new THREE.BoxGeometry(.8, .08, 4), std(0x2d6cdf), 0, 0, 0), mesh(new THREE.BoxGeometry(.5, 1, .08), std(0x2d6cdf), -1.6, .5, 0));
    g.userData.tick = t => { const p = (t / 7000) % 1; plane.position.x = -3 + p * 16; plane.position.y = 1 + Math.max(0, p - .35) * 18; plane.visible = p < .9; };
    return 6;
  },
  raketenstart(g) {
    g.add(mesh(new THREE.BoxGeometry(4, .5, 4), std(0x555a66), 0, .25, 0));
    const r = new THREE.Group(); g.add(r);
    r.add(mesh(new THREE.CylinderGeometry(.8, .8, 6, 16), std(0xf0f0f0), 0, 3.5, 0), mesh(new THREE.ConeGeometry(.8, 1.8, 16), std(0xd03030), 0, 7.4, 0));
    for (let i = 0; i < 3; i++) { const f = mesh(new THREE.BoxGeometry(.1, 1.4, 1), std(0xd03030), Math.cos(i * 2.09) * .8, 1.2, Math.sin(i * 2.09) * .8); f.rotation.y = -i * 2.09; r.add(f); }
    const flame = glow(0xff8a3d, 3); flame.position.y = .2; r.add(flame);
    g.userData.tick = t => flame.scale.setScalar(2.4 + Math.random() * 1.2);
    return 9;
  },
  loewe(g) {
    g.add(mesh(new THREE.BoxGeometry(3.5, 2, 3.5), std(0x9a9aa8), 0, 1, 0));
    const gold = std(0xffc23a, { metalness: .7, roughness: .3, emissive: 0x663300 });
    g.add(mesh(new THREE.SphereGeometry(2.1, 20, 16), gold, 0, 4.2, 0), mesh(new THREE.TorusGeometry(1.6, .7, 10, 20), std(0xc87a1a, { metalness: .5 }), 0, 5.6, .6), mesh(new THREE.SphereGeometry(1.2, 18, 14), gold, 0, 5.6, .9));
    return 8;
  },
  generator(g) {
    g.add(mesh(new THREE.BoxGeometry(4.6, 1, 4.6), std(0x3a3f5a), 0, .5, 0));
    const core = mesh(new THREE.CylinderGeometry(1, 1, 4, 16), std(0x33d6ff, { emissive: 0x33d6ff, emissiveIntensity: 1.2 }), 0, 3, 0); g.add(core);
    const rings = [0, 1, 2].map(i => { const r = mesh(new THREE.TorusGeometry(1.7, .14, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f }), 0, 1.8 + i * 1.2, 0); r.rotation.x = Math.PI / 2; g.add(r); return r; });
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) g.add(mesh(new THREE.CylinderGeometry(.18, .18, 4.4), std(0x777f99, { metalness: .6 }), x, 3.2, z));
    const halo = glow(0x33d6ff, 9); halo.position.y = 3; g.add(halo);
    g.userData.pulse = 0;
    g.userData.tick = (t, dt) => {
      rings.forEach((r, i) => { r.rotation.z += dt * .002 * (i % 2 ? -1 : 1); r.position.y = 1.8 + i * 1.2 + Math.sin(t / 400 + i) * .25; });
      g.userData.pulse = Math.max(0, g.userData.pulse - dt / 900);
      const k = 8 + Math.sin(t / 200) * 1 + g.userData.pulse * 14; halo.scale.set(k, k, 1);
      core.material.emissiveIntensity = 1.2 + g.userData.pulse * 2;
    };
    return 7;
  },
};
const modelFor = (kind, name) => {
  const n = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const keys = { riesenrad: 'riesenrad', bus: 'bushaltestelle', lamp: 'lampen', licht: 'lampen', feuerwerk: 'feuerwerk', brunnen: 'springbrunnen', spielplatz: 'spielplatz',
    leuchtturm: 'leuchtturm', stadion: 'stadion', flughafen: 'flughafen', rakete: 'raketenstart', lowe: 'loewe', loewe: 'loewe', generator: 'generator' };
  for (const [k, m] of Object.entries(keys)) if (n.includes(k)) return MODELS[m];
  return kind === 'coin' ? MODELS.stadion : MODELS.loewe;
};
function freeSlot() {
  const used = new Set(communityGroups.filter(g => !g.userData.noSlot).map(g => g.userData.slot));
  let i = communitySlots.findIndex((_, k) => !used.has(k));
  if (i < 0) {   // plaza full -> the oldest building makes room
    const old = communityGroups.find(g => !g.userData.noSlot && g.userData.kind !== 'generator');
    if (!old) return 0;
    i = old.userData.slot; scene.remove(old); communityGroups.splice(communityGroups.indexOf(old), 1);
  }
  return i;
}
function placeCommunity(kind, name) {
  const g = new THREE.Group();
  const model = modelFor(kind, name);
  const slot = freeSlot();
  const [dx, dz] = communitySlots[slot];
  g.position.set(plazaCenter.x + dx, .3, plazaCenter.z + dz);
  g.userData.slot = slot; g.userData.kind = kind;
  const h = model(g);                 // models may move themselves (e.g. lamps around the plaza)
  const lb = label(name, null); lb.position.y = h + 2.5; g.add(lb);
  if (g.userData.noSlot) lb.position.set(0, h + 2.5, -plazaSize / 2 + 1);
  scene.add(g); communityGroups.push(g);
  g.scale.setScalar(.01); animate(1200, x => g.scale.setScalar(Math.max(.01, easeOutBack(x))));
  focusOn(g.position, Math.min(h, 10), true);
  return g;
}
function buildCommunity(kind, name) {
  const g = placeCommunity(kind, name);
  state.built.push({ kind, name });
  fireworks(g.position, 8);
  banner(kind === 'coin' ? 'COIN-ZIEL!' : 'LIKE-ZIEL!', `${name} wurde gebaut! 🎉`);
  sfx('level');
}
// ---------- time generator (every 20.000 likes) ----------
function addGenerator(quiet = false) {
  state.generators = (state.generators || 0) + 1;
  if (!state.genNext || state.genNext < Date.now()) state.genNext = Date.now() + C.generator.intervalSeconds * 1000;
  const n = state.generators;
  placeCommunity('generator', n > 1 ? `⚡ Generator ${n}` : '⚡ Generator');
  if (quiet) return;
  banner('⚡ GENERATOR!', `${fmt(n * C.generator.everyLikes)} Likes · alle ${C.generator.intervalSeconds} Sek. +${n * C.generator.bonusSeconds} Sek. Zeit`, 'happy');
  shout(`⚡ <b>${fmt(n * C.generator.everyLikes)} Likes!</b> Ein Zeit-Generator läuft: alle ${C.generator.intervalSeconds} Sek. <b>+${C.generator.bonusSeconds} Sek.</b> für alle!`, 'teal');
  say(`${fmt(n * C.generator.everyLikes)} Likes! Generator an: alle ${C.generator.intervalSeconds} Sekunden ${C.generator.bonusSeconds} Sekunden mehr!`, 'goal');
  sfx('mega'); dirty = true;
}
function updateGenerators() {
  const n = state.generators || 0;
  if (!n || Date.now() < state.genNext) return;
  const secs = n * C.generator.bonusSeconds;
  state.roundEnd += secs * 1000;
  state.genNext = Date.now() + C.generator.intervalSeconds * 1000;
  timerBonus(`+${secs} Sek. · ⚡ Generator${n > 1 ? ' ×' + n : ''}`);
  for (const g of communityGroups) if (g.userData.kind === 'generator') { g.userData.pulse = 1; burst(g.position.clone().add(new THREE.Vector3(0, 5, 0)), 0x33d6ff, 30, 9, 1.2); }
  sfx('gen');
}

// =====================================================================================
// Quiz
// =====================================================================================
// quiz.active   = the question is on screen and answers are counted
// quiz.closing  = visible timer is over, late answers (stream delay) are still accepted for graceSeconds
const quiz = { active: false, closing: false, next: performance.now() + C.quiz.firstAfterSeconds * 1000, q: null, answers: new Map(), first: null, end: 0, asked: 0 };
// difficulty: every `harderEvery` questions of a city the quiz gets one stage harder (1 = easy … 4 = very hard)
const MAX_STAGE = Math.max(...QUESTIONS.map(q => q.d || 1));
// endless mode: after the hardest stage the quiz starts again at stage 1 (otherwise only the hardest questions would be left)
const quizStage = () => { const n = Math.floor(quiz.asked / Math.max(1, C.quiz.harderEvery)); return C.endless ? 1 + n % MAX_STAGE : Math.min(MAX_STAGE, 1 + n); };
const STAGE_NAME = ['', 'leicht', 'mittel', 'schwer', 'sehr schwer'];
// Questions are drawn per stage from a deck that is saved in the browser:
// no question repeats until ALL questions of that stage were asked – even across reloads, new cities and new streams.
function nextQuestion(stage = quizStage()) {
  let used = [];
  try { used = JSON.parse(localStorage.getItem('wissenscity_used') || '[]'); } catch { }
  const pool = QUESTIONS.filter(q => (q.d || 1) === stage);
  let left = pool.filter(q => !used.includes(q.q));
  if (!left.length) { const inPool = new Set(pool.map(q => q.q)); used = used.filter(u => !inPool.has(u)); left = [...pool]; }
  const q = left[Math.floor(Math.random() * left.length)];
  used.push(q.q);
  try { localStorage.setItem('wissenscity_used', JSON.stringify(used)); } catch { }
  quiz.left = left.length - 1;
  return q;
}
const quizBusy = () => quiz.active || quiz.closing;
function startQuiz() {
  const stage = quizStage();
  quiz.q = nextQuestion(stage); quiz.stage = stage; quiz.asked++;
  quiz.active = true; quiz.closing = false; quiz.answers.clear(); quiz.first = null;
  quiz.end = performance.now() + C.quiz.answerSeconds * 1000;
  quiz.next = performance.now() + C.quiz.everySeconds * 1000;          // every 40 s (start to start)
  quietForQuiz();                                                     // the quiz has priority: stop thank-you speech
  $('qStage').textContent = `Stufe ${stage} · ${STAGE_NAME[stage] || ''}`;
  $('qStage').className = 'qstage s' + stage;
  $('qText').textContent = quiz.q.q;
  ['qA', 'qB', 'qC'].forEach((id, i) => $(id).textContent = quiz.q.a[i]);
  ['qCA', 'qCB', 'qCC'].forEach(id => $(id).textContent = '0');
  document.querySelectorAll('.qopt').forEach(o => o.classList.remove('right', 'wrong'));
  $('qHint').innerHTML = `Schnell! <b>A</b>, <b>B</b> oder <b>C</b> in den Chat – nur ${C.quiz.answerSeconds} Sekunden! Nur die erste Antwort zählt · richtig = <b>+${C.quiz.pointsCorrect * mult()}</b> Baupunkte 🌹`;
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
// visible time is up -> show "Auswertung …" while late answers (TikTok delay) still count
function closeQuiz() {
  quiz.closing = true;
  $('qTimer').textContent = '⏳';
  $('qHint').innerHTML = `⏳ Zeit um! Auswertung … <small>(${quiz.answers.size} Antwort${quiz.answers.size === 1 ? '' : 'en'})</small>`;
}
function endQuiz() {
  quiz.active = false; quiz.closing = false;
  const right = [...quiz.answers.entries()].filter(([, a]) => a.idx === quiz.q.c);
  // spoken result first (before the points – so level-up lines don't jump the queue)
  const n = quiz.answers.size, ans = quiz.q.a[quiz.q.c].replace(/°/g, ' Grad').replace(/%/g, ' Prozent').replace(/\s*\(.*?\)/g, '');
  say(n ? `Richtig ist ${'ABC'[quiz.q.c]}: ${ans}! ${right.length} von ${n} lagen richtig.` : `Richtig ist ${'ABC'[quiz.q.c]}: ${ans}!`, 'quiz');
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
  if (quiz.answers.size && !C.endless) {
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
  setTimeout(() => { if (!quiz.active) { $('quiz').classList.add('hidden'); $('howto').classList.remove('hidden'); } }, 6000);
  // after every `harderEvery` questions: announce the next stage
  if (quiz.asked % C.quiz.harderEvery === 0 && quizStage() !== quiz.stage) {
    const st = quizStage();
    if (st > quiz.stage) {
      shout(`🧠 Quiz-<b>Stufe ${st}</b>: Ab jetzt wird es ${STAGE_NAME[st]}! 💪`, 'gold');
      say(`Achtung! Quiz-Stufe ${st}. Jetzt wird es ${STAGE_NAME[st]}!`, 'quiz');
    } else {
      shout(`🧠 Neue Quiz-Runde – wieder <b>Stufe 1</b>! 🍀`, 'teal');
      say('Neue Quiz-Runde! Wir fangen wieder leicht an.', 'quiz');
    }
  }
  releaseQuizSpeech();
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
  const gens = state.generators || 0;
  $('timerSub').textContent = C.endless ? '♾️ ohne Zeitlimit' : gens ? `⚡ Generator${gens > 1 ? ' ×' + gens : ''}: +${gens * C.generator.bonusSeconds} Sek. / ${C.generator.intervalSeconds} Sek.`
    : C.timerBonus.enabled ? `${C.timerBonus.coinsPerSecond} Coins = +1 Sek.` : 'Runde läuft';
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
  // big banners wait while the quiz card is on screen (they would cover the question) – except mega gifts / Happy Hour
  const quizShown = !$('quiz').classList.contains('hidden');
  if (quizShown && bannerQueue.length && !['mega', 'happy'].includes(bannerQueue[0].kind)) {
    bannerCur = null; bannerBusy = true; $('banner').classList.add('hidden'); bannerTimer = setTimeout(nextBanner, 400); return;
  }
  const it = bannerQueue.shift(); const b = $('banner');
  bannerCur = it || null;
  if (!it) { bannerBusy = false; b.classList.add('hidden'); return; }
  bannerBusy = true;
  $('bTitle').textContent = it.title; $('bSub').textContent = it.sub;
  b.className = 'hidden'; void b.offsetWidth; b.className = it.kind;
  bannerTimer = setTimeout(nextBanner, it.kind === 'mega' || it.kind === 'happy' ? 3600 : 2600);
}
let bonusTimer = null;
function timerBonus(text, bad = false) {
  if (C.endless) return; const el = $('timerBonus'); el.textContent = text; el.classList.toggle('bad', bad); el.classList.add('show'); clearTimeout(bonusTimer); bonusTimer = setTimeout(() => el.classList.remove('show'), 2500); }

// =====================================================================================
// Round reset
// =====================================================================================
function newCity() {
  const top = [...state.players.values()].filter(p => p.bp > 0).sort((a, b) => b.bp - a.bp).slice(0, 3);
  banner('NEUE STADT!', top.length ? `🏆 ${top.map(p => p.nick).join(' · ')}` : 'Bau mit!');
  fireworks(plazaCenter, 10);
  setTimeout(() => {
    // fresh start: houses, players, goals, community buildings, Happy Hour, lists –
    // only the best `keepTop` houses (default 5) stay with their level and build points
    const keep = [...state.players.values()].filter(p => p.bp > 0 && p.plot).sort((a, b) => b.bp - a.bp).slice(0, Math.max(0, C.keepTop));
    for (const pl of state.players.values()) if (!keep.includes(pl)) removeHouse(pl);
    state.players.clear(); state.lastGifts = [];
    for (const pl of keep) {
      pl.shares = 0; pl.likes = 0; state.players.set(pl.id, pl);
      // their success is halved: fewer build points -> lower level -> the house shrinks a bit
      pl.bp = Math.floor(pl.bp * C.keepTopFactor);
      placeHouse(pl, levelFor(pl.bp), false);
    }
    lastTop = keep.map(p => p.id);                    // no "throne" shout-outs right after the restart
    for (const g of communityGroups) scene.remove(g); communityGroups.length = 0; state.built = [];
    Object.assign(state, { coins: 0, likes: 0, coinGoalIdx: 0, likeGoalIdx: 0, coinBase: 0, likeBase: 0,
      coinTarget: C.coinGoal.target, likeTarget: C.likeGoal.target, timerCarry: 0, happyUntil: 0, generators: 0, genNext: 0, cityStart: Date.now() });
    nextRandomHappy = Date.now() + randMinutes(C.happy.randomEveryMinutes);
    quiz.asked = 0;                                   // new city -> quiz starts easy again
    state.roundEnd = Date.now() + C.roundMinutes * 60000; dirty = true;
    save();
    if (keep.length) {
      const names = keep.map(p => speakName(p.nick));
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1] : names[0];
      shout(`👑 Die Häuser von <b>${keep.map(p => esc(p.nick)).join('</b>, <b>')}</b> bleiben stehen – die Besten der letzten Stadt! 🏆${C.keepTopFactor < 1 ? ` (mit ${Math.round(C.keepTopFactor * 100)} % ihrer Punkte)` : ''}`, 'gold');
      say(`Die Häuser von ${list} bleiben stehen${C.keepTopFactor < 1 ? ', mit halben Punkten' : ''}!`.replace('halben', C.keepTopFactor === .5 ? 'halben' : 'weniger'), 'goal');
      for (const pl of keep) burst(new THREE.Vector3(pl.plot.x, (pl.top || 4) + 3, pl.plot.z), 0xffd23f, 60);
      if (keep[0]) focusHouse(keep[0], true);
    }
    shout('🏗️ Eine neue Stadt beginnt! Schreib <b>„Haus“</b> und bau mit! 🦁', 'teal');
  }, 2500);
}

// =====================================================================================
// Camera
// =====================================================================================
// The camera flies close to whatever just happened (new house, level-up, gift, follow, share, goal).
// Each shot is shown at least MIN ms; meanwhile only the newest wish is kept (+ important ones).
let focus = null; const focusQueue = [];
const FOCUS_MIN = 1900, FOCUS_MAX = 4200;
function focusOn(pos, height, important = false) {
  const it = { pos: pos.clone(), h: height, important };
  const now = performance.now();
  if (focus && focus.pos.distanceTo(it.pos) < .1) { focus.until = Math.max(focus.until, now + FOCUS_MAX); focus.h = Math.max(focus.h, height); return; }
  if (!focus || now >= focus.min) { startFocus(it); return; }
  for (let i = focusQueue.length - 1; i >= 0; i--) if (!focusQueue[i].important || focusQueue[i].pos.distanceTo(it.pos) < .1) focusQueue.splice(i, 1);
  focusQueue.push(it); if (focusQueue.length > 3) focusQueue.shift();
}
function startFocus(it) { const now = performance.now(); focus = { ...it, min: now + FOCUS_MIN, until: now + FOCUS_MAX, ang: Math.random() * .8 - .4 }; }
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateCamera(t, dt) {
  const ang = t * 0.00004;
  const ideal = new THREE.Vector3(Math.sin(ang) * 150, 140, Math.cos(ang) * 150 + 24);
  const look = new THREE.Vector3(0, 0, 8);
  const now = performance.now();
  if (focus && now >= focus.min && focusQueue.length) startFocus(focusQueue.shift());
  if (focus && now < focus.until) {
    const h = focus.h, dist = 13 + h * 1.1, a = focus.ang + (now - focus.min) * 0.00006;   // close-up, slowly circling
    ideal.set(focus.pos.x + Math.sin(a) * dist * .55, h * .6 + 7 + dist * .45, focus.pos.z + Math.cos(a) * dist);
    look.set(focus.pos.x, h * .45 + 2.5, focus.pos.z);   // house sits a bit below the banners
  }
  const k = 1 - Math.pow(.004, dt / 1000);
  camPos.lerp(ideal, k); camTarget.lerp(look, k);
  camera.position.copy(camPos); camera.lookAt(camTarget);
}
camPos.set(0, 150, 200);

// =====================================================================================
// Sound (small synthesized effects, no files needed)
// =====================================================================================
let actx = null;
function unlockAudio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if ('speechSynthesis' in window && !speech.unlocked) { speech.unlocked = true; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
  $('unlock').classList.add('hidden');
}
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });
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
  if (k === 'gen') { tone(330, .18, 'square', .06, 2); setTimeout(() => tone(990, .25, 'triangle', .09), 140); }
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
  rose: () => handle({ type: 'gift', ...bot(), giftName: 'Rose', count: 1, unit: 1, coins: 1 }),
  small: () => handle({ type: 'gift', ...bot(), giftName: 'Finger Heart', count: 1, unit: 5, coins: 5 }),
  rose10: () => handle({ type: 'gift', ...bot(), giftName: 'Rose', count: 10, unit: 1, coins: 10 }),
  big: () => handle({ type: 'gift', ...bot(), giftName: 'Löwe', count: 1, coins: 99 }),
  huge: () => handle({ type: 'gift', ...bot(), giftName: 'Universum', count: 1, coins: 500 }),
  likes: () => handle({ type: 'like', ...bot(), count: 500 }),
  likes5k: () => handle({ type: 'like', ...bot(), count: 5000 }),
  galaxy: () => handle({ type: 'gift', ...bot(), giftName: 'Galaxy', count: 1, coins: 1000 }),
  follow: () => handle({ type: 'follow', ...bot() }),
  member: () => handle({ type: 'member', ...bot() }),
  happy: () => startHappy([1, 2, 3, 4][Math.floor(Math.random() * 4)]),
  share: () => handle({ type: 'share', ...bot() }),
  quiz: () => { if (!quiz.active) startQuiz(); },
  answers: () => { if (!quiz.active) startQuiz(); const p = [.75, .5, .4, .3][quiz.stage - 1] ?? .5; for (let i = 0; i < 10; i++) setTimeout(() => quizBusy() && handle({ type: 'chat', ...bot(), text: Math.random() < p ? 'abc'[quiz.q.c] : 'abc'[Math.floor(Math.random() * 3)] }), 300 + i * 450); },
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
      coinTarget: state.coinTarget, likeTarget: state.likeTarget, coinBase: state.coinBase, likeBase: state.likeBase, roundEnd: state.roundEnd, lastGifts: state.lastGifts, happyUntil: state.happyUntil, cityStart: state.cityStart, built: state.built, generators: state.generators || 0, savedAt: Date.now(),
    }));
  } catch { /* storage not available */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('wissenscity') || 'null');
    if (!s || Date.now() - s.savedAt > 6 * 3600e3 || (!C.endless && s.roundEnd < Date.now())) return;
    if (s.cityStart) state.cityStart = s.cityStart;
    Object.assign(state, { coins: s.coins, likes: s.likes, coinGoalIdx: s.coinGoalIdx, likeGoalIdx: s.likeGoalIdx, coinTarget: s.coinTarget, likeTarget: s.likeTarget, coinBase: s.coinBase || 0, likeBase: s.likeBase || 0, roundEnd: s.roundEnd, lastGifts: s.lastGifts || [], happyUntil: s.happyUntil || 0 });
    for (const p of s.players) {
      const pl = { id: p.id, nick: p.nick, avatar: p.avatar, bp: p.bp, likes: p.likes || 0, level: -1, plot: null };
      state.players.set(pl.id, pl); const plot = freePlot(); if (plot) { pl.plot = plot; plot.owner = pl; placeHouse(pl, levelFor(pl.bp), false); }
    }
    for (const b of s.built || []) { placeCommunity(b.kind, b.name); state.built.push(b); }
    for (let i = 0; i < (s.generators || 0); i++) addGenerator(true);
    focus = null; focusQueue.length = 0;
  } catch { /* ignore broken save */ }
}
load();
setInterval(save, 5000);

// =====================================================================================
// Main loop
// =====================================================================================
function updateLabels() {
  const top = new Set([...state.players.values()].filter(p => p.plot).sort((a, b) => b.bp - a.bp).slice(0, 10).map(p => p.id));
  const tmp = new THREE.Vector3();
  for (const pl of state.players.values()) {
    const lb = pl.plot?.group?.userData.label; if (!lb) continue;
    lb.visible = top.has(pl.id) || camera.position.distanceTo(tmp.set(pl.plot.x, 0, pl.plot.z)) < 75;
  }
}
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
  if (quiz.active && !quiz.closing) { const left = Math.max(0, Math.ceil((quiz.end - t) / 1000)); $('qTimer').textContent = left; if (t >= quiz.end) closeQuiz(); }
  if (quiz.closing && t >= quiz.end + C.quiz.graceSeconds * 1000) endQuiz();
  // round timer (endless mode: no reset – the panel shows how long the city has existed)
  if (C.endless) state.roundEnd = Date.now() + C.roundMinutes * 60000;
  const rest = C.endless ? Date.now() - (state.cityStart || Date.now()) : Math.max(0, state.roundEnd - Date.now());
  const hh = Math.floor(rest / 3600000), mm = Math.floor(rest / 60000) % 60, ss = String(Math.floor(rest / 1000) % 60).padStart(2, '0');
  $('timer').textContent = hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
  $('timer').classList.toggle('long', hh > 0);
  if (!C.endless && rest <= 0 && !newCity.pending) { newCity.pending = true; newCity(); setTimeout(() => newCity.pending = false, 4000); }
  updateHappy(t);
  updateGenerators();
  for (const g of communityGroups) g.userData.tick?.(t, dt);
  if (dirty && t - lastHud > 250) { renderHUD(); lastHud = t; }
  warm.intensity = 1.1 + Math.sin(t / 900) * .1;
  updateCamera(t, dt);
  if (t - (loop.lastLabels || 0) > 300) { loop.lastLabels = t; updateLabels(); }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__game = { state, quiz, startQuiz, renderer, plots, SIM, speech, sayThanks, handle, nextQuestion, checkRanking, ensurePlayer, addBP, focusOn: (x, z, h) => focusOn(new THREE.Vector3(x, 0, z), h) };
