import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { LEVELS, levelForWave } from '../public/shared/levels.js';
import { moveBody, segmentBox, distance } from '../public/shared/world.js';

test('all arenas have clear spawn points, reachable supplies, and connected combat lanes', () => {
  assert.equal(new Set(LEVELS.map(l => l.id)).size, 6);
  for (let wave = 1; wave <= 18; wave++) assert.notEqual(levelForWave(wave).id, levelForWave(wave + 1).id);
  for (const level of LEVELS) {
    const clear = p => !level.solids.some(s => segmentBox([p[0], .65, p[2]], [p[0], .65, p[2]], s, .27));
    const game = new Game('LEVEL'); game.wave = LEVELS.indexOf(level); game.spawnWave();
    for (const spawn of [...level.playerSpawns, ...game.enemies.map(e => e.p)]) {
      assert.ok(clear(spawn), `${level.id}: spawn inside cover at ${spawn}`);
      assert.ok(spawn[0] >= level.bounds.minX && spawn[0] <= level.bounds.maxX && spawn[2] >= level.bounds.minZ && spawn[2] <= level.bounds.maxZ);
    }
    for (const item of level.items) {
      assert.ok(!level.solids.some(s => segmentBox(item.p, item.p, s)), `${level.id}: ${item.kind} embedded in cover`);
      assert.ok(item.p[1] <= 1.6, `${level.id}: unreachable supply`);
    }
    // Flood the walkable floor at half-metre spacing. Every spawn must reach
    // the staging area, not a sealed pocket formed by decorative cover.
    const queue = [[0, 5]], visited = new Set(['0,5']);
    for (let index = 0; index < queue.length; index++) {
      const [x, z] = queue[index];
      for (const [dx, dz] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) {
        const nx = x + dx, nz = z + dz, key = `${nx},${nz}`;
        if (visited.has(key) || nx < -7 || nx > 7 || nz < -7 || nz > 6 || !clear([nx, 0, nz])) continue;
        const next = moveBody([x, 0, z], dx, dz, .26, level);
        if (next[0] !== nx || next[2] !== nz) continue;
        visited.add(key); queue.push([nx, nz]);
      }
    }
    for (const spawn of [...level.playerSpawns, ...level.spawns]) assert.ok(queue.some(([x, z]) => Math.hypot(x - spawn[0], z - spawn[2]) < .6), `${level.id}: unreachable spawn`);
  }
});

test('each arena uses its own cover for movement and server projectile collisions', () => {
  for (const [index, level] of LEVELS.entries()) {
    const game = new Game('COVER'), player = game.addPlayer();
    game.levelWave = index + 1; game.phase = 'playing'; game.wave = index + 1;
    player.active = true; player.motion = 1; game.timeScale = 1;
    const cover = level.solids.find(s => s.kind !== 'table');
    const front = cover.z + cover.d / 2;
    assert.equal(moveBody([cover.x, 1.65, front + .5], 0, -1, .23, level)[2], front + .5);
    game.enemies = [{ id: 'guard', p: [6, 0, -6], yaw: 0, health: 1, cooldown: 100, type: 'rusher' }];
    game.bullets = [{ id: 'test', p: [cover.x, .65, front + .1], v: [0, 0, -24], owner: player.id, enemy: false, life: 5 }];
    game.step(.05); assert.equal(game.bullets.length, 0, `${level.id}: bullet passed through cover`);
  }
  const roof = levelForWave(2), point = [-3.8, 1.65, .7];
  assert.equal(moveBody(point, 0, -1, .23, roof)[2], .7);
  assert.notEqual(moveBody(point, 0, -1)[2], .7, 'a roof vent must not remain in the apartment');
});

test('wave changes reset both players safely, retain held items, reject stale poses, and reset the run', () => {
  const game = new Game('SWAP'), a = game.addPlayer(), b = game.addPlayer();
  a.active = true; a.motion = 1; game.timeScale = 1;
  const gun = game.items[0]; a.hands[1].p = [...gun.p]; game.grab(a.id, 1); gun.ammo = 2;
  game.start(); game.spawnWave();
  assert.equal(game.held(a.id, 1).id, gun.id);
  a.head.p = [-5, 1.1, 5]; a.hands[1].p = [-4.8, .8, 4.5];
  b.head.p = [4, 1.85, -3]; b.health = 0;
  const oldHands = a.hands.map(h => h.p.map((n, i) => n - a.head.p[i]));
  const stale = { head: structuredClone(a.head), hands: structuredClone(a.hands), levelRevision: game.levelRevision };
  game.enemies = []; game.bullets = [{ id: 'old', p: [0, 3, -5], v: [0, 0, 0], life: 5 }];
  game.step(.016);
  assert.equal(game.phase, 'countdown'); assert.equal(game.level.id, 'rooftop'); assert.equal(game.levelRevision, 1);
  assert.ok(distance(a.head.p, [-1.2, 1.1, 3.8]) < 1e-8); assert.ok(distance(b.head.p, [1.2, 1.85, 3.8]) < 1e-8);
  a.hands.forEach((h, i) => h.p.forEach((n, axis) => assert.ok(Math.abs(n - a.head.p[axis] - oldHands[i][axis]) < 1e-8)));
  assert.equal(gun.ammo, 8); assert.ok(distance(gun.p, a.hands[1].p) < 1e-8);
  assert.equal(game.bullets.length, 0); assert.equal(game.items.length, game.level.items.length + 1);
  assert.equal(game.updatePose(a.id, stale), false); assert.ok(distance(a.head.p, [-1.2, 1.1, 3.8]) < 1e-8);
  assert.equal(game.updatePose(a.id, { head: a.head, hands: a.hands, levelRevision: 1 }), true);
  game.spawnWave(); assert.equal(game.wave, 2); assert.equal(b.health, 1);
  const snapshot = game.snapshot(); assert.equal(snapshot.levelId, 'rooftop'); assert.equal(snapshot.levelWave, 2);
  game.removePlayer(b.id); const late = game.addPlayer('Late');
  assert.deepEqual(late.head.p, [1.2, 1.65, 3.8]); assert.equal(game.snapshot().levelRevision, 1);
  game.phase = 'gameover'; game.start();
  assert.equal(game.level.id, 'apartment'); assert.equal(game.levelRevision, 2); assert.equal(game.held(a.id, 1), undefined);
  assert.equal(game.items.length, game.level.items.length); assert.equal(a.health, 3);
});
