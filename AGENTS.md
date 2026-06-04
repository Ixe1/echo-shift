# Agent Guide: Echo Shift

Echo Shift is a Phaser 3 + TypeScript + Vite rewind puzzle-platformer. Treat it as a challenge-grade game project: changes should improve the playable product, preserve existing designer workflows, and be verified in-browser when visuals or gameplay are touched.

## First Steps

- Run `git status --short` before editing. The user often has active level, art, or editor work in progress; never revert or overwrite it unless explicitly asked.
- Read the nearest relevant files before changing behavior. Prefer existing game helpers over new abstractions.
- Keep edits scoped. Avoid broad refactors, formatting churn, or unrelated polish while fixing a specific issue.
- If a temporary server is already running for the user, do not stop it unless the current task requires it or the user asks.

## Project Map

- `src/main.ts`: boot routing for normal game, editor mode, and draft playtest mode.
- `src/scenes/`: Phaser scenes. `GameScene.ts` owns most runtime gameplay, rendering, diagnostics, and level orchestration.
- `src/game/`: shared runtime systems such as player physics, objects, motion, audio, scoring, progress, backgrounds, and sprite helpers.
- `src/data/levels.ts`: source level data.
- `src/editor/`: in-browser level editor at `/?editor=1`.
- `scripts/`: simulation, smoke, editor, and visual QA harnesses.
- `public/assets/`: static game assets. Sprites live in `public/assets/sprites/`, backgrounds in `public/assets/backgrounds/`, soundtracks in `public/assets/audio/soundtracks/`.
- `docs/`: durable plans and workflow notes. Important references include `docs/level-editor-plan.md`, `docs/entity-toolkit.md`, and `docs/background-art-pipeline.md`.

## Commands

- Install: `npm install`
- Development server: `npm run dev`
- Production build: `npm run build`
- Production preview: `npm run preview -- --host 0.0.0.0 --port 5173`
- Gameplay simulation: `npm run test:sim`
- Editor smoke test: `npm run qa:editor`
- Browser playtest smoke: `npm run qa:smoke`
- Door/solid visual QA: `npm run qa:door-solid`

Browser QA scripts expect a server at `http://localhost:5173/` unless `PLAYTEST_URL` is set. Screenshots usually go under `/tmp`. In this environment, Playwright/Chromium checks may need to run outside the sandbox if Chromium cannot launch.

## Quality Bar

- Always run `npm run build` after TypeScript, Phaser, editor, or asset-manifest changes.
- For gameplay physics, level rules, scoring, or entity interactions, run `npm run test:sim` when practical.
- For editor UI/workflow changes, run `npm run qa:editor` and manually inspect the editor if layout changed.
- For rendered gameplay, sprites, structural outlines, doors, sensors, or visual diagnostics, run `npm run qa:door-solid` or `npm run qa:smoke` as appropriate.
- For visual changes, capture and inspect screenshots at desktop size and, when UI is involved, a narrower/mobile viewport.
- If a check fails, determine whether it is caused by the current change before labeling it pre-existing. Record known unrelated failures in the handoff or final response.

## Gameplay Rules To Preserve

- The game is a puzzle-platformer with rewind echoes. Echoes replay previous attempts and can interact with puzzle objects when the entity rules allow it.
- Lasers and drones are hazards. Echoes should not disable lasers by collision; lasers vaporize affected echoes unless disabled by assigned triggers.
- Plates, timed switches, and echo sensors can drive doors and disable lasers/drones when referenced by ID.
- Moving platforms are one-way from underneath and sides: actors should land on the top only when descending from above.
- Score/time/lives are player-facing systems. Retry resets the current level attempt state as designed.
- Keep level completion fair for human play, not only automated smoke-test speed.

## Level Editor Rules

- Open the editor at `http://localhost:5173/?editor=1`.
- The editor saves drafts to `localStorage`; it does not rewrite `src/data/levels.ts` by itself.
- Use the editor Playtest flow for draft levels. Draft clears must not write normal campaign progress.
- Exported JSON should mirror the `Level` type and be applied to `src/data/levels.ts` deliberately.
- Preserve drag-and-drop creation, grid snapping, bottom alignment for floor-mounted objects, keyboard delete, wheel zoom, canvas panning, and inspector/object validation workflows.
- Start/exit portals, pressure plates, and drone bodies should not expose resize handles. Movement endpoints for drones/platforms/moving lasers should remain draggable.
- Floor, Wall, and Block palette tools create `solids`; keep one-grid thickness defaults so objects align cleanly.

## Assets And Visuals

- Prefer shipped bitmap assets for final game visuals over code-drawn placeholder shapes.
- Sprite assets belong in `public/assets/sprites/`; keep collision rectangles in code/data aligned to the intended visual anchor.
- Floors, walls, blocks, doors, lasers, drones, platforms, plates, sensors, crates, cores, and hazards should remain readable against image backgrounds.
- For backgrounds, add files under `public/assets/backgrounds/`, register keys in `src/game/backgrounds.ts`, and assign `backgroundKey` in `src/data/levels.ts`.
- For soundtracks, keep MP3s under `public/assets/audio/soundtracks/`, register keys in `src/game/soundtracks.ts`, and assign `soundtrackKey` per level.
- Do not stretch a single 16:9 image across very wide levels unless that is intentional. The current background approach scales to level height and repeats horizontally.
- When using image generation or Game Studio workflows, keep source/preview concepts in `docs/concepts/` and final runtime assets under `public/assets/`.

## Implementation Notes

- This is a static frontend app. No backend, API keys, or `.env` files are required.
- Prefer deterministic logic in `src/game/*` and keep Phaser rendering concerns in scenes or render helpers.
- The editor and game share the same level schema. If the schema changes, update `src/game/types.ts`, `src/data/levels.ts`, editor validation/inspector controls, and relevant QA scripts together.
- Diagnostics exposed on `document.documentElement.dataset` are used by Playwright QA. Update tests when diagnostics change.
- Do not edit `dist/` directly. Build output is generated by `npm run build`.

## Git And Handoff

- Make checkpoint commits when the user asks for committed progress or a review/fix loop is active.
- Keep unrelated user changes out of commits unless the user explicitly says to commit everything.
- Final responses should name changed files, commits created, verification run, and any checks not run or still failing.
