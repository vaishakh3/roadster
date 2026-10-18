# Roadster v5 race edition — 18 October 2026

## Release verification

- **71 Node checks pass:** 43 simulation/input/geometry, 12 driving/opponent, 8 challenge/replay and 8 sharing/recording checks. The recorder suite includes cancellation, size limits, startup failures, graphics-context failure and track cleanup.
- **61 production-browser regression checks pass, zero failures.** These cover independent controls, racing, tour progression, records, rendered stunts, resource reuse and responsive layouts.
- **16 production feature-browser checks pass, zero failures**, including the final replay fixes. The same sixteen also passed against source. Together with the original regression suite, this is **77 passing browser checks**.
- **All 13 rendered ramp checks pass.** Steering and boost were applied during ascent. Minimum measured wheel/bumper clearance was **1.8–2.0 cm**, with attitude correction outlets and landing lift active on every ramp.
- All three courses completed through production keyboard handlers with every gate and full condition. Saved fastest-run ghosts appeared afterward.
- Final build and whitespace checks pass. Hosted and standalone HTML are identical: **2,638,059 bytes**, **1,395,147 bytes gzip**. Final startup, uncached venue selection, cached switches and representative rendering samples are measured below.

The saved evidence is in `race-edition-browser.txt`, `race-edition-features.txt`, `race-edition-routes.txt`, `race-edition-ramps.txt`, `race-edition-tests.txt`, `race-edition-venue-switches.txt`, `race-edition-render-profile.txt` and `roadster-feature-regressions-source.txt` in the task's output directory. These reports identify source versus packaged-browser execution explicitly.

## Complete race feasibility

| Venue      | Length | Rendered run | Gates | Condition | Peak draw calls |
| ---------- | -----: | -----------: | ----: | --------: | --------------: |
| Breakwater | 5.4 km |      71.43 s | 26/26 |       3/3 |             219 |
| Redshift   | 5.7 km |      77.53 s | 26/26 |       3/3 |             202 |
| Nightshift | 6.0 km |      81.55 s | 28/28 |       3/3 |             207 |

These are automated boosted runs, not average human completion times or phone performance measurements. All route assertions passed. They exercise the same keyboard handlers used by a player. A predictive test driver chooses safe corridors through moving traffic and tightly spaced hazards; it is excluded from the shipped game.

The live map includes the player, three color-matched opponents, route progress, finish and stunt markers. Layout version **4** excludes incompatible old times and ghosts while preserving earned paints, medals and badges. Nine marked alternate lines, three per venue, occupy side lanes of the existing road. They provide speed and a one-time committed-line reward; they are not separate elevated tracks.

## Driving and opponent behavior

High-speed steering changes wheel angle and lateral response without disabling boost or flight. Bounded cornering slip, body roll and tire sound provide grip feedback. Releasing steering settles lateral movement. The original simultaneous-input and ramp-safety expectations still pass.

Three deterministic opponents use the same integrator, energy system, obstacle contacts and ramp trajectories as the player. Their decisions anticipate moving obstacles, maintain separation, yield and overtake, and include short hesitations. Pace does not change with player position; cars do not teleport to catch up. They are **non-contact opponents**: the player does not receive damage from touching a rival. Slipstream requires an aligned opponent ahead on the road and provides bounded reserve and speed assistance.

The dynamics suite checks all three venues under three event seeds. Every opponent finishes with full condition and clears the venue's ramps; close passes preserve the tested vehicle separation. It also checks deterministic motion at 30/60/120 Hz, stable finish rankings, branch rewards, drift recovery, tunnel ceiling transients and opponent rendering limits.

## Daily events, links and replay

The feature-browser suite verifies:

- Selected-venue-first startup, guarded starts during uncached venue loading, and cancellation that restores the chosen venue without leaving the loader visible.
- Daily venue/seed selection, race position, opponent map colors, and daily results that preserve ordinary course records.
- Daily ghost links retaining their event and deterministic seed, plus separate friend-challenge and event outcomes.
- Explicit replay capturing finish position, advancing visible playback without altering records, preserving manual-flight pitch and sky-gate rolls, and completing rolls without a backward spin.
- Bounded shareable ghost links, imported venue/target display, Enter starting the correct challenge, and replay/share actions fitting a landscape results screen.

Daily events derive their venue, objective and rival timing from the UTC day. They use the authored tracks. Link payloads contain a recorded ghost and optional event metadata; they do not require an account or upload service. Payload checks reject malformed coordinates, times, lengths and incompatible layouts. They are not authenticated competitive records or an anti-cheat system.

