# Roadster / World Tour

Version 6 is a self-contained Three.js arcade racer with three authored arenas, three solid AI opponents, nine career cups, a three-stage tour, moving hazards, flight, side-lane route choices, daily events and shareable ghosts. All arenas are available from the start. Racing uses simple independent steering, boost and flight controls; opponents have gentle physical contact, while recorded ghosts are clearly marked pass-through references.

| Course     | Route  | Character                                                                                        | Time-medal target |
| ---------- | ------ | ------------------------------------------------------------------------------------------------ | ----------------- |
| Breakwater | 5.4 km | Atlantic bridges, traffic, sweepers, five suction-grip ramps, storm galleries, lighthouse finish | 1:37 + 17 gates   |
| Redshift   | 5.7 km | Sandstone canyon, rock arches, sky ramps, rockfall, mine tunnels, low-clearance gantries         | 1:45 + 18 gates   |
| Nightshift | 6.0 km | Rainy freight port, moving traffic, moving cargo, dock trusses, sky ramps                        | 1:52 + 19 gates   |

Choose a venue from the three in-game route previews, or use the previous/next arrows (← / → on the keyboard). Pick **Race here** for a quick run or **World Tour** to race all three in order. **View car** rotates the garage view; dragging the scenery also orbits the car. A tour adds stage scores; retrying a stage replaces that stage's result. Course medals, best times, best scores and three mastery badges are saved locally. Finishing each new course in a standard race or tour unlocks a paint finish: Solar, Glacier, then Midnight. Launch Red is available immediately. Your fastest successful run becomes a cyan holographic ghost on subsequent attempts. Its contour lines, scanning bands and floating **GHOST / PASS THROUGH** label distinguish it from solid opponents, and it fades near your car. Layout version 5 ignores incompatible earlier ghosts and resets route time/score comparisons on the first new finish while preserving earned paints, medals and badges. The personal ghost can be disabled in Settings. A friend challenge keeps its challenger ghost visible so the target remains clear.

## Career objectives

Every venue has three sequential cups, for **nine career cups** in total:

1. **Bronze — finish on the podium:** beat at least one opponent and finish in the top three.
2. **Silver — win the race:** finish first against all three opponents.
3. **Gold — win without damage:** finish first with all three condition bars intact.

The garage shows the next cup before starting. During a race, the objective states how many rivals remain to pass, when to hold position, or whether damage has ruled out a clean victory. Results explain whether the cup was earned and name the next objective. A successful standard race or tour stage awards at most one cup. Cups are stored independently for each venue; completing all three offers title defence. Daily events and friend challenges keep their own goals and do not award career cups.

Time/gate medals and mastery badges remain optional scoring goals, separate from these career cups. Reaching the finish in fourth place still saves a completed run, but does not earn the podium cup.

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

- **Three rival drivers** race the same routes with the same energy, ramps and obstacle contacts. They anticipate traffic, choose passing lanes and occasionally hesitate. There is no position-based catch-up speed adjustment or catch-up teleporting. The HUD and map show the field; the result records a finishing position from 1 to 4. Opponents are solid: bumper contact matches closing speed and side contact separates the bodies. They yield to create passing room, while steering and boost remain available. Contact does not remove condition bars or cancel a stunt; traffic and track hazards still cause damage. Flying above a rival avoids contact when the bodies are vertically clear.
- **Slipstream** builds when following a grounded opponent at a safe distance in the same lane. It reduces wind noise, adds a modest speed benefit and replenishes reserve. Pull out to overtake; getting too close, moving aside or leaving the road breaks the wake.
- **Nine alternate lines**, three per venue, use the existing road's side lanes. Follow the marked route for extra speed; a sustained ground line earns a one-time bonus. These are side-lane choices within a shared road, not separate elevated tracks. Barriers and traffic make the faster line a decision rather than a guaranteed shortcut.
- **Mint gates** refill 30% thrust and reward an accurate line. Consecutive gates raise the multiplier to 4×. Air gates can award a visual barrel roll without taking away control.
- **Broken bridges** have orange approach bands and an early warning. Use the mint ramp, or hold FLY before the edge and across the gap. Approach stations guarantee a usable flight reserve.
- **Traffic and orange barriers** can be passed on either side or flown over. Sweepers move sideways. A close pass scores bonus points. Three hits end a run.
- **Low gantries** require returning to the road. Release FLY when the warning appears. The lower amber edge marks the 3.3 m clearance.
- **Suction-grip ramps** follow a curved deck, then automatically launch a backflip or barrel roll. Thirteen ramps range from 6 to 24 metres tall. Stay on the mint lane; steering and boost remain active. Assisted landing follows the marked landing zone even if you brake in the air. A clean landing earns 800 points; impacts cancel that bonus. No extra stunt button is needed.
- **Moving cargo, rockfall and roadworks drums** give each venue distinct hazards. Cargo moves across the road on a crane trolley; its amber border makes the collision footprint visible.
- **Blue slingshot strips** give a short speed surge and restore reserve when driven over.
- **Mastery badges** track finishing, taking no damage, and collecting every gate. These can be earned over separate runs.

