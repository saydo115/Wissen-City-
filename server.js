// Wissens-City LIVE – kleiner lokaler Server
// 1. liefert das Spiel (Ordner "public") unter http://localhost:PORT aus
// 2. verbindet sich mit deinem TikTok-LIVE und leitet Geschenke, Likes, Kommentare an das Spiel weiter
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DEMO = process.argv.includes('--demo') || !config.tiktokUsername || config.tiktokUsername === 'DEIN_TIKTOK_NAME';
const PORT = config.port || 8080;

// ------------------------------------------------------------------ static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const ROUTES = {
  '/vendor/three.module.js': path.join(__dirname, 'node_modules/three/build/three.module.js'),
  '/vendor/three.core.js': path.join(__dirname, 'node_modules/three/build/three.core.js'),
  '/config.json': path.join(__dirname, 'config.json'),
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = ROUTES[url] || path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(__dirname)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Nicht gefunden'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

// ------------------------------------------------------------------ websocket to the game
const wss = new WebSocketServer({ server });
let status = { type: 'status', connected: false, demo: DEMO, message: DEMO ? 'Demo-Modus (kein TikTok verbunden)' : 'Verbinde mit TikTok …' };
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
function setStatus(patch) { status = { ...status, ...patch }; broadcast(status); console.log('[Status]', status.message); }
wss.on('connection', ws => ws.send(JSON.stringify(status)));

const userOf = d => ({
  user: d.user?.uniqueId || d.uniqueId || 'unbekannt',
  nick: d.user?.nickname || d.nickname || d.user?.uniqueId || d.uniqueId || 'Zuschauer',
  avatar: d.user?.profilePicture?.url?.[0] || d.profilePictureUrl || '',
});

// ------------------------------------------------------------------ TikTok connection
async function startTikTok() {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
  const connection = new TikTokLiveConnection(config.tiktokUsername, { enableExtendedGiftInfo: true });
  let loggedGift = false;

  connection.on(ControlEvent.CONNECTED, state => setStatus({ connected: true, message: `Verbunden mit @${config.tiktokUsername} (Raum ${state.roomId})` }));
  connection.on(ControlEvent.DISCONNECTED, () => { setStatus({ connected: false, message: 'Verbindung getrennt – neuer Versuch in 15 s' }); setTimeout(connect, 15000); });
  connection.on(ControlEvent.ERROR, err => console.log('[Fehler]', err?.info || err?.message || err));

  connection.on(WebcastEvent.CHAT, d => broadcast({ type: 'chat', ...userOf(d), text: d.comment || '' }));
  connection.on(WebcastEvent.LIKE, d => broadcast({ type: 'like', ...userOf(d), count: d.likeCount || 1, total: d.totalLikeCount || 0 }));
  connection.on(WebcastEvent.MEMBER, d => broadcast({ type: 'member', ...userOf(d) }));
  connection.on(WebcastEvent.GIFT, d => {
    const giftType = d.giftDetails?.giftType ?? d.giftType;
    if (giftType === 1 && !d.repeatEnd) return;            // streak still running -> wait for the final event
    const repeat = d.repeatCount || 1;
    const diamonds = d.giftDetails?.diamondCount ?? d.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1;
    const name = d.giftDetails?.giftName || d.giftName || d.extendedGiftInfo?.name || 'Geschenk';
    if (!loggedGift) { loggedGift = true; console.log('[Erstes Geschenk – Rohdaten zur Kontrolle]', JSON.stringify({ name, diamonds, repeat, giftType })); }
    broadcast({ type: 'gift', ...userOf(d), giftName: name, count: repeat, coins: Math.max(1, diamonds) * repeat });
  });

  async function connect() {
    try {
      setStatus({ connected: false, message: `Verbinde mit @${config.tiktokUsername} …` });
      await connection.connect();
    } catch (e) {
      const offline = /offline|not live|UserOffline/i.test(String(e?.name || '') + String(e?.message || ''));
      setStatus({ connected: false, message: offline ? `@${config.tiktokUsername} ist gerade nicht LIVE – neuer Versuch in 30 s` : `Fehler: ${e?.message || e} – neuer Versuch in 30 s` });
      setTimeout(connect, 30000);
    }
  }
  connect();
}

server.listen(PORT, () => {
  console.log('');
  console.log('  🦁  Wissens-City LIVE läuft!');
  console.log(`  ➜  Spiel:        http://localhost:${PORT}`);
  console.log(`  ➜  Testmodus:    http://localhost:${PORT}/?demo=1`);
  console.log(DEMO ? '  ➜  Demo-Modus: In config.json deinen TikTok-Namen eintragen, um live zu verbinden.' : `  ➜  TikTok:       @${config.tiktokUsername}`);
  console.log('');
  if (!DEMO) startTikTok().catch(e => setStatus({ connected: false, message: 'TikTok-Modul konnte nicht geladen werden: ' + e.message }));
  else setStatus({});
});