Replay opens only when requested and shows the final ten seconds, or the available shorter duration. Silent clip capture is also explicit. Unit checks cover recorder cleanup and failure paths. An actual browser capture downloaded a **1,911,519-byte** clip; Chrome playback verified **960 × 540**, **9.96 seconds**, **300 decoded frames**, **zero dropped frames**, and 42/42 sampled frames nonblack, with no playback errors. Canvas capture and MediaRecorder support vary across browsers. No microphone or camera is used; no result, link or video is posted automatically.

## Car, scenery and rendering budget

The rebuilt racing car has **79,097 triangles across 56 meshes**, excluding its hidden showroom interior. Continuous body surfaces, fitted glazing, integrated wheel arches, revised lights and wheels, and incorporated thruster housings replace the earlier assembled appearance. The three opponents use lighter shared geometry in **eight instanced draw batches**, without additional lights or downloaded textures.

Each venue now has a stronger landmark sequence: storm-gallery and maritime structures at Breakwater, layered canyon and mine scenery at Redshift, and dense freight infrastructure at Nightshift. Marked lane choices, route signage and distinct final-district hazards provide variety. Scanned asphalt, wet-road roughness, HDR reflections, textured rock surfaces, eroded terrain tiles and vegetation remain locally bundled. World-space exhaust ribbons preserve the actual driven path; pooled debris, smoke and suspension response remain active for crashes and landings.

Startup constructs and renders only the selected venue. Remaining venues are prepared incrementally in the garage or results screen, not during a race. A player selecting an unprepared venue sees a loading state; subsequent selections reuse prepared geometry and textures. Starts are guarded during transitions, stale asynchronous requests cannot start a different race, and background preparation restores the selected venue after failure.

Near/far geometry, district culling and nearby spans of instanced scenery limit rendering work. AUTO resolution uses two-second windows and gradual recovery. The phone ceiling is 1.25 device pixels per CSS pixel with a floor of 0.8; desktop AUTO has a ceiling of 1.75. Mobile/low shadows use 1024 pixels; explicit HIGH and LOW remain available. Rendering stops while the page is hidden.

The final venue benchmark measured the selected menu ready in **697 ms**. Selecting unprepared Redshift took **1,874.4 ms** and unprepared Nightshift took **284.3 ms**. The six subsequent cached switches took **4.6–7.8 ms**; all retained **153 geometries and 17 textures** across those prepared menu views. These measurements include construction, shader preparation and the first rendered frame. Uncached selection still causes a visible wait, and shader caches, GPU drivers and browser scheduling affect these timings.

At an **844×390** viewport with **DPR 1.25**, nine representative race checkpoints submitted **159,065–327,041 triangles** and **122–203 draw calls**. Browser animation-frame intervals were **8.33–8.50 ms on the desktop GPU**. These are not physical-phone measurements or GPU timing queries. Additional district resources became resident as previously unseen track sections rendered; the final sampled renderer counters were **781 geometries and 58 textures**, so the 153/17 menu figures are not a whole-race memory limit.

No phone frame-rate, thermal or memory guarantee is inferred from these samples. Route peak draw counts and checkpoint profiles describe specific cameras and quality settings rather than a maximum for every scene. The final packaged HTML is **1,395,147 bytes gzip**.

## Ramp and thruster safety

Ramp support samples a wheelbase-sized plane, catches downward deck crossings, rejects entry through tall sides and aligns the car with the rendered deck normal. Flips begin after the whole car clears the lip. Simulation checks cover the thirteen ramps at complementary 12/24/30/60/120 Hz rates, held flight, steering, braking, side entry, finite states and gentle landing. The rendered ramp suite confirms actual wheel/bumper clearance rather than relying only on centre height.

Separate actuator state drives underside lift jets, opposing perimeter attitude jets, rear acceleration jets and suction fans. Automatic landing activates the underside outlets, while opposing pulses brake rotation. Collective belly thrust stays off while inverted or in unpowered freefall. Plumes follow each nozzle's body orientation.

Primary references remain [Tesla Roadster](https://www.tesla.com/roadster) and [Tesla — The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg). Exact nozzle placement and control laws are original game interpretations. This is an independent fan game with assisted arcade physics, not manufacturer CAD or a full rigid-body simulation. Reference images are not distributed in the game.

## Layout and remaining limits

Validated viewports: 1280×720 desktop; 844×390, 667×375 and 568×320 landscape; 390×844 and 320×568 portrait. The HUD, map and controls stay in bounds without critical overlap. Portrait pauses and requires deliberate resume. Shift/arrows/Space work simultaneously, independent synthetic touch pointers pass, and selection, context menus and touch scrolling remain suppressed. QA uses isolated records rather than overwriting personal progress.

Physical iPhone Safari and Android Chrome still require sustained multitouch, safe-area/browser-chrome, thermal, memory and battery testing. Desktop emulation does not establish phone frame rates. Automated complete races establish feasibility rather than human enjoyment. Records remain browser-local, and neither live multiplayer nor a server leaderboard is included.
