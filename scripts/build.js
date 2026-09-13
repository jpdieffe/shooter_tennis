import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const target = new URL('../dist/', import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(new URL('../public/', import.meta.url), target, { recursive: true });
if (process.env.GAME_SERVER_URL) {
  const server = new URL(process.env.GAME_SERVER_URL);
  if (server.protocol !== 'https:') throw new Error('GAME_SERVER_URL must use HTTPS.');
  await writeFile(new URL('config.json', target), JSON.stringify({ serverUrl: server.origin }, null, 2) + '\n');
}
await mkdir(new URL('vendor/three/', target), { recursive: true });
await cp(new URL('../node_modules/three/build/', import.meta.url), new URL('vendor/three/build/', target), { recursive: true });
await cp(new URL('../node_modules/three/examples/jsm/', import.meta.url), new URL('vendor/three/examples/jsm/', target), { recursive: true });
console.log('Built dist/. Serve with npm start, or host the static files and configure a separate multiplayer server.');
