import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGameServer } from '../../server/index.js';

test('Quest arena transition preserves crouching height, controller offsets, and held gun', async ({ page }) => {
  const host = createGameServer();
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    const runtime = readFileSync(new URL('../../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
    await page.addInitScript({ content: runtime + `;(() => {
      const device = window.__xrDevice = new IWER.XRDevice(IWER.metaQuest3);
      device.position.set(.6, 1, -.3);
      device.controllers.left.position.set(.3, .7, -.6);
      device.controllers.right.position.set(.8, .5, -1.2);
      device.installRuntime({forceInstall: true});
    })();` });
    await page.setViewportSize({ width: 960, height: 720 });
    await page.goto(`http://127.0.0.1:${host.server.address().port}/`);
    await page.locator('#create').click(); await page.locator('#VRButton').click();
    await page.waitForFunction(() => stillLife.vr?.phase === 'presenting' && stillLife.tracking.ready);
    await page.evaluate(() => __xrDevice.controllers.right.updateButtonValue('squeeze', 1));
    await page.waitForFunction(() => stillLife.state.items.some(i => i.heldBy === stillLife.playerId));
    const gunId = await page.evaluate(() => stillLife.state.items.find(i => i.heldBy === stillLife.playerId).id);
    await page.evaluate(() => __xrDevice.controllers.right.updateButtonValue('trigger', 1));
    await page.waitForFunction(() => stillLife.state.phase === 'playing');
    await page.evaluate(() => {
      __xrDevice.controllers.right.updateButtonValue('trigger', 0);
      __xrDevice.controllers.left.updateAxes('thumbstick', 0, .8);
    });
    await page.waitForFunction(() => stillLife.tracking.head.p[2] > 4.2);
    await page.evaluate(() => { __xrDevice.controllers.left.updateAxes('thumbstick', 0, 0); __xrDevice.position.y -= .2; });
    await expect.poll(() => page.evaluate(() => stillLife.tracking.head.p[1])).toBeCloseTo(1.45, 3);
    const before = await page.evaluate(() => stillLife.tracking);
    const game = [...host.rooms.values()][0], playerId = await page.evaluate(() => stillLife.playerId);
    for (const e of game.enemies) game.hitEnemy(e, playerId);
    await page.waitForFunction(() => stillLife.environment.id === 'rooftop');
    await expect.poll(() => page.evaluate(() => stillLife.tracking.head.p[2])).toBeCloseTo(3.8, 3);
    await expect.poll(() => page.evaluate(() => {
      const p = stillLife.state.players.find(p => p.id === stillLife.playerId);
      return Math.hypot(...p.hands[1].p.map((n, i) => n - stillLife.tracking.hands[1].p[i]));
    })).toBeLessThan(.03);
    const after = await page.evaluate(() => stillLife.tracking);
    expect(after.head.p[0]).toBeCloseTo(-1.2, 3); expect(after.head.p[1]).toBeCloseTo(before.head.p[1], 3);
    after.hands.forEach((h, i) => h.p.forEach((n, axis) => expect(n - after.head.p[axis]).toBeCloseTo(before.hands[i].p[axis] - before.head.p[axis], 3)));
    const gun = game.held(playerId, 1); expect(gun.id).toBe(gunId); expect(gun.ammo).toBe(8);
    await page.waitForFunction(() => stillLife.state.wave === 2);
    await page.screenshot({ path: 'artifacts/vr-rooftop.png' });
    expect(errors).toEqual([]);
  } finally { await page.close(); await host.close(); }
});
