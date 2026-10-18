# Roadster v7 — scenery, visible rivals and crash damage

Verified on 18 October 2026. This is an assisted arcade racer with richer materials and scenery, not a manufacturer vehicle simulation. Browser tests below used the production bundle unless marked otherwise.

## Results

- **94 Node checks pass:** 43 simulation/input/geometry, 26 driving/opponent/contact, 8 challenge/replay, 8 sharing/recording and 9 career-objective checks.
- **100 production-browser checks pass, zero failures:** 61 base regressions, 16 daily/challenge/replay checks, 12 career/ghost checks and 11 rival/HP/ghost-setting checks.
- **Three complete keyboard-driven races pass**, collecting every gate with 3/3 HP. Saved fastest ghosts render after explicitly enabling the personal ghost setting.
- **All 13 rendered ramps pass**, with minimum wheel/bumper clearance of 1.8–2.0 cm and working attitude-correction and landing jets.
- **12 rendered lighting boundaries pass**, plus finite geometry, 296 terrain chunk/LOD seam comparisons, 92 conforming road-light overlays, 486 supported containers and 99 zero-intensity light relocations.
- **Zero page or WebGL errors** during the complete-route and ramp checks.
- Final standalone and hosted HTML: **2,818,063 bytes**, **1,517,723 bytes gzip**, including fonts and runtime assets. SHA-256: `b3e258393b6b9c1c3a225629a14f1852f5f308e6e0d5866183290e5bf0d25db7`.

Evidence in the task output directory: `traffic-browser.txt`, `traffic-features.txt`, `traffic-objectives.txt`, `traffic-contact-browser.txt`, `traffic-routes.txt`, `traffic-ramps.txt`, `traffic-lighting-production.json`, `traffic-render-profile.txt`, `traffic-venue-profile.txt` and the `scenery-*` captures/reports. Final venue thumbnails were refreshed from the actual game; the final rebuild changed thumbnails and formatting only after these checks.

## Complete race checks

| Venue      | Length | Rendered time | Gates |  HP | Peak draw calls |
| ---------- | -----: | ------------: | ----: | --: | --------------: |
| Breakwater | 5.4 km |       71.94 s | 26/26 | 3/3 |             232 |
| Redshift   | 5.7 km |       78.03 s | 26/26 | 3/3 |             213 |
| Nightshift | 6.0 km |       83.43 s | 28/28 | 3/3 |             227 |

These are automated boosted runs through the actual keyboard handlers, not average human completion times or physical-phone performance measurements. The predictive QA driver is excluded from the shipped game. It now plans the entire lane-change path, gives alongside traffic room and brakes when a gate approach is delayed. Automated completion establishes feasibility, not enjoyment.

Layout version **6** excludes incompatible older route records and ghost trajectories while retaining earned paints, medals and badges. Each venue still has three career cups: podium, victory, then victory without damage. The current objective appears in the garage, race HUD and result screen; daily and friend challenges do not advance career cups.

## Rivals, HP and optional ghosts

Three distinct AI pace profiles start on a closer staggered grid. Rivals share the player's integrator, slipstream, energy, ramps and hazards. Their speed does not depend on player rank, and they do not teleport to catch up. Predictive avoidance and passing remain active. Representative scripted drivers found at least one rival within the forward 100 m/rear 18 m window for 98.4–99.9% of boosted runs and 42.1–85.6% of cruising runs across the venues. This is an engagement sample, not a visibility guarantee for every driver.

Solid rivals now have sculpted bodywork, glazing, mirrors, wheel arches, spoilers, detailed wheels and shaped lamps. They follow road grade and share **eight instanced material batches**, plus three small name/HP sprites. The labels fade with distance and do not cast shadows. Failed rivals show a brief crash response before leaving the field.

Swept contact prevents cars passing through one another. Rear impacts match closing speed and side impacts separate bodies. A hard player-caused rear or side collision removes **one HP from each car**, produces impact feedback and starts a 1.25-second cooldown. Gentle rubbing and an AI car rear-ending or pushing a neutral player do not drain player HP. Grounded contact preserves steering/boost; ramp and assisted-flight contact preserves vertical/stunt trajectories. A genuinely elevated pass is noncolliding. The HUD states **3 / 3 HP**, updates on impact and highlights low health.

