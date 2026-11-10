import * as THREE from 'three';
import { QUESTIONS } from './questions.js';

// =====================================================================================
// Config & helpers
// =====================================================================================
const CFG = await fetch('/config.json').then(r => r.json()).catch(() => ({}));
const C = {
  cityName: CFG.cityName || 'Wissens-City',
  roundMinutes: CFG.roundMinutes || 20,
  timerBonus: CFG.timerBonus || { enabled: true, coinsPerSecond: 50 },
  coinGoal: CFG.coinGoal || { names: ['Stadion'], target: 5000 },
  likeGoal: CFG.likeGoal || { names: ['Löwen-Statue'], target: 10000 },
  quiz: CFG.quiz || { everySeconds: 70, answerSeconds: 20, pointsCorrect: 2, pointsFirst: 5 },
  likesPerBP: CFG.likesPerBuildPoint || 50,
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
const LEVELS = [ // build points needed, name
  [0, 'Baustelle'], [1, 'Zelt'], [5, 'Hütte'], [15, 'Häuschen'], [40, 'Stadthaus'],
  [100, 'Villa'], [250, 'Große Villa'], [600, 'Hochhaus'], [1500, 'Löwen-Turm'],
];
const levelFor = bp => { let l = 0; for (let i = 0; i < LEVELS.length; i++) if (bp >= LEVELS[i][0]) l = i; return l; };

const state = {
  players: new Map(),            // id -> {id, nick, avatar, bp, level, plot, likes}
  coins: 0, likes: 0, coinGoalIdx: 0, likeGoalIdx: 0, coinBase: 0, likeBase: 0,
  coinTarget: C.coinGoal.target, likeTarget: C.likeGoal.target,
  roundEnd: Date.now() + C.roundMinutes * 60000,
  lastGifts: [], built: [],      // community buildings
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
  switch (level) {
    case 0: { // construction site
      add(box(4.5, .3, 4.5, 0x8a6a3a), 0, .15, 0);
      for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) add(box(.25, 2.2, .25, 0xf2c14e), x, 1.1, z);
      add(box(4, .25, .25, 0xf2c14e), 0, 2.1, -1.8); break;
    }
    case 1: { const t = new THREE.Mesh(new THREE.ConeGeometry(2, 2.8, 4), new THREE.MeshStandardMaterial({ color: col })); t.castShadow = true; add(t, 0, 1.4, 0); break; }
    case 2: add(box(3.2, 2.2, 3.2, col, 1, 2), 0, 1.1, 0); add(roof(3.2, 3.2, 1.8, rc), 0, 3.1, 0); break;
    case 3: add(box(4, 3, 3.6, col, 1, 3), 0, 1.5, 0); add(roof(4, 3.6, 2.2, rc), 0, 4.1, 0); add(box(.5, 1.6, .5, 0x777777), 1.2, 4.6, .6); break;
    case 4: add(box(4.2, 5.2, 4.2, col, 2, 3), 0, 2.6, 0); add(roof(4.2, 4.2, 2.4, rc), 0, 6.4, 0); break;
    case 5: add(box(5.6, 4, 4, col, 2, 4), 0, 2, -.4); add(roof(5.6, 4, 2.2, rc), 0, 5.1, -.4);
      add(box(2.4, .2, 1.6, 0x3aa0ff), 1.5, .25, 2.2); break; // pool
    case 6: add(box(5.8, 6, 3.8, col, 3, 4), 0, 3, -.6); add(box(2.6, 4, 2.6, col, 2, 2), -1.6, 2, 1.8);
      add(roof(5.8, 3.8, 2.4, rc), 0, 7.2, -.6); add(roof(2.6, 2.6, 1.6, rc), -1.6, 4.8, 1.8);
      add(box(2.4, .2, 1.6, 0x3aa0ff), 1.8, .25, 2.2); break;
    case 7: add(box(4.6, 16, 4.6, 0x9fb0c8, 8, 3), 0, 8, 0); add(box(3.4, 2, 3.4, 0x6a7a90, 1, 2), 0, 17, 0);
      { const a = add(box(.2, 3, .2, 0xff3b3b), 0, 19.5, 0); a.material.emissive = new THREE.Color(0xff2020); } break;
    default: { // 8: golden lion tower
      const gold = 0xffc23a;
      add(box(5, 22, 5, gold, 11, 3), 0, 11, 0); add(box(3.8, 3, 3.8, 0xfff0b0, 1, 2), 0, 23.5, 0);
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 16), new THREE.MeshStandardMaterial({ color: gold, emissive: 0xff9a00, emissiveIntensity: .8, metalness: .6, roughness: .3 }));
      add(s, 0, 26.5, 0);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(16, 16, 1); add(halo, 0, 26.5, 0);
    }
  }
  return g;
}
const HOUSE_TOP = [3, 3, 4, 5.5, 8, 7, 9, 20, 29];

