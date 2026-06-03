import type { Level, MovingPlatform, PatrolDrone, Rect, Solid } from "../game/types";
import { scoreSettingsFromGoldFrames } from "../game/scoring";
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

const sourceLevels: Level[] = [
  {
    id: "portal-primer",
    index: 0,
    name: "Portal Primer",
    subtitle: "A clean line through the lab",
    backgroundKey: "level-1-time-lab-no-portals",
    start: { x: 58, y: 450 },
    exit: r(2286, 438, 48, 62),
    bounds: bounds(2400),
    solids: [
      ...frame(2400, 500, [[1060, 78], [1510, 60], [2020, 70]]),
      s("step-1", 252, 438, 110, 18),
      s("step-2", 478, 428, 124, 18),
      s("step-3", 772, 400, 134, 18),
      s("tempo-bridge", 1190, 350, 180, 18),
      s("portal-ramp", 1718, 438, 150, 18)
    ],
    hazards: [h("spark-strip-a", 1388, 496, 58, 4), h("spark-strip-b", 2140, 496, 58, 4)],
    drones: [d("drone-a", 1430, 472, 30, 24, "x", 92, 190), d("drone-b", 2260, 360, 30, 24, "y", 34, 160, 1.7)],
    score: score(2040),
    hint: "The portal is stable. Keep momentum and hop the discharge strip."
  },
  {
    id: "first-afterimage",
    index: 1,
    name: "First Afterimage",
    subtitle: "One body stays, one body leaves",
    start: { x: 62, y: 450 },
    exit: r(2860, 438, 48, 62),
    bounds: bounds(3000),
    solids: [
      ...frame(3000, 500, [[730, 82], [1370, 78], [1980, 100], [2620, 84]]),
      s("ceiling-ledger", 1040, 370, 96, 18),
      s("relay-step", 1540, 444, 132, 18),
      s("final-step", 2280, 430, 150, 18)
    ],
    plates: [p("plate-a", 154, 492, 70, 8)],
    doors: [{ id: "gate-a", ...r(1180, 200, 26, 300), opensWith: ["plate-a"] }],
    hazards: [h("relay-spark", 2180, 496, 58, 4), h("final-spark", 2520, 496, 58, 4)],
    drones: [d("drone-c", 1820, 472, 30, 24, "x", 120, 210), d("drone-d", 2720, 472, 30, 24, "x", 90, 170, 1.4)],
    score: score(2580),
    hint: "Leave an echo standing on the left pressure plate, then take the open lane."
  },
  {
    id: "held-open",
    index: 2,
    name: "Held Open",
    subtitle: "The door only listens to weight",
    start: { x: 58, y: 450 },
    exit: r(3260, 438, 48, 62),
    bounds: bounds(3400),
    solids: [
      ...frame(3400, 500, [[470, 90], [1000, 90], [1740, 96], [2380, 100], [3060, 78]]),
      s("low-block", 296, 438, 78, 18),
      s("mid-ledge", 680, 420, 172, 18),
      s("handoff-ledge", 1380, 398, 172, 18),
      s("upper-rail", 2030, 362, 190, 18),
      s("exit-ledge", 2750, 426, 260, 18)
    ],
    plates: [p("plate-b", 184, 492, 70, 8)],
    doors: [{ id: "gate-b", ...r(1610, 200, 28, 300), opensWith: ["plate-b"] }],
    hazards: [h("handoff-spark", 1180, 496, 58, 4), h("exit-spark", 2650, 496, 58, 4)],
    drones: [d("drone-e", 1080, 360, 30, 24, "y", 30, 150), d("drone-f", 2440, 300, 30, 24, "x", 150, 240, 0.6)],
    score: score(3060),
    hint: "The upper gate closes fast. Make a patient echo on the floor plate."
  },
  {
    id: "relay-key",
    index: 3,
    name: "Relay Key",
    subtitle: "A core behind the first promise",
    start: { x: 56, y: 450 },
    exit: r(3460, 438, 48, 62),
    bounds: bounds(3600),
    solids: [
      ...frame(3600, 500, [[820, 98], [1260, 90], [2100, 90], [2680, 90], [3240, 78]]),
      s("key-ledge", 980, 410, 154, 18),
      s("drop-step", 1380, 438, 82, 18),
      s("core-approach", 1820, 430, 190, 18),
      s("exit-approach", 2860, 438, 220, 18)
    ],
    plates: [p("plate-c", 190, 492, 70, 8)],
    doors: [
      { id: "gate-c", ...r(620, 200, 28, 300), opensWith: ["plate-c"] },
      { id: "core-lock", ...r(2520, 200, 28, 300), requiresCore: "core-c", opensWith: [] }
    ],
    cores: [{ id: "core-c", ...r(930, 466, 24, 24), label: "C" }],
    hazards: [h("core-spark", 1580, 496, 58, 4), h("lock-spark", 2320, 496, 58, 4)],
    drones: [d("drone-g", 1640, 472, 30, 24, "x", 110, 180, 1.2), d("drone-h", 3090, 360, 30, 24, "x", 130, 220)],
    score: score(3420),
    hint: "An echo can hold the first gate while you climb for the core."
  },
  {
    id: "lift-phase",
    index: 4,
    name: "Lift Phase",
    subtitle: "Moving metal keeps its own time",
    start: { x: 58, y: 450 },
    exit: r(3260, 438, 48, 62),
    bounds: bounds(3400),
    solids: [
      ...frame(3400, 500, [[430, 90], [1150, 90], [1720, 90], [2500, 50]]),
      s("left-rise", 210, 432, 110, 18),
      s("right-rise", 840, 392, 266, 18),
      s("sync-ledge", 1480, 360, 160, 18),
      s("upper-transfer", 2100, 374, 220, 18),
      s("landing-run", 2730, 430, 210, 18)
    ],
    platforms: [
      m("lift-a", 514, 430, 120, 18, "y", 92, 210),
      m("lift-a2", 1830, 438, 120, 18, "y", 72, 180, 1.4)
    ],
    drones: [d("drone-i", 1340, 472, 30, 24, "x", 100, 170), d("drone-j", 2960, 444, 30, 24, "y", 38, 160, 0.8)],
    score: score(3000),
    hint: "The lift is deterministic. Watch one cycle, then commit."
  },
  {
    id: "laser-shadow",
    index: 5,
    name: "Laser Shadow",
    subtitle: "Switch light off on cue",
    start: { x: 58, y: 450 },
    exit: r(3660, 438, 48, 62),
    bounds: bounds(3800),
    solids: [
      ...frame(3800, 500, [[660, 70], [1260, 90], [2020, 90], [2860, 90], [3380, 70]]),
      s("laser-step", 304, 360, 96, 18),
      s("safe-step", 666, 360, 96, 18),
      s("scanner-ledge", 1420, 430, 180, 18),
      s("relay-ledge", 2320, 408, 180, 18),
      s("exit-run", 3080, 438, 260, 18)
    ],
    plates: [p("beam-safe", 372, 492, 72, 8)],
    lasers: [
      { id: "beam-a", ...r(414, 458, 230, 12), startsOn: true, disabledBy: ["beam-safe"] },
      { id: "beam-a2", ...r(1860, 496, 58, 4), startsOn: true }
    ],
    drones: [d("drone-k", 1160, 472, 30, 24, "x", 115, 200, 0.5), d("drone-l", 2720, 472, 30, 24, "x", 120, 220, 1.1)],
    score: score(3720),
    hint: "Record an echo on the beam switch, then cross while the plate disables the laser."
  },
  {
    id: "dual-lock",
    index: 6,
    name: "Dual Lock",
    subtitle: "Two echoes, one final gate",
    start: { x: 54, y: 450 },
    exit: r(3860, 438, 48, 62),
    bounds: bounds(4000),
    solids: [
      ...frame(4000, 500, [[520, 96], [960, 96], [1400, 90], [2040, 90], [2920, 90], [3540, 82]]),
      s("center-hop", 690, 438, 112, 18),
      s("right-hop", 1130, 426, 94, 18),
      s("relay-hop", 1760, 438, 140, 18),
      s("exit-hop", 3100, 430, 190, 18)
    ],
    plates: [p("plate-d1", 150, 492, 64, 8), p("plate-d2", 322, 492, 64, 8)],
    doors: [{ id: "gate-d", ...r(2780, 200, 28, 300), opensWith: ["plate-d1", "plate-d2"] }],
    hazards: [h("dual-spark-a", 1600, 496, 58, 4), h("dual-spark-b", 2520, 496, 58, 4)],
    drones: [d("drone-m", 1480, 320, 30, 24, "x", 160, 230), d("drone-n", 2350, 444, 30, 24, "y", 42, 170, 2.1)],
    score: score(4200),
    hint: "Make one echo for each floor plate. The third run is the escape."
  },
  {
    id: "cross-current",
    index: 7,
    name: "Cross Current",
    subtitle: "Core, lift, gate",
    start: { x: 56, y: 450 },
    exit: r(4060, 438, 48, 62),
    bounds: bounds(4200),
    solids: [
      ...frame(4200, 500, [[520, 96], [1120, 90], [1780, 70], [2580, 40], [3120, 90], [3740, 82]]),
      s("plate-ledge", 172, 420, 132, 18),
      s("core-ledge", 940, 352, 128, 18),
      s("exit-ledge", 1560, 374, 176, 18),
      s("current-ledge", 2380, 350, 190, 18),
      s("final-ledge", 3340, 438, 220, 18)
    ],
    platforms: [
      m("lift-b", 1210, 442, 104, 18, "y", 86, 180, 1.5),
      m("shuttle-b", 2840, 438, 112, 18, "x", 110, 210, 0.4)
    ],
    plates: [p("plate-e", 196, 492, 68, 8)],
    doors: [{ id: "gate-e", ...r(1860, 200, 28, 300), opensWith: ["plate-e"], requiresCore: "core-e" }],
    cores: [{ id: "core-e", ...r(994, 466, 24, 24), label: "E" }],
    hazards: [h("current-spark-a", 2050, 496, 58, 4), h("current-spark-b", 3230, 496, 58, 4)],
    drones: [d("drone-o", 2120, 472, 30, 24, "x", 140, 220), d("drone-p", 3640, 320, 30, 24, "x", 120, 190, 1.3)],
    score: score(4560),
    hint: "The gate needs the ledge plate and the core. Split the jobs across time."
  },
  {
    id: "phase-braid",
    index: 8,
    name: "Phase Braid",
    subtitle: "Three lanes share one timeline",
    start: { x: 54, y: 450 },
    exit: r(4060, 438, 48, 62),
    bounds: bounds(4200),
    solids: [
      ...frame(4200, 500, [[520, 92], [1040, 90], [1680, 90], [2460, 90], [3060, 90], [3720, 86]]),
      s("upper-left", 190, 420, 140, 18),
      s("upper-mid", 820, 386, 156, 18),
      s("upper-right", 1420, 420, 126, 18),
      s("braid-ledge", 2160, 430, 190, 18),
      s("gate-approach", 3300, 438, 220, 18)
    ],
    platforms: [m("lift-c", 1220, 438, 98, 18, "x", 110, 190)],
    plates: [p("plate-f1", 222, 492, 66, 8), p("plate-f2", 1460, 492, 66, 8)],
    doors: [{ id: "gate-f", ...r(3600, 200, 28, 300), opensWith: ["plate-f1", "plate-f2"], requiresCore: "core-f" }],
    cores: [{ id: "core-f", ...r(876, 466, 24, 24), label: "F" }],
    lasers: [{ id: "beam-f", ...r(700, 496, 58, 4), startsOn: true }],
    drones: [d("drone-q", 1880, 472, 30, 24, "x", 140, 210), d("drone-r", 2840, 320, 30, 24, "y", 46, 170, 1.1)],
    score: score(4920),
    hint: "Two echoes hold the upper plates. The live route braids through the core and open gate."
  },
  {
    id: "echo-shift",
    index: 9,
    name: "Echo Shift",
    subtitle: "Final synchronization",
    start: { x: 52, y: 450 },
    exit: r(5060, 438, 48, 62),
    bounds: bounds(5200),
    solids: [
      ...frame(5200, 500, [[450, 90], [1030, 90], [1880, 90], [2540, 90], [3560, 90], [4620, 50]]),
      s("left-perch", 178, 408, 136, 18),
      s("mid-perch", 860, 354, 138, 18),
      s("right-perch", 1540, 342, 196, 18),
      s("floor-pillar", 1260, 418, 64, 42),
      s("sync-bridge", 2260, 430, 190, 18),
      s("drone-bridge", 3180, 410, 220, 18),
      s("final-approach", 4300, 438, 260, 18)
    ],
    platforms: [
      m("lift-d", 1180, 438, 110, 18, "y", 92, 170),
      m("shuttle-d", 680, 430, 92, 18, "x", 96, 150, 0.9),
      m("lift-d2", 3780, 438, 120, 18, "y", 82, 210, 1.6)
    ],
    plates: [p("plate-g1", 210, 492, 68, 8), p("plate-g2", 892, 492, 68, 8), p("plate-g3", 1600, 492, 68, 8)],
    doors: [{ id: "final-gate", ...r(4680, 200, 28, 300), opensWith: ["plate-g1", "plate-g2", "plate-g3"], requiresCore: "core-g" }],
    cores: [{ id: "core-g", ...r(2320, 466, 24, 24), label: "G" }],
    lasers: [{ id: "beam-g", ...r(2000, 496, 58, 4), startsOn: true }],
    hazards: [h("final-spark-a", 2860, 496, 58, 4), h("final-spark-b", 4100, 496, 58, 4)],
    drones: [
      d("drone-s", 2700, 320, 30, 24, "x", 150, 220),
      d("drone-t", 3440, 320, 30, 24, "y", 48, 180, 1.7),
      d("drone-u", 4160, 320, 30, 24, "x", 140, 210, 0.4)
    ],
    score: score(6600),
    hint: "Three echoes hold the perches. Take the lift arc through the core, then cross the open gate."
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
