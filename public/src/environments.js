import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWorld, box, textPlane, sharedMaterials } from './scene.js';
import { levelForWave } from '../shared/levels.js';

// Keep each arena in its own disposable root. Dynamic players/items never get
// merged into the architecture, and old GPU resources are released on a swap.
export function createArena(scene, level = levelForWave(1)) {
  const root = new THREE.Group(); root.name = `arena-${level.id}`;
  if (level.id === 'apartment') createWorld(root);
  else buildEnvironment(root, level);
  scene.background = new THREE.Color(level.sky);
  scene.fog = new THREE.Fog(level.sky, 22, 65);
  scene.add(root);
  return { id: level.id, root, dispose() {
    scene.remove(root);
    const materials = new Set(), textures = new Set();
    root.traverse(obj => {
      obj.geometry?.dispose(); obj.shadow?.dispose();
      for (const mat of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
        if (mat && !sharedMaterials.has(mat)) { materials.add(mat); if (mat.map) textures.add(mat.map); }
      }
    });
    textures.forEach(tex => tex.dispose()); materials.forEach(mat => mat.dispose());
  } };
}

function buildEnvironment(root, level) {
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...options });
  const paper = material(0xe7e8df), dark = material(0x303c43), trim = material(0x9ba9a7);
  const accent = material(level.accent), floor = material(level.floor), green = material(0x718568, { flatShading: true });
  const glass = material(0x89b5bd, { metalness: .35, roughness: .22 });
  const glow = material(0xffe5ae, { emissive: 0xffd797, emissiveIntensity: .7 });
  const add = (w, h, d, mat, x = 0, y = 0, z = 0) => { const mesh = box(w, h, d, mat, x, y, z); root.add(mesh); return mesh; };
  const round = (r1, r2, h, mat, x, y, z, sides = 12) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, sides), mat);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const sign = (text, width, x, y, z, color = '#303c43') => {
    const mesh = textPlane(text, width, color); mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const foliage = (x, y, z, size = 1) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), green);
    mesh.position.set(x, y, z); mesh.scale.set(1, .65, .85); root.add(mesh);
  };
  const outdoor = level.setting === 'OUTDOOR';
  root.add(new THREE.HemisphereLight(level.sky, 0x8d948a, outdoor ? 3 : 2.5));
  const sun = new THREE.DirectionalLight(level.id === 'street' ? 0xd4e3ff : 0xfff0d5, outdoor ? 3.2 : 2.5);
  sun.position.set(-8, 15, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 45 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .025; root.add(sun);
  add(15.6, .18, 14.7, floor, 0, -.1, -.5);
  // Perimeter architecture sits outside the shared playable bounds.
  for (const x of [-7.75, 7.75]) add(.18, outdoor ? .8 : 1.1, 14.7, paper, x, outdoor ? .4 : .55, -.5);
  add(15.6, .7, .18, paper, 0, .35, 6.8);
  add(15.6, outdoor ? .8 : 4.5, .2, paper, 0, outdoor ? .4 : 2.25, -7.75);
  if (!outdoor) {
    for (const x of [-7.75, 7.75]) for (const z of [-6, -2, 2, 6]) add(.2, 3.4, .2, dark, x, 2.8, z);
    for (const z of [-6, -2, 2, 6]) {
      add(15.6, .22, .22, dark, 0, 4.55, z);
      add(3, .05, .22, glow, 0, 4.38, z);
    }
    // An open central skylight keeps the room readable from the menu camera.
    for (const x of [-5.6, 5.6]) add(4.2, .12, 14.6, paper, x, 4.65, -.5);
  }
  if (outdoor) {
    add(6.7, 1.05, .12, dark, 0, 3.25, -7.61);
    for (const x of [-3.25, 3.25]) add(.12, 3.8, .12, trim, x, 1.9, -7.65);
    add(6.7, .045, .14, accent, 0, 3.8, -7.61);
  }
  sign(level.name.toUpperCase(), 5.4, 0, outdoor ? 3.5 : 3.55, -7.5, outdoor ? '#e7e8df' : '#52635f');
  sign(level.setting + ' / ' + level.subtitle.toUpperCase(), 5.8, 0, 2.95, -7.48, outdoor ? '#bdc9c5' : '#63736a');

  for (const s of level.solids) {
    const top = s.h;
    if (s.kind === 'table') {
      add(s.w, .1, s.d, paper, s.x, top - .05, s.z);
      for (const dx of [-.75, .75]) for (const dz of [-.3, .3]) add(.08, .9, .08, dark, s.x + dx, .45, s.z + dz);
      add(s.w, .06, .04, accent, s.x, .88, s.z + s.d / 2);
      const label = sign('SUPPLIES', .8, s.x, top + .012, s.z + .22, '#52635f'); label.rotation.x = -Math.PI / 2;
    } else if (s.kind === 'vent') {
      add(s.w, s.h, s.d, trim, s.x, s.y, s.z);
      for (let i = 0; i < 6; i++) add(s.w - .2, .045, .03, dark, s.x, .3 + i * .15, s.z + s.d / 2 + .015);
      for (const dx of [-.5, .5]) round(.33, .33, .04, dark, s.x + dx, top + .02, s.z);
    } else if (s.kind === 'tank') {
      round(s.w / 2, s.w / 2, s.h, trim, s.x, s.y, s.z);
      for (const y of [.2, 1.3, 2.4]) round(s.w / 2 + .02, s.w / 2 + .02, .08, dark, s.x, y, s.z);
    } else if (s.kind === 'planter') {
      add(s.w, s.h, s.d, paper, s.x, s.y, s.z);
      add(s.w - .12, .03, s.d - .12, green, s.x, top + .01, s.z);
      // Low foliage stays within the cover's collision silhouette.
      for (let x = -.3 * s.w; x <= .3 * s.w; x += .4) for (let z = -.3 * s.d; z <= .3 * s.d; z += .4) foliage(s.x + x, top - .01, s.z + z, .25);
    } else if (s.kind === 'counter') {
      add(s.w, s.h - .08, s.d, accent, s.x, (s.h - .08) / 2, s.z);
      add(s.w, .08, s.d, paper, s.x, top - .04, s.z);
      for (let z = s.z - s.d / 2 + .25; z < s.z + s.d / 2; z += .6) add(.03, .65, .04, trim, s.x + s.w / 2 + .01, .48, z);
    } else if (s.kind === 'booth') {
      add(s.w, .65, s.d, paper, s.x, .325, s.z);
      for (const dz of [-.56, .56]) add(s.w, s.h, .34, accent, s.x, s.y, s.z + dz);
      add(s.w - .4, .08, .48, paper, s.x, .88, s.z);
    } else if (s.kind === 'fountain') {
      add(s.w, .4, s.d, trim, s.x, .2, s.z);
      add(s.w - .18, .04, s.d - .18, glass, s.x, .42, s.z);
      for (const dx of [-1.08, 1.08]) add(.24, s.h, s.d, paper, s.x + dx, s.y, s.z);
      for (const dz of [-1.08, 1.08]) add(s.w, s.h, .24, paper, s.x, s.y, s.z + dz);
      round(.36, .5, .35, paper, s.x, .6, s.z); round(.56, .3, .08, glass, s.x, .82, s.z);
    } else if (s.kind === 'bench') {
      add(s.w, .15, s.d, accent, s.x, .5, s.z);
      add(s.w, .5, .12, accent, s.x, top - .25, s.z - .34);
      for (const dx of [-.9, .9]) add(.12, .45, .6, dark, s.x + dx, .225, s.z);
    } else if (s.kind === 'crate') {
      add(s.w, s.h, s.d, accent, s.x, s.y, s.z);
      for (const dx of [-s.w * .4, s.w * .4]) add(.09, s.h, s.d + .015, trim, s.x + dx, s.y, s.z);
      for (const y of [.12, top - .12]) add(s.w + .02, .12, s.d + .02, trim, s.x, y, s.z);
      sign('FRAGILE', Math.min(1, s.w * .7), s.x, s.y, s.z + s.d / 2 + .025, '#4e554b');
    } else if (s.kind === 'car') {
      add(s.w, .57, s.d, paper, s.x, .5, s.z);
      add(s.w * .88, .52, s.d * .48, glass, s.x, 1.01, s.z);
      add(s.w * .9, .06, s.d * .5, accent, s.x, top - .03, s.z);
      for (const dx of [-.87, .87]) for (const dz of [-1.2, 1.2]) {
        const tire = round(.3, .3, .16, dark, s.x + dx, .3, s.z + dz); tire.rotation.z = Math.PI / 2;
      }
      for (const dx of [-.65, .65]) add(.28, .12, .03, glow, s.x + dx, .58, s.z + s.d / 2 + .015);
    } else if (s.kind === 'barrier') {
      add(s.w, s.h, s.d, accent, s.x, s.y, s.z);
      for (const dx of [-.8, 0, .8]) add(.18, .6, .015, dark, s.x + dx, s.y, s.z + s.d / 2 + .01).rotation.z = -.35;
    }
  }

  if (level.id === 'rooftop') {
    for (let i = 0; i < 18; i++) {
      const angle = i * Math.PI * 2 / 18, h = 4 + (i * 7 % 12), x = Math.sin(angle) * 23, z = Math.cos(angle) * 23;
      add(3 + i % 3, h, 3, trim, x, h / 2 - 5, z);
      for (let y = -3; y < h - 5; y += 1.3) add(2.3, .25, .025, glass, x, y, z + 1.52);
    }
    // Landing pad, roof seams, and perimeter railings.
    const pad = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.18, 40), accent); pad.rotation.x = -Math.PI / 2; pad.position.set(.3, .003, -1.7); root.add(pad);
    for (const x of [-.1, .7]) add(.14, .01, 1.1, accent, x, .009, -1.7); add(.8, .01, .14, accent, .3, .009, -1.7);
    for (const x of [-7.75, 7.75]) { add(.05, .06, 14.7, dark, x, 1.12, -.5); for (let z = -7; z < 7; z += 1.5) add(.04, .35, .04, dark, x, .95, z); }
    for (let x = -6; x <= 6; x += 2) add(.02, .006, 14.4, trim, x, .002, -.5);
  } else if (level.id === 'diner') {
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 6; z++) if ((x + z) % 2 === 0) add(.98, .008, .98, trim, x, .002, z);
    for (const x of [-7.7, 7.7]) for (const z of [-5, -1, 3]) { add(.035, 2.4, 3.6, glass, x, 2.45, z); add(.08, .07, 3.6, paper, x, 2.4, z); }
    for (const x of [-5, 5]) {
      add(2.3, 1.4, .08, dark, x, 2.7, -7.57); sign(x < 0 ? 'COFFEE / 24H' : 'PIE / $3', 1.9, x, 2.8, -7.51, '#e7e8df');
    }
    add(3.3, .12, .55, trim, -4.8, 2.4, -7.45);
  } else if (level.id === 'garden') {
    for (const x of [-3, 3]) add(1.5, .009, 12.8, paper, x, .004, -.5);
    add(14.5, .012, 1.35, paper, 0, .004, .6);
    for (const x of [-9.5, 9.5]) for (const z of [-6, -.5, 5]) {
      round(.16, .25, 3.2, trim, x, 1.6, z); foliage(x, 3.8, z, 2);
      round(.95, 1.1, .45, paper, x, .225, z);
    }
    for (const x of [-6.5, 0, 6.5]) {
      for (const dx of [-.85, .85]) add(.13, 3.1, .13, trim, x + dx, 1.55, -8.2);
      add(1.85, .14, .4, trim, x, 3.06, -8.2);
      for (const y of [.6, 1.2, 1.8, 2.4]) add(1.7, .035, .05, green, x, y, -8.25);
    }
    add(35, .12, 35, green, 0, -.2, 0);
  } else if (level.id === 'warehouse') {
    for (const x of [-5.8, 0, 5.8]) {
      add(2.5, 2.8, .06, trim, x, 1.4, -7.6);
      for (let y = .2; y < 2.8; y += .3) add(2.5, .04, .035, dark, x, y, -7.55);
      sign('BAY ' + (x < 0 ? '01' : x > 0 ? '03' : '02'), 1.2, x, 3.1, -7.5);
    }
    for (const x of [-6, 6]) { add(.1, .01, 12.8, accent, x, .004, -.5); add(.18, .3, 14.5, accent, x, 4.25, -.5); }
    add(12, .35, .35, accent, 0, 4, -3);
    for (let x = -5; x <= 5; x++) add(.4, .012, .15, accent, x, .005, 5.5);
  } else if (level.id === 'street') {
    for (let z = -6; z < 6; z += 2) add(.1, .012, .95, accent, 0, .005, z);
    for (let x = -6.5; x < 7; x += 1.1) add(.6, .015, 1.1, paper, x, .006, 5.3);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const z = -6 + i * 4, x = side * 10.5, h = 6 + i % 3 * 2;
      add(4.7, h, 3.8, i % 2 ? trim : paper, x, h / 2, z);
      for (let y = 2.2; y < h; y += 1.7) for (const dz of [-1, 1]) add(.025, .95, .65, glass, x - side * 2.36, y, z + dz);
      add(.8, .1, 2.8, accent, x - side * 2.5, 2, z);
    }
    for (const x of [-8.2, 8.2]) for (const z of [-5, 3]) {
      round(.055, .075, 3.8, dark, x, 1.9, z); add(.8, .08, .1, dark, x - Math.sign(x) * .35, 3.8, z);
      add(.55, .08, .26, glow, x - Math.sign(x) * .6, 3.73, z);
    }
  }
  // Batch static opaque pieces by material for Quest stereo rendering.
  const batches = new Map();
  for (const mesh of [...root.children]) {
    if (!mesh.isMesh || mesh.material.transparent) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    // Different primitive types all have position/normal/uv attributes.
    const batch = batches.get(mesh.material) || []; batch.push(geometry); batches.set(mesh.material, batch);
    root.remove(mesh); mesh.geometry.dispose();
  }
  for (const [mat, geometries] of batches) {
    // Icosahedra are non-indexed; normalize before merging mixed primitives.
    const normalized = geometries.map(g => g.index ? g.toNonIndexed() : g);
    const merged = new THREE.Mesh(mergeGeometries(normalized), mat); merged.castShadow = true; merged.receiveShadow = true; root.add(merged);
    new Set([...geometries, ...normalized]).forEach(g => g.dispose());
  }
}
