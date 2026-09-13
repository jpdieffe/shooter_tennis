import test from 'node:test';
import assert from 'node:assert/strict';
import { createVRControl } from '../public/src/vr.js';

function fixture(requestSession, attach = async () => {}) {
  const button = {}, note = { setAttribute() {} }; let reloads = 0, allowed = true;
  const control = createVRControl({button, note, xr: {requestSession}, renderer: {xr: {setSession: attach}}, canEnter: () => allowed, reload: () => reloads++});
  return {button, note, control, get reloads() {return reloads;}, leave() {allowed = false;}};
}
function session() {
  const result = new EventTarget(); result.ends = 0;
  result.end = async () => {result.ends++; result.dispatchEvent(new Event('end'));};
  return result;
}

test('VR starts from the click with only floor tracking and can be reentered', async () => {
  const s = session(); let calls = 0, attached = 0;
  const f = fixture((mode, options) => {calls++; assert.equal(mode, 'immersive-vr'); assert.deepEqual(options, {optionalFeatures: ['local-floor']}); return Promise.resolve(s);}, async value => {assert.equal(value,s); attached++;});
  assert.equal(calls, 0);
  const attempt = f.button.onclick(); assert.equal(calls,1); assert.equal(f.button.disabled,true);
  await attempt; assert.equal(attached,1); assert.equal(f.control.status.phase,'presenting');
  await f.button.onclick(); assert.equal(s.ends,1); assert.equal(f.button.textContent,'ENTER VR');
  await f.button.onclick(); assert.equal(calls,2);
});

test('VR permission failures are visible and allow retry', async () => {
  let calls=0; const s=session();
  const f=fixture(async()=>{if(calls++===0)throw new DOMException('Denied','NotAllowedError'); return s;});
  await f.button.onclick(); assert.equal(f.control.status.phase,'error'); assert.match(f.note.textContent,/permission/); assert.equal(f.button.disabled,false);
  await f.button.onclick(); assert.equal(f.control.status.phase,'presenting');
});

test('a pending VR request cannot be duplicated; recovery reloads instead of issuing another request', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let resolve, calls=0; const s=session();
  const f=fixture(()=>{calls++; return new Promise(r=>{resolve=r;});});
  const attempt=f.button.onclick(); await f.button.onclick(); assert.equal(calls,1);
  t.mock.timers.tick(12000); assert.equal(f.button.textContent,'RELOAD VR');
  await f.button.onclick(); assert.equal(f.reloads,1); assert.equal(calls,1);
  resolve(s); await attempt; assert.equal(f.control.status.phase,'presenting'); assert.equal(f.button.textContent,'EXIT VR');
});

test('renderer startup failure closes the acquired session and reports the error', async () => {
  const s=session(); const f=fixture(async()=>s, async()=>{throw new Error('Graphics startup failed');});
  await f.button.onclick(); assert.equal(s.ends,1); assert.match(f.note.textContent,/Graphics startup failed/); assert.equal(f.button.disabled,false);
});

test('leaving a room during permission approval closes the late session', async () => {
  let resolve, attached=0; const s=session();
  const f=fixture(()=>new Promise(r=>{resolve=r;}),async()=>attached++);
  const attempt=f.button.onclick(); f.leave(); resolve(s); await attempt;
  assert.equal(s.ends,1); assert.equal(attached,0); assert.equal(f.control.status.phase,'ready');
});
