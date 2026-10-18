# Roadster v6 — objectives, contact and visual refinement

Verified on 18 October 2026. The game remains an independent, assisted arcade interpretation; this report distinguishes packaged-browser tests, source lighting checks and unverified hardware limits.

## Verified checks

- **88 Node checks pass:** 43 simulation/input/geometry, 20 driving/opponent/contact, 8 challenge/replay, 8 sharing/recording and 9 career-objective checks.
- **89 production-browser checks pass, zero failures:** 61 original regressions, 16 daily/challenge/replay checks and 12 career/ghost checks.
- **All 13 rendered ramps pass**, with minimum wheel/bumper clearance of **1.8–2.0 cm**. Attitude correction outlets and landing lift activate on every ramp.
- **All three complete production routes pass** through the actual keyboard handlers, collecting every gate with full condition. Saved fastest-run ghosts appear afterward.
- **12 lighting boundaries pass in both source and packaged rendering**, alongside finite geometry, 92 road-conforming overlays, 486 supported containers and 99 zero-intensity light relocations.
- Final standalone/hosted bundle: **2,655,721 bytes**, **1,400,866 bytes gzip**, with fonts and assets included. No runtime asset requests.

Evidence: `refinement-tests.txt`, `refinement-browser.txt`, `refinement-features.txt`, `refinement-objectives.txt`, `refinement-routes.txt`, `refinement-ramps.txt`, `refinement-lighting.json`, `refinement-lighting-production.json`, `refinement-render-profile.txt` and `refinement-venue-profile.txt` in the task's output directory.

## Complete race feasibility

| Venue      | Length | Rendered time | Gates | Condition | Peak draw calls |
| ---------- | -----: | ------------: | ----: | --------: | --------------: |
| Breakwater | 5.4 km |       71.53 s | 26/26 |       3/3 |             220 |
| Redshift   | 5.7 km |       77.66 s | 26/26 |       3/3 |             210 |
| Nightshift | 6.0 km |       81.65 s | 28/28 |       3/3 |             212 |

These are automated boosted runs rather than average human completion times or phone performance measurements. The predictive test driver is excluded from the shipped game. Peak draw counts describe those route checks, not every possible camera or quality setting.

The live map distinguishes the player and three color-matched rivals, shows progress and finish, and marks stunt locations. Nine alternate lines occupy side lanes of the existing road; they are not separate elevated tracks. Layout version **5** excludes incompatible old times and ghosts while retaining earned paints, medals and badges.

## Objectives and ghost clarity

Every venue offers three sequential career cups: **podium finish**, **first place**, then **first place without damage**. The garage explains the next objective, the live HUD shows the required pass or condition, and results state whether the cup was earned and what comes next. A run awards at most one cup. The nine-cup career is stored per venue; daily and friend challenges do not advance it. Optional time/gate ratings are separate from the career objective.

The twelve objective-browser checks verify the initial briefing, layout separation at 844×390 and 568×320, live objective feedback, fourth-place failure, podium and victory progression, persistence, damaged-versus-clean victories, daily isolation and actual ghost rendering. The career reducer also rejects duplicate rewards and sanitizes invalid local progress.

Recorded ghosts now use a **three-draw cyan hologram**: a translucent scanned shell, contour lines and a floating **GHOST / PASS THROUGH** label. They cast no shadow and fade near the player. Solid AI opponents remain opaque. A personal or shared ghost is a recorded time reference and intentionally has no physical collision.

## Solid opponent contact

Three rivals use the same integrator, energy system, hazards and ramps as the player, with predictive avoidance, passing decisions and deterministic hesitations. Their pace does not depend on player rank. Their shared lightweight rendering remains **eight instanced draw batches**.

A swept contact solver now prevents cars from passing through one another. Bumper contact matches closing speed; side contact separates bodies. AI yields afterward, and a rival rear-ending the player cannot accelerate the player into hazards. Contact uses bounded inelastic response, preserves steering and boost, and does not remove condition bars. A short padded sound and contact message distinguish it from a damaging track collision.

Regressions cover rear and side impacts, high-speed swept crossings, three-car crowding at a road edge, vertical clearance, and repeatable contact at 12/30/60/120 Hz. Ramp and assisted-flight contacts preserve vertical/stunt trajectories and deck limits. All opponents finish each venue safely across three seeds, and the original full-condition/all-gate gold runs still pass.

