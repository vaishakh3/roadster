# Roadster / World Tour

A self-contained Three.js arcade racer with three authored arenas, a three-stage tour, moving hazards, flight, local course records and personal ghosts. All arenas are available from the start.

| Course     | Route  | Character                                                                         | Gold target     |
| ---------- | ------ | --------------------------------------------------------------------------------- | --------------- |
| Breakwater | 3.6 km | Atlantic bridges, traffic, sweepers, four broken spans, lighthouse finish         | 1:05 + 12 gates |
| Redshift   | 3.9 km | Sandstone canyon, rock arches, launch ramps, mine tunnels, low-clearance gantries | 1:13 + 13 gates |
| Nightshift | 4.2 km | Rainy freight port, moving traffic, container yards, cranes, dock crossings       | 1:20 + 14 gates |

Choose a venue from the three in-game route previews, or use the previous/next arrows (← / → on the keyboard). Pick **Race here** for a quick run or **World Tour** to race all three in order. **View car** rotates the garage view; dragging the scenery also orbits the car. A tour adds stage scores; retrying a stage replaces that stage's result. Course medals, best times, best scores and three mastery badges are saved locally. Finishing each new course unlocks a paint finish: Solar, Glacier, then Midnight. Pearl is available immediately. Your fastest successful run becomes a translucent mint car ghost on subsequent attempts. The ghost can be disabled in Settings.

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
- **Broken bridges** have orange approach bands and an early warning. Hold FLY before the edge and across the gap. Approach stations guarantee a usable flight reserve.
- **Traffic and orange barriers** can be passed on either side or flown over. Sweepers move sideways. A close pass scores bonus points. Three hits end a run.
- **Low gantries** require returning to the road. Release FLY when the warning appears. The lower amber edge marks the 3.3 m clearance.
- **Launch ramps** physically raise the car and impart an upward impulse. Hold FLY to extend the jump.
- **Blue slingshot strips** give a short speed surge and restore reserve when driven over.
- **Mastery badges** track finishing, taking no damage, and collecting every gate. These can be earned over separate runs.

The game uses assisted heading, automatic forward travel, independent lateral control and damped lift. It is an arcade game, not a simulation of a real Tesla or SpaceX vehicle. Time and remaining vehicle condition contribute to the finish score.

## Mobile and visibility

Phones play in landscape. Portrait pauses the race, displays a rotation prompt and makes the underlying UI inert; turning back requires an explicit resume. Touch controls prevent selection, scrolling and long-press menus. The timer, speed and thrust remain large, while hazard warnings sit to the left to preserve the central driving view. The gold target shows remaining time and the required gate count. Venue selection stays on the garage screen with large tap targets and stacked race actions.

Settings include sound, quality, reduced camera motion, fullscreen and the personal ghost. Sound starts after a gesture. SAVE RUN CARD downloads a PNG; nothing is posted or uploaded. Records and ghosts stay in this browser and do not sync between devices. Private browsing or storage restrictions can prevent persistence without preventing play.

## Rendering

Each arena has its own geometry, palette, lighting and landmarks. The Atlantic uses water highlights and suspension towers; Redshift uses layered rock surfaces, arches and mine passes; Nightshift uses container yards, illuminated buildings, cranes, wet-road lights and rain. The road uses scanned asphalt color, normal and roughness maps. World-space sandstone sampling avoids stretched cliff textures; HDR illumination adds reflections to the sculpted bodywork, glazing and wet asphalt. Cutout vegetation, detailed curbs and guardrails, illuminated facade windows, warehouses and marked freight aprons add scale. The garage offers an orbit view with a visible interior; the racing camera sits closer to the car. Boost exhaust fades into animated vapor. Impacts, gates and launches emit pooled particles.

Rigid scenery is batched by material and district, moving objects are batched within their groups, and distant districts are culled. Switching courses disposes their geometry, generated textures, instance buffers and shadow maps; the five scanned source textures and prefiltered HDR environment are shared across venues. Mobile AUTO limits pixel density and uses 1024-pixel shadows; HIGH uses 2048-pixel shadows. HIGH and LOW are available manually. Rendering stops while the page is hidden. Actual phone frame rates still need physical-device testing.

## Source map

- `courses.js`: authored routes, hazards, medal targets, badges, paint rewards and record reducer.
- `run.js`: deterministic simulation, swept collision, lift, ramps, boost pads and scoring.
- `controls.js`: independent keyboard and pointer state.
- `main.js`: renderer, camera, tour flow, local records, ghost playback, settings and UI.
- `coast.js`: course-specific scenery, animated hazards, shaders, particles and resource cleanup.
- `surfaces.js`: shared asset loading, scanned PBR materials, triplanar rock shading, cutout vegetation and illuminated facades.
- `car.js`, `interior.js`: original procedural Roadster interpretation.
- `sound.js`: local motor, wind and action cues.

## Verification

`npm test` runs 28 simulation/input checks, including a complete gold run on every course collecting every gate without damage. It also covers moving hazards, low clearance, ramp impulse, boost strips, record/ghost retention and input independence.

After building and starting the server, open `/tests/browser.html`. **Run checks** verifies the real production WebGL bundle, simultaneous keyboard and synthetic touch inputs, portrait behavior, course switching, tour progression, paint rewards, geometry/texture cleanup and responsive layouts. **Drive all three courses** completes each production course through its keyboard handlers and checks saved ghost playback. These QA runs use isolated in-memory records and never overwrite personal progress.

`/tests/preview.html` offers viewport and scene presets for visual inspection. Its test driver is not included in the shipped game. CI runs `npm ci`, `npm test` and `npm run build`. See `tests/QA.md` for results and remaining device checks. Automated feasibility does not establish human enjoyment or physical phone performance.

## Vercel

The existing `vercel.json` uses `npm run build` and serves `dist`. The connected GitHub repository deploys the production branch automatically. This refinement was authorized for a direct push to `main`. No service credentials or environment variables are needed.

## Credits

Independent fan game; not affiliated with Tesla. The car is an original procedural interpretation, not manufacturer CAD. No graphics from the supplied reference game are included. Original code retains its existing `UNLICENSED` status. Scanned asphalt and sandstone textures and the Venice Sunset HDR are CC0 assets from Poly Haven, credited with authors, source URLs and checksums in `assets/realism/LICENSE.txt`. Venue thumbnails are captures of this game. Three.js and its HDR loader are MIT-licensed. Barlow Condensed and IBM Plex Mono use the SIL Open Font License; exact licenses are bundled in source, copied into `dist`, and embedded in the standalone HTML.
