# Verification record

Validation performed on October 17, 2026. This records the AFTER HOURS design, landscape-only mobile play and assisted default controls.

## Source checks

`npm test`: **73 checks** — 25 physics, 31 integration/endurance/geometry, 9 scoring/performance/input/collision, and 8 pilot/handling/orientation checks.

- A physically driven circuit clears all 12 gates in about 31.27 seconds, with maximum track-center deviation of 2.26 m. Inputs are bounded; no teleportation.
- Full pitch/roll/yaw rotations, orientation-dependent thrust, reserve depletion, landing and crash lockout; 20 randomized two-minute physics runs and finite geometry.
- Tyre grip limits high-speed cornering; world momentum persists through steering. Loose surfaces brake and corner less effectively. Brake wins over simultaneous throttle and boost.
- Simple controls accelerate to cruise speed, stop without unintended reverse, command a real roll, stabilize, land and park to refill. Pilot commands do not mutate position, attitude or stunt totals.
- Roll guards cover altitude, fuel, active maneuvers and landing. Phones/touch tablets require landscape; large desktop portrait windows remain usable.
- Independent pointer release/cancellation, pause/blur/restart, scoring and combo forfeiture, pixel budgets and scenery collisions.

## Production browser checks

Run `npm run build` and `npm start`, then visit `/tests/browser.html` and click **Run checks**. The harness loads the bundled `dist/index.html?qa=1` with real WebGL and restores local best-score values afterward.

**20 checks passed in the Codex browser:**

- Production WebGL rendering; keyboard drive/steer/brake; pause clears input and freezes time; photo mode freezes and returns.
- Actual manual launch → climb → full roll → recovery → landing banks 750 points.
- Simple tap launch → auto climb → physical roll → assisted landing banks points, then parks and refills.
- Rush timeout and restart; independent concurrent synthetic pointers; cancelled selection/context menus.
- Portrait at 390×844, 375×667 and 320×568 pauses play, clears held boost, makes the game inert, displays the rotate prompt, blocks resume, and waits for deliberate resume after rotation.
- Garage actions fit; touch buttons and sticks do not overlap in both simple and manual layouts at 1440×900, 844×390, 667×375 and 568×320.
- No uncaught browser errors.

`/tests/preview.html` provides visible viewport presets for manual review. Desktop garage, phone garage, flight HUD, pause menu and rotate screen were visually reviewed. Fonts are bundled and the hosted/standalone HTML outputs are identical. Browser pointer events are synthetic; this is not a physical mobile-device benchmark. The optional command-line Playwright wrapper was not used in this session.

## Before public launch

Use a real iPhone/Safari and Android/Chrome for sustained multitouch, OS long-press behavior, performance/thermal behavior, orientation changes, safe-area/browser toolbar behavior, audio interruptions and image downloads. Test the eventual Vercel preview on those devices. No physical-device frame-rate or thermal claim is made. Deployment is left to the owner.

The car is original procedural geometry, not manufacturer CAD. Flight and tyre parameters are game approximations. Ground support is flat; building/barrier collision footprints are simplified. These limits remain explicit in the README.
