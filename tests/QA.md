# Verification record

Upgrade validation performed on October 17, 2026.

## Automated source checks

`npm test` runs 25 pure physics checks, 31 integration/endurance/geometry checks, and 9 scoring/performance/input/collision checks. Coverage includes:

- A physically driven full lap through all 12 gates; the bounded steering controller finishes at about 30.95 seconds, staying within 1.48 m of the track center.
- Full signed pitch/roll/yaw rotations, quaternion normalization, reserve depletion, orientation-dependent thrust, landing and crash lockout.
- 20 randomized two-minute physics runs; finite geometry positions and normals.
- Pause/blur/resume, independent pointer cancellation, steering pad pointer ownership, restart and recovery bookkeeping.
- Combo multipliers, safe landing banking, forfeiture on impact/reset/timeout, medal thresholds, mobile pixel budgets, and obstacle collision response.

## Production-build browser harness

Build with `npm run build`, run `npm start`, and open `/tests/browser.html`. The harness loads `dist/index.html?qa=1` in a real browser iframe and reports checks in its UI. It restores the previous personal-best storage values after the run.

14 checks passed in the Codex browser with real WebGL rendering:

1. Production renderer initialization and geometry.
2. Keyboard acceleration, steering and braking.
3. Pause releases held input and freezes elapsed time.
4. Photo mode freezes simulation and returns to the run.
5. Actual launch → climb → full roll → stabilization → landing banks 750 points.
6. The 90-second timer ends the run; restart clears scoring and starts a fresh countdown.
7. Concurrent pointer inputs, independent cancellation, disabled selection and cancelled context menus.
8–13. Garage actions fit and mobile control buttons do not overlap at 1440×900, 390×844, 375×667, 320×568, 844×390, and 568×320.
14. No uncaught browser errors.

Visual checks additionally inspect desktop garage, mobile garage, driving HUD, flight controls and short landscape. Browser pointer events in the harness are synthetic; physical operating-system long-press behavior is not emulated by that test. The optional Playwright command wraps the same harness; the command-line launcher was not executed during this session.

## Before public launch

Test a real iPhone in Safari and an Android phone in Chrome for sustained multitouch, OS long-press handling, thermal/performance behavior, orientation changes, audio interruption and saving images. Test the Vercel preview on those devices. No physical-device frame-rate or thermal claim is made. Vercel deployment is left to the owner.

The car remains a procedural visual interpretation. There is no claim of manufacturer CAD accuracy or simulation-grade physics. Terrain support is flat and collision footprints are approximate. These limits are intentional and documented in the README.
