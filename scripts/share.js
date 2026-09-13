import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const portable = new URL('../artifacts/cloudflared.exe', import.meta.url);
const executable = existsSync(portable) ? fileURLToPath(portable) : 'cloudflared';
const children = [];
let stopping = false;
function stop() {
  if (stopping) return; stopping = true;
  for (const child of children) if (!child.killed) child.kill();
}
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
process.on('exit', stop);
async function healthy() {
  try { const data = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(1500) }).then(r => r.json()); return data.ok === true && Number.isInteger(data.rooms); }
  catch { return false; }
}
if (!await healthy()) {
  const server = spawn(process.execPath, ['server/index.js'], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, PORT: '3000' } }); children.push(server);
  server.on('error', error => { console.error(`Could not start server: ${error.message}`); stop(); process.exitCode = 1; });
  for (let i = 0; i < 30 && !await healthy(); i++) await new Promise(resolve => setTimeout(resolve, 200));
  if (!await healthy()) { stop(); throw new Error('The game server did not start on port 3000.'); }
}
const tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', 'http://localhost:3000'], { cwd: root, windowsHide: true }); children.push(tunnel);
tunnel.on('error', error => {
  console.error(`Could not start cloudflared: ${error.message}\nInstall cloudflared: https://developers.cloudflare.com/tunnel/downloads/`);
  stop(); process.exitCode = 1;
});
let foundURL = '';
function output(buffer) {
  const text = buffer.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && match[0] !== foundURL) {
    foundURL = match[0]; mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../artifacts/online-session.json', import.meta.url), JSON.stringify({ url: foundURL, started: new Date().toISOString() }, null, 2));
    console.log(`\nPLAY ON BOTH HEADSETS: ${foundURL}\nKeep this terminal and computer running. Ctrl+C stops sharing.\nFor GitHub Pages, update the repository variable GAME_SERVER_URL to this address and run Publish game website.\n`);
  }
  if (/ERR|error/i.test(text)) process.stderr.write(text);
}
tunnel.stdout.on('data', output); tunnel.stderr.on('data', output);
tunnel.on('exit', code => { if (!stopping) { console.log(`Tunnel stopped (${code}).`); stop(); process.exitCode = code || 0; } });
console.log('Starting the HTTPS multiplayer connection…');