The game uses assisted heading, automatic acceleration, speed-sensitive steering, bounded cornering slip and damped lift. Steering retains its authority while boosting; releasing it settles lateral motion. Tire sound, wheel angle and restrained body roll communicate grip without adding another control. It remains an arcade interpretation rather than a full tire, suspension or manufacturer vehicle simulation. Time and remaining vehicle condition contribute to the finish score.

## Mobile and visibility

Phones play in landscape. Portrait pauses the race, displays a rotation prompt and makes the underlying UI inert; turning back requires an explicit resume. Touch controls prevent selection, scrolling and long-press menus. The timer, speed and thrust remain large, while hazard warnings sit to the left to preserve the central driving view. A compact live route map shows the travelled line, player and rival positions, percentage complete, finish and stunt locations. Position stays visible; slipstream, alternate-line and event information appears when relevant. Each venue includes an extra 1.8 km leg with gates, hazards and a sky ramp. The garage briefing and results retain optional time/gate ratings; the live HUD prioritizes the current race objective. Venue selection stays on the garage screen with large tap targets and stacked race actions.

Settings include sound, quality, reduced camera motion, fullscreen and the personal ghost. Sound starts after a gesture. SAVE RUN CARD downloads a PNG. Records and ghosts stay in this browser and do not sync between devices. Private browsing or storage restrictions can prevent persistence without preventing play.

## Daily events, challenges and replays

**Daily Event** chooses a venue, a goal and deterministic rival timing from the UTC calendar day. Goals rotate between collecting every gate, finishing without damage, and beating the gold time while finishing on the podium. The event resets at 00:00 UTC. It uses the authored routes; it does not generate a new track or weather system. Daily results are stored separately from standard course records and paint progression. A shared daily challenge retains that event's date and seed even after the day changes.

After a successful race, **Share challenge** produces a link containing a compact version of the ghost trajectory, venue, time and optional daily event. Copy it and send it using your preferred app. The recipient races the labelled cyan recorded ghost locally; there is no live multiplayer, account, upload service or global leaderboard. Links validate their size, coordinates, times and track layout, but scores are not independently authenticated or cheat-proof. Incompatible older layouts are rejected with an explanation. Long links may be restricted by some messaging apps; personal records do not transfer with them.

**Watch replay** explicitly opens a looping replay of the last ten seconds of the attempt, or the available duration for a shorter run. It does not interrupt the result screen automatically. **Save clip** records that replay locally at 960 × 540 with a target of 30 frames per second, then downloads a silent WebM or MP4 depending on browser support. It captures the game canvas only, with no microphone or camera access. Keep the tab visible and the phone in landscape during capture; exiting, hiding the tab or changing orientation cancels recording. Browser support for canvas capture and MediaRecorder varies. If recording is unavailable, replay and the PNG run card remain available. Nothing is posted automatically.

## Rendering

