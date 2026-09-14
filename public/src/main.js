import * as THREE from 'three';
import { createVRControl } from './vr.js';
import { heldPose } from './poses.js';
import { createWorld, makeEnemy, makeItem, makeAlly, makeWristHUD, palette, box, textPlane } from './scene.js';
import { moveBody, turnAroundHead, distance, clamp } from '../shared/world.js';

const $ = id => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600); }
const storage = { get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
const query = new URLSearchParams(location.search);
const deploymentConfig = await fetch(new URL('../config.json', import.meta.url), { cache: 'no-store' })
  .then(response => response.ok ? response.json() : {}).catch(() => ({}));
$('name').value = storage.get('still-life-name');
$('server-url').value = query.get('server') || storage.get('still-life-server') || deploymentConfig.serverUrl || '';
$('room-code').value = query.get('room') || '';

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' }); }
catch { $('connection-message').textContent = 'WebGL is unavailable. Open this page in Quest Browser or a browser with hardware acceleration.'; $('create').disabled = true; $('join').disabled = true; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFramebufferScaleFactor(0.9);
const scene = new THREE.Scene(); createWorld(scene);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 60); camera.position.y = 1.65; camera.rotation.order = 'YXZ';
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const menuCamera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 90);
const menuTarget = new THREE.Vector3(0, 0.4, -0.8);
const desktopHands = [new THREE.Group(), new THREE.Group()];
desktopHands.forEach((h, i) => { h.position.set(i === 0 ? -0.22 : 0.22, -0.23, -0.48); camera.add(h); });
const localHandMaterial = new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.7 });
const xr = [0, 1].map(index => {
  const ray = renderer.xr.getController(index), grip = renderer.xr.getControllerGrip(index);
  rig.add(ray, grip);
  const hand = box(0.072, 0.095, 0.11, localHandMaterial, 0, -0.018, 0.02); grip.add(hand);
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -0.6)]), new THREE.LineBasicMaterial({ color: palette.teal, transparent: true, opacity: 0.2 })); ray.add(beam);
  const data = { ray, grip, hand, beam, source: null, history: [], snapping: false };
  ray.addEventListener('connected', event => { data.source = event.data; });
  ray.addEventListener('disconnected', () => { data.source = null; data.history = []; });
  ray.addEventListener('squeezestart', () => { sendPose(); send({ type: 'grab', hand: index }); haptic(index, 0.3); });
  ray.addEventListener('squeezeend', () => release(index, true));
  ray.addEventListener('selectstart', () => {
    audioStart();
    if (state && ['lobby', 'gameover'].includes(state.phase)) send({ type: 'start' });
    else { sendPose(); send({ type: 'shoot', hand: index }); haptic(index, 0.4); }
  });
  return data;
});
const wrist = makeWristHUD(); xr[0].grip.add(wrist.mesh);
const vrBanner = textPlane('GRIP TO GRAB / TRIGGER TO START', 2.5, '#e94430'); vrBanner.position.set(0, 2.25, -2.8); scene.add(vrBanner); vrBanner.visible = false;
const showcase = new THREE.Group(); scene.add(showcase);
for (const [x, z, yaw, type] of [[0.3, -0.8, 0.5, 'shooter'], [-3.5, -3.8, 0.6, 'rusher'], [3.3, -3.4, -0.3, 'rusher']]) {
  const enemy = makeEnemy(type); enemy.position.set(x, 0, z); enemy.rotation.y = yaw; showcase.add(enemy);
}
for (const s of [-1, 1]) for (const [kind, dx] of [['pistol', 1.2], ['bottle', 1.85], ['mug', 2.3]]) {
  const item = makeItem(kind); item.position.set(s * dx, 1.15, 2.17); showcase.add(item);
}
for (let i = 0; i < 4; i++) {
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), new THREE.MeshBasicMaterial({ color: palette.red })); shard.position.set(0.5 + i * 0.18, 1.3 + i * 0.04, i * 0.53); shard.rotation.set(i, i * 2, i); showcase.add(shard);
}

