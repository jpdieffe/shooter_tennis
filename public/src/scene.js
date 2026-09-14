import { levelForWave } from '../shared/levels.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLIDS, PISTOL_MUZZLE, ENEMY_SHOULDER, ENEMY_GUN_REACH, enemyWeaponPose } from '../shared/world.js';

export const palette = { red: 0xe94430, ink: 0x202a29, teal: 0x29bba8, paper: 0xeaece3 };
const white = new THREE.MeshStandardMaterial({ color: 0xe7e9df, roughness: 0.9 });
const edge = new THREE.MeshStandardMaterial({ color: 0xb9bfb0, roughness: 1 });
const black = new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.58, metalness: 0.25 });
const red = new THREE.MeshStandardMaterial({ color: palette.red, roughness: 0.27, metalness: 0.1, flatShading: true });
const teal = new THREE.MeshStandardMaterial({ color: palette.teal, roughness: 0.4, flatShading: true });
export const sharedMaterials = new Set([white, edge, black, red, teal]);

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
function cylinder(top, bottom, height, sides, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function textPlane(text, width, color = '#202a29', background = null) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 128); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 62px monospace';
  const fontSize = Math.min(62, 62 * 980 / Math.max(1, ctx.measureText(text).width));
  ctx.font = `bold ${fontSize}px monospace`; ctx.fillText(text, 512, 64);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}