// name labels
function label(text, level) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 54px Fredoka, Arial'; const w = Math.min(500, g.measureText(text).width + 70);
  g.fillStyle = level >= 7 ? 'rgba(120,80,0,.85)' : 'rgba(10,12,28,.8)';
  g.beginPath(); g.roundRect((512 - w) / 2, 20, w, 84, 42); g.fill();
  g.strokeStyle = level >= 7 ? '#ffd23f' : 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 64, 460);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, sizeAttenuation: false }));
  const k = level >= 7 ? 1.25 : 1; s.scale.set(.095 * k, .024 * k, 1); s.renderOrder = 10; return s;
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
    pl = { id, nick: nick || id, avatar: avatar || '', bp: 0, level: -1, plot: null, likes: 0 };
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
  const lb = label(pl.nick.slice(0, 16), level); lb.position.y = HOUSE_TOP[level] + 1.6; g.add(lb);
  scene.add(g); p.group = g; pl.level = level;
  h.scale.set(1, .01, 1);
  animate(900, x => h.scale.set(1, Math.max(.01, easeOutBack(x)), 1));
  if (celebrate) {
    burst(new THREE.Vector3(p.x, HOUSE_TOP[level] * .6, p.z), level >= 7 ? 0xffd23f : 0x8affc8, 30 + level * 8);
    if (level >= 3) { focusOn(new THREE.Vector3(p.x, 0, p.z), HOUSE_TOP[level]); banner(`LEVEL ${level}!`, `${LEVELS[level][1]} · ${pl.nick}`); sfx('level'); }
    else sfx('build');
  }
}
function addBP(pl, amount) {
  if (!pl) return;
  pl.bp += amount;
  const lv = levelFor(pl.bp);
  if (lv !== pl.level) placeHouse(pl, lv, true);
  dirty = true;
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
      const m = t.match(/^([abc])\b[\s).!]*$/);
      if (m && quiz.active) { quizAnswer(ev, 'abc'.indexOf(m[1])); break; }
      if (C.joinWords.some(w => t.includes(w))) ensurePlayer(ev.user, ev.nick, ev.avatar);
      break;
    }
    case 'gift': {
      const pl = ensurePlayer(ev.user, ev.nick, ev.avatar);
      const coins = ev.coins || 1;
      addBP(pl, coins);
      state.coins += coins;
      if (C.timerBonus.enabled) {
        const secs = Math.floor(coins / C.timerBonus.coinsPerSecond);
        if (secs > 0) { state.roundEnd += secs * 1000; timerBonus(`+${secs} Sek. · ${pl.nick}`); }
      }
      state.lastGifts.unshift({ nick: pl.nick, gift: ev.giftName, count: ev.count, bp: coins });
      state.lastGifts.length = Math.min(state.lastGifts.length, 3);
      toast(`${giftIcon(ev.giftName)} <b>${esc(pl.nick)}</b> hat ${esc(ev.giftName)} gesendet`, ev.count > 1 ? `×${ev.count}` : '', ev.avatar);
      checkGoals(); dirty = true; sfx('gift');
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
const giftIcon = n => /rose/i.test(n || '') ? '🌹' : /lion|löwe/i.test(n || '') ? '🦁' : /universe|universum/i.test(n || '') ? '🌌' : '🎁';

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
  scene.add(g); state.built.push({ kind, name });
  g.scale.setScalar(.01); animate(1200, x => g.scale.setScalar(Math.max(.01, easeOutBack(x))));
  focusOn(g.position, 8); fireworks(g.position, 8);
  banner(kind === 'coin' ? 'COIN-ZIEL!' : 'LIKE-ZIEL!', `${name} wurde gebaut! 🎉`);
}

