# Validation

## Repeatable source checks

Run `npm test` from the repository root. The suite checks:

- 25 physics assertions for driving, reverse, drift, quaternion normalization,
  pitch/roll/yaw, full rotations, body-relative thrust, reserve depletion,
  leveling, landing, crash lockout, reset, and variable frame steps.
- 31 integration, endurance, and geometry assertions, including ordered
  circuit/air gates, an actually driven lap, pause/resume, blur, independent
  multitouch cancellation, keyboard flight controls, rendering orientation,
  lighting transitions, and 20 randomized two-minute runs.

The integration test uses the real game and scene modules with mocked DOM and
renderer objects. It is not a replacement for rendered browser checks.

## Rendered browser checks

Run `npm run build`, then `npm run test:browser` on a compatible Linux host.
The browser suite loads the final standalone payload in headless Chromium
and checks WebGL startup, driving, steering, braking, launch/climb, pause,
recovery, garage return, simultaneous touch input, and portrait/landscape
layouts. It writes a report to `tests/browser-qa-report.json` and screenshots
to the repository root; these generated files are ignored by Git.

Other `tests/*.cjs` scripts are optional visual studies and render regressions.
They use the same local-only browser tooling and do not require accounts.

## Manual flight checklist

- In Free Flight, launch with H and climb with Space to at least 30 m.
- Hold W/S, Q/E, and A/D to exercise pitch loops, rolls, and yaw spins.
- Check F for assisted/acro handling, Shift for body-relative forward thrust,
  B for airbraking, Z for descent, and held X for leveling recovery.
- Use H for powered landing; verify that an inverted or hard impact disables
  propulsion until reset and that reset preserves remaining reserve.
- On touch devices, exercise stick, roll, lift, and thrust simultaneously;
  release each independently, then test pause and cancellation.
- Test portrait and landscape, including small 320-pixel-tall viewports.

## Limits

Headless Chromium uses software SwiftShader, so its frame rate is not a GPU
benchmark. Mobile touch and viewport checks are emulation, not physical iOS
Safari or mobile-device validation. Scenery is intentionally non-colliding.
Floor contact uses an oriented body box and a flat proving ground. Wall
suction, structural damage, and full aerodynamic simulation are not included.
Flight behavior is a game approximation, not manufacturer-measured performance.
