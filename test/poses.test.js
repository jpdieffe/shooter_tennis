import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3, Quaternion, PerspectiveCamera, ArrayCamera } from 'three';
import { heldPose, updateTrackedHead, calibrateRig } from '../public/src/poses.js';
import { Game } from '../server/game.js';
import { direction, PISTOL_MUZZLE, turnAroundHead } from '../public/shared/world.js';

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
    close(game.bullets[0].p,new Vector3(...PISTOL_MUZZLE).applyQuaternion(new Quaternion(...pose.q)).add(new Vector3(...pose.p)).toArray());
    game.release(player.id,hand,[0,0,-3]); close(direction(gun.q),aim);
  }
});

test('household props and desktop pistols retain their grip orientation', () => {
  const grip=new Group(), ray=new Group(); grip.rotation.set(.7,.3,-.2); ray.rotation.set(-.3,.2,.1);
  const expected=grip.getWorldQuaternion(new Quaternion()).toArray();
  for(const kind of ['mug','bottle','pan','vase',undefined]) close(heldPose(grip,ray,kind).q,expected);
  close(heldPose(grip,null,'pistol').q,expected);
});

const frameAt = (position, orientation = new Quaternion()) => ({getViewerPose: () => ({transform:{position:new Vector3(...position),orientation}})});

test('head and gun share world coordinates from spawn through locomotion, snap turns, and shooting', () => {
  const game=new Game('WORLD'), player=game.addPlayer(); player.active=true;
  const rig=new Group(), head=new PerspectiveCamera(), grip=new Group(), ray=new Group(); rig.add(head,grip,ray);
  rig.position.set(player.head.p[0],0,player.head.p[2]);
  const local=[.7,.95,-.4]; // Seated, physically off-center in the Quest play space.
  updateTrackedHead(head,frameAt(local),{});
  grip.position.set(local[0]+.25,local[1]-.3,local[2]-.45); ray.position.copy(grip.position); ray.rotation.x=-.1;
  calibrateRig(rig,head,{anchor:player.head.p,eyeHeight:1.65});
  close(head.getWorldPosition(new Vector3()).toArray(),player.head.p);
  const send = () => {
    const pose=heldPose(grip,ray,'pistol');
    const headPose={p:head.getWorldPosition(new Vector3()).toArray(),q:head.getWorldQuaternion(new Quaternion()).toArray()};
    assert.equal(game.updatePose(player.id,{head:headPose,hands:[pose,pose]},game.elapsed),true);
    close(player.head.p,headPose.p); close(player.hands[1].p,pose.p); return pose;
  };
  let pose=send(); const gun=game.items[0]; gun.p=[...pose.p]; game.grab(player.id,1);
  for(let i=0;i<30;i++){rig.position.z-=.035;game.elapsed+=1/30;pose=send();}
  const before=head.getWorldPosition(new Vector3()).toArray();
  rig.position.fromArray(turnAroundHead(rig.position.toArray(),before,Math.PI/3)); rig.rotation.y+=Math.PI/3;
  game.elapsed+=1/30;pose=send();close(head.getWorldPosition(new Vector3()).toArray(),before);
  game.phase='playing';game.shoot(player.id,1);
  const renderedMuzzle=new Vector3(...PISTOL_MUZZLE).applyQuaternion(new Quaternion(...pose.q)).add(new Vector3(...pose.p));
  close(game.bullets[0].p,renderedMuzzle.toArray());
  assert.ok(renderedMuzzle.distanceTo(new Vector3(-1.2,1.2,3.4))>.8);
});

test('tracked head avoids the parentless XR camera world-getter trap', () => {
  const rig=new Group();rig.position.set(-1.2,.6,3.8);rig.rotation.y=.7;rig.updateMatrixWorld(true);
  const internal=new ArrayCamera();internal.position.set(.4,1.1,-.2);internal.updateMatrix();
  internal.matrixWorld.multiplyMatrices(rig.matrixWorld,internal.matrix);
  // The old code calls this getter, which replaces matrixWorld with a local pose.
  close(internal.getWorldPosition(new Vector3()).toArray(),[.4,1.1,-.2]);
  const head=new PerspectiveCamera();rig.add(head);updateTrackedHead(head,frameAt([.4,1.1,-.2]),{});
  close(head.getWorldPosition(new Vector3()).toArray(),new Vector3(.4,1.1,-.2).applyMatrix4(rig.matrixWorld).toArray());
});

test('height calibration moves head and hands together and preserves physical crouching', () => {
  const rig=new Group(),head=new PerspectiveCamera(),grip=new Group();rig.add(head,grip);
  updateTrackedHead(head,frameAt([.2,1.05,.1]),{});grip.position.set(.45,.75,-.35);
  const relative=grip.getWorldPosition(new Vector3()).sub(head.getWorldPosition(new Vector3()));
  calibrateRig(rig,head,{eyeHeight:1.65});
  assert.ok(Math.abs(head.getWorldPosition(new Vector3()).y-1.65)<1e-8);
  close(grip.getWorldPosition(new Vector3()).sub(head.getWorldPosition(new Vector3())).toArray(),relative.toArray());
  updateTrackedHead(head,frameAt([.2,.7,.1]),{});
  assert.ok(Math.abs(head.getWorldPosition(new Vector3()).y-1.3)<1e-8);
  calibrateRig(rig,head,{eyeHeight:null});assert.equal(rig.position.y,0);
  assert.equal(updateTrackedHead(head,{getViewerPose:()=>null},{}),false);
  assert.equal(updateTrackedHead(head,null,{}),false);
});