let socket = null, playerId = null, state = null, mode = 'menu', lastSend = 0, lastPing = 0, connectionTimer, lastPhase = '', introTime = 0;
let announcementUntil = 0, announcementText = '', lastHud = 0, latency = 0;
let skipFirstLook = true;
let lastDisconnect = null;
const items = new Map(), enemies = new Map(), bullets = new Map(), allies = new Map(), particles = [];
const keys = new Set();
const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), forward = new THREE.Vector3(), side = new THREE.Vector3();
let sound = null;
function audioStart() { if (!sound) sound = new (window.AudioContext || window.webkitAudioContext)(); if (sound.state === 'suspended') sound.resume().catch(() => {}); }
function tone(frequency, length, type = 'sine', volume = 0.03, end = frequency / 2) {
  if (!sound || sound.state !== 'running') return;
  const osc = sound.createOscillator(), gain = sound.createGain(); osc.type = type; osc.frequency.setValueAtTime(frequency, sound.currentTime); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), sound.currentTime + length);
  gain.gain.setValueAtTime(volume, sound.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, sound.currentTime + length);
  osc.connect(gain).connect(sound.destination); osc.start(); osc.stop(sound.currentTime + length);
}
function haptic(index, strength) { const actuator = xr[index]?.source?.gamepad?.hapticActuators?.[0]; actuator?.pulse(strength, 45)?.catch(() => {}); }
function send(data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); }
function me() { return state?.players.find(p => p.id === playerId); }
function held(hand) { return state?.items.find(i => i.heldBy === playerId && i.hand === hand); }
function handObject(index) { return renderer.xr.isPresenting ? xr[index].grip : desktopHands[index]; }
function handPose(index) {
  const controller = xr[index];
  const targetRay = renderer.xr.isPresenting && controller.source?.targetRayMode === 'tracked-pointer' && controller.ray.visible ? controller.ray : null;
  return heldPose(handObject(index), targetRay, held(index)?.kind);
}
function getPose(obj) { return { p: obj.getWorldPosition(new THREE.Vector3()).toArray(), q: obj.getWorldQuaternion(new THREE.Quaternion()).toArray() }; }
function sendPose() {
  if (!playerId || mode === 'menu') return;
  rig.updateMatrixWorld(true);
  const head = getPose(renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
  const hands = [handPose(0), handPose(1)];
  send({ type: 'pose', head, hands });
}
function endpoint() {
  const raw = $('server-url').value.trim();
  const url = new URL(raw || location.origin);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Use an HTTPS or WSS server address.');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  if (location.protocol === 'https:' && url.protocol === 'ws:') throw new Error('This HTTPS page needs a secure HTTPS or WSS multiplayer server.');
  url.pathname = '/ws'; url.search = ''; url.hash = ''; return url.href;
}
function connect(action) {
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  let url; try { url = endpoint(); } catch (err) { $('connection-message').textContent = err.message; return; }
  storage.set('still-life-name', $('name').value.trim()); storage.set('still-life-server', $('server-url').value.trim());
  $('create').disabled = true; $('join').disabled = true; $('connection-message').textContent = 'Connecting to the apartment…';
  const ws = new WebSocket(url); socket = ws;
  connectionTimer = setTimeout(() => { if (!playerId) { ws.close(); $('connection-message').textContent = 'Connection timed out. Check that the multiplayer server is running.'; } }, 10000);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: action, name: $('name').value, code: $('room-code').value.trim() })));
  ws.addEventListener('message', ({ data }) => {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === 'error') { $('connection-message').textContent = msg.message; toast(msg.message); if (!playerId) ws.close(); return; }
    if (msg.type === 'welcome') {
      clearTimeout(connectionTimer); playerId = msg.id; rig.position.set(msg.spawn[0], 0, msg.spawn[2]); rig.rotation.set(0, 0, 0); camera.rotation.set(0, 0, 0);
      mode = 'lobby'; show('menu', false); show('lobby', true); $('lobby-code').textContent = msg.code; $('hud-code').textContent = msg.code;
      showcase.visible = false; $('create').disabled = false; $('join').disabled = false; lastPhase = ''; initVR();
    }
    if (msg.type === 'state') receive(msg);
    if (msg.type === 'pong') latency = Date.now() - msg.at;
  });
  ws.addEventListener('error', () => { $('connection-message').textContent = 'Cannot reach the multiplayer server. If this is GitHub Pages, set a separate server address.'; });
  ws.addEventListener('close', event => {
    if (socket !== ws) return;
    lastDisconnect = { code: event.code, reason: event.reason, at: new Date().toISOString() };
    clearTimeout(connectionTimer); $('create').disabled = false; $('join').disabled = false;
    if (playerId) { toast('Disconnected. Create or join a room to reconnect.'); leave(false); }
    socket = null;
  });
}
function disposeMesh(obj) {
  obj.traverse(child => { child.geometry?.dispose(); }); obj.userData.ownedMaterial?.dispose(); scene.remove(obj);
}
function clearGame() {
  for (const map of [items, enemies, bullets, allies]) { for (const obj of map.values()) disposeMesh(obj); map.clear(); }
  for (const p of particles) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); } particles.length = 0;
}
function leave(closeSocket = true) {
  if (renderer.xr.isPresenting) renderer.xr.getSession().end().catch(() => {});
  playerId = null; state = null; mode = 'menu'; lastPhase = ''; keys.clear(); clearGame();
  if (closeSocket) { socket?.close(); socket = null; }
  document.exitPointerLock?.(); document.body.classList.remove('playing');
  for (const id of ['lobby', 'hud', 'pause']) show(id, false); show('menu', true); showcase.visible = true; vrBanner.visible = false;
  $('create').disabled = false; $('join').disabled = false; $('connection-message').textContent = 'Create a room to play solo or invite a friend.';
}
function enterPlay(lock = true) {
  if (!playerId) return;
  mode = 'play'; document.body.classList.add('playing'); show('lobby', false); show('pause', false); show('hud', true); keys.clear();
  audioStart(); send({ type: 'active', active: true });
  if (lock && !renderer.xr.isPresenting) $('game').requestPointerLock?.()?.catch(() => toast('Click the game to enable mouse look.'));
}
function pause() {
  if (mode !== 'play' || renderer.xr.isPresenting) return;
  mode = 'pause'; keys.clear(); show('pause', true); send({ type: 'active', active: false });
  const over = state?.phase === 'gameover'; $('pause-title').innerHTML = over ? 'ONE MORE<br>MOMENT.' : 'STILL IN<br>THE FIGHT.';
  $('pause-info').textContent = over ? `Wave ${state.wave} · ${state.kills} enemies shattered. Ready for another run?` : `Room ${state?.code} · ${latency} ms · Your teammate can keep playing.`;
  show('restart', over); document.exitPointerLock?.();
}
let vrReady = false, vrControl = null;
async function initVR() {
  if (vrReady) return;
  if (!isSecureContext) { $('vr-note').textContent = 'Quest VR needs HTTPS. Use the HTTPS setup in README.md.'; return; }
  if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) {
    $('vr-note').textContent = 'Open this same link in Quest Browser to enter VR. Desktop play is available here.'; return;
  }
  vrReady = true;
  const button = document.createElement('button');
  vrControl = createVRControl({ button, note: $('vr-note'), renderer, xr: navigator.xr, canEnter: () => !!playerId });
  $('vr-slot').append(button);
}
renderer.xr.addEventListener('sessionstart', () => {
  enterPlay(false); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  renderer.xr.setFoveation(1); vrBanner.visible = true;
  const session = renderer.xr.getSession();
  session.addEventListener('visibilitychange', () => send({ type: 'active', active: session.visibilityState === 'visible' }));
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 1.65, 0); camera.rotation.set(0, 0, 0); vrBanner.visible = false;
  xr.forEach(c => { c.history = []; });
  if (playerId) { mode = 'lobby'; document.body.classList.remove('playing'); show('hud', false); show('pause', false); show('lobby', true); send({ type: 'active', active: false }); }
});
function announce(text, seconds = 2) { announcementText = text; announcementUntil = performance.now() + seconds * 1000; }
function shatter(position) {
  tone(540, 0.13, 'triangle', 0.035, 90);
  for (let i = 0; i < 12 && particles.length < 180; i++) {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05 + Math.random() * 0.07), new THREE.MeshStandardMaterial({ color: palette.red, roughness: 0.3, flatShading: true }));
    mesh.position.fromArray(position); mesh.position.y += (Math.random() - 0.5) * 0.8; scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), life: 2 });
  }
}
function receive(next) {
  state = next;
  const player = me(); if (!player) return;
  $('roster').textContent = `${state.players.length}/2 connected · ${state.players.map(p => p.name).join(' + ')}`;
  $('start').firstChild.textContent = state.phase === 'lobby' ? 'START THE WAVES ' : state.phase === 'gameover' ? 'PLAY AGAIN ' : 'RETURN TO THE FIGHT ';
  if (lastPhase !== state.phase) {
    if (state.phase === 'gameover') { announce('RUN ENDED', 10); if (!renderer.xr.isPresenting && mode === 'play') { pause(); } }
    lastPhase = state.phase;
  }
  for (const event of state.events) {
    if (event.type === 'shatter') shatter(event.p);
    if (event.type === 'wave') { announce(`WAVE ${String(event.wave).padStart(2, '0')}`, 2); tone(180, 0.35, 'sine', 0.05, 340); }
    if (event.type === 'clear') announce('WAVE CLEAR · RESUPPLY', 3);
    if (event.type === 'shot') { tone(130, 0.095, 'sawtooth', event.player === playerId ? 0.045 : 0.018, 35); }
    if (event.type === 'empty' && event.player === playerId) { tone(90, 0.045, 'square', 0.025); announce('EMPTY · THROW IT', 1.5); }
    if (event.type === 'hurt' && event.player === playerId) {
      $('damage').style.opacity = '.8'; setTimeout(() => { $('damage').style.opacity = '0'; }, 180); tone(70, 0.28, 'sawtooth', 0.04, 25); haptic(0, 0.8); haptic(1, 0.8);
      if (player.health <= 0) announce('DOWNED · SURVIVE TO REVIVE', 8);
    }
  }
  sync(items, state.items, i => makeItem(i.kind));
  sync(enemies, state.enemies, e => makeEnemy(e.type));
  sync(bullets, state.bullets, b => {
    const g = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color: b.enemy ? 0xff3823 : 0xffc960 });
    g.userData.ownedMaterial = material;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(b.enemy ? 0.055 : 0.035, 6, 4), material));
    const trail = box(0.018, 0.018, b.enemy ? 0.5 : 0.3, material, 0, 0, 0.2); g.add(trail); return g;
  });
  sync(allies, state.players.filter(p => p.id !== playerId), () => makeAlly());
}
function sync(map, records, create) {
  const ids = new Set(records.map(r => r.id));
  for (const [id, mesh] of map) if (!ids.has(id)) { disposeMesh(mesh); map.delete(id); }
  for (const record of records) {
    let mesh = map.get(record.id);
    if (!mesh) { mesh = create(record); map.set(record.id, mesh); scene.add(mesh); if (record.p) mesh.position.fromArray(record.p); }
    mesh.userData.net = record;
  }
}
function release(index, throwing) {
  if (!held(index)) return;
  sendPose(); let velocity = [0, 0, 0];
  if (throwing && renderer.xr.isPresenting) {
    const samples = xr[index].history, last = samples.at(-1), first = samples.find(s => last?.time - s.time < 110);
    if (last && first && last.time > first.time) velocity = last.p.map((n, i) => (n - first.p[i]) / ((last.time - first.time) / 1000));
  } else if (throwing) { camera.getWorldDirection(v3); velocity = v3.multiplyScalar(11).toArray(); velocity[1] += 1.5; }
  send({ type: 'release', hand: index, velocity }); haptic(index, 0.2);
}
function desktopGrab() { if (held(1)) release(1, false); else { sendPose(); send({ type: 'grab', hand: 1 }); } }
$('create').onclick = () => connect('create');
$('join-form').onsubmit = event => { event.preventDefault(); connect('join'); };
$('start').onclick = () => { enterPlay(); if (['lobby', 'gameover'].includes(state?.phase)) send({ type: 'start' }); };
$('practice').onclick = () => enterPlay();
$('resume').onclick = () => enterPlay();
$('restart').onclick = () => { enterPlay(); send({ type: 'start' }); };
$('room-menu').onclick = pause;
document.querySelectorAll('.leave').forEach(button => { button.onclick = () => leave(); });
$('copy').onclick = async () => {
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', state.code);
  if ($('server-url').value.trim()) url.searchParams.set('server', $('server-url').value.trim());
  try { await navigator.clipboard.writeText(url.href); toast('Invite link copied. Send it to your partner.'); }
  catch { toast(`Room code: ${state.code}. Share this page’s address with your partner.`); }
};
$('help-button').onclick = () => $('help').showModal(); $('close-help').onclick = () => $('help').close();
$('help').addEventListener('click', e => { if (e.target === $('help')) { const r = $('help').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('help').close(); } });
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || $('help').open) return;
  if (mode !== 'play' || renderer.xr.isPresenting) return;
  keys.add(event.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Enter'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'KeyE') desktopGrab();
  if (event.code === 'KeyQ') release(1, true);
  if (event.code === 'Enter') send({ type: 'start' });
  if (event.code === 'Escape') pause();
});
document.addEventListener('keyup', event => keys.delete(event.code));
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== $('game') || mode !== 'play' || renderer.xr.isPresenting) return;
  // Some browsers emit a cursor-recentering movement when pointer lock begins.
  if (skipFirstLook) { skipFirstLook = false; return; }
  rig.rotation.y -= event.movementX * 0.002; camera.rotation.x = clamp(camera.rotation.x - event.movementY * 0.002, -1.25, 1.25);
});
$('game').addEventListener('mousedown', event => {
  if (mode !== 'play' || renderer.xr.isPresenting || event.button !== 0) return;
  if (document.pointerLockElement !== $('game')) { $('game').requestPointerLock?.()?.catch(() => {}); return; }
  audioStart(); sendPose(); send({ type: 'shoot', hand: 1 });
});
document.addEventListener('pointerlockchange', () => { skipFirstLook = true; if (!document.pointerLockElement && mode === 'play' && !renderer.xr.isPresenting) pause(); });
document.addEventListener('visibilitychange', () => { keys.clear(); send({ type: 'active', active: !document.hidden && mode === 'play' }); });
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => {
  camera.aspect = menuCamera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); menuCamera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