export function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'pistol') {
    g.add(box(0.085, 0.1, 0.3, black, 0, 0.025, -0.085));
    const handle = box(0.075, 0.16, 0.085, black, 0, -0.095, 0.025); handle.rotation.x = -0.2; g.add(handle);
    g.add(box(0.035, 0.018, 0.04, red, 0, 0.085, -0.16));
    g.add(box(0.026, 0.035, 0.008, edge, PISTOL_MUZZLE[0], PISTOL_MUZZLE[1], PISTOL_MUZZLE[2] + 0.004));
    g.add(box(0.018, 0.07, 0.04, black, 0, -0.06, -0.065));
  } else if (kind === 'bottle') {
    g.add(cylinder(0.064, 0.06, 0.22, 8, black));
    g.add(cylinder(0.025, 0.06, 0.06, 8, black, 0, 0.14));
    g.add(cylinder(0.025, 0.025, 0.09, 8, black, 0, 0.21));
    g.add(cylinder(0.065, 0.065, 0.06, 8, edge, 0, 0.01));
  } else if (kind === 'mug') {
    g.add(cylinder(0.075, 0.06, 0.14, 10, black));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 5, 10), black); ring.position.x = 0.09; g.add(ring);
    const top = cylinder(0.058, 0.058, 0.006, 10, edge, 0, 0.072); g.add(top);
  } else if (kind === 'pan') {
    const pan = cylinder(0.17, 0.15, 0.055, 12, black, 0, 0, -0.22); pan.rotation.x = Math.PI / 2; g.add(pan);
    g.add(box(0.05, 0.05, 0.25, black, 0, 0, 0.02));
  } else {
    g.add(cylinder(0.065, 0.1, 0.14, 7, black, 0, 0.1));
    g.add(cylinder(0.1, 0.07, 0.19, 7, black, 0, -0.065));
  }
  return g;
}
export function makeEnemy(type = 'rusher', ally = false) {
  const g = new THREE.Group(), mat = ally ? teal : red;
  const torso = cylinder(0.28, 0.18, 0.62, 5, mat, 0, 1.12); torso.scale.z = 0.62; g.add(torso);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat); head.scale.set(0.82, 1.15, 0.85); head.position.y = 1.67; head.castShadow = true; g.add(head);
  const hips = box(0.32, 0.19, 0.22, mat, 0, 0.75); g.add(hips);
  const limbs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.12, 0.72, 0); leg.add(box(0.14, 0.67, 0.16, mat, 0, -0.33)); leg.add(box(0.15, 0.12, 0.27, mat, 0, -0.64, 0.05)); g.add(leg); limbs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * ENEMY_SHOULDER[0], ENEMY_SHOULDER[1], ENEMY_SHOULDER[2]);
    if (type === 'shooter' && s === 1) {
      arm.add(box(0.12, 0.13, ENEMY_GUN_REACH, mat, 0, 0, -ENEMY_GUN_REACH / 2));
      const gun = makeItem('pistol'); gun.position.z = -ENEMY_GUN_REACH; arm.add(gun);
      arm.add(box(0.1, 0.1, 0.1, mat, 0, -0.07, -ENEMY_GUN_REACH + 0.025));
      arm.rotation.y = Math.PI; g.userData.weaponArm = arm; g.userData.weapon = gun;
    } else {
      arm.add(box(0.12, 0.51, 0.13, mat, 0, -0.25));
      arm.rotation.x = type === 'shooter' ? -1.35 : -0.35; arm.rotation.z = s * 0.18;
    }
    g.add(arm); limbs.push(arm);
  }
  g.userData.limbs = limbs; return g;
}
export function aimEnemyWeapon(mesh, aim) {
  if (!mesh.userData.weaponArm) return;
  const pose = enemyWeaponPose({ p: mesh.position.toArray(), yaw: 2 * Math.atan2(mesh.quaternion.y, mesh.quaternion.w), aim });
  mesh.userData.weaponArm.quaternion.copy(mesh.quaternion).invert().multiply(new THREE.Quaternion(...pose.q));
}
export function makeAlly() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), teal); head.scale.set(0.85, 1, 0.9);
  head.add(box(0.26, 0.08, 0.06, black, 0, 0.015, -0.17)); g.add(head);
  const hands = [box(0.085, 0.11, 0.14, teal), box(0.085, 0.11, 0.14, teal)]; g.add(...hands);
  const body = cylinder(0.25, 0.16, 0.48, 5, teal); body.scale.z = 0.65; g.add(body);
  g.userData = { head, hands, body }; return g;
}
export function createWorld(scene) {
  scene.background = new THREE.Color(palette.paper); scene.fog = new THREE.Fog(palette.paper, 15, 42);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb1baa7, 2.7));
  const sun = new THREE.DirectionalLight(0xfff9e9, 3.6); sun.position.set(-6, 14, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; scene.add(sun);
  const floor = box(70, 0.15, 70, white, 0, -0.1, 0); scene.add(floor);
  const tile = new THREE.GridHelper(15, 15, 0xb9c0b1, 0xd0d5c8); tile.position.set(0, 0.003, -0.5); tile.material.transparent = true; tile.material.opacity = 0.6; scene.add(tile);
  scene.add(box(15.6, 0.045, 0.08, black, 0, 0.02, 6.75), box(0.08, 0.045, 14.5, black, -7.75, 0.02, -0.5), box(0.08, 0.045, 14.5, black, 7.75, 0.02, -0.5));
  // Low side walls keep the landing-page cutaway readable; the rear wall anchors VR scale.
  scene.add(box(15.6, 3.7, 0.22, white, 0, 1.85, -7.7));
  scene.add(box(0.2, 1.0, 14.4, white, -7.8, 0.5, -0.4), box(0.2, 1, 14.4, white, 7.8, 0.5, -0.4));
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xaeb7a7, roughness: 1 });
  for (const x of [-6.5, 0, 6.5]) {
    scene.add(box(1.3, 2.65, 0.06, doorMat, x, 1.325, -7.55));
    scene.add(box(1.38, 0.045, 0.065, red, x, 2.69, -7.5));
    const number = textPlane(x === 0 ? '02' : x < 0 ? '01' : '03', 0.65, '#e94430'); number.position.set(x, 2.97, -7.5); scene.add(number);
  }
  for (const s of SOLIDS) {
    if (s.kind === 'table') {
      scene.add(box(s.w, 0.09, s.d, white, s.x, 0.96, s.z));
      for (const dx of [-0.75, 0.75]) for (const dz of [-0.3, 0.3]) scene.add(box(0.06, 0.91, 0.06, black, s.x + dx, 0.455, s.z + dz));
      const label = textPlane('TAKE YOUR PICK', 0.85, '#747e6c'); label.position.set(s.x, 1.012, s.z + 0.27); label.rotation.x = -Math.PI / 2; scene.add(label);
    } else if (s.kind === 'sofa') {
      scene.add(box(s.w, 0.45, s.d, edge, s.x, 0.33, s.z));
      scene.add(box(0.3, 0.7, s.d, white, s.x + 0.5, 0.66, s.z));
      for (const dz of [-0.97, 0, 0.97]) scene.add(box(0.96, 0.22, 0.9, white, s.x - 0.09, 0.64, s.z + dz));
      for (const dz of [-1.42, 1.42]) scene.add(box(s.w, 0.6, 0.24, white, s.x, 0.67, s.z + dz));
    } else {
      scene.add(box(s.w, s.h, s.d, white, s.x, s.y, s.z));
      if (s.kind === 'island') { scene.add(box(s.w + 0.08, 0.07, s.d + 0.08, edge, s.x, 1.18, s.z)); for (const dx of [-0.65, 0, 0.65]) scene.add(box(0.55, 0.65, 0.02, edge, s.x + dx, 0.64, s.z + 0.56)); }
    }
  }
  const sign = textPlane('STILL / LIFE', 3.6, '#7b8572'); sign.position.set(0, 3.23, -7.52); scene.add(sign);
  // Abstract framed prints, a rug, and a low-poly plant give the room a domestic silhouette.
  for (const x of [-4.5, 4.5]) {
    scene.add(box(1.15, 1.3, 0.06, black, x, 2.04, -7.51));
    scene.add(box(1.04, 1.19, 0.04, white, x, 2.04, -7.46));
    const art = new THREE.Mesh(new THREE.CircleGeometry(0.35, 3), red); art.position.set(x, 2.06, -7.43); art.rotation.z = x; scene.add(art);
  }
  const rug = box(3.5, 0.008, 3.2, new THREE.MeshStandardMaterial({ color: 0xd6dbce }), 3.8, 0.011, 0.3); scene.add(rug);
  scene.add(cylinder(0.3, 0.21, 0.48, 7, edge, -6.9, 0.24, 5.4));
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 3), new THREE.MeshStandardMaterial({ color: 0x9ba78e, flatShading: true }));
    leaf.position.set(-6.9 + Math.sin(i * 2) * 0.18, 0.9, 5.4 + Math.cos(i * 2) * 0.18); leaf.rotation.z = Math.sin(i) * 0.55; leaf.rotation.x = Math.cos(i) * 0.45; scene.add(leaf);
  }
  // Batch opaque architectural pieces by material to reduce stereo draw calls on Quest.
  const batches = new Map();
  for (const mesh of [...scene.children]) {
    if (!mesh.isMesh || mesh.material.transparent) continue;
    mesh.updateMatrixWorld(true);
    const batch = batches.get(mesh.material) || []; batch.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)); batches.set(mesh.material, batch);
    scene.remove(mesh); mesh.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const merged = new THREE.Mesh(mergeGeometries(geometries), material); merged.castShadow = true; merged.receiveShadow = true; scene.add(merged);
    for (const geometry of geometries) geometry.dispose();
  }
  return { sun };
}

