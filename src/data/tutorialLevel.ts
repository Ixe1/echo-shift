import { scoreSettingsFromGoldFrames } from "../game/scoring";
import type { Level, MovingPlatform, PatrolDrone, Rect, Solid } from "../game/types";
import { markAnchoredMotionModel } from "./motionModel";

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const s = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: Solid["tone"] = "steel",
  options: Partial<Pick<Solid, "sprite" | "material" | "collision">> = {}
): Solid => ({
  id,
  x,
  y,
  w,
  h,
  tone,
  ...options
});
const p = (id: string, x: number, y: number, w: number, h: number, label?: string) => ({ id, x, y, w, h, ...(label ? { label } : {}) });
const h = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });

const anchoredMotionRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  axis: PatrolDrone["axis"],
  centeredDistance: number
): Rect => ({
  x: axis === "x" ? x - centeredDistance : x,
  y: axis === "y" ? y - centeredDistance : y,
  w,
  h
});

const anchoredPhase = (phase = 0): number => phase + Math.PI / 2;

const d = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  axis: PatrolDrone["axis"],
  distance: number,
  period: number,
  phase = 0,
  disabledBy?: string[]
): PatrolDrone => ({
  id,
  ...anchoredMotionRect(x, y, w, h, axis, distance),
  axis,
  distance: distance * 2,
  period,
  phase: anchoredPhase(phase),
  ...(disabledBy ? { disabledBy } : {})
});

const m = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  axis: MovingPlatform["axis"],
  distance: number,
  period: number,
  phase = 0
): MovingPlatform => ({ id, ...anchoredMotionRect(x, y, w, h, axis, distance), axis, distance: distance * 2, period, phase: anchoredPhase(phase) });

export const tutorialLevel: Level = markAnchoredMotionModel({
  id: "tutorial-echo-primer",
  index: 0,
  name: "Training Annex",
  subtitle: "Echoes, objects, locks, hazards, and moving systems",
  soundtrackKey: "tutorial",
  backgroundKey: "level-1-readable-lab",
  backgroundAmbience: { preset: "lab", intensity: 0.28, color: "#43f7ff", drift: 0.24, flicker: 0.12, particles: 0.2 },
  start: { x: 58, y: 450 },
  exit: r(5480, 438, 48, 62),
  bounds: r(0, 0, 5600, 540),
  solids: [
    s("floor-start", 0, 500, 420, 60, "dark", { sprite: "floor", material: "metal-lab" }),
    s("floor-main", 520, 500, 1480, 60, "dark", { sprite: "floor", material: "metal-lab" }),
    s("floor-tools", 2000, 500, 1260, 60, "dark", { sprite: "floor", material: "metal-lab" }),
    s("floor-hazards-a", 3260, 500, 830, 60, "dark", { sprite: "floor", material: "warning-industrial" }),
    s("floor-hazards-b", 4260, 500, 1340, 60, "dark", { sprite: "floor", material: "metal-lab" }),
    s("left-wall", -26, 0, 26, 560, "glass"),
    s("right-wall", 5600, 0, 26, 560, "glass"),
    s("jump-marker", 302, 438, 92, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
    s("plate-marker", 620, 438, 132, 18, "steel", { sprite: "floor", material: "metal-lab", collision: "top-only" }),
    s("crate-marker", 1360, 438, 180, 18, "steel", { sprite: "floor", material: "wood-archive", collision: "top-only" }),
    s("timed-marker", 2180, 438, 150, 18, "steel", { sprite: "floor", material: "warning-industrial", collision: "top-only" }),
    s("core-marker", 2840, 430, 170, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
    s("laser-overlook", 3740, 360, 240, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
    s("platform-landing", 4120, 430, 150, 18, "steel", { sprite: "floor", material: "metal-lab", collision: "top-only" }),
    s("drone-marker", 4520, 430, 190, 18, "steel", { sprite: "floor", material: "warning-industrial", collision: "top-only" }),
    s("exit-approach", 5200, 438, 190, 18, "steel", { sprite: "floor", material: "metal-lab", collision: "top-only" })
  ],
  platforms: [m("tutorial-lift", 4080, 430, 120, 18, "y", 82, 190), m("tutorial-shuttle", 4980, 390, 120, 18, "x", 130, 210, 0.8)],
  plates: [p("tutorial-plate", 654, 492, 76, 8, "ECHO"), p("crate-plate", 1660, 492, 80, 8, "CRATE"), p("drone-plate", 4580, 492, 80, 8, "DRONE")],
  timedSwitches: [
    { id: "tutorial-timer", ...r(2210, 492, 76, 8), duration: 270, label: "TIME" },
    { id: "laser-timer", ...r(3340, 492, 76, 8), duration: 330, label: "LASER" }
  ],
  doors: [
    { id: "tutorial-gate", ...r(1140, 200, 28, 300), opensWith: ["tutorial-plate"] },
    { id: "crate-gate", ...r(1900, 200, 28, 300), opensWith: ["crate-plate"] },
    { id: "timed-gate", ...r(2520, 200, 28, 300), opensWith: ["tutorial-timer"] },
    { id: "core-gate", ...r(3180, 200, 28, 300), opensWith: [], requiresCore: "tutorial-major-core" }
  ],
  crates: [
    { id: "tutorial-crate", ...r(1400, 460, 40, 40) },
    { id: "drone-crate", ...r(4380, 460, 40, 40) }
  ],
  cores: [
    { id: "tutorial-core-a", ...r(620, 392, 20, 20), label: "T" },
    { id: "tutorial-core-b", ...r(1470, 420, 20, 20), label: "T" },
    { id: "tutorial-core-c", ...r(2240, 402, 20, 20), label: "T" },
    { id: "tutorial-major-core", ...r(2888, 398, 24, 24), label: "KEY", size: "large" },
    { id: "tutorial-core-d", ...r(3820, 318, 20, 20), label: "T" },
    { id: "tutorial-core-e", ...r(5050, 350, 20, 20), label: "T" }
  ],
  lasers: [{ id: "tutorial-laser", ...r(3540, 386, 20, 112), startsOn: true, disabledBy: ["laser-timer"] }],
  movingLasers: [
    { id: "tutorial-moving-laser", ...r(3810, 330, 150, 20), axis: "y", beamAxis: "x", distance: 118, period: 220, startsOn: true, disabledBy: ["laser-timer"] }
  ],
  hazards: [h("tutorial-spark-a", 4040, 496, 58, 4), h("tutorial-spark-b", 5280, 496, 58, 4)],
  drones: [d("tutorial-drone", 4820, 472, 30, 24, "x", 130, 210, 0, ["drone-plate"])],
  score: { ...scoreSettingsFromGoldFrames(5400), lives: null },
  hint: "Each station introduces a tool. Echoes, crates, switches, cores, and platforms all change what stays open."
});
