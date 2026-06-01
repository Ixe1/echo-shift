import type { Level, Rect, Solid } from "../game/types";

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

const bounds = r(0, 0, 960, 540);
const frame = (floorY = 500): Solid[] => [
  s("floor", 0, floorY, 960, 60, "dark"),
  s("left-wall", -26, 0, 26, 560, "glass"),
  s("right-wall", 960, 0, 26, 560, "glass")
];

export const levels: Level[] = [
  {
    id: "portal-primer",
    index: 0,
    name: "Portal Primer",
    subtitle: "A clean line through the lab",
    start: { x: 58, y: 450 },
    exit: r(866, 438, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("step-1", 252, 454, 110, 18),
      s("step-2", 418, 410, 124, 18),
      s("step-3", 604, 366, 134, 18)
    ],
    hazards: [h("spark-strip-a", 750, 492, 76, 8)],
    perfectEchoes: 0,
    medalFrames: { gold: 1050, silver: 1500 },
    hint: "The portal is stable. Keep momentum and hop the discharge strip."
  },
  {
    id: "first-afterimage",
    index: 1,
    name: "First Afterimage",
    subtitle: "One body stays, one body leaves",
    start: { x: 62, y: 450 },
    exit: r(850, 438, 48, 62),
    bounds,
    solids: [...frame(), s("ceiling-ledger", 604, 370, 96, 18)],
    plates: [p("plate-a", 154, 492, 70, 8)],
    doors: [{ id: "gate-a", ...r(562, 392, 26, 108), opensWith: ["plate-a"] }],
    perfectEchoes: 1,
    medalFrames: { gold: 1320, silver: 1800 },
    hint: "Leave an echo standing on the left pressure plate, then take the open lane."
  },
  {
    id: "held-open",
    index: 2,
    name: "Held Open",
    subtitle: "The door only listens to weight",
    start: { x: 58, y: 450 },
    exit: r(852, 288, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("low-block", 296, 456, 78, 44),
      s("mid-ledge", 452, 398, 172, 18),
      s("exit-ledge", 742, 350, 178, 18)
    ],
    plates: [p("plate-b", 184, 492, 70, 8)],
    doors: [{ id: "gate-b", ...r(664, 260, 28, 108), opensWith: ["plate-b"] }],
    perfectEchoes: 1,
    medalFrames: { gold: 1560, silver: 2100 },
    hint: "The upper gate closes fast. Make a patient echo on the floor plate."
  },
  {
    id: "relay-key",
    index: 3,
    name: "Relay Key",
    subtitle: "A core behind the first promise",
    start: { x: 56, y: 450 },
    exit: r(852, 438, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("key-ledge", 398, 410, 154, 18),
      s("drop-step", 610, 454, 82, 18)
    ],
    plates: [p("plate-c", 190, 492, 70, 8)],
    doors: [
      { id: "gate-c", ...r(338, 392, 28, 108), opensWith: ["plate-c"] },
      { id: "core-lock", ...r(760, 392, 28, 108), requiresCore: "core-c", opensWith: [] }
    ],
    cores: [{ id: "core-c", ...r(466, 370, 24, 24), label: "C" }],
    perfectEchoes: 1,
    medalFrames: { gold: 1740, silver: 2280 },
    hint: "An echo can hold the first gate while you climb for the core."
  },
  {
    id: "lift-phase",
    index: 4,
    name: "Lift Phase",
    subtitle: "Moving metal keeps its own time",
    start: { x: 58, y: 450 },
    exit: r(850, 300, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("left-rise", 210, 432, 110, 18),
      s("right-rise", 696, 362, 210, 18)
    ],
    platforms: [{ id: "lift-a", ...r(414, 430, 120, 18), axis: "y", distance: 92, period: 210 }],
    hazards: [h("spark-strip-b", 548, 492, 118, 8)],
    perfectEchoes: 0,
    medalFrames: { gold: 1500, silver: 2040 },
    hint: "The lift is deterministic. Watch one cycle, then commit."
  },
  {
    id: "laser-shadow",
    index: 5,
    name: "Laser Shadow",
    subtitle: "A ghost can interrupt light",
    start: { x: 58, y: 450 },
    exit: r(850, 438, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("laser-step", 304, 456, 96, 18),
      s("safe-step", 666, 456, 96, 18)
    ],
    lasers: [{ id: "beam-a", ...r(414, 458, 230, 12), startsOn: true }],
    perfectEchoes: 1,
    medalFrames: { gold: 1620, silver: 2220 },
    hint: "Record a run that jumps into the beam, then let the echo shade the crossing."
  },
  {
    id: "dual-lock",
    index: 6,
    name: "Dual Lock",
    subtitle: "Two echoes, one final gate",
    start: { x: 54, y: 450 },
    exit: r(852, 438, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("center-hop", 438, 450, 112, 18),
      s("right-hop", 604, 426, 94, 18)
    ],
    plates: [p("plate-d1", 150, 492, 64, 8), p("plate-d2", 322, 492, 64, 8)],
    doors: [{ id: "gate-d", ...r(736, 392, 28, 108), opensWith: ["plate-d1", "plate-d2"] }],
    perfectEchoes: 2,
    medalFrames: { gold: 2100, silver: 2820 },
    hint: "Make one echo for each floor plate. The third run is the escape."
  },
  {
    id: "cross-current",
    index: 7,
    name: "Cross Current",
    subtitle: "Core, lift, gate",
    start: { x: 56, y: 450 },
    exit: r(852, 312, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("plate-ledge", 172, 420, 132, 18),
      s("core-ledge", 414, 352, 128, 18),
      s("exit-ledge", 742, 374, 176, 18)
    ],
    platforms: [{ id: "lift-b", ...r(574, 442, 104, 18), axis: "y", distance: 86, period: 180, phase: 1.5 }],
    plates: [p("plate-e", 196, 412, 68, 8)],
    doors: [{ id: "gate-e", ...r(682, 284, 28, 108), opensWith: ["plate-e"], requiresCore: "core-e" }],
    cores: [{ id: "core-e", ...r(468, 314, 24, 24), label: "E" }],
    perfectEchoes: 1,
    medalFrames: { gold: 2160, silver: 3000 },
    hint: "The gate needs the ledge plate and the core. Split the jobs across time."
  },
  {
    id: "phase-braid",
    index: 8,
    name: "Phase Braid",
    subtitle: "Three lanes share one timeline",
    start: { x: 54, y: 450 },
    exit: r(852, 438, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("upper-left", 190, 382, 140, 18),
      s("upper-mid", 410, 330, 146, 18),
      s("upper-right", 666, 386, 126, 18)
    ],
    platforms: [{ id: "lift-c", ...r(560, 438, 98, 18), axis: "x", distance: 70, period: 190 }],
    plates: [p("plate-f1", 222, 374, 66, 8), p("plate-f2", 698, 378, 66, 8)],
    doors: [{ id: "gate-f", ...r(808, 392, 28, 108), opensWith: ["plate-f1", "plate-f2"], requiresCore: "core-f" }],
    cores: [{ id: "core-f", ...r(466, 292, 24, 24), label: "F" }],
    lasers: [{ id: "beam-f", ...r(340, 462, 194, 12), startsOn: true }],
    perfectEchoes: 2,
    medalFrames: { gold: 2700, silver: 3540 },
    hint: "One echo shades the lower beam. Another can wait on the high plate."
  },
  {
    id: "echo-shift",
    index: 9,
    name: "Echo Shift",
    subtitle: "Final synchronization",
    start: { x: 52, y: 450 },
    exit: r(856, 280, 48, 62),
    bounds,
    solids: [
      ...frame(),
      s("left-perch", 178, 408, 136, 18),
      s("mid-perch", 388, 354, 138, 18),
      s("right-perch", 702, 342, 196, 18),
      s("floor-pillar", 618, 446, 64, 54)
    ],
    platforms: [
      { id: "lift-d", ...r(542, 438, 110, 18), axis: "y", distance: 92, period: 170 },
      { id: "shuttle-d", ...r(318, 454, 92, 18), axis: "x", distance: 62, period: 150, phase: 0.9 }
    ],
    plates: [p("plate-g1", 210, 400, 68, 8), p("plate-g2", 420, 346, 68, 8), p("plate-g3", 728, 334, 68, 8)],
    doors: [{ id: "final-gate", ...r(812, 252, 28, 108), opensWith: ["plate-g1", "plate-g2", "plate-g3"], requiresCore: "core-g" }],
    cores: [{ id: "core-g", ...r(640, 404, 24, 24), label: "G" }],
    lasers: [{ id: "beam-g", ...r(526, 462, 170, 12), startsOn: true }],
    perfectEchoes: 3,
    medalFrames: { gold: 3300, silver: 4380 },
    hint: "The final gate wants three plates and the core. Record deliberate jobs."
  }
];

export const getLevel = (index: number): Level => levels[Math.max(0, Math.min(levels.length - 1, index))];
