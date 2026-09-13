import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

function client(url) {
  const ws = new WebSocket(url), messages = [], waiters = [];
  ws.on('message', raw => { const msg = JSON.parse(raw); messages.push(msg); for (const fn of [...waiters]) fn(); });
  const wait = (predicate, timeout = 3000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiters.splice(waiters.indexOf(check), 1); reject(new Error('Timed out waiting for server message')); }, timeout);
    function check() { const at = messages.findIndex(predicate); if (at < 0) return; clearTimeout(timer); const i = waiters.indexOf(check); if (i >= 0) waiters.splice(i, 1); resolve(messages.splice(at, 1)[0]); }
    waiters.push(check); check();
  });
  return { ws, wait, ready: new Promise(resolve => ws.on('open', resolve)), send: data => ws.send(JSON.stringify(data)) };
}
test('two real sockets join, share state, reject a third, and clean up', async () => {
  const app = createGameServer(); await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  const port = app.server.address().port, url = `ws://127.0.0.1:${port}/ws`;
  const a = client(url), b = client(url), c = client(url);
  try {
    await Promise.all([a.ready, b.ready, c.ready]);
    a.send({ type: 'create', name: 'Alpha' }); const welcome = await a.wait(m => m.type === 'welcome');
    assert.match(welcome.code, /^[A-HJ-NP-Z2-9]{5}$/);
    b.send({ type: 'join', code: welcome.code, name: 'Bravo' }); await b.wait(m => m.type === 'welcome');
    const shared = await a.wait(m => m.type === 'state' && m.players.length === 2); assert.deepEqual(shared.players.map(p => p.name), ['Alpha', 'Bravo']);
    c.send({ type: 'join', code: welcome.code }); assert.match((await c.wait(m => m.type === 'error')).message, /two players/);
    a.send({ type: 'start' }); assert.equal((await b.wait(m => m.phase === 'countdown')).phase, 'countdown');
    b.ws.close(); const alone = await a.wait(m => m.type === 'state' && m.players.length === 1); assert.equal(alone.players[0].id, welcome.id);
    const response = await fetch(`http://127.0.0.1:${port}/`); assert.equal(response.status, 200); assert.match(await response.text(), /STILL LIFE/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/vendor/three/build/three.module.js`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/game.js`)).status, 404);
    a.ws.close(); await new Promise(resolve => a.ws.once('close', resolve));
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(app.rooms.size, 0);
  } finally { a.ws.terminate(); b.ws.terminate(); c.ws.terminate(); await app.close(); }
});
test('invalid room and malformed messages fail without crashing the server', async () => {
  const app = createGameServer(); await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  const c = client(`ws://127.0.0.1:${app.server.address().port}/ws`);
  try {
    await c.ready; c.send({ type: 'join', code: 'XXXXX' }); assert.match((await c.wait(m => m.type === 'error')).message, /not found/);
    c.ws.send('{bad'); assert.match((await c.wait(m => m.type === 'error')).message, /Invalid/);
    c.send({ type: 'create' }); assert.ok((await c.wait(m => m.type === 'welcome')).id);
  } finally { c.ws.terminate(); await app.close(); }
});
test('heartbeat tolerates missed pongs briefly, then removes a dead connection', async () => {
  const app = createGameServer({ heartbeatIntervalMs: 20, heartbeatTimeoutMs: 180 });
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, { autoPong: false });
  try {
    await new Promise(resolve => ws.once('open', resolve));
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(ws.readyState, WebSocket.OPEN);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Dead socket was not cleaned up')), 1500);
      ws.once('close', () => { clearTimeout(timer); resolve(); });
    });
  } finally { ws.terminate(); await app.close(); }
});
