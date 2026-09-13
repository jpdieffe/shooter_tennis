import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
export function createGameServer({ heartbeatIntervalMs = 15000, heartbeatTimeoutMs = 90000 } = {}) {
  const rooms = new Map();
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const vendor = path.startsWith('/vendor/three/');
      const base = resolve(root, vendor ? 'node_modules/three' : 'public');
      const relative = vendor ? path.slice('/vendor/three/'.length) : path === '/' ? 'index.html' : path.slice(1);
      const target = resolve(base, relative);
      if (!target.startsWith(base + sep) || !(await stat(target)).isFile()) throw new Error('Not found');
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 250000) ws.send(JSON.stringify(data)); };
  wss.on('connection', ws => {
    ws.lastPong = Date.now(); ws.bucket = 160; ws.bucketAt = Date.now();
    ws.on('pong', () => { ws.lastPong = Date.now(); });
    ws.on('error', () => {});
    ws.on('message', raw => {
      const now = Date.now(); ws.bucket = Math.min(160, ws.bucket + (now - ws.bucketAt) * 0.1); ws.bucketAt = now;
      if (--ws.bucket < 0) { ws.close(1008, 'Too many messages'); return; }
      let msg; try { msg = JSON.parse(raw); } catch { send(ws, { type: 'error', message: 'Invalid message.' }); return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'create' || msg.type === 'join') {
        if (ws.game) { send(ws, { type: 'error', message: 'Leave your current room first.' }); return; }
        let game;
        if (msg.type === 'create') {
          if (rooms.size >= 100) { send(ws, { type: 'error', message: 'Server full. Please try again later.' }); return; }
          let code; do { code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while (rooms.has(code));
          game = new Game(code); rooms.set(code, game);
        } else game = rooms.get(String(msg.code || '').trim().toUpperCase());
        if (!game) { send(ws, { type: 'error', message: 'Room not found. Check the code and server address.' }); return; }
        try {
          const player = game.addPlayer(msg.name); ws.game = game; ws.playerId = player.id;
          send(ws, { type: 'welcome', id: player.id, code: game.code, spawn: player.head.p });
          send(ws, { type: 'state', ...game.snapshot() });
        } catch (err) { send(ws, { type: 'error', message: err.message }); }
        return;
      }
      const game = ws.game; if (!game) return;
      const p = game.players.get(ws.playerId); if (!p) return;
      switch (msg.type) {
        case 'pose': game.updatePose(p.id, msg); break;
        case 'grab': game.grab(p.id, msg.hand); break;
        case 'release': game.release(p.id, msg.hand, msg.velocity); break;
        case 'shoot': game.shoot(p.id, msg.hand); break;
        case 'start': game.start(); break;
        case 'active': p.active = Boolean(msg.active); break;
        case 'ping': send(ws, { type: 'pong', at: msg.at }); break;
      }
    });
    ws.on('close', () => {
      if (!ws.game) return;
      ws.game.removePlayer(ws.playerId);
      if (!ws.game.players.size) rooms.delete(ws.game.code);
    });
  });
  let last = performance.now(), ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    for (const game of rooms.values()) game.step(dt);
    if (++ticks % 3 === 0) for (const game of rooms.values()) {
      const packet = { type: 'state', ...game.snapshot() };
      for (const ws of wss.clients) if (ws.game === game) send(ws, packet);
    }
  }, 1000 / 60);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (Date.now() - ws.lastPong > heartbeatTimeoutMs) { ws.terminate(); continue; }
      ws.ping();
    }
  }, heartbeatIntervalMs);
  async function close() {
    clearInterval(timer); clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(done => wss.close(done));
    await new Promise(done => server.close(done));
  }
  return { server, rooms, close };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createGameServer();
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => console.log(`Still Life running at http://localhost:${port}\nQuest requires an HTTPS URL. See README.md.`));
}
