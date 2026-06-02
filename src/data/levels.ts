import type { Level, PatrolDrone, Rect, Solid } from "../game/types";

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
): PatrolDrone => ({ id, x, y, w, h, axis, distance, period, phase });

const bounds = (width: number): Rect => r(0, 0, width, 540);
const frame = (width: number, floorY = 500): Solid[] => [
  s("floor", 0, floorY, width, 60, "dark"),
  s("left-wall", -26, 0, 26, 560, "glass"),
  s("right-wall", width, 0, 26, 560, "glass")
];

export const levels: Level[] = [
  {
    id: "portal-primer",
    index: 0,
    name: "Portal Primer",
    subtitle: "A clean line through the lab",
    start: { x: 58, y: 450 },
    exit: r(2286, 438, 48, 62),
    bounds: bounds(2400),
    solids: [
      ...frame(2400),
      s("step-1", 252, 438, 110, 18),
      s("step-2", 478, 428, 124, 18),
      s("step-3", 772, 400, 134, 18),
      s("tempo-bridge", 1190, 438, 180, 18),
      s("portal-ramp", 1718, 438, 150, 18)
    ],
    hazards: [h("spark-strip-a", 940, 430, 76, 8), h("spark-strip-b", 1870, 430, 86, 8)],
    drones: [d("drone-a", 1430, 420, 30, 24, "x", 92, 190), d("drone-b", 2050, 390, 30, 24, "y", 34, 160, 1.7)],
    perfectEchoes: 0,
    medalFrames: { gold: 2040, silver: 2700 },
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
      ...frame(3000),
      s("ceiling-ledger", 1040, 370, 96, 18),
      s("relay-step", 1540, 444, 132, 18),
      s("final-step", 2280, 430, 150, 18)
    ],
    plates: [p("plate-a", 154, 492, 70, 8)],
    doors: [{ id: "gate-a", ...r(1180, 200, 26, 300), opensWith: ["plate-a"] }],
    drones: [d("drone-c", 1820, 418, 30, 24, "x", 120, 210), d("drone-d", 2520, 418, 30, 24, "x", 90, 170, 1.4)],
    perfectEchoes: 1,
    medalFrames: { gold: 2580, silver: 3360 },
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
      ...frame(3400),
      s("low-block", 296, 438, 78, 18),
      s("mid-ledge", 680, 420, 172, 18),
      s("handoff-ledge", 1380, 398, 172, 18),
      s("upper-rail", 2030, 362, 190, 18),
      s("exit-ledge", 2750, 426, 260, 18)
    ],
    plates: [p("plate-b", 184, 492, 70, 8)],
    doors: [{ id: "gate-b", ...r(1610, 200, 28, 300), opensWith: ["plate-b"] }],
    drones: [d("drone-e", 1080, 390, 30, 24, "y", 40, 150), d("drone-f", 2440, 410, 30, 24, "x", 150, 240, 0.6)],
    perfectEchoes: 1,
    medalFrames: { gold: 3060, silver: 3960 },
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
      ...frame(3600),
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
    cores: [{ id: "core-c", ...r(1046, 466, 24, 24), label: "C" }],
    drones: [d("drone-g", 1640, 420, 30, 24, "x", 110, 180, 1.2), d("drone-h", 3090, 414, 30, 24, "x", 130, 220)],
    perfectEchoes: 1,
    medalFrames: { gold: 3420, silver: 4380 },
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
      ...frame(3400),
      s("left-rise", 210, 432, 110, 18),
      s("right-rise", 840, 392, 266, 18),
      s("sync-ledge", 1480, 420, 160, 18),
      s("upper-transfer", 2100, 374, 220, 18),
      s("landing-run", 2730, 430, 210, 18)
    ],
    platforms: [
      { id: "lift-a", ...r(514, 430, 120, 18), axis: "y", distance: 92, period: 210 },
      { id: "lift-a2", ...r(1830, 438, 120, 18), axis: "y", distance: 72, period: 180, phase: 1.4 }
    ],
    hazards: [h("spark-strip-b", 1190, 430, 118, 8), h("spark-strip-c", 2440, 430, 106, 8)],
    drones: [d("drone-i", 1340, 418, 30, 24, "x", 100, 170), d("drone-j", 2960, 386, 30, 24, "y", 38, 160, 0.8)],
    perfectEchoes: 0,
    medalFrames: { gold: 3000, silver: 3900 },
    hint: "The lift is deterministic. Watch one cycle, then commit."
  },
  {
    id: "laser-shadow",
    index: 5,
    name: "Laser Shadow",
    subtitle: "A ghost can interrupt light",
    start: { x: 58, y: 450 },
    exit: r(3660, 438, 48, 62),
    bounds: bounds(3800),
    solids: [
      ...frame(3800),
      s("laser-step", 304, 438, 96, 18),
      s("safe-step", 666, 438, 96, 18),
      s("scanner-ledge", 1420, 430, 180, 18),
      s("relay-ledge", 2320, 408, 180, 18),
      s("exit-run", 3080, 438, 260, 18)
    ],
    lasers: [
      { id: "beam-a", ...r(414, 458, 230, 12), startsOn: true },
      { id: "beam-a2", ...r(1860, 430, 92, 12), startsOn: true }
    ],
    drones: [d("drone-k", 1160, 416, 30, 24, "x", 115, 200, 0.5), d("drone-l", 2720, 412, 30, 24, "x", 120, 220, 1.1)],
    perfectEchoes: 1,
    medalFrames: { gold: 3720, silver: 4860 },
    hint: "Record an echo that falls into the beam, then cross while that echo interrupts the light."
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
      ...frame(4000),
      s("center-hop", 690, 438, 112, 18),
      s("right-hop", 1130, 426, 94, 18),
      s("relay-hop", 1760, 438, 140, 18),
      s("exit-hop", 3100, 430, 190, 18)
    ],
    plates: [p("plate-d1", 150, 492, 64, 8), p("plate-d2", 322, 492, 64, 8)],
    doors: [{ id: "gate-d", ...r(2780, 200, 28, 300), opensWith: ["plate-d1", "plate-d2"] }],
    drones: [d("drone-m", 1480, 416, 30, 24, "x", 160, 230), d("drone-n", 2350, 384, 30, 24, "y", 42, 170, 2.1)],
    perfectEchoes: 2,
    medalFrames: { gold: 4200, silver: 5460 },
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
      ...frame(4200),
      s("plate-ledge", 172, 420, 132, 18),
      s("core-ledge", 940, 352, 128, 18),
      s("exit-ledge", 1560, 374, 176, 18),
      s("current-ledge", 2380, 430, 190, 18),
      s("final-ledge", 3340, 438, 220, 18)
    ],
    platforms: [
      { id: "lift-b", ...r(1210, 442, 104, 18), axis: "y", distance: 86, period: 180, phase: 1.5 },
      { id: "shuttle-b", ...r(2840, 438, 112, 18), axis: "x", distance: 110, period: 210, phase: 0.4 }
    ],
    plates: [p("plate-e", 196, 492, 68, 8)],
    doors: [{ id: "gate-e", ...r(1860, 200, 28, 300), opensWith: ["plate-e"], requiresCore: "core-e" }],
    cores: [{ id: "core-e", ...r(994, 466, 24, 24), label: "E" }],
    drones: [d("drone-o", 2120, 414, 30, 24, "x", 140, 220), d("drone-p", 3640, 410, 30, 24, "x", 120, 190, 1.3)],
    perfectEchoes: 1,
    medalFrames: { gold: 4560, silver: 5940 },
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
      ...frame(4200),
      s("upper-left", 190, 420, 140, 18),
      s("upper-mid", 820, 386, 156, 18),
      s("upper-right", 1420, 420, 126, 18),
      s("braid-ledge", 2160, 430, 190, 18),
      s("gate-approach", 3300, 438, 220, 18)
    ],
    platforms: [{ id: "lift-c", ...r(1220, 438, 98, 18), axis: "x", distance: 110, period: 190 }],
    plates: [p("plate-f1", 222, 492, 66, 8), p("plate-f2", 1460, 492, 66, 8)],
    doors: [{ id: "gate-f", ...r(3600, 200, 28, 300), opensWith: ["plate-f1", "plate-f2"], requiresCore: "core-f" }],
    cores: [{ id: "core-f", ...r(876, 466, 24, 24), label: "F" }],
    lasers: [{ id: "beam-f", ...r(620, 430, 104, 12), startsOn: true }],
    drones: [d("drone-q", 1880, 414, 30, 24, "x", 140, 210), d("drone-r", 2840, 382, 30, 24, "y", 46, 170, 1.1)],
    perfectEchoes: 2,
    medalFrames: { gold: 4920, silver: 6360 },
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
      ...frame(5200),
      s("left-perch", 178, 408, 136, 18),
      s("mid-perch", 860, 354, 138, 18),
      s("right-perch", 1540, 342, 196, 18),
      s("floor-pillar", 1260, 418, 64, 42),
      s("sync-bridge", 2260, 430, 190, 18),
      s("drone-bridge", 3180, 410, 220, 18),
      s("final-approach", 4300, 438, 260, 18)
    ],
    platforms: [
      { id: "lift-d", ...r(1180, 438, 110, 18), axis: "y", distance: 92, period: 170 },
      { id: "shuttle-d", ...r(680, 430, 92, 18), axis: "x", distance: 96, period: 150, phase: 0.9 },
      { id: "lift-d2", ...r(3780, 438, 120, 18), axis: "y", distance: 82, period: 210, phase: 1.6 }
    ],
    plates: [p("plate-g1", 210, 492, 68, 8), p("plate-g2", 892, 492, 68, 8), p("plate-g3", 1600, 492, 68, 8)],
    doors: [{ id: "final-gate", ...r(4680, 200, 28, 300), opensWith: ["plate-g1", "plate-g2", "plate-g3"], requiresCore: "core-g" }],
    cores: [{ id: "core-g", ...r(2320, 466, 24, 24), label: "G" }],
    lasers: [{ id: "beam-g", ...r(1880, 430, 112, 12), startsOn: true }],
    drones: [
      d("drone-s", 2700, 412, 30, 24, "x", 150, 220),
      d("drone-t", 3440, 380, 30, 24, "y", 48, 180, 1.7),
      d("drone-u", 4160, 412, 30, 24, "x", 140, 210, 0.4)
    ],
    perfectEchoes: 3,
    medalFrames: { gold: 6600, silver: 8400 },
    hint: "Three echoes hold the perches. Take the lift arc through the core, then cross the open gate."
  }
];

export const getLevel = (index: number): Level => levels[Math.max(0, Math.min(levels.length - 1, index))];
