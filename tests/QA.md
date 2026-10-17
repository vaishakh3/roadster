# Terrain, flight and extended routes — 17 October 2026

## Release checks

- **43 simulation/input/geometry checks passed.**
- **60 production-browser checks passed, zero failures.**
- **13 rendered ramp checks passed.** Full steering and boost were applied during ascent. Minimum measured wheel/bumper clearance was 1.8–2.0 cm, with correction outlets and landing lift active on every ramp.
- All three extended courses completed through the production keyboard handlers with every gate and full vehicle condition; fastest-run ghosts appeared on replay.
- Build and whitespace checks passed. Standalone and hosted HTML are identical: **2,589,016 bytes**, **1,377,727 bytes gzip**. All graphics, fonts and sound remain local to the bundle; there are no runtime asset/API requests.

## Longer courses and route map

| Course     | Length |  Added | Rendered run | Gates | Hull | Peak draw calls |
| ---------- | -----: | -----: | -----------: | ----: | ---: | --------------: |
| Breakwater | 5.4 km | 1.8 km |      72.29 s | 26/26 |  3/3 |             202 |
| Redshift   | 5.7 km | 1.8 km |      78.38 s | 26/26 |  3/3 |             202 |
| Nightshift | 6.0 km | 1.8 km |      81.17 s | 28/28 |  3/3 |             198 |

A separate continuous Nightshift run finished in 81.18 simulation seconds with all 28 gates and full condition; the desktop browser animation-frame counter averaged 120 frames/second at 844×390. This is not a phone measurement.

These are automated boosted runs, not average human completion times. Each final leg adds gates, hazards, reserve pads and a ramp. The live route trace shows the driven path, player position, percentage, finish and stunt markers. Route records now use layout version 3; old times/ghosts are excluded while earned paints, medals and badges survive.

## Ramp and thruster corrections

The original centre-point support and steering bank could place rendered wheels under a ramp even when simulation height was correct. Support now samples the wheelbase, catches downward deck crossings, rejects entry through tall sides and aligns the car with the actual deck normal. Flip rotation waits until the vehicle clears the lip. Tests cover all ramps at multiple frame rates, fly held on entry, steering, braking, side entry, finite states and gentle landing.

Underbody outlets previously depended only on the manual Fly button. Separate actuator state now drives downward lift jets, opposing perimeter correction jets, rear acceleration jets and suction fans. Automatic landing activates underside lift; rotation deceleration uses the opposing outlets. No collective belly thrust fires through an inverted coast or unpowered freefall. Cold-gas plumes follow the vehicle's orientation. The model includes corner nozzles, underfloor plenums/impellers and the existing rear cassette.

Primary references: [Tesla Roadster](https://www.tesla.com/roadster) and [Tesla — The Ramp](https://www.youtube.com/watch?v=7p5LxFdc-Qg). These verify suction and perimeter cold-gas propulsion. Exact nozzle coordinates and control laws are an original game interpretation. This remains an assisted arcade racer, not manufacturer CAD or a full rigid-body simulation. Reference images are not distributed in the game.

## Visual and performance work

- Smooth indexed boulders, stratified mesas, eroded terrain tiles, correctly planted rounded cacti and scanned gravel replace faceted rocks and stepped pillars.
- Terrain winding and normals agree on both banks. Instance transforms are included in rock texture coordinates, fixing the stretched sandstone on scaled boulders.
- Road-local tire wear, granular asphalt normals, variable wet-road roughness and revised ambient/direct illumination improve surface separation. Updated venue thumbnails are captures of the actual game.
- Near/far geometry levels and district culling limit terrain cost. Long instance rows submit only a nearby precomputed matrix span; geometry is not rebuilt while driving.
- Tire-groove shading removes **48,640 triangles** from the car, retaining a smooth silhouette and tread detail. The racing car has **96,273 triangles** excluding its hidden showroom interior.
- AUTO graphics uses bounded resolution adaptation with two-second observation windows and slower recovery. The phone ceiling is 1.25 device pixels/CSS pixel and the floor is 0.8; explicit HIGH/LOW remain available. Shadows stay at 1024 on low/mobile quality.

Sampled 844×390 scenes after geometry/instance optimization submitted approximately **170k–337k triangles** and **124–189 draw calls**, versus 349k–493k triangles earlier in this refinement. These samples precede a small cactus geometry improvement and are not a device-wide maximum. Browser frame intervals were approximately 8.3–8.6 ms on this desktop GPU, not a mobile benchmark. Real frame pacing, GPU time and thermal behavior on phones are not inferred from those numbers.

Venue selection through the first rendered frame: **4.7–8.3 ms**, median **6.8 ms**, across nine local switches. Cached initialization measured **1,080 ms**. All nine switches retained 155 geometries and 15 textures; additional district resources upload on first use during racing. Worlds and assets are reused across selection.

## Layout and device limits

Validated 1280×720 desktop; 844×390, 667×375 and 568×320 landscape; and 390×844 and 320×568 portrait. HUD/map/controls remain in bounds without critical overlap. Portrait pauses and requires deliberate resume. Simultaneous Shift/arrows/Space and independent synthetic touch pointers pass; selection, context menus and touch scrolling remain suppressed. QA records are isolated from personal progress.

Physical iPhone Safari and Android Chrome still need sustained multitouch, safe-area/browser-chrome, thermal and battery testing. Desktop emulation cannot establish phone frame rates. Automated complete runs establish feasibility, not human enjoyment. Local records do not sync across devices.