Node regressions cover damaging rear/side contacts, harmless rubs, protected AI contacts, cooldown, high-speed swept crossings, crowding at road edges, vertical clearance, fatal rival crash animation and repeatability at 12/30/60/120 Hz. All opponents finish safely across three venues and three seeds. The eleven dedicated browser checks verify opening-grid visibility, names, default ghost state, explicit opt-in/disable, both cars losing HP, cooldown, flyovers and low-health feedback.

Personal ghosts start **OFF** for new/default settings. Explicit existing preferences persist. Settings can enable the cyan scanned hologram with its **GHOST / PASS THROUGH** label. A friend challenge intentionally keeps its challenger visible. Recorded ghosts remain nonphysical time references.

## Scenery, materials and lighting

The coast now has stronger headlands, a broader sea and denser forest stands. Canyon buttresses, terraces, erosion channels and supported talus replace simpler silhouettes. Freight buildings include pitched roofs, loading docks, structural bays, rooflights and vents, with a more developed skyline. Directional/ambient balance gives more shape to the terrain and buildings without adding dynamic lights.

Road shading adds finer aggregate, normal detail, repairs, rubber and wet roughness variation. Rock/soil materials use mineral variation, warped bedding and slope-aware blending. Warehouse surfaces gain corrugation, seams and rain streaks; architectural glazing is opaque and bounded. A single original **115,000-byte, 256-pixel packed WebP** supplies this extra material detail, approximately 349,524 GPU bytes with mipmaps. It adds no geometry or draw calls. Its deterministic generator and license are included.

Pooled lights still reach zero intensity before relocating. Road glow geometry follows the actual road surface. Twelve production lighting boundaries were compared 2 mm apart: worst mean RGB difference was **0.1269/255**, with at most **0.01%** of pixels changing by more than 32/255. These are targeted continuity checks, not proof that every lighting condition is artifact-free. Terrain checks also verified finite geometry and neighboring chunk/LOD seams; visual review caught and corrected floating talus.

The existing player model remains a procedural Roadster interpretation with integrated underside lift and attitude outlets. Ramps share their surface function with collision physics, sample wheelbase-sized support, reject entry through tall sides and launch flips only after clearing the lip. The controls are unchanged.

## Rendering budget and load behavior

At **844×390 and DPR 1.25**, final production samples at three locations per venue ranged from **127–209 draw calls** and **158,453–334,161 triangles**. Desktop-GPU browser frame intervals were 8.28–8.33 ms. These intervals are browser cadence, not a physical-phone GPU benchmark. Full-course peak draw counts are listed separately above.

A separate local benchmark reached the selected venue in **786 ms**. First Redshift/Nightshift selection took **1,747.3/477.3 ms**; six cached switches took **4.9–12.6 ms**, with stable cached-switch resources of 161 geometries and 18 textures. Cold shader compilation and device speed can still cause a visible wait. Selected-venue-first loading, guarded starts and a loading state remain necessary. Background venue preparation runs in the garage/results screen, not during racing.

District batching, near/far terrain, bounded instance spans and shared materials limit rendering work. Mobile AUTO uses 1024-pixel shadows and adapts DPR between 0.8 and the device-limited ceiling of 1.25; desktop AUTO caps at 1.75. HIGH/LOW remain available, and rendering stops while hidden. No runtime asset requests are required.

## Other regressions and limits

Verified layouts include 1280×720 desktop; 844×390, 667×375 and 568×320 landscape; and 390×844 and 320×568 portrait. Portrait pauses and requires deliberate resume. Simultaneous Shift/arrows/Space, independent synthetic touch pointers and suppression of text selection/context menus/scrolling pass. QA records are isolated from personal progress.

Daily event/seed handling, challenge import, career progression, explicit replay without changing records, manual-flight/sky-roll continuity, course switching, tour progression and paints pass. Recorder unit checks cover cancellation, failure, size limits and cleanup; **this release did not repeat downloaded-video playback**. MediaRecorder and canvas capture support vary by browser. Records remain browser-local; there is no live multiplayer, authenticated competition or server leaderboard.

**Physical iPhone Safari and Android Chrome remain unverified.** Sustained multitouch, browser chrome/safe areas, thermal behavior, memory limits, battery use and real mobile frame pacing need hardware testing. The visual treatment remains an original arcade interpretation; it is not photorealistic or manufacturer CAD.
