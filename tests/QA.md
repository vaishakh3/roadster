# Roadster v8 — dimensional scenery, paint previews and staged loading

Verified on 18 October 2026. This pass changes scenery, materials and garage/loading presentation. Racing controls, route layout version 6, opponent physics, objectives and saved progression remain compatible with v7.

## Verification

- **94 Node checks pass:** 43 gameplay/input/geometry, 26 opponent/contact/dynamics, 8 challenge/replay, 8 recording/sharing and 9 career-objective checks. The recording-error fixture now supplies the loading controller and asserts that an error dismisses loading while releasing capture tracks.
- **21 focused showroom/loading checks pass in source and production.** They cover actual boot-stage progression, first rendered frame, accessible progress, early Enter protection, inert background controls, uncached/cancelled/cached venue changes, paint rotation, rapid changes, dragging, reduced motion and stable rendering resources.
- **98 production-browser checks pass in total:** 21 showroom/loading, 61 base and 16 feature checks.
- **61 production-browser regressions pass:** input independence, touch handling, portrait pause/resume, tour and record flow, course switching, responsive layouts, rendered effects and stunt feedback.
- **16 daily/challenge/replay checks pass.** The harness initially stalled when replacing its iframe; reusing the browsing context resolved this test-lifecycle issue. The generated link also opened correctly in a separate browser tab. All assertions were retained, and the final suite passed.
- **12 production lighting boundaries pass**, with finite world geometry, **296 terrain chunk/LOD seam comparisons**, **92 road-conforming light overlays**, **486 supported container instances** and **99 zero-intensity light relocations**.
- New tree geometry has finite position/normal/UV data; the branch atlas UVs stay inside their intended tiles. Visual review caught and corrected a floating canyon formation before release.
- No WebGL errors were observed in the final scenery, material or lighting checks.

The simulation suite still checks complete all-gate gold races and complementary ramp/contact cases. This release did not repeat the three complete rendered driving runs or the separate 13-ramp envelope suite; those v7 results are retained in Git history, not counted as newly run v8 checks. Downloaded video playback and physical-phone testing were also not repeated.

## Graphics changes and measured cost

Pines and broadleaf trees now use dimensional layered branch crowns and branching trunks. Nearby crowns use 86/60 triangles respectively, with 28/18-triangle distant versions. Forest districts share geometry and materials; alpha testing avoids sorted translucent leaves. A few lower-bench groves bring the foliage closer to the racing view while retaining open ocean vistas. Smaller rock meshes offset the additional tree geometry.

Terrain gains irregular shelves, fractured profiles, embedded canyon buttresses and sea stacks. Freight buildings have actual recessed/open bays, structural trim, loading equipment and authored administration blocks. Materials add botanical branch imagery, bark, sandstone scan normals and stronger cladding relief. No dynamic lights or new gameplay controls were added.

The new runtime assets total **432,426 encoded bytes**, approximately **4.42 MiB of RGBA8 GPU texture memory including mipmaps**: one 768×768 branch atlas, one 256×512 bark map and one 384×384 sandstone normal map. The branch artwork is original generated imagery; its untouched source and prompt are retained in `assets/foliage`. The bark is deterministic original artwork; the normal map derives from the already credited CC0 sandstone scan. Authoring PNGs and Python dependencies are not downloaded by the game.

At **844×390, DPR 1.25**, the production nine-location rendering sample measured:

| Venue      | Draw calls |       Triangles |
| ---------- | ---------: | --------------: |
| Breakwater |    137–215 | 224,785–293,583 |
| Redshift   |    126–179 | 192,397–254,123 |
| Nightshift |    137–196 | 159,517–192,425 |

The overall range is **126–215 draws / 159,517–293,583 triangles**. The previous v7 sample ranged from 127–209 draws / 158,453–334,161 triangles at the same nine locations. These are sampled geometry budgets, not worst-case guarantees or phone FPS measurements.