## Car and lighting refinement

The current racing car has **72,913 triangles across 56 meshes**, excluding its hidden showroom interior. Body, glazing, lights, wheel detail and integrated thruster housings remain locally generated; lighter opponent geometry avoids duplicating the garage model.

Pooled point lights fade to zero before moving to their next road position. Emissive glow placement and the follow-shadow reference use the actual road elevation. This addresses illumination jumps and detached lighting on changing terrain without adding lights or changing controls.

The source and packaged continuity checks compared images **2 mm apart** across twelve handoff boundaries. Worst mean pixel change was **0.0644 on a 0–255 scale**; at most **0.01% of pixels** changed by more than **32/255**. These are targeted static continuity measurements, not a frame-rate benchmark or proof that every lighting condition is artifact-free. Visual review also caught and fixed overlap between the ghost timing label and obstacle warning, and between the garage keyboard guide and career briefing.

## Ramps, daily events and replay

Ramp contact samples a wheelbase-sized support plane, catches downward crossings, rejects entry through tall sides and aligns orientation to the rendered deck. Flips begin after the vehicle clears the lip. Complementary simulation checks cover 12/24/30/60/120 Hz, held flight, steering, braking and side entry; rendered checks measure the actual wheel/bumper envelope.

Separate actuator state drives underside lift, opposing perimeter attitude jets, rear acceleration jets and suction fans. Automatic landing fires the underside outlets, while opposing pulses arrest rotation. Collective belly thrust stays off while inverted or in unpowered freefall. Primary references remain [Tesla Roadster](https://www.tesla.com/roadster) and [Tesla — The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg); exact geometry and control laws are original game interpretations. No marketing images are distributed.

The sixteen feature-browser checks cover selected-venue-first loading, cancellation and guarded starts; UTC daily venue/seed selection; separate daily records; imported ghost links; explicit replay without modifying results; manual-flight and sky-gate-roll continuity; and landscape replay/share actions. A daily friend challenge preserves its event seed and reports both outcomes.

Ghost links contain bounded, validated local trajectory data. No account or upload service is required; they are not authenticated competitive records or an anti-cheat system. Replay is explicit and shows up to the final ten seconds. Silent clip capture is also explicit; Node checks cover cancellation, recorder failure, size limits and graphics-error cleanup. This v6 verification does not claim a newly repeated downloaded-video playback result. Browser capture/codec support varies; no microphone, camera or automatic posting is used.

## Performance policy and remaining limits

Startup prepares the selected venue first. Other venues prepare incrementally in the garage or results screen, never during racing. An uncached selection can still visibly wait; cached selections reuse geometry and textures. Near/far geometry, district culling and nearby spans of instanced scenery limit work. AUTO pixel density remains bounded from 0.8 to the device-limited mobile ceiling of 1.25, with gradual recovery; desktop AUTO caps at 1.75. Mobile/low shadows use 1024 pixels. Rendering stops while hidden.

The final local Chrome profile at **844×390 / DPR 1.25** sampled three locations per venue: **123–204 draw calls** and **155,003–322,345 triangles**. Browser frame intervals were 8.33–8.34 ms on this desktop GPU; this is browser cadence, not a measured physical-phone GPU time. A separate venue benchmark became ready in **657 ms**; the first Redshift/Nightshift switches took **408.3/253.2 ms**, and the six cached switches took **1.5–7.7 ms**. Cached switching held at 155 geometries and 17 textures in that benchmark. These timings are local observations, not guaranteed network or phone load times.

Verified layouts include 1280×720 desktop, 844×390, 667×375 and 568×320 landscape, and 390×844 and 320×568 portrait. Portrait pauses with deliberate resume. Simultaneous Shift/arrows/Space, independent synthetic touch pointers, and suppression of selection/context menus/scrolling pass. QA records are isolated from personal progress.

**Physical iPhone Safari and Android Chrome remain unverified.** Sustained multitouch, browser chrome/safe areas, thermal behavior, battery use, memory limits and real mobile frame pacing still need hardware testing. Automated completion establishes feasibility rather than human enjoyment. Records are browser-local; no live multiplayer or server leaderboard is included.