Each arena has its own geometry, palette, lighting and landmarks. The Atlantic uses water highlights and suspension towers; Redshift uses layered rock surfaces, arches and mine passes; Nightshift uses container yards, illuminated buildings, cranes, wet-road lights and rain. The road uses scanned asphalt color, normal and roughness maps. Smooth indexed boulders, eroded terrain tiles, planted cacti and stratified mesas replace faceted rocks and stepped pillars. Near/far geometry levels reduce distant detail. Instance-aware world-space sandstone sampling avoids stretched cliff textures; HDR illumination adds reflections to the sculpted bodywork, glazing and wet asphalt. Cutout vegetation, detailed curbs and guardrails, illuminated facade windows, warehouses and marked freight aprons add scale. The car has a continuous sculpted shell with integrated wheel arches, fitted glazing, recessed light housings, detailed wheels and incorporated thruster housings. The garage offers an orbit view with a visible interior; the racing camera sits closer to the car. Opponents use lighter shared geometry instead of three copies of the detailed garage model. Boost exhaust has two time-faded ribbons recorded in world space, so previous segments follow the path already driven. Impacts emit pooled debris, sparks and smoke; a fatal hit recoils and spins the car before the retry screen. Landings compress the suspension. Reduced motion removes stunt spins, trails and impact shake.

Rigid scenery is batched by material and district, moving objects are batched within their groups, and distant districts are culled. Startup constructs and renders the selected venue first. Remaining venues are prepared incrementally while the garage or results screen is open, not during a race. Selecting an unprepared venue shows a loading state; cached selections reuse their geometry and textures. First-load time still depends on device speed and shader compilation. Shared compact WebP maps and a 512-pixel HDR keep the texture payload bounded; source-resolution originals remain in the repository. Long instance rows draw only a precomputed nearby span, updated every 80 metres. Tire tread uses surface shading, and the three opponent cars share eight instanced draw batches without extra lights or downloaded textures.

Mobile AUTO uses 1024-pixel shadows and adapts pixel density between 0.8 and its device-limited ceiling of 1.25 using two-second frame windows; it recovers slowly after sustained headroom. Desktop AUTO has a ceiling of 1.75; HIGH uses 2048-pixel shadows. HIGH and LOW are available manually. Rendering stops while the page is hidden. Desktop testing at phone-sized viewports does not establish actual phone frame rates, thermal behavior or memory limits. Physical iPhone and Android testing remains required. Startup and venue measurements depend on shader caches and hardware; uncached selection still has a visible loading state. Recorded rendering samples and their limits are in `tests/QA.md`.

## Source map

- `courses.js`: authored routes, hazards, medal targets, badges, paint rewards and record reducer.
- `run.js`: deterministic simulation, grip and drift assistance, swept collision, lift, ramps, branch rewards and scoring.
- `rivals.js`, `rivals-mesh.js`: opponent decisions, slipstream, swept solid-body contact, race order and shared opponent rendering.
- `missions.js`: nine-cup career objectives, bounded progression, rewards and live objective status.
- `ghost.js`: non-solid cyan projection, contour rendering, pass-through label and proximity fading.
- `controls.js`: independent keyboard and pointer state.
- `main.js`: renderer, camera, asynchronous venue preparation, tour and daily flow, local records, ghost/replay playback, settings and UI.
- `challenges.js`: UTC daily goals, bounded ghost-link encoding/validation and replay sampling.
- `replay-clip.js`: opt-in silent canvas recording, capability checks and capture cleanup.
- `coast.js`, `setpieces.js`: reusable venue worlds, batched architecture, ramps, hazards and lighting.
- `stunts.js`: shared ramp surface, assisted flight trajectory and world-space path history.
- `effects.js`: reusable trail buffers, impact debris and smoke pools.
- `surfaces.js`: shared asset loading, scanned PBR materials, triplanar rock shading, cutout vegetation and illuminated facades.
- `terrain.js`: deterministic terrain tiles, smooth boulders and detail levels.
- `propulsion.js`, `propulsion-mesh.js`: flight actuator state, corner nozzles and suction hardware.
- `quality.js`: bounded frame-budget adaptation.
- `car.js`, `interior.js`: original procedural Roadster interpretation.
- `sound.js`: local motor, wind, tire grip, landing and action cues.

## Verification

The automated suites cover complementary behaviors:

