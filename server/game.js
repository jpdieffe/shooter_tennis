import { randomUUID } from 'node:crypto';
import { ARENA, SOLIDS, SPAWNS, clamp, distance, direction, pistolMuzzle, enemyWeaponPose, segmentDistance, segmentBox, moveBody } from '../public/shared/world.js';

const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(x => Number.isFinite(x) && Math.abs(x) < 1000);
const quat = q => {
  const length = Math.hypot(...q);
  return length > 0.01 ? q.map(n => n / length) : [0, 0, 0, 1];
};
const pose = (p, q = [0, 0, 0, 1]) => ({ p: [...p], q: [...q] });

export class Game {
  constructor(code) {
    this.code = code; this.players = new Map(); this.items = []; this.enemies = []; this.bullets = [];
    this.events = []; this.phase = 'lobby'; this.wave = 0; this.kills = 0; this.timeScale = 0.035;
    this.countdown = 0; this.elapsed = 0; this.nextId = 1; this.resetItems();
  }
  id() { return `${this.nextId++}`; }
  event(type, data = {}) { this.events.push({ id: this.id(), type, ...data }); }
  addPlayer(name = 'Player') {
    if (this.players.size >= 2) throw new Error('This room already has two players.');
    const slot = [...this.players.values()].some(p => p.slot === 0) ? 1 : 0;
    const x = slot === 0 ? -1.2 : 1.2;
    const p = { id: randomUUID(), slot, name: String(name).trim().slice(0, 18) || 'Player',
      head: pose([x, 1.65, 3.8]), hands: [pose([x - 0.25, 1.2, 3.4]), pose([x + 0.25, 1.2, 3.4])],
      health: 3, score: 0, motion: 0, lastPose: 0, lastShot: -10, lastHit: -10, active: false };
    this.players.set(p.id, p); return p;
  }
  removePlayer(id) {
    for (let hand = 0; hand < 2; hand++) this.release(id, hand, [0, 0, 0]);
    this.players.delete(id);
  }
  resetItems() {
    this.items = [];
    for (const side of [-1, 1]) {
      this.addItem('pistol', [side * 1.2, 1.13, 2.17]);
      this.addItem('bottle', [side * 1.85, 1.2, 2.1]);
      this.addItem('mug', [side * 2.3, 1.15, 2.1]);
    }
    this.addItem('pan', [-4.6, 1.3, -1.8]);
    this.addItem('bottle', [-5.2, 1.35, -1.8]);
    this.addItem('vase', [4.65, 1.1, 0.5]);
  }
  addItem(kind, p) {
    const item = { id: this.id(), kind, p: [...p], q: [0, 0, 0, 1], v: [0, 0, 0], ammo: kind === 'pistol' ? 8 : 0,
      heldBy: null, hand: null, thrownBy: null, moving: false, lastImpact: -10 };
    this.items.push(item); return item;
  }
  updatePose(id, data, now = this.elapsed) {
    const p = this.players.get(id);
    if (!p || !data.head || !vec(data.head.p, 3) || !vec(data.head.q, 4) ||
      !Array.isArray(data.hands) || data.hands.length !== 2 || data.hands.some(h => !h || !vec(h.p, 3) || !vec(h.q, 4))) return false;
    const dt = clamp(now - p.lastPose, 0.016, 0.2);
    const target = [clamp(data.head.p[0], ARENA.minX, ARENA.maxX), clamp(data.head.p[1], 0.4, 2.5), clamp(data.head.p[2], ARENA.minZ, ARENA.maxZ)];
    const maxStep = 8 * dt + 0.15;
    const dist = distance(target, p.head.p);
    if (dist > maxStep) for (let i = 0; i < 3; i++) target[i] = p.head.p[i] + (target[i] - p.head.p[i]) * maxStep / dist;
    const q = quat(data.head.q);
    const angle = 2 * Math.acos(clamp(Math.abs(q.reduce((s, n, i) => s + n * p.head.q[i], 0)), 0, 1));
    let motion = distance(target, p.head.p) / dt * 0.55 + angle / dt * 0.13;
    p.head = pose(target, q);
    p.hands = data.hands.map((h, i) => {
      let hp = [...h.p]; const reach = distance(hp, target);
      if (reach > 1.7) hp = target.map((n, axis) => n + (hp[axis] - n) * 1.7 / reach);
      const handQ = quat(h.q);
      const turn = 2 * Math.acos(clamp(Math.abs(handQ.reduce((s, n, axis) => s + n * p.hands[i].q[axis], 0)), 0, 1));
      motion = Math.max(motion, distance(hp, p.hands[i].p) / dt * 0.33 + turn / dt * 0.07);
      return pose(hp, handQ);
    });
    p.motion = clamp(motion, 0, 1); p.lastPose = now;
    return true;
  }
  held(id, hand) { return this.items.find(i => i.heldBy === id && i.hand === hand); }
  grab(id, hand) {
    const p = this.players.get(id);
    if (!p || p.health <= 0 || ![0, 1].includes(hand) || this.held(id, hand)) return;
    const near = this.items.filter(i => !i.heldBy && distance(i.p, p.hands[hand].p) < 0.9)
      .sort((a, b) => distance(a.p, p.hands[hand].p) - distance(b.p, p.hands[hand].p))[0];
    if (near) { near.heldBy = id; near.hand = hand; near.thrownBy = null; near.moving = false; near.v = [0, 0, 0]; }
  }
  release(id, hand, velocity) {
    const item = this.held(id, hand), p = this.players.get(id);
    if (!item || !p) return;
    item.p = [...p.hands[hand].p]; item.q = [...p.hands[hand].q];
    item.heldBy = null; item.hand = null; item.moving = true; item.thrownBy = id;
    item.v = vec(velocity, 3) ? [...velocity] : [0, 0, 0];
    const speed = Math.hypot(...item.v);
    if (speed > 18) item.v = item.v.map(v => v * 18 / speed);
  }
  shoot(id, hand) {
    const p = this.players.get(id), item = this.held(id, hand);
    if (!p || p.health <= 0 || !p.active || !item || item.kind !== 'pistol' || this.phase !== 'playing' || this.elapsed - p.lastShot < 0.18) return;
    p.lastShot = this.elapsed;
    if (item.ammo <= 0) { this.event('empty', { player: id }); return; }
    item.ammo--;
    const dir = direction(p.hands[hand].q), origin = pistolMuzzle(p.hands[hand]);
    this.bullets.push({ id: this.id(), p: origin, v: dir.map(n => n * 24), owner: id, enemy: false, life: 5 });
    p.motion = 1;
    this.event('shot', { p: origin, player: id });
  }
  start() {
    if (this.phase !== 'lobby' && this.phase !== 'gameover') return;
    if (this.phase === 'gameover') this.resetItems();
    this.wave = 0; this.kills = 0; this.enemies = []; this.bullets = [];
    for (const p of this.players.values()) { p.health = 3; p.score = 0; p.lastHit = -10; }
    this.phase = 'countdown'; this.countdown = 3; this.event('start');
  }
  spawnWave() {
    this.wave++; this.phase = 'playing'; this.bullets = [];
    for (const p of this.players.values()) { p.health = Math.min(3, p.health + 1); }
    // Replenish both stations between waves; preserve anything still in a hand.
    if (this.wave > 1) {
      this.items = this.items.filter(i => i.heldBy);
      for (const i of this.items) if (i.kind === 'pistol') i.ammo = 8;
      for (const side of [-1, 1]) {
        this.addItem('pistol', [side * 1.2, 1.13, 2.17]);
        this.addItem('bottle', [side * 1.85, 1.2, 2.1]);
        this.addItem('mug', [side * 2.3, 1.15, 2.1]);
      }
      this.addItem('pan', [-4.6, 1.3, -1.8]);
    }
    const count = Math.min(4 + this.wave * 2 + (this.players.size - 1) * 2, 22);
    for (let i = 0; i < count; i++) {
      const spawn = SPAWNS[i % SPAWNS.length];
      this.enemies.push({ id: this.id(), p: [spawn[0] + (i % 2) * 0.35, 0, spawn[2] + Math.floor(i / 5) * 0.5],
        yaw: 0, health: 1, cooldown: 1.7 + i * 0.4, type: i % 3 === 0 ? 'shooter' : 'rusher' });
    }
    this.event('wave', { wave: this.wave });
  }
  hitEnemy(e, owner) {
    if (e.health <= 0) return;
    e.health = 0; this.kills++;
    const p = this.players.get(owner); if (p) p.score++;
    this.event('shatter', { p: [e.p[0], 1.15, e.p[2]] });
    if (e.type === 'shooter' && this.items.length < 45) this.addItem('pistol', [e.p[0], 0.15, e.p[2]]);
  }
  hitPlayer(p) {
    if (this.elapsed - p.lastHit < 0.8 || p.health <= 0) return;
    p.health--; p.lastHit = this.elapsed; this.event('hurt', { player: p.id, p: p.head.p });
    if (p.health === 0) for (let hand = 0; hand < 2; hand++) this.release(p.id, hand, [0, 0, 0]);
  }
  step(dt) {
    dt = clamp(dt, 0, 0.05); this.elapsed += dt;
    const active = [...this.players.values()].filter(p => p.health > 0 && p.active && this.elapsed - p.lastPose < 2);
    const activity = Math.max(0.035, ...active.map(p => this.elapsed - p.lastPose < 0.25 ? p.motion : 0));
    this.timeScale += (activity - this.timeScale) * Math.min(1, dt * 9);
    const sim = dt * this.timeScale;
    if (this.phase === 'countdown' && active.length) { this.countdown -= dt; if (this.countdown <= 0) this.spawnWave(); }
    for (const item of this.items) {
      const old = [...item.p];
      if (item.heldBy) {
        const p = this.players.get(item.heldBy); if (!p) continue;
        item.p = [...p.hands[item.hand].p]; item.q = [...p.hands[item.hand].q];
        const speed = distance(old, item.p) / (dt || 1);
        if (speed > 1.8 && this.elapsed - item.lastImpact > 0.25 && this.phase === 'playing') {
          for (const e of this.enemies) if (segmentDistance(old, item.p, [e.p[0], clamp(item.p[1], 0.5, 1.7), e.p[2]]) < 0.48) {
            this.hitEnemy(e, item.heldBy); item.lastImpact = this.elapsed;
          }
        }
      } else if (item.moving) {
        item.v[1] -= 9.8 * sim;
        item.p = item.p.map((n, i) => n + item.v[i] * sim);
        if (this.phase === 'playing' && Math.hypot(...item.v) > 1.5) {
          for (const e of this.enemies) if (segmentDistance(old, item.p, [e.p[0], clamp(item.p[1], 0.5, 1.7), e.p[2]]) < 0.48) {
            this.hitEnemy(e, item.thrownBy); item.v = item.v.map(n => n * -0.25);
          }
        }
        if (SOLIDS.some(s => segmentBox(old, item.p, s, 0.07))) { item.p = old; item.v = [0, 0, 0]; item.moving = false; }
        if (item.p[1] < 0.12) { item.p[1] = 0.12; item.v = [0, 0, 0]; item.moving = false; }
        item.p[0] = clamp(item.p[0], ARENA.minX, ARENA.maxX); item.p[2] = clamp(item.p[2], ARENA.minZ, ARENA.maxZ);
      }
    }
    if (this.phase === 'playing' && this.players.size && [...this.players.values()].every(p => p.health <= 0)) {
      this.phase = 'gameover'; this.event('gameover'); return;
    }
    if (this.phase !== 'playing' || !active.length) return;
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const target = [...active].sort((a, b) => distance(a.head.p, e.p) - distance(b.head.p, e.p))[0];
      const dx = target.head.p[0] - e.p[0], dz = target.head.p[2] - e.p[2], d = Math.hypot(dx, dz);
      e.yaw = Math.atan2(dx, dz); e.cooldown -= sim;
      if (d > (e.type === 'shooter' ? 4.2 : 0.75)) {
        const speed = (e.type === 'shooter' ? 0.6 : 0.95 + Math.min(this.wave, 10) * 0.055) * sim;
        const next = moveBody(e.p, dx / (d || 1) * speed, dz / (d || 1) * speed, 0.26);
        // Slide around furniture instead of staying pinned behind it.
        if (distance(next, e.p) < speed * 0.25) {
          const sign = Number(e.id) % 2 ? 1 : -1;
          e.p = moveBody(e.p, -dz / (d || 1) * speed * sign, dx / (d || 1) * speed * sign, 0.26);
        } else e.p = next;
      }
      if (e.type === 'shooter') e.aim = [...target.head.p];
      if (e.type === 'shooter' && e.cooldown <= 0 && this.bullets.length < 120) {
        const weapon = enemyWeaponPose(e), origin = pistolMuzzle(weapon), aim = direction(weapon.q);
        if (!SOLIDS.some(s => segmentBox(origin, target.head.p, s))) {
          this.bullets.push({ id: this.id(), p: origin, v: aim.map(n => n * 5.5), owner: e.id, enemy: true, life: 8 });
          this.event('enemyshot', { p: origin });
        }
        e.cooldown = Math.max(1.3, 3.2 - this.wave * 0.1);
      }
      if (d < 0.8 && e.cooldown <= 0) { this.hitPlayer(target); e.cooldown = 1.2; }
    }
    this.enemies = this.enemies.filter(e => e.health > 0);
    for (const b of this.bullets) {
      const old = [...b.p]; b.p = b.p.map((n, i) => n + b.v[i] * sim); b.life -= sim;
      if (SOLIDS.some(s => segmentBox(old, b.p, s)) || b.p[1] < 0 || b.p[1] > 4.5 || Math.abs(b.p[0]) > 7.8 || b.p[2] < -7.8 || b.p[2] > 6.8) b.life = 0;
      if (b.life <= 0) continue;
      if (b.enemy) {
        for (const p of active) {
          if (segmentDistance(old, b.p, p.head.p) < 0.22 || segmentDistance(old, b.p, [p.head.p[0], Math.max(0.35, p.head.p[1] - 0.45), p.head.p[2]]) < 0.27) {
            this.hitPlayer(p); b.life = 0; break;
          }
        }
      } else {
        for (const e of this.enemies) if (e.health > 0 && segmentDistance(old, b.p, [e.p[0], clamp(b.p[1], 0.4, 1.72), e.p[2]]) < 0.34) {
          this.hitEnemy(e, b.owner); b.life = 0; break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.enemies = this.enemies.filter(e => e.health > 0);
    if ([...this.players.values()].every(p => p.health <= 0)) { this.phase = 'gameover'; this.event('gameover'); }
    else if (!this.enemies.length) { this.phase = 'countdown'; this.countdown = 4; this.event('clear'); }
  }
  snapshot() {
    return { code: this.code, phase: this.phase, wave: this.wave, kills: this.kills, timeScale: this.timeScale,
      countdown: this.countdown, players: [...this.players.values()].map(({ id, slot, name, head, hands, health, score, active }) => ({ id, slot, name, head, hands, health, score, active })),
      items: this.items, enemies: this.enemies, bullets: this.bullets, events: this.events.splice(0) };
  }
}
