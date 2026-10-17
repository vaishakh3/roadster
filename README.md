# Roadster / World Tour

A self-contained Three.js arcade racer with three authored arenas, a three-stage tour, moving hazards, flight, local course records and personal ghosts. All arenas are available from the start.

| Course     | Route  | Character                                                                                        | Gold target     |
| ---------- | ------ | ------------------------------------------------------------------------------------------------ | --------------- |
| Breakwater | 5.4 km | Atlantic bridges, traffic, sweepers, five suction-grip ramps, storm galleries, lighthouse finish | 1:37 + 17 gates |
| Redshift   | 5.7 km | Sandstone canyon, rock arches, sky ramps, rockfall, mine tunnels, low-clearance gantries         | 1:45 + 18 gates |
| Nightshift | 6.0 km | Rainy freight port, moving traffic, moving cargo, dock trusses, sky ramps                        | 1:52 + 19 gates |

Choose a venue from the three in-game route previews, or use the previous/next arrows (← / → on the keyboard). Pick **Race here** for a quick run or **World Tour** to race all three in order. **View car** rotates the garage view; dragging the scenery also orbits the car. A tour adds stage scores; retrying a stage replaces that stage's result. Course medals, best times, best scores and three mastery badges are saved locally. Finishing each new course unlocks a paint finish: Solar, Glacier, then Midnight. Pearl is available immediately. Your fastest successful run becomes a translucent mint car ghost on subsequent attempts. Layout version 3 ignores incompatible earlier ghosts and resets route time/score comparisons on the first new finish while preserving earned paints, medals and badges. The ghost can be disabled in Settings.

## Run and build

```sh
npm ci
npm start
npm test
npm run build
```

Open `http://127.0.0.1:4173/`. Node.js 20+ is required for development. The build creates `dist/index.html` and an identical self-contained `Roadster-Flight-Lab.html`; the old filename remains for compatibility. Fonts, shaders, geometry, scanned textures, HDR lighting and synthesized audio are bundled locally. There are no runtime asset downloads, account requirements, environment variables, paid assets or backend.

## Play

| Action | Keyboard                            | Landscape phone                                |
| ------ | ----------------------------------- | ---------------------------------------------- |
| Steer  | ← / → or A / D                      | Left / right buttons                           |
| Fly    | Hold Space or H; release to descend | Hold FLY; release to descend                   |
| Boost  | Hold Shift or ↑ / W                 | Hold BOOST                                     |
| Brake  | ↓ or S                              | Automatic cruise; steer and fly around hazards |
| Pause  | Escape or P                         | Ⅱ                                              |
| Retry  | R or result button                  | ONE MORE RUN                                   |

Steering, boost and flight work simultaneously. Each touch pointer owns its own control. Landing and takeoff never clear held inputs. Pause, focus loss and portrait rotation clear input so it cannot stick.

- **Mint gates** refill 30% thrust and reward an accurate line. Consecutive gates raise the multiplier to 4×. Air gates can award a visual barrel roll without taking away control.
- **Broken bridges** have orange approach bands and an early warning. Use the mint ramp, or hold FLY before the edge and across the gap. Approach stations guarantee a usable flight reserve.
- **Traffic and orange barriers** can be passed on either side or flown over. Sweepers move sideways. A close pass scores bonus points. Three hits end a run.
- **Low gantries** require returning to the road. Release FLY when the warning appears. The lower amber edge marks the 3.3 m clearance.
- **Suction-grip ramps** follow a curved deck, then automatically launch a backflip or barrel roll. Thirteen ramps range from 6 to 24 metres tall. Stay on the mint lane; steering and boost remain active. Assisted landing follows the marked landing zone even if you brake in the air. A clean landing earns 800 points; impacts cancel that bonus. No extra stunt button is needed.
- **Moving cargo, rockfall and roadworks drums** give each venue distinct hazards. Cargo moves across the road on a crane trolley; its amber border makes the collision footprint visible.
- **Blue slingshot strips** give a short speed surge and restore reserve when driven over.
- **Mastery badges** track finishing, taking no damage, and collecting every gate. These can be earned over separate runs.

