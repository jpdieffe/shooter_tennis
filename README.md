# STILL LIFE

A two-player WebXR survival game for Meta Quest 3, with a desktop mode for development and play. Time slows when you hold still. Grab a pistol, throw a mug, swing a frying pan, and survive escalating waves of red crystalline enemies in a minimalist apartment.

Original procedural visuals and synthesized sounds. Inspired by movement-driven action games; no SUPERHOT assets or branding are used.

## Run it on your computer

Install **Node.js 22 or newer**, then run from this folder:

```sh
npm ci
npm start
```

Open **http://localhost:3000**. Create a room, then choose **Start the waves** or **Explore / desktop controls**. Send your friend the room code and the same website address. Two tabs can test a room locally, but background tabs pause their player; separate visible windows work better.

The Node process serves **both the website and the multiplayer WebSocket connection**. No database, API key, Meta developer account, Unity installation, or headset sideloading is required for the browser version.

## Play on both Quest headsets

Quest Browser needs a trusted **HTTPS** address for immersive VR. A computer's plain `http://192.168…:3000` LAN address is not enough. `localhost` on the headset means the headset itself.

For a quick session from this computer:

1. Start the game with `npm start`.
2. Install [Cloudflare's cloudflared client](https://developers.cloudflare.com/tunnel/setup/) and open a second terminal.
3. Run:

   ```sh
   cloudflared tunnel --url http://localhost:3000
   ```

4. Open the printed `https://…trycloudflare.com` address in **Meta Quest Browser** on both headsets. Leave **Connection settings** empty so the game uses that same server.
5. One player creates a room; the other enters its five-character code. **Copy invite** includes the room code in the link.
6. Choose **Enter VR** on each headset. Pick up a weapon from a table, then pull a trigger to start the run.

Keep the computer, Node process, and tunnel running. The temporary address changes when a new tunnel is created. This also works from separate homes. Tunnel/network latency affects multiplayer responsiveness.

For later sessions, `npm run share` starts the server (if needed) and the tunnel together. It uses `cloudflared` from your PATH or the portable `artifacts/cloudflared.exe` downloaded during setup. The new HTTPS address is printed in the terminal and saved to `artifacts/online-session.json`. This is a computer-hosted session, not an always-on cloud server.

### Test a Quest over USB

Enable Developer Mode for your headset in the Meta Horizon app, use a USB data cable, and accept the headset's **Allow USB debugging** prompt. `adb devices -l` must list the Quest as `device` before automated headset inspection is possible. Once it does:

```sh
adb reverse tcp:3000 tcp:3000
adb shell am start -a android.intent.action.VIEW -d http://localhost:3000 com.oculus.browser
```

USB reverse makes the headset's localhost reach this computer, which supports local WebXR testing. It does not provide your friend's internet connection; use the HTTPS link for that. See [Meta's browser debugging guide](https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/).

If VR is unavailable, confirm you opened an HTTPS link in the headset's own browser. Browser support is detected on the lobby screen. See [WebXR's secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Startup_and_shutdown).

## Controls

**If Enter VR appears stuck:** the button now shows `OPENING VR`, then `RELOAD VR` after 12 seconds if the browser hasn't completed its request. Finish any headset permission or boundary prompt first. Otherwise reload, rejoin, and try again while wearing the headset. Repeated clicks cannot create overlapping VR requests. If even the [official immersive VR sample](https://immersive-web.github.io/webxr-samples/immersive-vr-session.html) fails, restart Quest Browser or the headset before retrying. VR startup status is available in `window.stillLife.vr` for debugging.

| Action | Quest Touch controllers | Desktop |
| --- | --- | --- |
| Look / dodge | Move your head and body | Mouse look |
| Move | Left thumbstick, optional | WASD |
| Crouch / reach the floor | Physically crouch | Hold C |
| Turn | Physical turning or right-stick 30° snap turns | Mouse |
| Grab | Hold grip near an object | E near an object |
| Drop / throw | Release grip; hand velocity determines throw | E drops, Q throws forward |
| Shoot | Trigger while holding a pistol | Left click |
| Melee | Swing a held object into an enemy | Move / turn a held object into an enemy |
| Start / restart | Trigger while in lobby or after a run | Enter or menu button |
| Room menu | Exit immersive VR | Esc |

On desktop, click the game to capture your mouse. The crosshair is an aiming guide; bullets originate at the held weapon. In VR, aim along the pistol's sights. The wrist display shows your room, wave, health, ammunition, and time speed. Use the headset's boundary and a clear physical play area. This is virtual co-op, not a colocated mixed-reality game with aligned physical rooms.

## Game rules

- **One shared clock:** the most active living, active player sets the speed. Head and hand translation and rotation contribute. Stillness slows the world to about 3.5%; firing briefly accelerates it. Player input remains responsive in real time.
- **One or two players:** the server creates five-character rooms. Your teammate appears in teal. Friendly fire is disabled.
- **Eight shots per pistol:** no manual reload. Throw an empty gun, find another, or use a household object. Red ranged enemies drop pistols when shattered.
- **Physical props:** bottles, mugs, a vase, and a frying pan can be grabbed, thrown, or used for melee. Props use lightweight swept collision rather than a full rigid-body physics engine.
- **Waves:** a mix of rushing and shooting enemies approaches you. Enemy bullets are visible and slow enough to dodge. Furniture provides cover. Waves grow up to 22 enemies.
- **Three health:** recover one health at the next wave. A downed teammate returns with one health if the other player clears the wave. Both down ends the run.
- **Resupply:** held guns refill and table supplies refresh between waves. Weapons picked up in the initial lobby stay in your hands when you start.
- **Pause:** desktop menu, hidden page, or hidden VR session marks that player inactive. Teammates can keep fighting. With no active living players, combat stops.
- **Disconnect:** held props drop; the room remains while someone is connected. Rooms are held in memory and disappear when empty or when the server restarts. Rejoining creates a new player; there is no account or persistent score system.

## Permanent hosting

The simplest deployment is **one Node web service** that serves the game and WebSockets from the same HTTPS domain. No separate static site is necessary.

The included `render.yaml` prepares a single free Render web service. [Deploy Still Life to Render](https://render.com/deploy?repo=https://github.com/jpdieffe/shooter_tennis). Sign in to your Render account and review/create the service, then use its HTTPS address on both headsets. The game and multiplayer run there, so your PC can be off. No hosting account or cloud service is created by this repository itself.

[Free Render services](https://render.com/docs/free) sleep after 15 minutes without inbound traffic and take about a minute to wake. Open the service's website and let it finish loading before creating a room. Active WebSocket messages count as traffic. Restarts erase current rooms. This blueprint disables automatic deployments so a code push cannot interrupt a match; deploy updates from the Render dashboard when ready.

For example, connect this repository to a [Render Node web service](https://render.com/docs/deploy-node-express-app):

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/health` |
| Instances | **1** |

The server respects the host's `PORT` environment variable and binds to `0.0.0.0`. Render supports [WebSockets on the same service](https://render.com/docs/websocket). Choose a region near both players and a hosting plan appropriate for your sessions. A sleeping/restarting service ends its in-memory rooms. Do not scale to multiple instances without adding shared room routing/state.

A `Dockerfile` is also included:

```sh
docker build -t still-life .
docker run --rm -p 3000:3000 still-life
```

Use your host's HTTPS termination in front of the container for Quest access.

### Optional GitHub Pages frontend

GitHub Pages can host the website, but **cannot run the multiplayer server**. A single-player room also uses the server simulation.

1. Deploy the Node server as above.
2. In GitHub repository settings, set **Pages → Source → GitHub Actions**.
3. Run the included **Publish game website** workflow manually. It builds and publishes `dist/`.
4. On the hosted game, open **Connection settings** and enter the Node server's HTTPS address. Both players must use the same server. The address is saved locally and included in copied invite links.

To configure that address automatically, set the repository's **Actions variable** `GAME_SERVER_URL` to the server's HTTPS origin. The Pages build writes it to `config.json`; players can then create/join without entering a server. The workflow deploys on pushes to `main` once Pages is enabled, or by manual dispatch. After restarting a temporary tunnel, update this variable and run **Publish game website** again. An explicit connection setting or invite-link server takes precedence over the deployment default.

GitHub Pages availability for private repositories depends on your GitHub plan. Enabling Pages does not automatically change repository visibility.

Relative imports support the `/shooter_tennis/` Pages path. The standalone build includes Three.js and locally hosted fonts; runtime CDN access is unnecessary. See [GitHub's custom Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Development and verification

```sh
npm run dev                 # Node watch mode; refresh the browser after client edits
npm test                    # Simulation and real two-client WebSocket integration tests
npm run build               # Static website in dist/
npx playwright install chromium
npm run test:browser        # Rendering, two browser players, pickup/fire/throw, mobile/error flow
```

Browser screenshots are written to `artifacts/`. If testing with an installed Chrome instead, set `PLAYWRIGHT_CHANNEL=chrome`. The browser runner requires an environment that permits WebGL; an OS sandbox may block GPU/software rendering.

Set `GAME_TEST_URL` to a deployed website URL (including its trailing slash and project path) to run the same two-player browser tests over the internet. For example in PowerShell: `$env:GAME_TEST_URL='https://jpdieffe.github.io/shooter_tennis/'; npm run test:browser`. These tests create and clean up their own rooms.

Files:

- `public/src/main.js` — WebXR and desktop input, networking, UI, audio, rendering loop.
- `public/src/scene.js` — procedural apartment, props, enemies, teammate, and wrist display.
- `public/shared/world.js` — shared solid geometry and collision math.
- `server/game.js` — server-owned clock, waves, enemies, damage, and item ownership.
- `server/index.js` — static files, WebSocket rooms, input limits, and cleanup.
- `test/` — simulation, server, and browser tests.

### Prototype limits

Browser rendering and two-client multiplayer can be tested automatically. **Actual Quest controller alignment, comfort, frame rate, haptics, and internet play still need a two-headset playtest.** The game interpolates network updates, but does not yet implement rollback or latency compensation. There is no integrated voice chat; use your usual headset call. Room codes provide casual invitation access, not authenticated private accounts. The server validates poses, reach, ammo, and object ownership, but this is not a competitive anti-cheat system.

## Asset licenses

Geometry is generated by this project. Three.js and `ws` are MIT licensed. Local Barlow Condensed, DM Sans, and DM Mono font files are distributed under the SIL Open Font License; their notices are in `public/fonts/`.
