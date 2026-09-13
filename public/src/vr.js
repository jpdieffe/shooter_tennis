// Request only the floor-tracking feature the game uses. Keep the request in
// the click handler so the browser receives the player's activation directly.
export function createVRControl({ button, note, renderer, xr, canEnter, reload = () => location.reload(), pendingDelay = 12000 }) {
  let session = null, pending = false, delayed = false, timer;
  const status = { phase: 'ready', error: null };
  const ready = () => {
    button.disabled = false; button.textContent = 'ENTER VR';
    note.textContent = 'Enter VR, grab a weapon, then pull a trigger to start. Your room code is on your wrist.';
  };
  function failure(error) {
    status.phase = 'error'; status.error = `${error.name || 'Error'}: ${error.message || error}`;
    const advice = {
      NotAllowedError: 'VR permission was not granted. Allow VR in the browser site permissions, then try again.',
      SecurityError: 'Keep the headset on and this browser window visible, then try Enter VR again.',
      InvalidStateError: 'The browser has another VR request open. Exit other VR content or reload this page.',
      NotSupportedError: 'VR could not start with floor tracking. Check that headset tracking is enabled and try again.'
    };
    note.textContent = advice[error.name] || `VR could not start: ${error.message || error}. Try again.`;
    button.disabled = false; button.textContent = 'TRY VR AGAIN';
  }
  ready(); button.id = 'VRButton'; button.type = 'button'; note.setAttribute('role', 'status');
  button.onclick = async () => {
    if (pending) { if (delayed) reload(); return; }
    if (session) { try { await session.end(); } catch (error) { failure(error); } return; }
    if (!canEnter()) { note.textContent = 'Create or join a room before entering VR.'; return; }
    pending = true; delayed = false; status.phase = 'requesting'; status.error = null;
    button.disabled = true; button.textContent = 'OPENING VR…';
    note.textContent = 'Keep the headset on. Accept any VR permission or boundary prompt in the headset.';
    timer = setTimeout(() => {
      delayed = true; status.phase = 'waiting'; button.disabled = false; button.textContent = 'RELOAD VR';
      note.textContent = 'VR has not opened. Finish any headset prompt. If none appears, select Reload VR to clear the pending request, then rejoin your room.';
    }, pendingDelay);
    let requested;
    try {
      requested = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      if (!canEnter()) { await requested.end(); ready(); status.phase = 'ready'; return; }
      session = requested; let ended = false;
      requested.addEventListener('end', () => {
        ended = true;
        if (session === requested) { session = null; status.phase = 'ready'; ready(); }
      }, { once: true });
      status.phase = 'initializing';
      await renderer.xr.setSession(requested);
      if (!ended) { status.phase = 'presenting'; button.textContent = 'EXIT VR'; button.disabled = false; note.textContent = 'VR is running in your headset.'; }
    } catch (error) {
      if (requested) { try { await requested.end(); } catch {} }
      session = null; failure(error);
    } finally { clearTimeout(timer); pending = false; delayed = false; }
  };
  return { get status() { return { ...status }; } };
}