The game uses assisted heading, automatic forward travel, independent lateral control and damped lift. It is an arcade game, not a simulation of a real Tesla or SpaceX vehicle. Time and remaining vehicle condition contribute to the finish score.

## Mobile and visibility

Phones play in landscape. Portrait pauses the race, displays a rotation prompt and makes the underlying UI inert; turning back requires an explicit resume. Touch controls prevent selection, scrolling and long-press menus. The timer, speed and thrust remain large, while hazard warnings sit to the left to preserve the central driving view. A compact live route map shows the travelled line, player position, percentage complete, finish and stunt locations. Each venue includes an extra 1.8 km leg with gates, hazards and a sky ramp. The gold target shows remaining time and the required gate count. Venue selection stays on the garage screen with large tap targets and stacked race actions.

Settings include sound, quality, reduced camera motion, fullscreen and the personal ghost. Sound starts after a gesture. SAVE RUN CARD downloads a PNG; nothing is posted or uploaded. Records and ghosts stay in this browser and do not sync between devices. Private browsing or storage restrictions can prevent persistence without preventing play.

## Rendering

Each arena has its own geometry, palette, lighting and landmarks. The Atlantic uses water highlights and suspension towers; Redshift uses layered rock surfaces, arches and mine passes; Nightshift uses container yards, illuminated buildings, cranes, wet-road lights and rain. The road uses scanned asphalt color, normal and roughness maps. Smooth indexed boulders, eroded terrain tiles, planted cacti and stratified mesas replace faceted rocks and stepped pillars. Near/far geometry levels reduce distant detail. Instance-aware world-space sandstone sampling avoids stretched cliff textures; HDR illumination adds reflections to the sculpted bodywork, glazing and wet asphalt. Cutout vegetation, detailed curbs and guardrails, illuminated facade windows, warehouses and marked freight aprons add scale. The garage offers an orbit view with a visible interior; the racing camera sits closer to the car. Boost exhaust has two time-faded ribbons recorded in world space, so previous segments follow the path already driven. Impacts emit pooled debris, sparks and smoke; a fatal hit recoils and spins the car before the retry screen. Landings compress the suspension. Reduced motion removes stunt spins, trails and impact shake.

Rigid scenery is batched by material and district, moving objects are batched within their groups, and distant districts are culled. Three worlds are constructed and their initial shaders rendered behind the loading screen. Venue changes then reuse those prepared worlds instead of rebuilding geometry. The shared compact WebP maps and 512-pixel HDR reduce the runtime image payload by 77%; source-resolution originals remain in the repository. This deliberately trades bounded resident geometry for fast selection. No per-selection geometry or texture allocation is needed. Long instance rows draw only a precomputed nearby span, updated every 80 metres. Tire tread uses surface shading instead of 48,640 tiny triangles; the racing model is 96,273 triangles. Mobile AUTO uses 1024-pixel shadows and adapts pixel density between 0.8 and its device-limited ceiling of 1.25 using two-second frame windows; it recovers slowly after sustained headroom. Desktop AUTO has a ceiling of 1.75; HIGH uses 2048-pixel shadows. HIGH and LOW are available manually. Rendering stops while the page is hidden. Actual phone frame rates still need physical-device testing.

## Source map

