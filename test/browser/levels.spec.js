import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createGameServer } from '../../server/index.js';
import { LEVELS } from '../../public/shared/levels.js';

test('both players change arenas together, late joins match, and scenery resources stay bounded', async ({ page, browser }) => {
  test.setTimeout(120000);
  // An isolated real server lets the test clear waves without a production
  // cheat endpoint or making browser clients authoritative over the game.
  const host = createGameServer();
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${host.server.address().port}/`;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  try {
    await page.goto(url); await page.locator('#create').click(); await expect(page.locator('#lobby')).toBeVisible();
    const code = await page.locator('#lobby-code').textContent(), game = host.rooms.get(code);
    const friend = await context.newPage(); friend.on('pageerror', error => errors.push(error.message));
    await friend.goto(url); await friend.locator('#room-code').fill(code); await friend.locator('#join').click();
    await expect(friend.locator('#roster')).toContainText('2/2');
    await page.bringToFront(); await page.locator('#start').click();
    await page.waitForFunction(() => stillLife.state.phase === 'playing');
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => stillLife.state.players.find(p => p.id === stillLife.playerId).head.p[2] > 4.15);
    await page.keyboard.up('KeyS');
    const player = game.players.get(await page.evaluate(() => stillLife.playerId));
    const gun = game.items[0]; gun.heldBy = player.id; gun.hand = 1; gun.p = [...player.hands[1].p]; gun.ammo = 2;
    const resources = [];
    for (let wave = 2; wave <= 8; wave++) {
      for (const enemy of game.enemies) game.hitEnemy(enemy, player.id);
      await page.waitForFunction(w => stillLife.state.levelWave === w, wave);
      await friend.waitForFunction(w => stillLife.state.levelWave === w, wave);
      const level = LEVELS[(wave - 1) % LEVELS.length];
      expect(await page.evaluate(() => stillLife.environment.id)).toBe(level.id);
      expect(await friend.evaluate(() => stillLife.environment.id)).toBe(level.id);
      await expect.poll(() => page.evaluate(() => stillLife.state.players.find(p => p.id === stillLife.playerId).head.p[2])).toBeCloseTo(3.8, 2);
      expect(game.held(player.id, 1).id).toBe(gun.id); expect(gun.ammo).toBe(8);
      await page.waitForFunction(() => stillLife.state.phase === 'playing');
      resources.push(await page.evaluate(() => stillLife.stats));
    }
    // Repeat the same roof with comparable entity counts: no accumulating
    // arena geometry, textures, or lights from the previous six environments.
    expect(resources.at(-1).textures).toBeLessThanOrEqual(resources[0].textures + 2);
    expect(resources.at(-1).geometries).toBeLessThan(resources[0].geometries + 220);
    await friend.close(); await page.waitForFunction(() => stillLife.state.players.length === 1);
    const late = await context.newPage(); await late.goto(url); await late.locator('#room-code').fill(code); await late.locator('#join').click();
    await late.waitForFunction(() => stillLife.environment.id === 'rooftop' && stillLife.state.wave === 8);
    expect(errors).toEqual([]);
  } finally { await context.close(); await page.close(); await host.close(); }
});

test('all six environments render with a bounded static draw budget', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./'); await page.waitForFunction(() => !!window.stillLife);
  const shots = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createArena } = await import('./src/environments.js');
    const { LEVELS } = await import('./shared/levels.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(960, 720); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 960 / 720, .05, 90);
    camera.position.set(11, 10, 15); camera.lookAt(0, .5, -1);
    const results = [];
    for (const level of LEVELS) {
      const arena = createArena(scene, level); renderer.render(scene, camera);
      results.push({ id: level.id, calls: renderer.info.render.calls, image: renderer.domElement.toDataURL('image/png') });
      arena.dispose();
      if (scene.children.length) throw new Error('Old arena retained scene children');
    }
    renderer.dispose(); renderer.forceContextLoss(); return results;
  });
  for (const shot of shots) {
    expect(shot.calls, shot.id).toBeLessThan(40);
    writeFileSync(`artifacts/arena-${shot.id}.png`, Buffer.from(shot.image.split(',')[1], 'base64'));
  }
  expect(errors).toEqual([]);
});