function locomotion(dt) {
  if (mode !== 'play' || me()?.health <= 0) return;
  let x = 0, z = 0;
  if (renderer.xr.isPresenting) {
    for (const controller of xr) {
      const source = controller.source, axes = source?.gamepad?.axes; if (!axes) continue;
      const ax = axes.length >= 4 ? axes[2] : axes[0], ay = axes.length >= 4 ? axes[3] : axes[1];
      if (source.handedness === 'left') { x = Math.abs(ax) > 0.18 ? ax : 0; z = Math.abs(ay) > 0.18 ? -ay : 0; }
      if (source.handedness === 'right') {
        if (Math.abs(ax) > 0.7 && !controller.snapping) {
          const head = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
          const angle = -Math.sign(ax) * Math.PI / 6;
          rig.position.fromArray(turnAroundHead(rig.position.toArray(), head.toArray(), angle));
          rig.rotation.y += angle; rig.updateMatrixWorld(true); controller.snapping = true;
        }
        if (Math.abs(ax) < 0.3) controller.snapping = false;
      }
    }
  } else {
    x = Number(keys.has('KeyD')) - Number(keys.has('KeyA')); z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    camera.position.y += ((keys.has('KeyC') ? 0.9 : 1.65) - camera.position.y) * Math.min(1, dt * 12);
  }
  const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
  const view = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  view.getWorldDirection(forward); forward.y = 0; forward.normalize(); side.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
  const delta = forward.clone().multiplyScalar(z * dt * 2.1).addScaledVector(side, x * dt * 2.1);
  view.getWorldPosition(v3);
  const next = moveBody(v3.toArray(), delta.x, delta.z);
  rig.position.x += next[0] - v3.x; rig.position.z += next[2] - v3.z;
}
function renderEntities(dt, time) {
  const alpha = 1 - Math.exp(-dt * 22);
  for (const mesh of items.values()) {
    const data = mesh.userData.net;
    if (data.heldBy === playerId) {
      const pose = handPose(data.hand); mesh.position.fromArray(pose.p); mesh.quaternion.fromArray(pose.q);
    } else { mesh.position.lerp(v3.fromArray(data.p), alpha); mesh.quaternion.slerp(q4.fromArray(data.q), alpha); }
  }
  for (const mesh of enemies.values()) {
    const data = mesh.userData.net; mesh.position.lerp(v3.fromArray(data.p), alpha);
    mesh.quaternion.slerp(q4.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, data.yaw), alpha);
    mesh.userData.walk = (mesh.userData.walk || 0) + dt * (state?.timeScale || 0.035) * 5;
    const limbs = mesh.userData.limbs; if (limbs) { limbs[0].rotation.x = Math.sin(mesh.userData.walk) * 0.38; limbs[2].rotation.x = -Math.sin(mesh.userData.walk) * 0.38; }
  }
  for (const mesh of bullets.values()) {
    const data = mesh.userData.net; mesh.position.lerp(v3.fromArray(data.p), alpha);
    forward.fromArray(data.v).normalize(); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
  }
  for (const mesh of allies.values()) {
    const data = mesh.userData.net, parts = mesh.userData; mesh.visible = data.health > 0;
    parts.head.position.lerp(v3.fromArray(data.head.p), alpha); parts.head.quaternion.slerp(q4.fromArray(data.head.q), alpha);
    parts.hands.forEach((hand, i) => { hand.position.lerp(v3.fromArray(data.hands[i].p), alpha); hand.quaternion.slerp(q4.fromArray(data.hands[i].q), alpha); });
    parts.body.position.copy(parts.head.position); parts.body.position.y -= 0.55;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i], sim = dt * Math.max(0.15, state?.timeScale || 0.1); p.life -= sim; p.velocity.y -= sim * 5;
    p.mesh.position.addScaledVector(p.velocity, sim); p.mesh.rotation.x += sim * 2; p.mesh.rotation.z += sim * 3; p.mesh.scale.setScalar(Math.min(1, p.life));
    if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.velocity.set(0, 0, 0); }
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); particles.splice(i, 1); }
  }
  if (renderer.xr.isPresenting) xr.forEach((controller, index) => {
    const p = controller.grip.getWorldPosition(new THREE.Vector3()).toArray();
    controller.history.push({ p, time }); while (controller.history.length && time - controller.history[0].time > 150) controller.history.shift();
    controller.hand.visible = !held(index); controller.beam.visible = !held(index);
  });
}
function updateHud(time) {
  if (!state || !me()) return;
  const player = me(), guns = state.items.filter(i => i.heldBy === playerId && i.kind === 'pistol'), object = held(1) || held(0);
  const ammo = guns.length ? guns.map(g => `${g.ammo} / 8`).join(' | ') : object ? object.kind.toUpperCase() : 'HANDS FREE';
  $('wave').textContent = String(state.wave).padStart(2, '0'); $('kills').textContent = String(state.kills).padStart(2, '0'); $('ammo').textContent = ammo;
  $('health').textContent = '● '.repeat(player.health) + '○ '.repeat(3 - player.health);
  $('time-fill').style.width = `${state.timeScale * 100}%`; $('speed').textContent = `${String(Math.round(state.timeScale * 100)).padStart(2, '0')}%`;
  const label = player.health <= 0 ? 'DOWNED' : state.phase === 'lobby' ? 'GEAR UP' : state.phase === 'countdown' ? `NEXT WAVE IN ${Math.ceil(state.countdown)}` : state.phase === 'gameover' ? 'RUN ENDED' : `${state.enemies.length} HOSTILES`;
  $('phase-label').textContent = label;
  const message = state.phase === 'lobby' ? 'GRAB A GUN / TRIGGER TO START' : state.phase === 'gameover' ? 'TRIGGER TO RESTART' : player.health <= 0 ? 'PARTNER MUST CLEAR WAVE TO REVIVE' : label;
  wrist.update(state, player, ammo, message);
  vrBanner.visible = renderer.xr.isPresenting && ['lobby', 'gameover'].includes(state.phase);
  $('announcement').textContent = time < announcementUntil ? announcementText : state.phase === 'lobby' ? 'GRAB A WEAPON · ENTER TO START' : '';
  if (!renderer.xr.isPresenting && mode === 'play') {
    if (object) $('interaction').textContent = object.kind === 'pistol' ? 'CLICK FIRE · Q THROW · E DROP' : 'Q THROW · SWING TO SHATTER · E DROP';
    else {
      const pos = desktopHands[1].getWorldPosition(new THREE.Vector3()).toArray();
      const near = state.items.filter(i => !i.heldBy && distance(i.p, pos) < 0.9).sort((a, b) => distance(a.p, pos) - distance(b.p, pos))[0];
      $('interaction').textContent = near ? `E · GRAB ${near.kind.toUpperCase()}` : '';
    }
  }
}
let previous = 0;
renderer.setAnimationLoop(time => {
  const dt = Math.min((time - previous) / 1000 || 0.016, 0.05); previous = time; introTime += dt;
  if (mode === 'menu') {
    menuCamera.position.set(12 + Math.sin(introTime * 0.06) * 0.8, 10.2, 15.7); menuCamera.lookAt(menuTarget);
    // A small horizontal offset reserves the left third for the title.
    menuCamera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.055, -innerHeight * 0.025, innerWidth, innerHeight);
  }
  locomotion(dt); rig.updateMatrixWorld(true); renderEntities(dt, time);
  if (playerId && time - lastSend > 33) { sendPose(); lastSend = time; }
  if (playerId && time - lastPing > 3000) { send({ type: 'ping', at: Date.now() }); lastPing = time; }
  if (time - lastHud > 100) { updateHud(time); lastHud = time; }
  renderer.render(scene, mode === 'menu' ? menuCamera : camera);
});

// Small read-only diagnostics are useful when checking a real headset or desktop browser.
window.stillLife = { get state() { return state; }, get playerId() { return playerId; }, get mode() { return mode; }, get lastDisconnect() { return lastDisconnect; }, get vr() { return vrControl?.status; }, get stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, latency }; } };
for (const id of ['name', 'room-code', 'create', 'join']) $(id).disabled = false;
