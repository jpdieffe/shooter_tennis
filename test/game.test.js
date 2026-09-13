import test from 'node:test';
import assert from 'node:assert/strict';
import { Game as BaseGame } from '../server/game.js';
import { segmentBox, moveBody } from '../public/shared/world.js';
class Game extends BaseGame {
  addPlayer(name) { const p = super.addPlayer(name); p.active = true; return p; }
}

test('room capacity and item ownership are enforced', () => {
  const game = new Game('TEST1'), a = game.addPlayer('A'), b = game.addPlayer('B');
  assert.throws(() => game.addPlayer('C'), /two players/);
  const gun = game.items.find(i => i.kind === 'pistol');
  game.items = [gun];
  a.hands[1].p = [...gun.p]; b.hands[1].p = [...gun.p];
  game.grab(a.id, 1); game.grab(b.id, 1);
  assert.equal(gun.heldBy, a.id); assert.equal(game.held(b.id, 1), undefined);
  game.removePlayer(a.id); assert.equal(gun.heldBy, null);
  game.grab(b.id, 1); assert.equal(gun.heldBy, b.id);
});
test('the most active living player controls the shared clock', () => {
  const game = new Game('TEST1'), a = game.addPlayer(), b = game.addPlayer();
  a.motion = 0; b.motion = 1;
  for (let i = 0; i < 60; i++) { a.lastPose = b.lastPose = game.elapsed; game.step(1 / 60); }
  assert.ok(game.timeScale > 0.99);
  b.health = 0;
  for (let i = 0; i < 60; i++) { a.lastPose = game.elapsed; game.step(1 / 60); }
  assert.ok(game.timeScale < 0.04);
});
test('pose input rejects malformed data and clamps position and reach', () => {
  const game = new Game('TEST1'), p = game.addPlayer();
  assert.equal(game.updatePose(p.id, { head: { p: [NaN, 0, 0] } }), false);
  assert.equal(game.updatePose(p.id, { head: { p: [100, 1, 100], q: [0, 0, 0, 2] }, hands: [{ p: [100, 1, 100], q: [0, 0, 0, 1] }, { p: [100, 1, 100], q: [0, 0, 0, 1] }] }), true);
  assert.ok(p.head.p[0] < 0); assert.equal(p.head.q[3], 1);
  assert.ok(Math.hypot(...p.hands[0].p.map((n, i) => n - p.head.p[i])) < 1.71);
});
test('gun fire consumes ammo and cannot be spoofed without ownership', () => {
  const game = new Game('TEST1'), p = game.addPlayer(); game.phase = 'playing';
  game.shoot(p.id, 1); assert.equal(game.bullets.length, 0);
  const gun = game.items[0]; p.hands[1].p = [...gun.p]; game.grab(p.id, 1);
  game.shoot(p.id, 1); assert.equal(game.bullets.length, 1); assert.equal(gun.ammo, 7);
  game.shoot(p.id, 1); assert.equal(gun.ammo, 7);
  game.elapsed += 0.2; game.release(p.id, 1, [0, 0, 0]); game.shoot(p.id, 1); assert.equal(gun.ammo, 7);
});
test('swept bullets shatter enemies and waves revive downed teammates', () => {
  const game = new Game('TEST1'), a = game.addPlayer(), b = game.addPlayer();
  game.phase = 'playing'; game.wave = 1; a.motion = 1; game.timeScale = 1; b.health = 0;
  game.enemies = [{ id: 'target', p: [0, 0, -1], yaw: 0, health: 1, type: 'rusher', cooldown: 100 }];
  game.bullets = [{ id: 'shot', p: [0, 1.4, 0], v: [0, 0, -24], owner: a.id, enemy: false, life: 5 }];
  game.step(0.05); assert.equal(game.kills, 1); assert.equal(a.score, 1); assert.equal(game.phase, 'countdown');
  for (let i = 0; i < 85; i++) { a.lastPose = game.elapsed; game.step(0.05); }
  assert.equal(game.wave, 2); assert.equal(b.health, 1); assert.equal(game.phase, 'playing');
});
test('thrown household objects damage enemies', () => {
  const game = new Game('TEST1'), p = game.addPlayer(); game.phase = 'playing'; p.motion = 1; game.timeScale = 1;
  const mug = game.items.find(i => i.kind === 'mug'); p.hands[1].p = [0, 1.1, 0]; mug.p = [0, 1.1, 0]; game.grab(p.id, 1);
  game.release(p.id, 1, [0, 0, -18]);
  game.enemies = [{ id: 'target', p: [0, 0, -0.8], yaw: 0, health: 1, type: 'rusher', cooldown: 100 }];
  game.step(0.05); assert.equal(game.kills, 1); assert.equal(p.score, 1);
});
test('enemy bullets damage players and end the run', () => {
  const game = new Game('TEST1'), p = game.addPlayer(); game.phase = 'playing'; p.health = 1; p.motion = 1; game.timeScale = 1;
  game.enemies = [{ id: 'target', p: [0, 0, -5], yaw: 0, health: 1, type: 'rusher', cooldown: 100 }];
  game.bullets = [{ id: 'shot', p: [p.head.p[0], 1.65, 3.5], v: [0, 0, 6], owner: 'enemy', enemy: true, life: 5 }];
  game.step(0.05); assert.equal(p.health, 0); assert.equal(game.phase, 'gameover');
});
test('solid furniture blocks swept projectiles and player movement', () => {
  assert.equal(segmentBox([-2, 1, 0], [2, 1, 0], { x: 0, y: 1, z: 0, w: 1, h: 2, d: 1 }), true);
  assert.equal(segmentBox([-2, 3, 0], [2, 3, 0], { x: 0, y: 1, z: 0, w: 1, h: 2, d: 1 }), false);
  const p = moveBody([-1.65, 1.65, 3], 0, -1); assert.equal(p[2], 3);
});
test('starting a run preserves a weapon grabbed in the lobby', () => {
  const game = new Game('TEST1'), p = game.addPlayer(); p.hands[1].p = [...game.items[0].p]; game.grab(p.id, 1);
  const id = game.held(p.id, 1).id; game.start(); assert.equal(game.held(p.id, 1).id, id);
});
test('a surviving partner disconnecting ends the run for a downed player', () => {
  const game = new Game('TEST1'), a = game.addPlayer(), b = game.addPlayer(); game.phase = 'playing'; a.health = 0;
  game.removePlayer(b.id); game.step(1 / 60); assert.equal(game.phase, 'gameover');
});
