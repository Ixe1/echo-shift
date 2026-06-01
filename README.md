# Echo Shift

A compact rewind puzzle-platformer built for the Community Dev Challenge. Previous attempts become translucent echoes that replay recorded inputs and can hold plates, open doors, block lasers, and help route the player to the exit.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test:sim`
- `npm run qa:smoke`

`npm run qa:smoke` expects the dev server at `http://localhost:5173/` by default. Override with `PLAYTEST_URL`. Screenshots are written to `/tmp/echo-shift-playtest` unless `PLAYTEST_OUT` is set.

## Controls

- Move: `A/D` or arrow keys
- Jump: `Space`, `W`, or up arrow
- Rewind/create echo: `R`
- Retry current attempt: `T` or the HUD retry button
- Pause: `Esc` or the HUD pause button

## Deploy

The game is fully static after `npm run build`. Deploy the `dist/` directory to itch.io, GitHub Pages, Vercel, Netlify, or any static host. No API keys, `.env` files, or backend services are required.
