export const ARENA = { minX: -7.4, maxX: 7.4, minZ: -7.4, maxZ: 6.4 };
// The same solid furniture is used for rendering, movement, and projectile hits.
export const SOLIDS = [
  { kind: 'island', x: -4.7, y: 0.58, z: -1.8, w: 2.4, h: 1.16, d: 1.1 },
  { kind: 'sofa', x: 4.8, y: 0.46, z: 0.4, w: 1.35, h: 0.92, d: 3.1 },
  { kind: 'table', x: -1.65, y: 0.5, z: 2.15, w: 1.9, h: 1, d: 0.85 },
  { kind: 'table', x: 1.65, y: 0.5, z: 2.15, w: 1.9, h: 1, d: 0.85 },
  { kind: 'pillar', x: -2.9, y: 1.8, z: -4.1, w: 0.65, h: 3.6, d: 0.65 },
  { kind: 'pillar', x: 2.9, y: 1.8, z: -4.1, w: 0.65, h: 3.6, d: 0.65 }
];
export const SPAWNS = [[-6.5, 0, -6.4], [0, 0, -6.6], [6.5, 0, -6.4], [-6.6, 0, 0], [6.6, 0, -2.8]];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export const PISTOL_MUZZLE = [0, 0.025, -0.244];
export const ENEMY_SHOULDER = [0.3, 1.38, 0];
export const ENEMY_GUN_REACH = 0.5;
export function enemyWeaponPose(enemy) {
  const yaw = enemy.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
  const shoulder = [enemy.p[0] + ENEMY_SHOULDER[0] * c, enemy.p[1] + ENEMY_SHOULDER[1], enemy.p[2] - ENEMY_SHOULDER[0] * s];
  let gunYaw = yaw + Math.PI, pitch = 0;
  if (enemy.aim) {
    const delta = enemy.aim.map((n, i) => n - shoulder[i]), length = Math.hypot(...delta);
    gunYaw = Math.atan2(-delta[0], -delta[2]);
    // Account for the barrel sitting above the gun origin so the muzzle's
    // forward axis, rather than a line from the shoulder, meets the target.
    pitch = Math.atan2(delta[1], Math.hypot(delta[0], delta[2])) - Math.asin(clamp(PISTOL_MUZZLE[1] / (length || 1), -1, 1));
  }
  const cy = Math.cos(gunYaw / 2), sy = Math.sin(gunYaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  const q = [cy * sp, sy * cp, -sy * sp, cy * cp], forward = direction(q);
  return { p: shoulder.map((n, i) => n + forward[i] * ENEMY_GUN_REACH), q };
}
export function pistolMuzzle(pose) {
  const [x, y, z] = PISTOL_MUZZLE, [qx, qy, qz, qw] = pose.q;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [pose.p[0] + x + qw * tx + qy * tz - qz * ty,
    pose.p[1] + y + qw * ty + qz * tx - qx * tz,
    pose.p[2] + z + qw * tz + qx * ty - qy * tx];
}
export function direction(q) {
  const [x, y, z, w] = q;
  return [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];
}
export function segmentDistance(a, b, p) {
  const v = b.map((n, i) => n - a[i]);
  const t = clamp(v.reduce((s, n, i) => s + n * (p[i] - a[i]), 0) / (v.reduce((s, n) => s + n * n, 0) || 1), 0, 1);
  return distance(a.map((n, i) => n + v[i] * t), p);
}
export function segmentBox(a, b, box, padding = 0) {
  let low = 0, high = 1;
  const center = [box.x, box.y, box.z], half = [box.w / 2, box.h / 2, box.d / 2];
  for (let i = 0; i < 3; i++) {
    const delta = b[i] - a[i], min = center[i] - half[i] - padding, max = center[i] + half[i] + padding;
    if (Math.abs(delta) < 0.000001) { if (a[i] < min || a[i] > max) return false; }
    else {
      const near = (min - a[i]) / delta, far = (max - a[i]) / delta;
      low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far));
      if (low > high) return false;
    }
  }
  return true;
}
export function moveBody(position, dx, dz, radius = 0.23) {
  const p = [...position];
  for (const [axis, delta] of [[0, dx], [2, dz]]) {
    const before = [...p];
    p[axis] = clamp(p[axis] + delta, axis === 0 ? ARENA.minX : ARENA.minZ, axis === 0 ? ARENA.maxX : ARENA.maxZ);
    if (SOLIDS.some(s => segmentBox([before[0], 0.65, before[2]], [p[0], 0.65, p[2]], s, radius))) p[axis] = before[axis];
  }
  return p;
}
export function turnAroundHead(origin, head, angle) {
  const x = origin[0] - head[0], z = origin[2] - head[2];
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [head[0] + x * cos + z * sin, origin[1], head[2] - x * sin + z * cos];
}
