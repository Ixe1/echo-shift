import { scoreSettingsFromGoldFrames } from "../game/scoring";
import type { Level, Rect, Solid } from "../game/types";
import { markAnchoredMotionModel } from "./motionModel";

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const s = (id: string, x: number, y: number, w: number, h: number, tone: Solid["tone"] = "steel"): Solid => ({
  id,
  x,
  y,
  w,
  h,
  tone
});

export const tutorialLevel: Level = markAnchoredMotionModel({
  id: "tutorial-echo-primer",
  index: 0,
  name: "Echo Primer",
  subtitle: "Movement, rewind, and pressure plates",
  soundtrackKey: "level-1",
  backgroundKey: "level-1-readable-lab",
  backgroundAmbience: { preset: "lab", intensity: 0.28, color: "#43f7ff", drift: 0.24, flicker: 0.12, particles: 0.2 },
  start: { x: 58, y: 450 },
  exit: r(2060, 438, 48, 62),
  bounds: r(0, 0, 2200, 540),
  solids: [
    s("floor-left", 0, 500, 420, 60, "dark"),
    s("floor-main", 520, 500, 1680, 60, "dark"),
    s("left-wall", -26, 0, 26, 560, "glass"),
    s("right-wall", 2200, 0, 26, 560, "glass"),
    s("jump-marker", 302, 438, 92, 18),
    s("plate-marker", 620, 438, 132, 18),
    s("exit-approach", 1720, 438, 180, 18)
  ],
  plates: [{ id: "tutorial-plate", ...r(654, 492, 76, 8), label: "ECHO" }],
  doors: [{ id: "tutorial-gate", ...r(1140, 200, 28, 300), opensWith: ["tutorial-plate"] }],
  score: scoreSettingsFromGoldFrames(2400),
  hint: "Create an echo on the plate, then let the live runner pass through the open gate."
});
