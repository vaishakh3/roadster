# Roadster · Flight Lab

A self-contained, real-time 3D driving and flight game inspired by the October 2026 Tesla Roadster concept reveal. Built with Three.js, original procedural geometry and synthesized optional audio. No remote asset/CDN requests, analytics, external accounts or paid assets are required by the game itself.

## Play

Download this repository and open `Roadster-Flight-Lab.html` in a WebGL 2 capable browser on a computer. The standalone HTML contains the entire game and does not need a server. For devices that cannot execute downloaded HTML, serve the project over HTTP as described below.

For the editable modular source, run `npm start` and open http://localhost:4173. A Python 3 installation is needed by that convenience command; any static HTTP server works. Runtime Three.js modules and the studio lighting are bundled locally.

## Install and build

Requirements: Node.js 20 or newer and npm. Python 3 is optional, for the convenience server.

```sh
npm ci
npm test
npm run build
npm start
```

`npm run build` regenerates `Roadster-Flight-Lab.html` and creates `dist/`. The standalone file and `dist/index.html` are byte-identical. Deploy the contents of `dist/` to any static host, preserving the included third-party license files. The build does not require credentials or environment variables.

For rendered browser checks on a compatible Linux host:

```sh
npm run build
npm run test:browser
```

The browser check uses the development-only `playwright-core` and `@sparticuz/chromium` packages, starts a temporary server on port 4178, and writes local screenshots and a JSON report. The other scripts under `tests/` provide optional showroom, lighting, night, and geometry render checks.

### Controls

Ground:
- W/A/S/D or arrow keys: throttle, steering, brake/reverse
- Shift: extra cold-gas forward boost
- Space: handbrake drift

Flight:
- H: launch, request powered assisted landing, or cancel landing
- W / S or up/down arrows: pitch nose down / up
- A / D or left/right arrows: yaw left / right
- Q / E: roll left / right
- Space / Z: climb / descend
- Shift: forward cold-gas thrust along the actual nose direction
- B: airbrake
- F: toggle assisted flight / acro
- Hold X: level the car and arrest spin using remaining cold gas

Both:
- C: cycle chase, cockpit and cinematic cameras
- R: recover to track; preserves air reserve and top speed, adds a 3-second circuit penalty
- P / Escape: pause
- Touch: driving pedals/steering change to a yaw/pitch stick, roll pair, climb/descent, thrust, airbrake, ASSIST and held LEVEL controls in flight. CAM, LAUNCH/LAND and reset remain available.

Climb to at least 30 m for a first flip, and higher for acro or chained stunts. Hold pitch or roll through a full turn. Assisted flight levels the car when rotational commands are released; acro retains attitude and angular inertia. Both use actual body-oriented thrust. Lift cannot point upward when inverted, so flips cost altitude. Hold X / LEVEL to recover, then H to land. Landing inverted or too fast causes an impact and disables propulsion until R / reset.

Circuit mode requires all 12 gates in order. Free Flight has seven ordered airborne gates and scored 360-degree loops, rolls and yaw spins. Each complete rotation earns 500 points; each air gate earns 200 points and a 20% reserve bonus. All thrusters share a finite reserve. Upright low-speed grounded coasting/braking refills it for game balance. An empty reserve disables propulsion and leaves ballistic descent. A local personal-best circuit time persists in browser storage when available. Sound is off until explicitly enabled.

## Rendering and design

