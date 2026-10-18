# Coastal realism study — 18 October 2026

## Scope and reproduction

Branch `codex/coastal-realism`, based on main `ec008fb`, with the later main
analytics commit `7a638e2` merged. The 760–1260 m Atlantic section is the visual
study; coastal atmosphere changes apply throughout that venue. The remaining
three venues retain their original scenery and lighting.

Run `npm ci`, `npm test`, `npm run build`, then `npm start`.

- `/coastal-study.html`: source study, four views and a short playable section.
- `/dist/coastal-study.html`: actual bundled production study.
- `/tests/coastal.html`: matched source/production views, profiles, geometry,
  pool, venue, live-driving and optional GPU timer checks.
- `/tests/coastal-study.html?production=1`: public study UX checks.
- `/tests/browser.html`: existing full game regression harness.

For an optional comparison baseline, run:

```sh
git show ec008fb:Roadster-Flight-Lab.html > tests/coastal-baseline.html
```

The generated baseline is ignored by Git. All test fixtures use isolated
in-memory progress. No personal records are overwritten.

## Verification

The complete Node suite passed: 125 game/offline/geometry checks and 17 analytics
integration cases. Twelve new coastal cases cover both LODs, finite attributes,
valid indices/UVs, road and shoulder clearance, resource reuse, instance-buffer
disposal, repeated disposal, cached loading, missing maps, bounded load timeout,
late completion cleanup, partial decode failure and successful retry.

The actual production WebGL bundle passed all ten geometry invariants and all
16 matched poses (780/900/1080/1230 m, ground/12 m flight, phone/desktop layouts).
No application, WebGL or shader compilation errors were observed. Entry/exit
rail joins, scan grounding and the shoulder apron were inspected visually.

Three repeated 600–1400 m quality/distance sweeps retained **337 geometries /
32 textures**. After preparing all four venues, three complete selection sweeps
stayed at **438 geometries / 41 textures**. All venues rendered and selected
correctly; the coastal geometry was confined to Atlantic. Cached selection took
3.4–8.9 ms in this session; first preparation still took 333–785 ms and retains
the loading screen. These are desktop measurements with local assets.

A live drive from approximately 760 to 1320 m completed with 3/3 HP and no errors.

The final production public-study flow passed **17/17 checks**: all four views,
three detail settings, live drive/end/finish behavior, portrait guidance,
landscape recovery, isolated progress and no runtime errors. The existing
browser regression passed 61 of 62 assertions before the final short-phone
touch-target fix. Its remaining pause-layout issue was then verified with a
targeted check on the final bundle: all ten pause controls fit a 568×320 viewport
and are at least 44 px tall. No console warnings or errors were reported.

The graphics profiles below were collected after geometry and materials were
frozen. Subsequent changes were the short-phone CSS fixes and QA-excluded
analytics. The final targeted checks used the 6,825,597-byte `dist/index.html`
with SHA-256 `50ed77be294516bf1db3cd32324fe217422ef02503450534e44512a3d3eadd71`.

Local evidence is saved beside the repository in `../outputs/`: matched profile,
GPU, geometry, pool, venue and live-drive JSON reports use the
`coastal-production-` prefix; the final study report is
`coastal-study-production.json`. Final visual captures include
`coastal-production-desktop-1080.png`, `coastal-production-phone-1080.png`,
`coastal-study-production-desktop.png` and
`coastal-production-small-phone-pause.png`.

## Matched rendering cost

These are rendered-scene totals including existing car, rivals and scenery;
geometry outside the camera frustum is excluded. Both builds were measured on
the same desktop browser at explicit settings. Counts do not imply phone FPS.

| Scene/layout                                           |   Main baseline | Coastal prototype |
| ------------------------------------------------------ | --------------: | ----------------: |
| Phone-sized 844×390, DPR 1.25, LOW: draw calls         |         207–218 |           220–259 |
| Same eight poses: triangles                            | 278,193–298,489 |   263,089–328,485 |
| Desktop 1280×720, DPR 1.75, HIGH: draw calls           |         207–218 |           219–261 |
| Same eight poses: triangles                            | 311,927–351,073 |   302,861–383,533 |
| Standalone HTML bytes                                  |       3,464,542 |         6,825,597 |
| Gzip bytes (local gzip, not measured network transfer) |       1,984,517 |         4,176,353 |

GPU timer queries were supported, valid and not disjoint. At 844×390, 24 samples
per pose, frozen simulation:

| Pose   | Setting/DPR | Mean GPU time | p95 GPU time |
| ------ | ----------- | ------------: | -----------: |
| 900 m  | LOW/1.25    |       1.95 ms |      3.14 ms |
| 1080 m | LOW/1.25    |       1.54 ms |      1.62 ms |
| 900 m  | HIGH/1.75   |       2.73 ms |      4.27 ms |
| 1080 m | HIGH/1.75   |       2.31 ms |      2.40 ms |

CPU rendering submission averaged 0.65–0.77 ms. These are single-frame GPU
microbenchmarks on the current **desktop GPU**, not full simulation frame time
or physical-phone results. The old baseline has no timer-query hook; no baseline
GPU-time claim is made. Browser animation intervals varied between review
sessions (roughly 33 ms versus 8 ms), so they were not used to claim a speedup.

## Asset costs and remaining limits

Two real coastal scan formations share three maps and one material. Each uses
9,999 triangles near or 1,500 far and costs one draw. Their encoded geometry and
maps total 847,435 raw bytes (~1.13 MB after base64 embedding). Matching texture
mip allocation is about 8 MiB. The scanned material, sky and water add no lights
or extra reflection render pass. Detailed rails are material-batched and culled
by 100 m district; trees and ground cover have distance limits.

The result is still a prototype: distant terrain and some silhouettes remain
procedural, there are visible transitions between scanned and authored scenery,
and it does not reproduce the generated poster's finish. Asset payload grew
meaningfully. Before extending this treatment around every track, test sustained
driving, thermal behavior, first-load time and memory on real iPhone/Android
hardware. No physical phone was attached for this pass.
