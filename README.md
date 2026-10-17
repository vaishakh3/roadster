# Roadster · Flight Lab

A browser driving and flight playground inspired by the revealed 2026 Roadster. Original Three.js geometry, six-axis flight, an afterdark circuit, and a 90-second stunt challenge. Works with keyboard or a mobile thumb control deck. No accounts, API keys, analytics, or paid assets.

## Play or develop

Open `Roadster-Flight-Lab.html` directly in a WebGL 2 browser to play the self-contained build. For development, use Node.js 20+:

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. The runtime uses locally bundled Three.js and studio lighting; it makes no external asset requests.

```sh
npm test
npm run build
```

The build writes a standalone `Roadster-Flight-Lab.html` and an identical `dist/index.html`, with third-party license notices in `dist/`.

## Deploy on Vercel

Import this GitHub repository and select the branch containing this upgrade. The included `vercel.json` sets the build command to `npm run build` and output directory to `dist`. No environment variables or backend are needed. After reviewing a preview deployment, merge the upgrade branch to use the default production branch.

## Three ways to play

- **Circuit:** clear all 12 gates in sequence. Brake before corners, use cold-gas thrust on straights, and chase a personal best saved on the device. Recovery adds a three-second penalty.
- **Flight rush:** 90 seconds to score. A complete airborne rotation starts at 500 points. Consecutive rotations raise the multiplier by 0.5, up to 4×. A safe landing banks the combo and adds 250 points. A crash, recovery, or timeout loses unbanked points. Air gates award 200 points and restore 20% gas. Bronze: 1,000; silver: 3,000; gold: 6,000. Best score is saved locally.
- **Free flight:** an untimed playground with contextual guidance, ordered air gates, and full assisted/acro control.

The garage offers front, profile and rear views plus a stowed/deployed aero preview. Photo mode pauses the simulation and lets you orbit the car and save an image. Finished runs can be saved as a PNG score card. Both downloads happen locally; the game never posts to social media.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Drive / steer | WASD or arrows | Left steering pad + right pedals |
| Forward thrust | Shift | THRUST |
| Drift | Space on ground | DRIFT |
| Launch / assisted landing | H | LAUNCH / LAND |
| Pitch / yaw in flight | W/S · A/D | Left flight stick |
| Roll | Q / E | ROLL buttons |
| Climb / descend | Space / Z in flight | ↑ / ↓ |
| Airbrake | B | BRAKE |
| Level and arrest rotation | Hold X | Hold LEVEL |
| Assist / acro | F | ASSIST |
| Camera / recovery | C / R | CAM / ↺ |
| Pause | P / Escape | Pause in top bar |

Climb above 30 m before a first roll. Hold the roll input through a complete turn, release it, level the car, then request landing. Thrust follows the car's real orientation; inverted lift cannot hold it up. A hard or inverted landing causes an impact. Major buildings and track barriers are solid; the vehicle uses a simplified rounded collision footprint.

Reserve is finite. Upright, slow grounded coasting/braking refills it as a game mechanic. Recovery does not refill the tank. Low reserve calls for an early landing.

## Rendering and mobile behavior

The reference-informed car has a flatter canopy, bronze glazing, wedge body, active rear wing, detailed aero wheels, four rear nozzles, suction fans and a modeled interior. Roughly 133,000 triangles including the interior, down from roughly 193,000 in the prior model. This is original procedural geometry, not licensed manufacturer CAD.

Rendering uses a screen pixel budget, automatic resolution adjustment, reduced mobile particles, optional high/low quality, and no planar floor reflection on coarse-pointer devices. Hidden tabs stop rendering and pause a run. The cockpit interior is hidden in external gameplay views. HUD legends are rebuilt only when control mode changes; the minimap refreshes at 10 Hz.

The game uses `100dvh`, safe-area insets, independent pointer ownership, pointer cancellation cleanup, and nonselectable controls including their labels. Portrait and landscape use separate control layouts. Help and result dialogs can scroll on small screens. Sound is optional and starts only after the player enables it.

## Validation

`npm test` covers independent physics, integration/endurance, scoring, collision and input behavior. CI runs tests and the static build for pushes and pull requests.

For browser verification, build and start the server, then open http://127.0.0.1:4173/tests/browser.html and select **Run checks**. This exercises the actual bundled build and WebGL renderer, a complete roll-and-land scoring run, pause/photo/restart transitions, synthetic multitouch pointer events, and six responsive layouts. Optional `npm run test:browser` launches the same harness headlessly (Chrome on macOS, bundled Chromium on Linux, or `CHROME_PATH`).

See [tests/QA.md](tests/QA.md) for the verified scope and remaining device checks. A desktop browser viewport is not a physical mobile GPU benchmark.

## Design references and limits

- [Official Tesla Roadster page](https://www.tesla.com/roadster)
- [Front view](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-1-Desktop.jpg)
- [Rear view](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-01-Hero-Desktop.jpg)
- [Deployed aero](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-04-World-Desktop.jpg)

This game is not affiliated with Tesla. Vehicle geometry, dimensions, flight endurance, acceleration, control forces and recharge are game approximations. The interior is a two-seat interpretation, rather than the one-seat Rocket trim. Wall driving, opening doors, deformable damage and online leaderboards are not implemented. Building collisions use simplified footprints; the flat ground is the only landable support surface.

Original code retains its existing `UNLICENSED` status; see `LICENSE`. Three.js is MIT licensed (`vendor/THREE-LICENSE.txt`). The bundled Poly Haven Studio Small 09 HDRI by Sergej Majboroda is CC0 (`assets/LICENSE.txt`). No Tesla promotional images are bundled in the game.