export function makeWristHUD() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }));
  mesh.renderOrder = 100; mesh.position.set(0, 0.13, -0.07); mesh.rotation.x = -Math.PI / 3;
  let last = '';
  return { mesh, update(state, player, ammo, message = '') {
    const value = `${state.code}|${state.levelWave}|${state.wave}|${player.health}|${Math.round(state.timeScale * 100)}|${ammo}|${message}`;
    if (last === value) return; last = value;
    ctx.clearRect(0, 0, 768, 384); ctx.fillStyle = '#182522ee'; ctx.fillRect(0, 0, 768, 384);
    ctx.fillStyle = '#83e2cf'; ctx.font = '24px monospace'; ctx.fillText(`STILL LIFE / ${state.code}`, 30, 48);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 45px monospace'; ctx.fillText(`WAVE ${String(state.wave).padStart(2, '0')}`, 30, 113);
    ctx.fillStyle = '#b4c4bb'; ctx.font = '23px monospace'; ctx.fillText(levelForWave(state.levelWave).name.toUpperCase(), 300, 110);
    ctx.fillStyle = '#ff7056'; ctx.font = '42px monospace'; ctx.fillText('● '.repeat(Math.max(0, player.health)) || 'DOWNED', 30, 173);
    ctx.fillStyle = '#ffffff'; ctx.font = '29px monospace'; ctx.fillText(ammo, 30, 228);
    ctx.fillStyle = '#ffffff66'; ctx.fillRect(30, 254, 708, 7); ctx.fillStyle = '#ff7056'; ctx.fillRect(30, 254, 708 * state.timeScale, 7);
    ctx.fillStyle = '#b4c4bb'; ctx.font = '23px monospace'; ctx.fillText(message.slice(0, 44), 30, 318); texture.needsUpdate = true;
  } };
}
