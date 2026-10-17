# Stunt and scenery refinement verification — 17 October 2026

## Build and scope

The production bundle was exercised locally with real WebGL in the Codex browser. Hosted and standalone HTML are identical, with no runtime asset/API requests.

- `npm test`: **36 passed**.
- Production browser harness: **56 passed, 0 failed**.
- Three complete rendered races through production keyboard handlers: **all passed**, including saved ghost playback.
- Build and whitespace checks passed.
- Standalone/hosted HTML: **2,574,751 bytes**; gzip: **1,372,484 bytes**.
- Previous build: 6,961,050 bytes; gzip: 4,554,257 bytes. The compressed payload is approximately **70% smaller**.
- Five runtime textures/HDR: 969,396 bytes versus 4,288,030 bytes, **77.39% smaller**. Original-resolution sources and license provenance remain in the repository.

## Venue switching

Measured selection through its first rendered frame at 844 × 390, nine switches (three rounds across all venues), in the same local desktop browser. These are local timing samples, not guarantees for other hardware or network conditions.

| Metric                        | Previous build | Prepared venue worlds |
| ----------------------------- | -------------: | --------------------: |
| Minimum                       |        67.4 ms |                2.2 ms |
| Median                        |        85.7 ms |                6.4 ms |
| Maximum                       |       140.0 ms |               13.0 ms |
| Locally cached initialization |         497 ms |                677 ms |

Geometry and shader preparation now happen behind the loading screen. Switching reuses a bounded set of three worlds; it does not construct or dispose geometry on every click. During the measured switches the new build retained 150 geometries and 15 textures without growth. More districts upload as they are first visited during racing. This trades some resident geometry and initial preparation time for much faster selection. Image decode/transfer costs are reduced separately by the compact assets.

## Complete rendered routes

| Course     | Time    | Gates   | Condition | Score  | Peak draw calls |
| ---------- | ------- | ------- | --------- | ------ | --------------- |
| Breakwater | 48.03 s | 18 / 18 | 3 / 3     | 24,768 | 180             |
| Redshift   | 54.23 s | 18 / 18 | 3 / 3     | 24,146 | 195             |
| Nightshift | 57.12 s | 20 / 20 | 3 / 3     | 25,253 | 201             |

The deterministic test driver uses the actual keyboard handlers and a 60 Hz simulation step. It is excluded from the shipped game. These results demonstrate route feasibility and rendering/input integration, not human enjoyment or phone frame rates.

A separate continuous Nightshift run finished in 57.14 simulation seconds with all 20 gates and full condition. The local desktop animation-frame counter averaged 120 frames/second at 844 × 390. This is a desktop diagnostic, not a mobile benchmark.

## Verified behavior

- All ten curved ramps follow the same surface equation in the simulation and renderer. Each launches and lands one automatic stunt at 30, 60 and 120 Hz.
- Braking in the air preserves the authored safe landing zone. Steering and boost remain independent throughout. Completed flips reset to an exact zero height and upright pose.
- Entering alongside a high ramp lip cannot teleport a grounded car onto its top. A collision cancels the clean-stunt bonus. Imminent hazard warnings override a later ramp hint.
- World-space ribbon samples retain past positions through steering reversals, expire after boost release, and clear on retry/teleport.
- A fatal collision keeps the car visible, recoils and rotates it, then opens results after 0.95 seconds. Race time/distance stop at impact. Inputs clear and the results screen offers a retry.
- Moving cargo, rockfall, drums, sweepers, traffic and low gantries use the authored collision footprints and shared moving poses. Traffic stops before gaps.
- Shift, arrows and Space work together. Independent synthetic touch pointers survive unrelated pointer cancellation. Selection, context menus and touch scrolling are suppressed.
- Pause/focus/orientation recovery, finishing, scoring, all venue selectors/arrows, World Tour progression, paint unlocks and personal ghosts pass.
- Layout version 2 replaces incompatible old ghost/time comparisons while retaining earned paints, medals and mastery badges.

## Visual and layout review

Reviewed coastal storm galleries, the canyon arch and sky ramp, an in-flight backflip, night dock trusses, moving cargo, curved boost ribbons and impact animation. Venue thumbnails are new captures of the actual game. Landings have guide markings; cargo has amber outlines; headlights and streetlight pools light the wet port. The final regression run produced no graphics errors or warnings.

Layout checks cover 1280 × 720 desktop, 844 × 390 / 667 × 375 / 568 × 320 landscape, and 390 × 844 / 320 × 568 portrait. Critical HUD and controls remain in bounds without overlap; all tour results/actions fit the smallest landscape viewport. Portrait pauses play and requires deliberate resume after rotation. QA records are isolated in memory and never overwrite personal progress.

## Remaining device validation

Physical iPhone Safari and Android Chrome testing is still needed for sustained multitouch, browser chrome/safe areas, thermal behavior, battery and frame pacing. Desktop timings must not be treated as phone benchmarks. Local progress does not sync across devices; fullscreen support varies by browser. This is an assisted arcade racer, and the magnetic adhesion and automatic stunts are fictional mechanics, not claims about an actual Tesla demonstration.