// =====================================================================================
// Quiz
// =====================================================================================
const quiz = { active: false, next: performance.now() + 15000, q: null, answers: new Map(), first: null, end: 0, deck: [] };
function nextQuestion() {
  if (!quiz.deck.length) quiz.deck = [...QUESTIONS].sort(() => Math.random() - .5);
  return quiz.deck.pop();
}
function startQuiz() {
  quiz.q = nextQuestion(); quiz.active = true; quiz.answers.clear(); quiz.first = null;
  quiz.end = performance.now() + C.quiz.answerSeconds * 1000;
  $('qText').textContent = quiz.q.q;
  ['qA', 'qB', 'qC'].forEach((id, i) => $(id).textContent = quiz.q.a[i]);
  ['qCA', 'qCB', 'qCC'].forEach(id => $(id).textContent = '0');
  document.querySelectorAll('.qopt').forEach(o => o.classList.remove('right', 'wrong'));
  $('qHint').innerHTML = 'Schreib <b>A</b>, <b>B</b> oder <b>C</b> in den Chat! Richtig = Baupunkte 🏗️';
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
  for (const [id, a] of right) { const pl = ensurePlayer(id, a.nick, a.avatar); addBP(pl, C.quiz.pointsCorrect + (id === quiz.first ? C.quiz.pointsFirst : 0)); }
  const firstNick = quiz.first ? quiz.answers.get(quiz.first).nick : null;
  $('qHint').innerHTML = right.length
    ? `✅ <b>${right.length}</b> richtig! +${C.quiz.pointsCorrect} Baupunkte${firstNick ? ` · ⚡ Schnellste/r: <b>${esc(firstNick)}</b> +${C.quiz.pointsFirst}` : ''}`
    : `Richtig war <b>${'ABC'[quiz.q.c]}</b> – niemand hatte es! 😮`;
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
  $('lastGifts').innerHTML = state.lastGifts.map(g => `<div class="entry"><span class="medal">${giftIcon(g.gift)}</span><span class="n">${esc(g.nick)}<small>${g.count > 1 ? g.count + '× ' : ''}${esc(g.gift)} · +${fmt(g.bp)} BP</small></span></div>`).join('')
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
let bannerTimer = null;
function banner(title, sub) {
  const b = $('banner'); $('bTitle').textContent = title; $('bSub').textContent = sub;
  b.classList.add('hidden'); void b.offsetWidth; b.classList.remove('hidden');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), 2600);
}
let bonusTimer = null;
function timerBonus(text) { const el = $('timerBonus'); el.textContent = text; el.classList.add('show'); clearTimeout(bonusTimer); bonusTimer = setTimeout(() => el.classList.remove('show'), 2500); }

// =====================================================================================
// Round reset
// =====================================================================================
function newCity() {
  const top = [...state.players.values()].sort((a, b) => b.bp - a.bp).slice(0, 3);
  banner('NEUE STADT!', top.length ? `🏆 ${top.map(p => p.nick).join(' · ')}` : 'Bau mit!');
  fireworks(plazaCenter, 10);
  setTimeout(() => {
    for (const pl of state.players.values()) removeHouse(pl);
    state.players.clear(); state.lastGifts = [];
    state.roundEnd = Date.now() + C.roundMinutes * 60000; dirty = true;
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
      coinTarget: state.coinTarget, likeTarget: state.likeTarget, coinBase: state.coinBase, likeBase: state.likeBase, roundEnd: state.roundEnd, lastGifts: state.lastGifts, savedAt: Date.now(),
    }));
  } catch { /* storage not available */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('wissenscity') || 'null');
    if (!s || Date.now() - s.savedAt > 6 * 3600e3 || s.roundEnd < Date.now()) return;
    Object.assign(state, { coins: s.coins, likes: s.likes, coinGoalIdx: s.coinGoalIdx, likeGoalIdx: s.likeGoalIdx, coinTarget: s.coinTarget, likeTarget: s.likeTarget, coinBase: s.coinBase || 0, likeBase: s.likeBase || 0, roundEnd: s.roundEnd, lastGifts: s.lastGifts || [] });
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
  if (dirty && t - lastHud > 250) { renderHUD(); lastHud = t; }
  warm.intensity = 1.1 + Math.sin(t / 900) * .1;
  updateCamera(t, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__game = { state, SIM, handle };
