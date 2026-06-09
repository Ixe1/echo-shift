import type { Level, MovingPlatform, PatrolDrone, Rect, Solid } from "../game/types";
import { scoreSettingsFromGoldFrames } from "../game/scoring";
import { level1SpringtideSprint } from "./level-1-springtide-sprint";
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
const p = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });
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
  phase = 0
): PatrolDrone => ({ id, ...anchoredMotionRect(x, y, w, h, axis, distance), axis, distance: distance * 2, period, phase: anchoredPhase(phase) });

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

const bounds = (width: number): Rect => r(0, 0, width, 540);
const score = scoreSettingsFromGoldFrames;
const springtideSprintLevel: Level = level1SpringtideSprint;
const frame = (width: number, floorY = 500, gaps: Array<[number, number]> = []): Solid[] => {
  const floors: Solid[] = [];
  let cursor = 0;
  gaps
    .slice()
    .sort(([a], [b]) => a - b)
    .forEach(([gapX, gapW], index) => {
      if (gapX > cursor) {
        floors.push(s(index === 0 ? "floor" : `floor-${index}`, cursor, floorY, gapX - cursor, 60, "dark"));
      }
      cursor = Math.max(cursor, gapX + gapW);
    });
  if (cursor < width) {
    floors.push(s(floors.length === 0 ? "floor" : `floor-${floors.length}`, cursor, floorY, width - cursor, 60, "dark"));
  }

  return [
    ...floors,
    s("left-wall", -26, 0, 26, 560, "glass"),
    s("right-wall", width, 0, 26, 560, "glass")
  ];
};

const themedFrame = (
  width: number,
  floorY: number,
  gaps: Array<[number, number]>,
  material: NonNullable<Solid["material"]>
): Solid[] =>
  frame(width, floorY, gaps).map((solid) =>
    solid.id.includes("wall")
      ? { ...solid, sprite: "wall" as const, material: "glass-energy" as const }
      : { ...solid, sprite: "floor" as const, material }
  );

