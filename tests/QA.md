# Visual refinement verification — 17 October 2026

## Scope

The production bundle was built locally and exercised in the Codex browser with real WebGL. The same self-contained HTML is served by Vercel. No Vercel authentication protection was changed or bypassed.

- `npm test`: **28 passed**.
- Production browser regression harness: **48 passed, 0 failed**.
- Three complete rendered routes, driven through production keyboard handlers: **all passed**, including fastest-run ghost playback.
- `npm run build` and `git diff --check`: passed.
- Hosted and standalone output: identical, **6,961,050 bytes**, **4,554,257 bytes gzip** at the verified build.
- No external asset or API requests are needed during play.

## Complete rendered routes

| Course | Time | Gates | Condition | Score | Peak draw calls |
| --- | --- | --- | --- | --- | --- |
| Breakwater | 50.22 s | 18 / 18 | 3 / 3 | 21,437 | 160 |
| Redshift | 55.47 s | 18 / 18 | 3 / 3 | 21,272 | 158 |
| Nightshift | 59.09 s | 20 / 20 | 3 / 3 | 21,935 | 188 |

These are deterministic test-driver results at a 60 Hz simulation step, rendered in an 844 × 390 browser viewport. They demonstrate route feasibility and input integration, not human performance or phone frame rates. The test driver is excluded from the production bundle. Its keyboard discretization can produce slightly different scores from the pure simulation driver.

## Verified behavior

- Shift plus either arrow continues steering while boosting; Space can be held simultaneously through takeoff and landing.
- Independent synthetic touch pointers, pointer cancellation and lost capture do not cancel unrelated controls.
- Selection, context menus and touch scrolling are suppressed on the play surface.
- Pause, resume, failure, retry, finishing, one-time score awards and deliberate orientation recovery work.
- All three course selectors and previous/next arrows change the authored route, geometry and briefing. The venue index wraps correctly.
- Showroom rotation preserves the selected course and driving state.
- Repeated arena changes release old geometry and textures; retained counts stay bounded.
- The World Tour advances through three stages, totals their results and unlocks paint finishes.
- Each completed route records a ghost and displays it on replay.
- Per-course record logic retains independent best score/time, the fastest ghost and previously earned badges.
- Low gantries, moving sweepers, traffic stopping before gaps, ramp impulse and ground-only slingshot strips are covered in simulation checks.

## Layout coverage

Desktop 1280 × 720; landscape phones 844 × 390, 667 × 375 and 568 × 320; portrait 390 × 844 and 320 × 568. The checks cover bounds and overlap for course selection, title, start actions, critical HUD, touch controls and pause settings. All tour-result actions also fit the smallest landscape viewport. Portrait pauses the race and makes the underlying UI inert.

Visual review included the garage, canyon arch, Atlantic gap, night port, tunnels and results. Screenshots are frozen QA scene presets, not promotional renders. The final regression run produced no graphics errors or warnings. A stale mobile grid rule that pushed World Tour off-screen was corrected and covered by viewport assertions. Boost vapor was revised after visual review to remove hard cone edges. The freight yard gained textured ground, lane markings and bollards.

An additional real-time Nightshift run completed in 59.09 simulation seconds with all 20 gates, full condition and a gold medal. Its animation-frame counter averaged 118 browser frames/second in the local desktop browser at 844 × 390; this is a local diagnostic, not a mobile-device benchmark. Asset loading and HDR preprocessing occur once per page. Shared maps stay resident while venue-owned geometry and generated textures are disposed.

## Before public launch

Physical iPhone Safari and Android Chrome playtesting remains necessary for sustained multi-finger input, safe areas/browser chrome, heat, battery and real frame rates. Local records depend on browser storage and do not sync between devices. Fullscreen availability depends on the browser. Tour progress is session-only; completed course records persist locally. The protected Vercel preview itself was not browser-tested in this run; verification used the identical local production bundle.