A separate matched desktop scenery comparison at d1000/d1280/d2240 measured 206/180/190 draws and 311,015/272,599/206,849 triangles, versus v7's 202/183/189 draws and 347,385/323,231/204,279 triangles. The screenshots use the same camera poses. Lower triangle cost does not by itself guarantee lower GPU time: foliage introduces overdraw and textures.

The lighting check compared renders 2 mm apart across twelve handoff boundaries. Worst mean RGB change was **0.1307/255**; at most **0.01% of pixels** changed by more than 32/255. This checks the targeted illumination handoffs, not every possible lighting condition.

## Paint showroom

Changing an unlocked paint starts a **5.2-second, eased full revolution of the car**, with a fixed camera viewpoint. It returns to the chosen orientation and stops. Rapid changes restart from the currently visible angle without snapping. View Car makes a smooth quarter turn; dragging cancels animation immediately. Reduced-motion mode changes paint without automatically spinning and makes manual quarter turns immediate. Entering a race cancels the preview; the racing pose and controls remain independent. Paint unlock requirements are unchanged.

The production tests exercise actual car transforms and verify a full revolution, bounded per-frame movement, stationary position, unchanged race distance, manual takeover, no text selection and no additional geometry/texture allocations after repeated paint changes.

## Loading behavior

The loader uses a Roadster outline, animated wheels/road markings, named preparation stages and an accessible percentage. Progress advances from completed asset and preparation work; it is weighted stage progress, not a timer or downloaded-byte percentage. Loading reaches 100% only after shader preparation and an actual rendered frame. A slow stage offers retry after 12 seconds, and errors expose recovery controls. Reduced-motion preferences disable decorative loader animation.

The background UI is inert during preparation. Keyboard Enter cannot start a race underneath the boot overlay. Foreground venue changes own a request ticket: a cancelled or stale preparation cannot replace the latest selection or hide its loader. Background world preparation pauses during racing and foreground loads. Cold construction still includes synchronous work and can briefly pause animation; the new UI does not eliminate that cost.

A local production benchmark reached initial readiness in **2,607 ms**. First Redshift/Nightshift selections took **909.5 / 560.3 ms**. Six cached switches took **6.1–62.5 ms**, with the final round **6.1 / 6.5 / 8.2 ms**. Cached-switch resources stayed at 163 geometries and 20 textures. These observations depend on hardware, browser scheduling and shader caches; they are not guaranteed load times.

## Evidence and limits

The final standalone build is **3,417,976 bytes** (**1,962,383 bytes gzip**), with SHA-256 `9399f98306e0acb8ec903f119d58fcc675cc5654339dfe0cc5160c52555439b4`. The last rebuild refreshes the venue thumbnail images; its embedded game script is byte-identical to the production build used for the browser checks.

Evidence in the task output directory includes `showroom-tests.txt`, `showroom-source-checks.txt`, `showroom-production-checks.txt`, `showroom-browser.txt`, `showroom-features.txt`, `showroom-render-profile.txt`, `showroom-venue-profile.txt`, `v8-world-geometry.json`, `v8-world-budget.json`, `v8-lighting-production.json`, matched `v8-*-before/after.png` captures and loader/paint screenshots.

The loader was visually reviewed at 1280×720, 844×390, 568×320 and 390×844. Existing landscape racing and portrait-pause checks remain in the base suite. The visual loader fixture manually selects stages; the actual-game tests separately verify real completion-driven progress. QA uses isolated records.

**Physical iPhone Safari and Android Chrome remain unverified.** Desktop-GPU rendering at phone viewport sizes does not establish sustained mobile frame pacing, multitouch comfort, thermal behavior, browser chrome/safe areas or memory limits. The profile's 8.27–8.45 ms browser-frame intervals are scheduling observations with frozen simulation, not a physical-device gameplay FPS claim. AUTO resolution, distance-based geometry, batching, bounded shadows and hidden-tab suspension remain enabled. This remains an assisted arcade interpretation rather than a photorealistic manufacturer simulation.
