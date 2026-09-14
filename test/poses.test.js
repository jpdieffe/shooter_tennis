import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3, Quaternion } from 'three';
import { heldPose } from '../public/src/poses.js';
import { Game } from '../server/game.js';
import { direction } from '../public/shared/world.js';

const close = (actual, expected) => assert.ok(Math.hypot(...actual.map((v,i)=>v-expected[i])) < 1e-8, `${actual} should match ${expected}`);

test('both pistol hands stay at the grip but point and fire along the target ray after turning', () => {
  for (const hand of [0,1]) {
    const rig=new Group(), grip=new Group(), ray=new Group(); rig.add(grip,ray);
    rig.position.set(0,0,1); rig.rotation.y=Math.PI/6;
    grip.position.set(hand===0 ? -0.2 : 0.2,1.4,0);
    grip.rotation.x=Math.PI/2; // Grip's -Z points up when the controller aims forward.
    ray.position.copy(grip.position).add(new Vector3(0,0,-0.1));
    ray.rotation.x=-0.12;
    const pose=heldPose(grip,ray,'pistol');
    const aim=new Vector3(0,0,-1).applyQuaternion(ray.getWorldQuaternion(new Quaternion())).toArray();
    close(pose.p,grip.getWorldPosition(new Vector3()).toArray()); close(direction(pose.q),aim);
    assert.ok(Math.abs(direction(grip.getWorldQuaternion(new Quaternion()).toArray())[1])>.99);

    const game=new Game('AIM'), player=game.addPlayer(); player.active=true;
    player.head.p=[0,1.65,1];
    const hands=[structuredClone(pose),structuredClone(pose)];
    assert.equal(game.updatePose(player.id,{head:player.head,hands},0.1),true);
    const gun=game.items[0]; gun.p=[...pose.p]; game.grab(player.id,hand);
    assert.equal(game.held(player.id,hand),gun);
    game.step(1/60); close(direction(gun.q),aim); // Remote held-item orientation.
    game.phase='playing'; game.shoot(player.id,hand);
    close(game.bullets[0].v,aim.map(n=>n*24));
    close(game.bullets[0].p,pose.p.map((n,i)=>n+aim[i]*0.23));
    game.release(player.id,hand,[0,0,-3]); close(direction(gun.q),aim);
  }
});

test('household props and desktop pistols retain their grip orientation', () => {
  const grip=new Group(), ray=new Group(); grip.rotation.set(.7,.3,-.2); ray.rotation.set(-.3,.2,.1);
  const expected=grip.getWorldQuaternion(new Quaternion()).toArray();
  for(const kind of ['mug','bottle','pan','vase',undefined]) close(heldPose(grip,ray,kind).q,expected);
  close(heldPose(grip,null,'pistol').q,expected);
});