- Approximately 193,000-triangle car, batched to 83 meshes, with continuous crease-controlled body surfaces, physically transmitting coated bronze glass and a sculpted cabin, five-spoke/aero-sector wheels, brakes, flush panel seams, triangular headlamps, thin tail optics, a substantial active wing, four upper nozzles and four lower turbines
- Clearcoat PBR paint, bundled HDR studio reflections, restrained satin planar showroom reflection and near-field rectangular studio lights, tire contact shadows, directional sun shadows, an atmospheric night sky, layered futuristic architecture, illuminated circuit edges and wet-look asphalt, plus a separate neutral design-studio garage
- Body-oriented white vapour columns with short blue-white cores, paired reaction-control jets, expanding trails and near-ground clouds, working night headlights, tire marks, true driver-eye cockpit, speed-sensitive chase camera, responsive HUD and circuit minimap
- Fixed-step physics, speed-dependent steering, tire slip, handbrake, supported-surface suction grip, brake/reverse, drag, quaternion-based six-axis flight, assisted/acro handling and oriented-body floor contact
- Automatic render-resolution reduction during gameplay on slower devices, plus HIGH/LOW overrides; showroom front, profile and rear camera selectors

## Reference and fidelity notes

Reference material reviewed: official Tesla product photos, official event transcript and demonstration stills. Full moving-video playback buffered in the research browser, so animation timing is not claimed to be measured.

- Official product page: https://www.tesla.com/roadster
- Official full reveal: https://www.youtube.com/watch?v=qt5p-_tE8d0
- Official front photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-1-Desktop.jpg
- Official rear photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-01-Hero-Desktop.jpg
- Official body/wing photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-04-World-Desktop.jpg
- Official closed-car shape photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-08-End-Desktop.jpg
- Official interior photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-4-Desktop.jpg
- Official flying rear view: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-06-Gravity-Desktop.jpg
- Official fan/nozzle photo: https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-07-Augments-Desktop.jpg

The cabin is a two-seat Roadster interpretation based on the public interior photograph. It is not claimed to reproduce the single-seat Rocket configuration.

This is an original visual interpretation, not a licensed CAD model, certified performance simulation or pixel-perfect replica. Dimensions, steering, force levels, flight stabilization, air consumption and recharge are game choices. Ground suction currently works on the flat proving-ground surface; inverted wall driving, fully simulated aerodynamic surfaces, structural damage and opening doors are outside this build. Scenery is visual and non-colliding; the support/collision plane is the flat proving ground. The game is not affiliated with Tesla.

## Validation

`npm test` runs 25 pure physics checks and the integration/endurance/geometry suite, including actual 360 rotations, all three signed rotation axes, body-relative forces, reserve depletion, crash lockout, safe landing, reset/pause/blur and multitouch cancellation. `npm run test:browser` runs actual headless Chromium WebGL render/input checks and creates `tests/browser-qa-report.json` locally. `tests/QA.md` describes additional integration coverage and remaining limits. Mobile checks emulate viewport and touch behavior in Chromium; physical iOS Safari and physical mobile GPU performance have not been verified.

## Files

- `main.js`: orchestration, controls, game states, rendering, camera, HUD and particles
- `physics.js`: independent vehicle state and fixed-step dynamics
- `car.js`: original detailed car geometry and animation handles
- `interior.js`: sculpted seats, dashboard, yoke, console and interior materials
- `world.js`: circuit and procedural environment
- `studio-light.js`, `assets/`: bundled CC0 studio HDRI and source attribution
- `style.css`, `index.html`: responsive UI
- `vendor/`: bundled Three.js dependency and MIT license
- `Roadster-Flight-Lab.html`: generated standalone playable build
- `dist/`: generated static hosting payload (created by the build and ignored by Git)

## License

Original game code and generated geometry retain their existing `UNLICENSED` status; no open-source license is granted. See `LICENSE`. Three.js is MIT-licensed; its license is preserved in `vendor/THREE-LICENSE.txt`. No Tesla image assets are embedded in this game. Studio lighting uses Poly Haven’s Studio Small 09 by Sergej Majboroda (CC0): https://polyhaven.com/a/studio_small_09. Source and license are preserved in `assets/LICENSE.txt` and the hosted `ASSET-LICENSE.txt`.

Browser QA helper uses playwright-core and a Linux headless Chromium package (development dependencies only). Run npm run test:browser on a compatible Linux test host.
