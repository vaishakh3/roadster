# Roadster / Breakwater

A fast, original coastal crossing built in Three.js. Drive a Roadster-inspired car across 3.6 km of sea bridges, thread recharge gates, fly four gaps, and reach the lighthouse. A crossing takes roughly 50–80 seconds, with a score, medal, personal best, and instant retry.

Breakwater replaces the previous Flight Lab playground. It is deliberately an **arcade game**: automatic forward travel, continuous lateral steering, damped lift, gravity, and a predictable flight ceiling. Steering remains available while boosting, lifting, landing, and performing a visual reward roll. It is not a simulation of Tesla or SpaceX hardware.

## Run

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4173/`. Node.js 20+ is required for development.

```sh
npm test
npm run build
```

The build creates `dist/index.html` and an identical self-contained `Roadster-Flight-Lab.html` (the existing filename is retained for compatibility). Fonts, JavaScript, geometry, sky, water and audio are local/procedural. The hosted game makes no external asset or API requests. No accounts, environment variables, paid assets or backend are required.

## Play

| Action | Keyboard                            | Landscape phone                                            |
| ------ | ----------------------------------- | ---------------------------------------------------------- |
| Steer  | ← / → or A / D                      | Left / right buttons                                       |
| Fly    | Hold Space or H; release to descend | Hold FLY; release to descend                               |
| Boost  | Hold Shift or ↑ / W                 | Hold BOOST                                                 |
| Brake  | ↓ or S                              | Automatic cruise; steering and flight are the main actions |
| Pause  | Escape or P                         | Ⅱ                                                          |
| Retry  | R or the result button              | ONE MORE RUN                                               |

You can steer, fly and boost simultaneously. Each pointer owns its own control; releasing one does not cancel the others. Pausing, changing tabs, losing focus or rotating upright clears input. Landing and takeoff **do not** clear input.

- **Mint gates:** restore 30% thrust. A centred pass earns 250 points; a wider pass earns 150. Consecutive gates increase the multiplier to 4×. Missing a gate breaks the chain.
- **Broken bridges:** orange approach strips warn of a gap. Hold FLY before the edge, and keep holding across the water. Approach stations guarantee at least 65% reserve. Each crossing earns 300 points.
- **Barriers:** steer around them or fly above them. Close calls earn 150 points. A hit slows the car and costs one of three condition segments. Three hits or falling into the water ends the run.
- **Flight:** hold to lift toward a 5.8 m ceiling; release to glide down. Perfect airborne gates trigger an automatic visual barrel roll without suspending control or changing the collision shape.
- **Thrust:** boost and lift consume reserve; coasting on the road refills it. Gates reward staying on the intended route instead of flying continuously.
- **Medals:** gold requires at most 65 seconds and at least 12 gates; silver requires at most 76 seconds and at least 8 gates; every other completed crossing earns bronze. Time and remaining condition add finish points.

The pause menu includes sound, graphics quality, reduced camera motion and fullscreen. Audio starts only after a player gesture. High score is stored on the device. SAVE RUN CARD downloads a local PNG; nothing is posted or uploaded.

## Mobile and readability

Phones play in landscape. Portrait shows a rotation prompt, pauses the run and makes the underlying controls inert. Returning to landscape requires an explicit resume. This works without browser orientation-lock support.

The HUD prioritises a large central hazard warning, timer, score, speed and thrust. High-contrast shading supports the instruments over bright scenery. Touch targets are at least 44 CSS pixels; primary driving targets are 62–86 pixels wide at the verified phone sizes. Controls do not select text, open a long-press menu or scroll the page. Safe-area insets keep controls away from device edges. This still needs physical-device testing before public launch.

## Source map

- `main.js`: renderer, camera, UI, lifecycle, preferences and run-card export.
- `run.js`: deterministic course, independent steering/lift/boost, collision, scoring and medals.
- `controls.js`: simultaneous keyboard and pointer state.
- `coast.js`: procedural ocean, islands, bridges, gates, turbines and lighthouse; static geometry batching.
- `sound.js`: locally synthesised motor, wind and action cues.
- `car.js`, `interior.js`: original procedural Roadster interpretation.

Older Flight Lab simulation modules remain in repository history; the current build has one focused game mode. Mobile AUTO lowers pixel density and disables shadows; HIGH/LOW are also available. The glass uses a cheaper opaque external-view material during play. Rendering and simulation pause when the page is hidden.

## Verification

`npm test` runs 20 gameplay/input checks, including sustained combined controls, all four gaps, collision sweeps, scoring, energy, frame-rate independence and a complete 18-gate crossing without damage. They establish correctness and feasibility, not how enjoyable a human finds the game.

For real WebGL/DOM checks, build and start the server, open `/tests/browser.html`, then select **Run checks**. It checks the production bundle, combined keyboard and synthetic multitouch input, pause/resume/retry, portrait behavior, and HUD/layout bounds at desktop and phone sizes. `/tests/preview.html` provides visible scene and viewport presets for manual inspection. QA runs do not write personal records or preferences.

The optional `npm run test:browser` wrapper runs the same harness in an installed Chromium browser. CI runs `npm ci`, `npm test` and `npm run build`. See `tests/QA.md` for the tested scope and device limitations.

## Vercel

Import this GitHub repository and select the upgrade branch. `vercel.json` configures `npm run build` and the `dist` output directory. Review a preview deployment before merging to your production branch. This change does not deploy automatically from the local workspace.

## Credits and limits

This is an independent fan game, not affiliated with Tesla. The white car is an original procedural interpretation, not manufacturer CAD. The course, graphics and game loop are original; no imagery from the reference game is included. The game physics, route assistance, recharging and visual barrel rolls are design choices, not claims about a real car.

Original code retains its existing `UNLICENSED` status (`LICENSE`). Three.js is MIT-licensed (`vendor/THREE-LICENSE.txt`). Barlow Condensed and IBM Plex Mono are bundled under the SIL Open Font License; exact licenses are in `assets/fonts/`, copied into `dist/` and embedded in the standalone HTML. No external font service is used.