- `tests/run.test.mjs` verifies a complete gold run on every course collecting every gate without damage, moving hazards, low clearance, all thirteen ramps at 12/24/30/60/120 Hz across complementary checks, braking through a stunt, collision-cancelled stunt bonuses, trail history, boost strips, record retention and input independence.
- `tests/dynamics.test.mjs` verifies high-speed steering, recoverable grip, slipstream limits, branch rewards, deterministic rivals at 30/60/120 Hz, independent opponent pace, safe complete opponent races across multiple seeds, separation during passes, finish rankings, tunnel ceilings and bounded opponent draw batches. Solid-contact cases also cover rear and side impacts, high-speed swept crossings, road edges, vertical clearance, protected ramp/flight motion and repeatable contact at 12/30/60/120 Hz.
- `tests/missions.test.mjs` verifies podium/win/clean-win goals, one reward per run, independent venue progress, completed careers, corrupt local data and live objective feedback.
- `tests/challenges.test.mjs` verifies UTC event determinism, actual daily completion goals, challenge round trips, invalid input rejection and replay interpolation.
- `tests/sharing.test.mjs` verifies quantized finish samples, incompatible and malformed links, recorder success, cancellation, size limits, startup errors and capture cleanup. Recorder unit checks use a mock; actual recording, download and Chrome playback are verified separately; compatibility on other browsers still needs testing.

After building and starting the server, open `/tests/browser.html`. **Run checks** verifies the real production WebGL bundle, simultaneous keyboard and synthetic touch inputs, portrait behavior, course switching, tour progression, paint rewards, bounded venue resources, rendered trails, crash animation, automatic stunts and responsive layouts. **16 feature-browser checks** additionally cover selected-venue-first loading and cancellation, daily event/seed handling, opponent markers, imported ghost challenges, explicit replay without record changes, flight/roll continuity and landscape result actions. The objective/ghost/contact browser harness additionally checks career briefing and progression, pass-through ghost appearance and solid rival contact. Current run results are recorded in `tests/QA.md`. A real 960 × 540 clip was downloaded and played in Chrome: 9.96 seconds, 300 decoded frames, zero dropped frames and no playback errors. See `tests/QA.md` for results and timing evidence. **Check all ramp contacts** drives every ramp under steering, measures rendered wheel/bumper clearance, and verifies correction/landing jets. **Profile mobile rendering** records geometry and frame intervals at phone dimensions on the current GPU. **Benchmark venue switches** measures selection through the first rendered frame. **Drive all three courses** completes each production course through its keyboard handlers and checks saved ghost playback. These QA runs use isolated in-memory records and never overwrite personal progress.

`/tests/preview.html` offers viewport and scene presets for visual inspection. Its test driver is not included in the shipped game. CI runs `npm ci`, `npm test` and `npm run build`. See `tests/QA.md` for results and remaining device checks. Automated feasibility does not establish human enjoyment or physical phone performance.

## Vercel

The existing `vercel.json` uses `npm run build` and serves `dist`. The connected GitHub repository deploys the production branch automatically. No service credentials or environment variables are needed.

## Credits

Independent fan game; not affiliated with Tesla. The car is an original procedural interpretation, not manufacturer CAD. No graphics from the supplied reference game are included. Original code retains its existing `UNLICENSED` status. Scanned asphalt and sandstone textures and the Venice Sunset HDR are CC0 assets from Poly Haven, credited with authors, source URLs and checksums in `assets/realism/LICENSE.txt`. Venue thumbnails are captures of this game. Three.js and its HDR loader are MIT-licensed. Barlow Condensed and IBM Plex Mono use the SIL Open Font License; exact licenses are bundled in source, copied into `dist`, and embedded in the standalone HTML.

## Flight reference and interpretation

The current [Tesla Roadster page](https://www.tesla.com/roadster) and Tesla’s [The Ramp | Roadster](https://www.youtube.com/watch?v=7p5LxFdc-Qg) distinguish underfloor suction, rear acceleration jets and perimeter cold-gas thrusters for lift and rotation. The procedural model uses original geometry inspired by those references; no Tesla marketing images are bundled as game assets. Exact nozzle coordinates and control laws are not published.

The game has four downward corner lift outlets, paired attitude outlets, lateral correction jets, underfloor plenums and fans, and separate rear jets. White vapor follows each nozzle’s body orientation. Suction activates on ramps; manual lift and automatic landing arrest activate the underside jets. Opposing attitude pulses initiate and stop rotation; collective lift is disabled while inverted or freely falling. Automatic stunts use an assisted trajectory and gentle landing, not a full rigid-body or manufacturer physics simulation.

Ramp contact samples a wheelbase-sized support plane, catches downward deck crossings, rejects entry through tall ramp sides and keeps the car’s orientation aligned with the actual deck normal while steering. Flip rotation begins only after the full car clears the lip. Physics and the rendered deck share the ramp surface function.
