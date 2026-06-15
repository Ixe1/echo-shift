# Echo Shift

A compact rewind puzzle-platformer built for the Community Dev Challenge. Rewinds leave translucent echoes anchored where you were, letting them hold plates, open doors, block lasers, and help route the player to the exit while level progress continues.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test:sim`
- `npm run qa:editor`
- `npm run qa:door-solid`

## Level Editor

Run `npm run dev` and open `http://localhost:5173/?editor=1`. The editor loads the current level schema, saves browser drafts in `localStorage`, validates object references, and exports JSON for deliberate source updates. The grouped palette includes one-grid-thick Floor and Wall presets plus the entity toolkit described in `docs/entity-toolkit.md`. Level settings include the MP3 soundtrack key, background key, and medal thresholds with seconds shown at 60 frames per second. Use the editor's Playtest button to boot the current saved draft in game mode; draft playtest clears do not write normal campaign progress.

## Controls

- Move: `A/D` or arrow keys
- Jump: `Space`, `W`, or up arrow
- Rewind/create echo: `R`
- Retry current attempt: `T` or the HUD retry button
- Pause: `Esc` or the HUD pause button

## Deploy

The game is fully static after `npm run build`. Deploy the `dist/` directory to itch.io, GitHub Pages, Vercel, Netlify, or any static host. No API keys, `.env` files, or backend services are required.

## License

Echo Shift is by Paul Lewis (Ixe1). Source code is licensed under the PolyForm Noncommercial License 1.0.0. Game assets and creative content are licensed under CC BY-NC 4.0 unless otherwise noted. Commercial use requires prior written permission; non-commercial reuse must credit `Echo Shift by Paul Lewis (Ixe1)`.
