# Breakwater verification — 17 October 2026

This record applies to the new coastal sprint, not the retired Flight Lab interface.

## Gameplay and input

`npm test`: 20 checks. A deterministic controller completes all 18 gates with three condition segments in 50.51 seconds (21,020 points). This verifies that the route is feasible; it is not a claim about human difficulty or fun.

Coverage includes identical lateral authority during cruise/boost; simultaneous steering, flight and boost through takeoff/landing; steering during reward rolls; gravity/ceiling/landing; all four gaps and their reserve guarantees; swept obstacle contacts; collision immunity; gate scoring/deduplication/multiplier; braking priority; warnings; stable integration at 30/60/120 Hz; bounded reserve; independent key release; and landscape gating.

## Browser verification

The production-bundle harness uses WebGL and actual DOM handlers. 31 checks cover:

- Shift + either arrow, changing direction without releasing boost, and holding steering/boost through takeoff and landing.
- Three concurrent synthetic touch pointers; independent release, cancellation and lost capture.
- Selection/context-menu suppression and touch-action rules.
- Pause, resume, clear-input behavior, a bridge failure with specific instructions, instant retry, finish scoring and medal.
- HUD bounds and critical non-overlap at 1280×720, 844×390, 667×375 and 568×320.
- Visible pause controls of at least 44 px at those sizes; no title/instruction overlap on start screens.
- Portrait prompts at 390×844 and 320×568, pausing time and input, inert gameplay, and deliberate resume after returning to landscape.

Native keyboard verification in the Codex browser also held Shift+Right, then Shift+Left: the vehicle moved from X=0 to X=8.54 at 211 km/h, then back to X=−0.51 at 248 km/h. This exercised a real held key chord in addition to the synthetic harness.

Visual review covers the start screen, driving/flight HUD, bridge warnings, pause, results and portrait prompt. QA state is isolated from persisted personal bests. The standalone and hosted builds are identical, with bundled fonts and no runtime network assets.

## Launch limits

Browser viewport tests do not measure a phone GPU or OS touch behavior. Before public launch, play sustained runs on actual iPhone/Safari and Android/Chrome: simultaneous thumbs, long presses, safe areas/browser bars, rotation, audio interruptions, image downloads, frame rate and thermal behavior. Test the eventual Vercel preview too. No physical-device frame-rate claim is made.

This is assisted arcade driving, not six-axis simulation or measured Roadster physics. The reward roll is visual. There is one authored 3.6 km route and a local record, without online multiplayer or leaderboards.
