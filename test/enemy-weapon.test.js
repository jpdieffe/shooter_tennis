import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { makeEnemy, aimEnemyWeapon } from '../public/src/scene.js';
import { enemyWeaponPose, pistolMuzzle, PISTOL_MUZZLE, direction } from '../public/shared/world.js';
import { Game } from '../server/game.js';

const close = (a, b) => assert.ok(Math.hypot(...a.map((n, i) => n - b[i])) < 1e-8, `${a} should match ${b}`);

test('enemy pistol faces forward and its rendered muzzle matches the server for different headings and target heights', () => {
  for (const yaw of [-2.7, -1, 0, 1.4, Math.PI]) for (const height of [.7, 1.65, 2.1]) {
    const enemy = {p:[1,0,-2],yaw,aim:[1+Math.sin(yaw)*5,height,-2+Math.cos(yaw)*5]};
    const model = makeEnemy('shooter'); model.position.fromArray(enemy.p); model.rotation.y=yaw;
    aimEnemyWeapon(model,enemy.aim); model.updateMatrixWorld(true);
    const gun=model.userData.weapon, pose=enemyWeaponPose(enemy);
    close(gun.getWorldPosition(new Vector3()).toArray(),pose.p);
    const muzzle=new Vector3(...PISTOL_MUZZLE).applyMatrix4(gun.matrixWorld);
    close(muzzle.toArray(),pistolMuzzle(pose));
    const barrel=new Vector3(0,0,-1).applyQuaternion(gun.getWorldQuaternion(new Quaternion()));
    close(barrel.toArray(),new Vector3(...enemy.aim).sub(muzzle).normalize().toArray());
    assert.ok(barrel.dot(new Vector3(Math.sin(yaw),0,Math.cos(yaw)))>.9);
  }
  const idle=makeEnemy('shooter'); idle.updateMatrixWorld(true);
  close(new Vector3(0,0,-1).applyQuaternion(idle.userData.weapon.getWorldQuaternion(new Quaternion())).toArray(),[0,0,1]);
  assert.equal(makeEnemy('rusher').userData.weapon,undefined);
});

test('enemy shots spawn at the actual gun muzzle and travel down its barrel', () => {
  const game=new Game('ENEMY'), player=game.addPlayer(); player.active=true; player.head.p=[1,1.65,2];
  game.phase='playing';game.wave=1;
  const enemy={id:'100',p:[0,0,-1.5],yaw:0,health:1,cooldown:0,type:'shooter'};game.enemies=[enemy];
  game.step(1/60);
  const shot=game.events.find(e=>e.type==='enemyshot'), bullet=game.bullets.find(b=>b.owner===enemy.id);
  assert.ok(shot);assert.ok(bullet);
  const model=makeEnemy('shooter');model.position.fromArray(enemy.p);model.rotation.y=enemy.yaw;
  aimEnemyWeapon(model,enemy.aim);model.updateMatrixWorld(true);
  const muzzle=new Vector3(...PISTOL_MUZZLE).applyMatrix4(model.userData.weapon.matrixWorld);
  close(shot.p,muzzle.toArray());close(bullet.v,direction(enemyWeaponPose(enemy).q).map(n=>n*5.5));
  assert.ok(muzzle.distanceTo(new Vector3(enemy.p[0],1.35,enemy.p[2]))>.7);
});