const sourceLevels: Level[] = [
  springtideSprintLevel,
  {
    id: "first-afterimage",
    index: 1,
    name: "Rainhouse Relay",
    subtitle: "Hold the door while the storm moves on",
    backgroundKey: "level-2-rainhouse-relay",
    backgroundAmbience: { preset: "maintenance", intensity: 0.34, color: "#50ffc2", drift: 0.42, flicker: 0.18, particles: 0.36 },
    start: { x: 62, y: 450 },
    exit: r(3340, 438, 48, 62),
    bounds: bounds(3400),
    solids: [
      ...frame(3400, 500, [
        [720, 80],
        [1290, 72],
        [1880, 64],
        [2660, 90],
        [3140, 70]
      ]).map((solid) => (solid.id.includes("wall") ? solid : { ...solid, sprite: "floor" as const, material: "copper-corrode" as const })),
      s("start-canopy", 250, 424, 150, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" }),
      s("rain-arc-a", 460, 360, 150, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" }),
      s("rain-arc-b", 660, 300, 130, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
      s("gate-overlook", 920, 390, 170, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" }),
      s("relay-step", 1410, 430, 150, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" }),
      s("lift-catch", 1660, 350, 160, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" }),
      s("storm-rail", 2080, 412, 180, 18, "steel", { sprite: "floor", material: "warning-industrial", collision: "top-only" }),
      s("upper-relay-line", 2380, 302, 230, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
      s("exit-springboard", 2860, 430, 250, 18, "steel", { sprite: "floor", material: "copper-corrode", collision: "top-only" })
    ],
    platforms: [
      m("rain-lift-a", 1580, 410, 112, 18, "y", 86, 190),
      m("relay-shuttle", 2520, 302, 112, 18, "x", 120, 210, 1.1)
    ],
    plates: [p("plate-a", 154, 492, 72, 8)],
    doors: [{ id: "gate-a", ...r(1080, 200, 28, 300), opensWith: ["plate-a"] }],
    cores: [
      { id: "rain-core-a", ...r(500, 320, 20, 20), label: "R" },
      { id: "rain-core-b", ...r(700, 260, 20, 20), label: "R" },
      { id: "rain-core-c", ...r(960, 350, 20, 20), label: "R" },
      { id: "rain-core-d", ...r(1640, 304, 20, 20), label: "R" },
      { id: "rain-core-e", ...r(1740, 304, 20, 20), label: "R" },
      { id: "rain-core-f", ...r(2430, 262, 20, 20), label: "R" },
      { id: "rain-core-g", ...r(2490, 262, 20, 20), label: "R" },
      { id: "rain-core-h", ...r(2550, 262, 20, 20), label: "R" },
      { id: "rain-core-i", ...r(3040, 390, 20, 20), label: "R" }
    ],
    hazards: [h("storm-drain-a", 1480, 496, 58, 4), h("storm-drain-b", 2260, 496, 58, 4), h("final-drain", 2900, 496, 58, 4)],
    drones: [d("drone-c", 1800, 472, 30, 24, "x", 110, 205), d("drone-d", 2820, 260, 30, 24, "y", 48, 190, 1.2)],
    score: score(3180),
    hint: "Leave an echo on the relay plate, then flow through the copper catwalks before the storm drains catch you."
  },
  {
    id: "held-open",
    index: 2,
    name: "Cryo Hold",
    subtitle: "Freeze a gate open with your echo",
    soundtrackKey: "level-3",
    backgroundKey: "level-3-cryo-conservatory",
    backgroundAmbience: { preset: "lab", intensity: 0.34, color: "#8eeaff", drift: 0.22, flicker: 0.1, particles: 0.18 },
    start: { x: 58, y: 450 },
    exit: r(3260, 438, 48, 62),
    bounds: bounds(3400),
    solids: [
      ...themedFrame(3400, 500, [[470, 90], [1000, 90], [1740, 96], [2380, 100], [3060, 78]], "ice-cryo"),
      s("low-block", 296, 438, 78, 18, "glass", { sprite: "block", material: "ice-cryo" }),
      s("mid-ledge", 680, 420, 172, 18, "glass", { sprite: "floor", material: "ice-cryo", collision: "top-only" }),
      s("handoff-ledge", 1380, 398, 172, 18, "glass", { sprite: "floor", material: "ice-cryo", collision: "top-only" }),
      s("upper-rail", 2030, 362, 190, 18, "glass", { sprite: "floor", material: "glass-energy", collision: "top-only" }),
      s("exit-ledge", 2750, 426, 260, 18, "glass", { sprite: "floor", material: "ice-cryo", collision: "top-only" })
    ],
    plates: [p("plate-b", 184, 492, 70, 8)],
    doors: [{ id: "gate-b", ...r(1610, 200, 28, 300), opensWith: ["plate-b"] }],
    hazards: [h("handoff-spark", 1180, 496, 58, 4), h("exit-spark", 2650, 496, 58, 4)],
    drones: [d("drone-e", 1080, 360, 30, 24, "y", 30, 150), d("drone-f", 2440, 300, 30, 24, "x", 150, 240, 0.6)],
    score: score(3060),
    hint: "Leave a patient echo on the frost plate, then cross the cold gaps before the gate seals."
  },
  {
    id: "relay-key",
    index: 3,
    name: "Timber Archive",
    subtitle: "A core behind the old stacks",
    soundtrackKey: "level-4",
    backgroundKey: "level-4-timber-archive",
    backgroundAmbience: { preset: "data", intensity: 0.36, color: "#45f2a2", drift: 0.4, flicker: 0.24, particles: 0.26 },
    start: { x: 56, y: 450 },
    exit: r(3460, 438, 48, 62),
    bounds: bounds(3600),
    solids: [
      ...themedFrame(3600, 500, [[820, 98], [1260, 90], [2100, 90], [2680, 90], [3240, 78]], "wood-archive"),
      s("key-ledge", 980, 410, 154, 18, "steel", { sprite: "floor", material: "wood-archive", collision: "top-only" }),
      s("drop-step", 1380, 438, 82, 18, "steel", { sprite: "floor", material: "wood-archive", collision: "top-only" }),
      s("core-approach", 1820, 430, 190, 18, "steel", { sprite: "floor", material: "wood-archive", collision: "top-only" }),
      s("exit-approach", 2860, 438, 220, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" })
    ],
    plates: [p("plate-c", 190, 492, 70, 8)],
    doors: [
      { id: "gate-c", ...r(620, 200, 28, 300), opensWith: ["plate-c"] },
      { id: "core-lock", ...r(2520, 200, 28, 300), requiresCore: "core-c", opensWith: [] }
    ],
    cores: [{ id: "core-c", ...r(930, 466, 24, 24), label: "C", size: "large" }],
    hazards: [h("core-spark", 1580, 496, 58, 4), h("lock-spark", 2320, 496, 58, 4)],
    drones: [d("drone-g", 1640, 472, 30, 24, "x", 110, 180, 1.2), d("drone-h", 3090, 360, 30, 24, "x", 130, 220)],
    score: score(3420),
    hint: "Hold the archive gate with an echo, then climb the old stacks for the core."
  },
  {
    id: "lift-phase",
    index: 4,
    name: "Sunken Clockwork",
    subtitle: "The final lift moves through buried time",
    soundtrackKey: "level-5",
    backgroundKey: "level-5-sunken-clockwork",
    backgroundAmbience: { preset: "reactor", intensity: 0.24, color: "#ffe35a", drift: 0.18, flicker: 0.32, particles: 0.18 },
    start: { x: 58, y: 450 },
    exit: r(3260, 438, 48, 62),
    bounds: bounds(3400),
    solids: [
      ...themedFrame(3400, 500, [[430, 90], [1150, 90], [1720, 90], [2500, 50]], "sand-ruin"),
      s("left-rise", 210, 432, 110, 18, "steel", { sprite: "floor", material: "sand-ruin", collision: "top-only" }),
      s("right-rise", 840, 392, 266, 18, "steel", { sprite: "floor", material: "sand-ruin", collision: "top-only" }),
      s("sync-ledge", 1480, 360, 160, 18, "steel", { sprite: "floor", material: "warning-industrial", collision: "top-only" }),
      s("upper-transfer", 2100, 374, 220, 18, "steel", { sprite: "floor", material: "sand-ruin", collision: "top-only" }),
      s("landing-run", 2730, 430, 210, 18, "steel", { sprite: "floor", material: "glass-energy", collision: "top-only" })
    ],
    platforms: [
      m("lift-a", 514, 430, 120, 18, "y", 92, 210),
      m("lift-a2", 1830, 438, 120, 18, "y", 72, 180, 1.4)
    ],
    drones: [d("drone-i", 1340, 472, 30, 24, "x", 100, 170), d("drone-j", 2960, 444, 30, 24, "y", 38, 160, 0.8)],
    score: score(3000),
    hint: "Watch one cycle of the buried lifts, then commit across the final clockwork gaps."
  }
];

const cloneLevels = (items: Level[]): Level[] => JSON.parse(JSON.stringify(items)) as Level[];
const runtimeLevelIndex = (index: number): number => {
  if (levels.length === 0) return 0;
  return Math.max(0, Math.min(levels.length - 1, Math.round(index)));
};

export const levels: Level[] = cloneLevels(sourceLevels).map((level) => markAnchoredMotionModel(level));

let draftPlaytestActive = false;

export const setRuntimeLevels = (items: Level[], options: { draftPlaytest?: boolean } = {}): void => {
  levels.splice(0, levels.length, ...cloneLevels(items).map((level) => markAnchoredMotionModel(level)));
  draftPlaytestActive = options.draftPlaytest === true;
};

export const resetRuntimeLevels = (): void => {
  levels.splice(0, levels.length, ...cloneLevels(sourceLevels).map((level) => markAnchoredMotionModel(level)));
  draftPlaytestActive = false;
};

export const isDraftPlaytestActive = (): boolean => draftPlaytestActive;

export const getLevel = (index: number): Level => levels[runtimeLevelIndex(index)];