- `courses.js`: authored routes, hazards, medal targets, badges, paint rewards and record reducer.
- `run.js`: deterministic simulation, swept collision, lift, ramps, boost pads and scoring.
- `controls.js`: independent keyboard and pointer state.
- `main.js`: renderer, camera, tour flow, local records, ghost playback, settings and UI.
- `coast.js`, `setpieces.js`: reusable venue worlds, batched architecture, ramps, hazards and lighting.
- `stunts.js`: shared ramp surface, assisted flight trajectory and world-space path history.
- `effects.js`: reusable trail buffers, impact debris and smoke pools.
- `surfaces.js`: shared asset loading, scanned PBR materials, triplanar rock shading, cutout vegetation and illuminated facades.
- `terrain.js`: deterministic terrain tiles, smooth boulders and detail levels.
- `propulsion.js`, `propulsion-mesh.js`: flight actuator state, corner nozzles and suction hardware.
- `quality.js`: bounded frame-budget adaptation.
- `car.js`, `interior.js`: original procedural Roadster interpretation.
- `sound.js`: local motor, wind and action cues.

## Verification

`npm test` runs 43 simulation/input checks, including a complete gold run on every course collecting every gate without damage. It also covers moving hazards, low clearance, all thirteen ramps at 12/24/30/60/120 Hz across complementary checks, braking through a stunt, collision-cancelled stunt bonuses, trail history, boost strips, record/ghost retention and input independence.

After building and starting the server, open `/tests/browser.html`. **Run checks** verifies the real production WebGL bundle, simultaneous keyboard and synthetic touch inputs, portrait behavior, course switching, tour progression, paint rewards, bounded venue resources, rendered trails, crash animation, automatic stunts and responsive layouts. **Check all ramp contacts** drives every ramp under steering, measures rendered wheel/bumper clearance, and verifies correction/landing jets. **Profile mobile rendering** records geometry and frame intervals at phone dimensions on the current GPU. **Benchmark venue switches** measures selection through the first rendered frame. **Drive all three courses** completes each production course through its keyboard handlers and checks saved ghost playback. These QA runs use isolated in-memory records and never overwrite personal progress.

`/tests/preview.html` offers viewport and scene presets for visual inspection. Its test driver is not included in the shipped game. CI runs `npm ci`, `npm test` and `npm run build`. See `tests/QA.md` for results and remaining device checks. Automated feasibility does not establish human enjoyment or physical phone performance.

## Vercel

The existing `vercel.json` uses `npm run build` and serves `dist`. The connected GitHub repository deploys the production branch automatically. This refinement was authorized for a direct push to `main`. No service credentials or environment variables are needed.

## Credits

Independent fan game; not affiliated with Tesla. The car is an original procedural interpretation, not manufacturer CAD. No graphics from the supplied reference game are included. Original code retains its existing `UNLICENSED` status. Scanned asphalt and sandstone textures and the Venice Sunset HDR are CC0 assets from Poly Haven, credited with authors, source URLs and checksums in `assets/realism/LICENSE.txt`. Venue thumbnails are captures of this game. Three.js and its HDR loader are MIT-licensed. Barlow Condensed and IBM Plex Mono use the SIL Open Font License; exact licenses are bundled in source, copied into `dist`, and embedded in the standalone HTML.

## Flight reference and interpretation

The current [Tesla Roadster page](https://www.tesla.com/roadster) and Tesla’s [The Ramp | Roadster](https://www.youtube.com/watch?v=7p5LxFdc-Qg) distinguish underfloor suction, rear acceleration jets and perimeter cold-gas thrusters for lift and rotation. The procedural model uses original geometry inspired by those references; no Tesla marketing images are bundled as game assets. Exact nozzle coordinates and control laws are not published.

The game has four downward corner lift outlets, paired attitude outlets, lateral correction jets, underfloor plenums and fans, and separate rear jets. White vapor follows each nozzle’s body orientation. Suction activates on ramps; manual lift and automatic landing arrest activate the underside jets. Opposing attitude pulses initiate and stop rotation; collective lift is disabled while inverted or freely falling. Automatic stunts use an assisted trajectory and gentle landing, not a full rigid-body or manufacturer physics simulation.

Ramp contact samples a wheelbase-sized support plane, catches downward deck crossings, rejects entry through tall ramp sides and keeps the car’s orientation aligned with the actual deck normal while steering. Flip rotation begins only after the full car clears the lip. Physics and the rendered deck share the ramp surface function.
