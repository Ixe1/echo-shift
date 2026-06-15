# Echo Shift

A compact rewind puzzle-platformer built for the Community Dev Challenge. Rewind to leave echoes from previous attempts, then cooperate with them to hold plates, trigger sensors, open doors, and route through four time-shift rooms plus a tutorial.

## Play Locally

- `npm install`
- `npm run dev`
- Open `http://localhost:5173/`

The title screen includes Play, Tutorial, Options, and Credits. Level Select and the Level Editor are hidden by default; unlock them for the current session with `Up Up Down Down Left Right Left Right R` on the menu, or open the editor directly at `http://localhost:5173/?editor=1`.

## Commands

- `npm run dev`: start the Vite dev server on port 5173.
- `npm run build`: run TypeScript checks and build the static `dist/` output.
- `npm run preview`: serve the production build on port 5173.
- `npm run preview:stop`: stop tracked preview server processes.
- `npm run preview:restart`: stop preview, rebuild, and start preview again.
- `npm run test:sim`: run deterministic gameplay simulation checks.
- `npm run qa:editor`: run the editor smoke test.
- `npm run qa:door-solid`: run door and solid render QA.
- `npm run qa:core-spill`: run core-spill render QA.

## Campaign

The campaign currently contains:

- Training Annex: tutorial, practice only.
- Springtide Sprint
- Rainhouse Relay
- Frostcap Echo Rush
- Timber Archive: final boss room, completed by defeating the boss, with rewind disabled.

Tutorial clears, editor draft playtests, and practice Level Select clears do not write normal campaign progress or leaderboard entries.

## Controls

- Move: `A/D` or left/right arrows.
- Jump: `W`, up arrow, or `Space`.
- Rewind/create echo: `R` or the HUD rewind button.
- Pause: `Esc` or the HUD pause button.
- Gamepad: D-pad or left stick to move, `A/Cross` to jump or confirm, `B/Circle` to go back, `X/Square` or left shoulder to rewind, `Start/Menu` to pause.
- Touch: on-screen left, right, and jump buttons are available during gameplay.

Rewind is unavailable in boss fights, during final synchronization states, and in rooms that explicitly disable it.

## Score, Lives, And Progress

Echo Shift no longer awards medals. Current scoring is based on core pickups, monster and boss defeats, and a time bonus for full seconds saved under the level's target time. Campaign levels currently use 3 finite lives, 100 points per core, a 900 second time-bonus target, and 1 point per saved second.

Campaign progress is stored in `localStorage`. Best level scores prefer higher score first, then fewer deaths, fewer echoes, and faster time. The campaign starts with 3 carried lives for finite-life levels, and every 50 unique campaign core pickups awards a bonus life. Completing the final campaign room can save a local top-10 leaderboard entry with a nickname up to 16 characters.

## Level Editor

Run `npm run dev` and open `http://localhost:5173/?editor=1`. The editor loads the current level schema, saves browser drafts in `localStorage`, validates object references, and exports JSON for deliberate source updates. The grouped palette includes one-grid-thick Floor and Wall presets plus entity toolkit controls.

Level settings include soundtrack key, background key, completion mode, rewind-disabled mode, finite or unlimited lives, core score, time-bonus target seconds, and score per saved second. Use the editor's Playtest button to boot the current saved draft in game mode; draft clears and scores are not written to normal campaign progress.

## Deploy

The game is fully static after `npm run build`, and no API keys, `.env` files, or backend services are required. Deploy the contents of `dist/` to a free static host.

The current Vite config and runtime asset paths assume the game is served from the domain root. Vercel or Netlify root deployments are direct. GitHub Pages project URLs such as `/echo-shift/` and itch.io HTML5 uploads may need a base-path or relative-asset pass before publish.

Public repository: `https://github.com/Ixe1/echo-shift`

## License

Echo Shift is by Paul Lewis (Ixe1). Source code is licensed under the PolyForm Noncommercial License 1.0.0. Game assets and creative content are licensed under CC BY-NC 4.0 unless otherwise noted. Commercial use requires prior written permission; non-commercial reuse must credit `Echo Shift by Paul Lewis (Ixe1)`.
