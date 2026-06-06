import { levels as sourceLevels } from "../data/levels";
import { EDITOR_DRAFT_STORAGE_KEY } from "../data/editorDraft";
import { ANCHORED_MOTION_MODEL, markAnchoredMotionModel, normalizeLevelMotionModel, usesAnchoredMotionModel } from "../data/motionModel";
import {
  backgroundAmbiencePresetLabels,
  backgroundAmbiencePresets,
  defaultBackgroundAmbienceForPreset,
  isBackgroundAmbienceColor,
  isBackgroundAmbiencePreset,
  normalizeBackgroundAmbience
} from "../game/backgroundAmbience";
import { backgroundForLevel, isLevelBackgroundKey, levelBackgroundKeys, levelBackgrounds } from "../game/backgrounds";
import {
  bossEntrySides,
  bossKinds,
  bossWeakSpots,
  monsterKinds,
  normalizeBossEntrySide,
  normalizeBossKind,
  normalizeBossWeakSpot,
  normalizeMonsterKind,
  normalizeMonsterVulnerability
} from "../game/enemies";
import { doorRequiredCoreIds, isMajorCore, movingLaserBeamAxis } from "../game/objects";
import { normalizeScoreSettings } from "../game/scoring";
import { normalizeSolidCollision, solidCollisionFor, solidCollisionValues, solidHasGameplayCollision } from "../game/solidCollision";
import { solidRenderDepth } from "../game/solidRenderOrder";
import { normalizeSolid, normalizeSolidSprite, solidSpriteValues } from "../game/solidSprites";
import { defaultSoundtrackKeyForLevel, isLevelSoundtrackKey, levelSoundtrackKeys, soundtracks } from "../game/soundtracks";
import { normalizeTerrainMaterial, terrainMaterialForSolid, terrainMaterialLabels, terrainMaterialValues } from "../game/terrainMaterials";
import type {
  Conveyor,
  Boss,
  BossEntrySide,
  BossWeakSpot,
  Core,
  Door,
  EchoSensor,
  Hazard,
  LaunchPad,
  Laser,
  Level,
  LevelBackgroundAmbience,
  LevelBackgroundAmbiencePreset,
  MovingLaser,
  MovingPlatform,
  Monster,
  MonsterKind,
  MonsterVulnerability,
  OneWayPlatform,
  PatrolDrone,
  PressurePlate,
  PushableCrate,
  Rect,
  Solid,
  TimedSwitch,
  Vec2
} from "../game/types";
import "./levelEditor.css";

const rectCollections = [
  "solids",
  "oneWays",
  "conveyors",
  "platforms",
  "hazards",
  "launchPads",
  "plates",
  "timedSwitches",
  "echoSensors",
  "doors",
  "lasers",
  "movingLasers",
  "cores",
  "drones",
  "crates",
  "monsters",
  "bosses"
] as const;
type RectCollection = (typeof rectCollections)[number];
type RectObject =
  | Solid
  | OneWayPlatform
  | Conveyor
  | MovingPlatform
  | Hazard
  | LaunchPad
  | PressurePlate
  | TimedSwitch
  | EchoSensor
  | Door
  | Laser
  | MovingLaser
  | Core
  | PatrolDrone
  | PushableCrate
  | Monster
  | Boss;
type SelectableKind = RectCollection | "start" | "exit";
type Tool = SelectableKind | "select";
type PlaceableTool = Exclude<Tool, "select">;
type SolidPreset = "floor" | "wall" | "block";
type PalettePlacement = {
  tool: PlaceableTool;
  preset: SolidPreset | null;
};
type EditorPanel = "inspect" | "objects" | "validation" | "export";
type ValidationSeverity = "error" | "warning";
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type MovingKind = "platforms" | "drones" | "movingLasers";
type PathableObject = MovingPlatform | PatrolDrone | MovingLaser | Monster;
type PathEndpoint = "start" | "end";
type SelectOption = string | { value: string; label: string };

type Selection =
  | { kind: "start" }
  | { kind: "exit" }
  | {
      kind: RectCollection;
      id: string;
    };

type DragState =
  | {
      mode: "pan";
      pointerStart: Vec2;
      viewStart: Vec2;
    }
  | {
      mode: "move";
      selection: Selection;
      pointerStartWorld: Vec2;
      startRect: Rect;
    }
  | {
      mode: "resize";
      selection: Selection;
      handle: ResizeHandle;
      pointerStartWorld: Vec2;
      startRect: Rect;
    }
  | {
      mode: "path";
      selection: {
        kind: MovingKind;
        id: string;
      };
      endpoint: PathEndpoint;
    }
  | {
      mode: "create";
      kind: RectCollection;
      id: string;
      preset: SolidPreset | null;
      origin: Vec2;
      startRect: Rect;
    };

type ValidationMessage = {
  severity: ValidationSeverity;
  text: string;
};

type EditorDraft = {
  motionModel: typeof ANCHORED_MOTION_MODEL;
  levels: Level[];
  currentIndex: number;
};

const GRID = 20;
const MIN_RECT_SIZE = GRID;
const HIT_TOLERANCE_PX = 8;
const SURFACE_SNAP_DISTANCE = 24;
const PLAYER_RECT = { w: 24, h: 34 };
const CLOSED_GATE_MAX_TOP = 220;

const collectionLabels: Record<RectCollection, string> = {
  solids: "Solids",
  oneWays: "One-Ways",
  conveyors: "Conveyors",
  platforms: "Platforms",
  hazards: "Hazards",
  launchPads: "Launch Pads",
  plates: "Plates",
  timedSwitches: "Timed Switches",
  echoSensors: "Echo Sensors",
  doors: "Doors",
  lasers: "Lasers",
  cores: "Cores",
  drones: "Drones",
  movingLasers: "Moving Lasers",
  crates: "Crates",
  monsters: "Monsters",
  bosses: "Boss Arenas"
};

const toolLabels: Record<Tool, string> = {
  select: "Select",
  start: "Start",
  exit: "Exit",
  solids: "Solid",
  oneWays: "One-Way",
  conveyors: "Conveyor",
  platforms: "Platform",
  hazards: "Hazard",
  launchPads: "Launch Pad",
  plates: "Plate",
  timedSwitches: "Timed Switch",
  echoSensors: "Echo Sensor",
  doors: "Door",
  lasers: "Laser",
  cores: "Core",
  drones: "Drone",
  movingLasers: "Moving Laser",
  crates: "Crate",
  monsters: "Monster",
  bosses: "Boss Arena"
};

const objectIdStems: Record<RectCollection, string> = {
  solids: "solid",
  oneWays: "one-way",
  conveyors: "conveyor",
  platforms: "platform",
  hazards: "hazard",
  launchPads: "launch-pad",
  plates: "plate",
  timedSwitches: "timed-switch",
  echoSensors: "echo-sensor",
  doors: "door",
  lasers: "laser",
  movingLasers: "moving-laser",
  cores: "core",
  drones: "drone",
  crates: "crate",
  monsters: "monster",
  bosses: "boss"
};

const solidPresetLabels: Record<SolidPreset, string> = {
  floor: "Floor",
  wall: "Wall",
  block: "Block"
};

const solidPresetIdStems: Record<SolidPreset, string> = {
  floor: "floorpiece",
  wall: "wall",
  block: "block"
};

const terrainMaterialOptions: SelectOption[] = [
  { value: "", label: "legacy/default" },
  ...terrainMaterialValues.map((value) => ({ value, label: terrainMaterialLabels[value] }))
];

const solidCollisionOptions: SelectOption[] = [
  { value: "", label: "default/solid" },
  ...solidCollisionValues.map((value) => ({ value, label: value }))
];

const cloneLevels = (items: Level[]): Level[] => JSON.parse(JSON.stringify(items)) as Level[];

const exportableLevels = (items: Level[]): Level[] =>
  cloneLevels(items).map((level, index) => markAnchoredMotionModel({ ...level, index }));

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const snap = (value: number): number => Math.round(value / GRID) * GRID;

const snapSize = (value: number, minimum = GRID): number => Math.max(minimum, snap(value));

const snapPoint = (point: Vec2): Vec2 => ({
  x: snap(point.x),
  y: snap(point.y)
});

const resizeRectOnGrid = (startRect: Rect, handle: ResizeHandle, dx: number, dy: number): Rect => {
  let { x, y, w, h } = startRect;

  if (handle.includes("w")) {
    const right = startRect.x + startRect.w;
    w = snapSize(right - (startRect.x + dx), MIN_RECT_SIZE);
    x = right - w;
  } else if (handle.includes("e")) {
    w = snapSize(startRect.w + dx, MIN_RECT_SIZE);
  }

  if (handle.includes("n")) {
    const bottom = startRect.y + startRect.h;
    h = snapSize(bottom - (startRect.y + dy), MIN_RECT_SIZE);
    y = bottom - h;
  } else if (handle.includes("s")) {
    h = snapSize(startRect.h + dy, MIN_RECT_SIZE);
  }

  return { x, y, w, h };
};

const positiveNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const numberValue = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const nonNegativeNumber = (value: unknown, fallback: number): number => Math.max(0, positiveNumber(value, fallback));

const nonNegativeInteger = (value: unknown, fallback: number): number => Math.max(0, Math.round(positiveNumber(value, fallback)));

const positiveInteger = (value: unknown, fallback: number): number => Math.max(1, Math.round(positiveNumber(value, fallback)));

const levelIndex = (value: unknown, maxIndex: number, fallback = 0): number => clamp(nonNegativeInteger(value, fallback), 0, Math.max(0, maxIndex));

const scoreSummary = (level: Level): string =>
  `${level.score.lives === null ? "Unlimited lives" : `${level.score.lives} lives`}; +${level.score.timeBonusPerSecond} per full second under ${level.score.timeBonusTargetSeconds}s`;

const csvToList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const listToCsv = (value: string[] | undefined): string => (value || []).join(", ");

const replaceReferenceList = (value: string[] | undefined, previousId: string, nextId: string): string[] => [
  ...new Set((value || []).map((item) => (item === previousId ? nextId : item)))
];

const rectContainsWithTolerance = (rect: Rect, point: Vec2, tolerance: number): boolean =>
  point.x >= rect.x - tolerance &&
  point.x <= rect.x + rect.w + tolerance &&
  point.y >= rect.y - tolerance &&
  point.y <= rect.y + rect.h + tolerance;

const pointDistance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

const rectsOverlapX = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x;

const rectInside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const normalizeRect = (rect: Rect): Rect => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  w: Math.max(1, Math.round(rect.w)),
  h: Math.max(1, Math.round(rect.h))
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const styleForKind = (kind: SelectableKind, item?: RectObject): { fill: string; stroke: string; text: string } => {
  if (kind === "start") return { fill: "rgba(67, 247, 255, 0.82)", stroke: "#ecfbff", text: "#041018" };
  if (kind === "exit") return { fill: "rgba(189, 92, 255, 0.34)", stroke: "#43f7ff", text: "#ecfbff" };
  if (kind === "solids") {
    const solid = item as Solid | undefined;
    if (solid) {
      const material = terrainMaterialForSolid(solid);
      if (material === "metal-lab") return { fill: "#17243a", stroke: "#43f7ff", text: "#ecfbff" };
      if (material === "glass-energy") return { fill: "#143447", stroke: "#43f7ff", text: "#ecfbff" };
      if (material === "warning-industrial") return { fill: "#473b18", stroke: "#ffe35a", text: "#fff8bf" };
      if (material === "grass-organic") return { fill: "#214a2d", stroke: "#6eca70", text: "#f2ffd8" };
      if (material === "sand-ruin") return { fill: "#5d4d31", stroke: "#d8bd76", text: "#fff1b5" };
      if (material === "ice-cryo") return { fill: "#244b62", stroke: "#b8f2ff", text: "#f2fdff" };
      if (material === "wood-archive") return { fill: "#4f2f1b", stroke: "#e0af67", text: "#fff1d0" };
      if (material === "copper-corrode") return { fill: "#4d3127", stroke: "#50ffc2", text: "#eafff8" };
    }
    const sprite = solid?.sprite;
    if (sprite === "wall") return { fill: "#111827", stroke: "#4b607c", text: "#ecfbff" };
    if (sprite === "block") return { fill: "#143447", stroke: "#43f7ff", text: "#ecfbff" };
    if (sprite === "warning") return { fill: "#473b18", stroke: "#ffe35a", text: "#fff8bf" };
    const tone = solid?.tone;
    if (tone === "dark") return { fill: "#111827", stroke: "#4b607c", text: "#ecfbff" };
    if (tone === "warning") return { fill: "#473b18", stroke: "#ffe35a", text: "#fff8bf" };
    if (tone === "glass") return { fill: "#143447", stroke: "#43f7ff", text: "#ecfbff" };
    return { fill: "#17243a", stroke: "#43f7ff", text: "#ecfbff" };
  }
  if (kind === "oneWays") return { fill: "rgba(80, 255, 194, 0.22)", stroke: "#50ffc2", text: "#ecfbff" };
  if (kind === "conveyors") return { fill: "rgba(255, 227, 90, 0.28)", stroke: "#ffe35a", text: "#05070d" };
  if (kind === "platforms") return { fill: "#25344d", stroke: "#ffe35a", text: "#fff8bf" };
  if (kind === "hazards") return { fill: "rgba(255, 79, 139, 0.42)", stroke: "#ff4f8b", text: "#fff" };
  if (kind === "launchPads") return { fill: "rgba(80, 255, 194, 0.36)", stroke: "#50ffc2", text: "#041018" };
  if (kind === "plates") return { fill: "rgba(255, 227, 90, 0.72)", stroke: "#fff4a0", text: "#05070d" };
  if (kind === "timedSwitches") return { fill: "rgba(189, 92, 255, 0.42)", stroke: "#bd5cff", text: "#ecfbff" };
  if (kind === "echoSensors") return { fill: "rgba(80, 255, 194, 0.13)", stroke: "#bd5cff", text: "#ecfbff" };
  if (kind === "doors") return { fill: "rgba(189, 92, 255, 0.28)", stroke: "#ff4f8b", text: "#ecfbff" };
  if (kind === "lasers") return { fill: "rgba(255, 47, 108, 0.62)", stroke: "#ff4f8b", text: "#fff" };
  if (kind === "movingLasers") return { fill: "rgba(255, 47, 108, 0.48)", stroke: "#ff4f8b", text: "#fff" };
  if (kind === "cores") return { fill: "rgba(255, 227, 90, 0.8)", stroke: "#ecfbff", text: "#05070d" };
  if (kind === "crates") return { fill: "rgba(255, 227, 90, 0.32)", stroke: "#ffe35a", text: "#fff8bf" };
  if (kind === "monsters") return { fill: "rgba(110, 202, 112, 0.48)", stroke: "#6eca70", text: "#041018" };
  if (kind === "bosses") return { fill: "rgba(255, 227, 90, 0.12)", stroke: "#ffe35a", text: "#fff8bf" };
  return { fill: "rgba(255, 79, 139, 0.5)", stroke: "#ff4f8b", text: "#fff" };
};

const defaultSizeFor = (kind: RectCollection, solidPreset: SolidPreset | null = null): { w: number; h: number } => {
  switch (kind) {
    case "solids":
      if (solidPreset === "floor") return { w: 320, h: 20 };
      if (solidPreset === "wall") return { w: 20, h: 180 };
      if (solidPreset === "block") return { w: 80, h: 80 };
      return { w: 180, h: 20 };
    case "oneWays":
      return { w: 140, h: 16 };
    case "conveyors":
      return { w: 180, h: 20 };
    case "platforms":
      return { w: 120, h: 20 };
    case "hazards":
      return { w: 60, h: 20 };
    case "launchPads":
      return { w: 80, h: 20 };
    case "plates":
      return { w: 80, h: 20 };
    case "timedSwitches":
      return { w: 80, h: 20 };
    case "echoSensors":
      return { w: 120, h: 80 };
    case "doors":
      return { w: 20, h: 300 };
    case "lasers":
      return { w: 140, h: 20 };
    case "movingLasers":
      return { w: 20, h: 140 };
    case "cores":
      return { w: 20, h: 20 };
    case "drones":
      return { w: 40, h: 20 };
    case "crates":
      return { w: 40, h: 40 };
    case "monsters":
      return { w: 36, h: 30 };
    case "bosses":
      return { w: 560, h: 320 };
  }
};

const movingPath = (item: PathableObject): { start: number; end: number; center: number; speed: number } => {
  const axis = item.axis === "y" ? "y" : "x";
  const start = axis === "x" ? item.x : item.y;
  const distance = nonNegativeNumber(item.distance, 0);
  const period = positiveNumber(item.period, 180);
  const end = start + distance;
  return {
    start,
    end,
    center: start,
    speed: period > 0 ? Math.round((120 * distance) / period) : 0
  };
};

const movingPathPoints = (item: MovingPlatform | PatrolDrone | MovingLaser): { start: Vec2; end: Vec2 } => {
  const distance = nonNegativeNumber(item.distance, 0);
  return {
    start:
      item.axis === "x"
        ? { x: item.x, y: item.y + item.h / 2 }
        : { x: item.x + item.w / 2, y: item.y },
    end:
      item.axis === "x"
        ? { x: item.x + distance, y: item.y + item.h / 2 }
        : { x: item.x + item.w / 2, y: item.y + distance }
  };
};

const alignMovingLaserRectToBeam = <T extends MovingLaser>(laser: T): T => {
  const centerX = laser.x + laser.w / 2;
  const centerY = laser.y + laser.h / 2;
  const span = Math.max(laser.w, laser.h);
  const cross = Math.min(laser.w, laser.h);
  const beamAxis = movingLaserBeamAxis(laser);
  laser.w = beamAxis === "x" ? span : cross;
  laser.h = beamAxis === "x" ? cross : span;
  laser.x = centerX - laser.w / 2;
  laser.y = centerY - laser.h / 2;
  return laser;
};

const setMovingPath = (
  item: PathableObject,
  nextStart: number,
  nextEnd: number
): void => {
  const snappedStart = snap(nextStart);
  const snappedEnd = snap(nextEnd);
  const start = Math.min(snappedStart, snappedEnd);
  const end = Math.max(snappedStart, snappedEnd);
  item.distance = Math.max(0, end - start);
  if (item.axis !== "y") item.x = start;
  else item.y = start;
};

const resizeHandlesForRect = (rect: Rect): Array<{ handle: ResizeHandle; point: Vec2 }> => [
  { handle: "nw", point: { x: rect.x, y: rect.y } },
  { handle: "n", point: { x: rect.x + rect.w / 2, y: rect.y } },
  { handle: "ne", point: { x: rect.x + rect.w, y: rect.y } },
  { handle: "e", point: { x: rect.x + rect.w, y: rect.y + rect.h / 2 } },
  { handle: "se", point: { x: rect.x + rect.w, y: rect.y + rect.h } },
  { handle: "s", point: { x: rect.x + rect.w / 2, y: rect.y + rect.h } },
  { handle: "sw", point: { x: rect.x, y: rect.y + rect.h } },
  { handle: "w", point: { x: rect.x, y: rect.y + rect.h / 2 } }
];

const readCollection = (level: Level, kind: RectCollection): RectObject[] => {
  if (kind === "solids") return level.solids;
  return ((level as unknown as Record<RectCollection, RectObject[] | undefined>)[kind] || []) as RectObject[];
};

const ensureCollection = (level: Level, kind: RectCollection): RectObject[] => {
  if (kind === "solids") return level.solids;
  const record = level as unknown as Record<RectCollection, RectObject[] | undefined>;
  record[kind] ||= [];
  return record[kind] || [];
};

const objectIdStem = (kind: RectCollection): string => objectIdStems[kind];

const normalizedObjectIdValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalizedCoreSize = (value: unknown): Core["size"] =>
  value === "small" || value === "large" ? value : undefined;

const explicitImportedObjectIds = (value: Record<string, unknown>): Set<string> => {
  const ids = new Set<string>();
  for (const kind of rectCollections) {
    const collection = value[kind];
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!isRecord(item)) continue;
      const id = normalizedObjectIdValue(item.id);
      if (id) ids.add(id);
    }
  }
  return ids;
};

const nextImportedObjectId = (kind: RectCollection, usedIds: Set<string>): string => {
  const stem = objectIdStem(kind);
  let index = 1;
  let id = `${stem}-${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `${stem}-${index}`;
  }
  usedIds.add(id);
  return id;
};

const normalizeImportedLevel = (value: unknown, fallbackIndex: number, draftAnchored = false): Level | null => {
  if (!isRecord(value)) return null;
  const boundsRecord = isRecord(value.bounds) ? value.bounds : {};
  const exitRecord = isRecord(value.exit) ? value.exit : {};
  const startRecord = isRecord(value.start) ? value.start : {};
  const medalRecord = isRecord(value.medalFrames) ? value.medalFrames : {};
  const scoreSettings = normalizeScoreSettings(value.score, medalRecord.gold);
  const usedObjectIds = explicitImportedObjectIds(value);
  const importedSoundtrackKey = isLevelSoundtrackKey(value.soundtrackKey) ? value.soundtrackKey : undefined;
  const importedBackgroundKey = isLevelBackgroundKey(value.backgroundKey) ? value.backgroundKey : undefined;
  const importedBackgroundAmbience = isRecord(value.backgroundAmbience)
    ? normalizeBackgroundAmbience(value.backgroundAmbience as LevelBackgroundAmbience)
    : undefined;
  const anchoredMotion = draftAnchored || usesAnchoredMotionModel(value);

  const level: Level = {
    id: String(value.id || `level-${fallbackIndex + 1}`),
    index: nonNegativeInteger(value.index, fallbackIndex),
    name: String(value.name || `Level ${fallbackIndex + 1}`),
    subtitle: String(value.subtitle || ""),
    motionModel: ANCHORED_MOTION_MODEL,
    ...(importedSoundtrackKey ? { soundtrackKey: importedSoundtrackKey } : {}),
    ...(importedBackgroundKey ? { backgroundKey: importedBackgroundKey } : {}),
    ...(importedBackgroundAmbience ? { backgroundAmbience: importedBackgroundAmbience } : {}),
    start: {
      x: positiveNumber(startRecord.x, 60),
      y: positiveNumber(startRecord.y, 450)
    },
    exit: normalizeRect({
      x: positiveNumber(exitRecord.x, 860),
      y: positiveNumber(exitRecord.y, 438),
      w: positiveNumber(exitRecord.w, 48),
      h: positiveNumber(exitRecord.h, 62)
    }),
    bounds: normalizeRect({
      x: positiveNumber(boundsRecord.x, 0),
      y: positiveNumber(boundsRecord.y, 0),
      w: positiveNumber(boundsRecord.w, 960),
      h: positiveNumber(boundsRecord.h, 540)
    }),
    solids: Array.isArray(value.solids) ? (value.solids as Solid[]).map((item) => normalizeObject(item, "solids", usedObjectIds)) : [],
    oneWays: normalizeOptionalCollection(value.oneWays, "oneWays", usedObjectIds) as OneWayPlatform[],
    conveyors: normalizeOptionalCollection(value.conveyors, "conveyors", usedObjectIds) as Conveyor[],
    platforms: normalizeOptionalCollection(value.platforms, "platforms", usedObjectIds) as MovingPlatform[],
    launchPads: normalizeOptionalCollection(value.launchPads, "launchPads", usedObjectIds) as LaunchPad[],
    drones: normalizeOptionalCollection(value.drones, "drones", usedObjectIds) as PatrolDrone[],
    plates: normalizeOptionalCollection(value.plates, "plates", usedObjectIds) as PressurePlate[],
    timedSwitches: normalizeOptionalCollection(value.timedSwitches, "timedSwitches", usedObjectIds) as TimedSwitch[],
    echoSensors: normalizeOptionalCollection(value.echoSensors, "echoSensors", usedObjectIds) as EchoSensor[],
    doors: normalizeOptionalCollection(value.doors, "doors", usedObjectIds) as Door[],
    lasers: normalizeOptionalCollection(value.lasers, "lasers", usedObjectIds) as Laser[],
    movingLasers: normalizeOptionalCollection(value.movingLasers, "movingLasers", usedObjectIds) as MovingLaser[],
    cores: normalizeOptionalCollection(value.cores, "cores", usedObjectIds) as Core[],
    hazards: normalizeOptionalCollection(value.hazards, "hazards", usedObjectIds) as Hazard[],
    crates: normalizeOptionalCollection(value.crates, "crates", usedObjectIds) as PushableCrate[],
    monsters: normalizeOptionalCollection(value.monsters, "monsters", usedObjectIds) as Monster[],
    bosses: normalizeOptionalCollection(value.bosses, "bosses", usedObjectIds) as Boss[],
    score: scoreSettings,
    hint: String(value.hint || "")
  };

  return normalizeLevelMotionModel(level, anchoredMotion);
};

const normalizeOptionalCollection = (value: unknown, kind: RectCollection, usedIds: Set<string>): RectObject[] | undefined =>
  Array.isArray(value) ? value.map((item) => normalizeObject(item, kind, usedIds)) : undefined;

const normalizeObject = (value: unknown, kind: RectCollection, usedIds: Set<string>): RectObject => {
  const record = isRecord(value) ? value : {};
  const base = normalizeRect({
    x: positiveNumber(record.x, 0),
    y: positiveNumber(record.y, 0),
    w: positiveNumber(record.w, defaultSizeFor(kind).w),
    h: positiveNumber(record.h, defaultSizeFor(kind).h)
  });
  const explicitId = normalizedObjectIdValue(record.id);
  const id = explicitId || nextImportedObjectId(kind, usedIds);

  if (kind === "solids") {
    return normalizeSolid({
      ...base,
      id,
      tone: record.tone as Solid["tone"],
      sprite: normalizeSolidSprite(record.sprite),
      material: normalizeTerrainMaterial(record.material),
      collision: normalizeSolidCollision(record.collision)
    });
  }
  if (kind === "conveyors") {
    return {
      ...base,
      id,
      direction: record.direction === -1 || record.direction === "left" ? -1 : 1,
      speed: nonNegativeNumber(record.speed, 1.4)
    } as Conveyor;
  }
  if (kind === "platforms" || kind === "drones" || kind === "movingLasers") {
    const movingObject = {
      ...base,
      id,
      axis: record.axis === "y" ? "y" : "x",
      distance: nonNegativeNumber(record.distance, 100),
      period: positiveInteger(record.period, 180),
      phase: positiveNumber(record.phase, 0),
      ...(kind === "drones" || kind === "movingLasers"
        ? {
            disabledBy: Array.isArray(record.disabledBy) ? record.disabledBy.map(String) : undefined
          }
        : {}),
      ...(kind === "movingLasers"
        ? {
            beamAxis: record.beamAxis === "x" || record.beamAxis === "y" ? record.beamAxis : undefined,
            startsOn: record.startsOn === false ? false : record.startsOn === true ? true : undefined
          }
        : {})
    } as MovingPlatform | PatrolDrone | MovingLaser;
    return kind === "movingLasers" ? alignMovingLaserRectToBeam(movingObject as MovingLaser) : movingObject;
  }
  if (kind === "launchPads") {
    return {
      ...base,
      id,
      powerX: Number.isFinite(Number(record.powerX)) ? Number(record.powerX) : undefined,
      powerY: Math.max(1, positiveNumber(record.powerY, 12))
    } as LaunchPad;
  }
  if (kind === "plates") {
    return {
      ...base,
      id,
      label: typeof record.label === "string" ? record.label : undefined,
      once: record.once === true ? true : undefined
    } as PressurePlate;
  }
  if (kind === "timedSwitches") {
    return {
      ...base,
      id,
      duration: positiveInteger(record.duration, 180),
      label: typeof record.label === "string" ? record.label : undefined
    } as TimedSwitch;
  }
  if (kind === "echoSensors") {
    return {
      ...base,
      id,
      actors: record.actors === "player" || record.actors === "both" ? record.actors : "echo",
      label: typeof record.label === "string" ? record.label : undefined
    } as EchoSensor;
  }
  if (kind === "doors") {
    return {
      ...base,
      id,
      opensWith: Array.isArray(record.opensWith) ? record.opensWith.map(String) : undefined,
      requiresCore: typeof record.requiresCore === "string" ? record.requiresCore : undefined,
      inverted: record.inverted === true ? true : undefined
    } as Door;
  }
  if (kind === "lasers") {
    return {
      ...base,
      id,
      disabledBy: Array.isArray(record.disabledBy) ? record.disabledBy.map(String) : undefined,
      startsOn: record.startsOn === false ? false : record.startsOn === true ? true : undefined
    } as Laser;
  }
  if (kind === "cores") {
    return {
      ...base,
      id,
      label: typeof record.label === "string" ? record.label : undefined,
      size: normalizedCoreSize(record.size)
    } as Core;
  }
  if (kind === "monsters") {
    return {
      ...base,
      id,
      kind: normalizeMonsterKind(record.kind),
      axis: record.axis === "x" || record.axis === "y" ? record.axis : undefined,
      distance: record.axis === "x" || record.axis === "y" ? nonNegativeNumber(record.distance, 100) : undefined,
      period: record.axis === "x" || record.axis === "y" ? positiveInteger(record.period, 180) : undefined,
      phase: record.axis === "x" || record.axis === "y" ? positiveNumber(record.phase, 0) : undefined,
      score: Number.isFinite(Number(record.score)) ? nonNegativeInteger(record.score, 0) : undefined,
      killable: record.killable === false ? false : undefined,
      vulnerableFrom: normalizeMonsterVulnerability(record.vulnerableFrom)
    } as Monster;
  }
  if (kind === "bosses") {
    const checkpointRecord = isRecord(record.checkpoint) ? record.checkpoint : null;
    return {
      ...base,
      id,
      kind: normalizeBossKind(record.kind),
      entrySide: normalizeBossEntrySide(record.entrySide),
      weakSpot: normalizeBossWeakSpot(record.weakSpot),
      checkpoint: checkpointRecord
        ? { x: numberValue(checkpointRecord.x, base.x - 60), y: numberValue(checkpointRecord.y, base.y + base.h - 48) }
        : undefined,
      introSeconds: positiveInteger(record.introSeconds, 17),
      health: positiveInteger(record.health, 3),
      score: Number.isFinite(Number(record.score)) ? nonNegativeInteger(record.score, 0) : undefined
    } as Boss;
  }
  return { ...base, id } as Hazard | OneWayPlatform | PushableCrate;
};

class LevelEditor {
  private readonly host: HTMLElement;
  private levels: Level[];
  private currentIndex = 0;
  private tool: Tool = "select";
  private placementPreset: SolidPreset | null = null;
  private selection: Selection | null = null;
  private activePanel: EditorPanel = "inspect";
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private exportArea!: HTMLTextAreaElement;
  private importArea!: HTMLTextAreaElement;
  private statusElement!: HTMLElement;
  private readonly view: Rect = { x: -60, y: -60, w: 1, h: 1 };
  private readonly handleDocumentKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
  private paletteDragTool: PlaceableTool | null = null;
  private paletteDragPreset: SolidPreset | null = null;
  private drag: DragState | null = null;
  private resizeObserver?: ResizeObserver;
  private hasFitInitialLevel = false;

  constructor(host: HTMLElement) {
    this.host = host;
    const draft = this.loadDraft();
    this.levels = draft?.levels || cloneLevels(sourceLevels);
    this.reindexLevels();
    this.currentIndex = levelIndex(draft?.currentIndex, this.levels.length - 1);
  }

  mount(): void {
    document.body.classList.add("level-editor-mode");
    this.host.innerHTML = this.shellHtml();
    this.canvas = this.require<HTMLCanvasElement>("[data-editor-canvas]");
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Level editor canvas context unavailable");
    this.context = context;
    this.exportArea = this.require<HTMLTextAreaElement>("[data-export-json]");
    this.importArea = this.require<HTMLTextAreaElement>("[data-import-json]");
    this.statusElement = this.require<HTMLElement>("[data-editor-status]");
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.renderCanvas();
    });
    this.resizeObserver.observe(this.canvas);
    this.resizeCanvas();
    this.renderAll();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    document.body.classList.remove("level-editor-mode");
  }

  private get level(): Level {
    return this.levels[this.currentIndex];
  }

  private shellHtml(): string {
    const paletteGroups: Array<{
      label: string;
      tools: Array<{ id: string; tool: Tool; label: string; preset?: SolidPreset; compact?: boolean }>;
    }> = [
      { label: "Cursor", tools: [{ id: "select", tool: "select", label: "Select" }] },
      {
        label: "Structure",
        tools: [
          { id: "floor", tool: "solids", label: "Floor", preset: "floor", compact: true },
          { id: "wall", tool: "solids", label: "Wall", preset: "wall", compact: true },
          { id: "block", tool: "solids", label: "Block", preset: "block", compact: true },
          { id: "solids", tool: "solids", label: "Solid", compact: true },
          { id: "oneWays", tool: "oneWays", label: "One-Way" },
          { id: "conveyors", tool: "conveyors", label: "Conveyor" },
          { id: "platforms", tool: "platforms", label: "Platform" }
        ]
      },
      {
        label: "Hazards",
        tools: [
          { id: "hazards", tool: "hazards", label: "Hazard", compact: true },
          { id: "lasers", tool: "lasers", label: "Laser", compact: true },
          { id: "movingLasers", tool: "movingLasers", label: "Moving Laser" },
          { id: "launchPads", tool: "launchPads", label: "Launch Pad" }
        ]
      },
      {
        label: "Logic",
        tools: [
          { id: "plates", tool: "plates", label: "Plate", compact: true },
          { id: "timedSwitches", tool: "timedSwitches", label: "Timed Switch" },
          { id: "echoSensors", tool: "echoSensors", label: "Echo Sensor" },
          { id: "doors", tool: "doors", label: "Door", compact: true },
          { id: "cores", tool: "cores", label: "Core", compact: true }
        ]
      },
      {
        label: "Actors",
        tools: [
          { id: "drones", tool: "drones", label: "Drone", compact: true },
          { id: "crates", tool: "crates", label: "Crate", compact: true },
          { id: "monsters", tool: "monsters", label: "Monster", compact: true },
          { id: "bosses", tool: "bosses", label: "Boss Arena" }
        ]
      },
      {
        label: "Markers",
        tools: [
          { id: "start", tool: "start", label: "Start", compact: true },
          { id: "exit", tool: "exit", label: "Exit", compact: true }
        ]
      }
    ];
    const tools = paletteGroups
      .map((group) => {
        const buttons = group.tools
          .map((entry) => {
            const placeable = entry.tool !== "select";
            const presetAttribute = entry.preset ? ` data-solid-preset="${entry.preset}"` : "";
            const dragAttributes = placeable ? ` draggable="true" data-palette-kind="${entry.tool}"${presetAttribute}` : "";
            const title = placeable ? `Drag ${entry.label} into the level` : entry.label;
            return `<button class="editor-tool ${entry.compact ? "compact" : ""}" type="button" data-tool="${entry.id}" title="${escapeHtml(
              title
            )}"${dragAttributes}>${escapeHtml(entry.label)}</button>`;
          })
          .join("");
        return `
          <div class="editor-tool-group">
            <div class="editor-tool-group-title">${escapeHtml(group.label)}</div>
            <div class="editor-tool-group-grid">${buttons}</div>
          </div>
        `;
      })
      .join("");

    return `
      <main class="level-editor" data-level-editor>
        <header class="editor-topbar">
          <div class="editor-title">
            <strong>Level Editor</strong>
            <span data-editor-status>Draft ready</span>
          </div>
          <label class="editor-level-select">
            <span>Level</span>
            <div class="editor-level-row">
              <select data-level-select></select>
              <button type="button" class="editor-button" data-add-level>New</button>
              <button type="button" class="editor-button danger" data-delete-level>Delete</button>
            </div>
          </label>
          <div class="editor-actions">
            <button type="button" class="editor-button" data-save-draft>Save Draft</button>
            <button type="button" class="editor-button primary" data-playtest-draft>Playtest</button>
            <button type="button" class="editor-button" data-reset-source>Reset Source</button>
            <button type="button" class="editor-button" data-back-game>Game</button>
          </div>
        </header>
        <section class="editor-workspace">
          <aside class="editor-sidebar left">
            <section class="editor-panel toolbar-panel">
              <h2>Tools</h2>
              <div class="editor-tool-grid" data-tool-grid>${tools}</div>
              <div class="editor-viewport-actions">
                <button type="button" class="editor-button" data-add-object>Add</button>
                <button type="button" class="editor-button" data-duplicate-object>Duplicate</button>
                <button type="button" class="editor-button danger" data-delete-object>Delete</button>
              </div>
              <div class="editor-viewport-actions">
                <button type="button" class="editor-button" data-fit-level>Fit</button>
                <button type="button" class="editor-button" data-center-start>Start</button>
              </div>
              <div class="editor-viewport-actions editor-zoom-actions">
                <button type="button" class="editor-button" data-zoom-out>Zoom -</button>
                <span class="editor-zoom-readout" data-zoom-readout>100%</span>
                <button type="button" class="editor-button" data-zoom-in>Zoom +</button>
              </div>
            </section>
          </aside>
          <section class="editor-canvas-panel">
            <canvas data-editor-canvas tabindex="0"></canvas>
          </section>
          <aside class="editor-sidebar right editor-dock">
            <section class="editor-panel editor-tabs-panel">
              <div class="editor-tabs" data-editor-tabs>
                <button type="button" data-editor-tab="inspect">Inspect</button>
                <button type="button" data-editor-tab="objects">Objects</button>
                <button type="button" data-editor-tab="validation">Validate</button>
                <button type="button" data-editor-tab="export">Export</button>
              </div>
              <section class="editor-tab-panel inspector-panel" data-tab-panel="inspect">
                <h2>Inspector</h2>
                <div data-inspector></div>
              </section>
              <section class="editor-tab-panel object-list-panel" data-tab-panel="objects">
                <h2>Objects</h2>
                <div class="editor-object-list" data-object-list></div>
              </section>
              <section class="editor-tab-panel validation-panel" data-tab-panel="validation">
                <h2>Validation</h2>
                <div data-validation></div>
              </section>
              <section class="editor-tab-panel export-panel" data-tab-panel="export">
                <h2>Export</h2>
                <div class="editor-viewport-actions">
                  <button type="button" class="editor-button" data-copy-export>Copy JSON</button>
                  <button type="button" class="editor-button" data-download-export>Download</button>
                  <button type="button" class="editor-button" data-apply-import>Import</button>
                </div>
                <textarea readonly data-export-json spellcheck="false"></textarea>
                <textarea data-import-json spellcheck="false" placeholder="Paste exported Level or Level[] JSON"></textarea>
              </section>
            </section>
          </aside>
        </section>
      </main>
    `;
  }

  private bindEvents(): void {
    document.addEventListener("keydown", this.handleDocumentKeyDown);

    this.require<HTMLSelectElement>("[data-level-select]").addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement;
      this.currentIndex = levelIndex(target.value, this.levels.length - 1);
      this.selection = null;
      this.centerOnStart();
      this.renderAll();
      this.persistDraft("Level selected");
    });

    this.require<HTMLElement>("[data-tool-grid]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]");
      if (!button) return;
      const paletteKind = button.dataset.paletteKind as PlaceableTool | undefined;
      this.tool = paletteKind || "select";
      this.placementPreset = paletteKind === "solids" ? this.solidPresetFromValue(button.dataset.solidPreset) : null;
      this.renderToolbar();
      this.setStatus(`${this.paletteLabel(this.tool, this.placementPreset)} tool`);
    });
    this.require<HTMLElement>("[data-tool-grid]").addEventListener("dragstart", (event) => this.handleToolDragStart(event));
    this.require<HTMLElement>("[data-tool-grid]").addEventListener("dragend", (event) => this.handleToolDragEnd(event));

    this.require<HTMLElement>("[data-editor-tabs]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-editor-tab]");
      if (!button) return;
      this.activePanel = button.dataset.editorTab as EditorPanel;
      this.renderPanelTabs();
    });

    this.require<HTMLElement>("[data-object-list]").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
      if (!button) return;
      const kind = button.dataset.kind as SelectableKind;
      this.selection = kind === "start" || kind === "exit" ? { kind } : { kind, id: button.dataset.id || "" };
      this.tool = "select";
      this.placementPreset = null;
      this.activePanel = "inspect";
      this.renderAll();
    });

    this.require<HTMLElement>("[data-inspector]").addEventListener("change", (event) => this.handleInspectorChange(event));
    this.require<HTMLElement>("[data-inspector]").addEventListener("input", (event) => {
      const target = event.target as HTMLElement;
      if (target.matches("[data-live-field]")) this.handleInspectorChange(event);
    });

    this.require<HTMLButtonElement>("[data-add-object]").addEventListener("click", () => this.addObjectAtViewCenter());
    this.require<HTMLButtonElement>("[data-duplicate-object]").addEventListener("click", () => this.duplicateSelection());
    this.require<HTMLButtonElement>("[data-delete-object]").addEventListener("click", () => this.deleteSelection());
    this.require<HTMLButtonElement>("[data-fit-level]").addEventListener("click", () => {
      this.fitLevel();
      this.renderCanvas();
    });
    this.require<HTMLButtonElement>("[data-center-start]").addEventListener("click", () => {
      this.centerOnStart();
      this.renderCanvas();
    });
    this.require<HTMLButtonElement>("[data-zoom-out]").addEventListener("click", () => this.zoomAtCanvasCenter(0.86));
    this.require<HTMLButtonElement>("[data-zoom-in]").addEventListener("click", () => this.zoomAtCanvasCenter(1.16));
    this.require<HTMLButtonElement>("[data-save-draft]").addEventListener("click", () => this.persistDraft("Draft saved"));
    this.require<HTMLButtonElement>("[data-playtest-draft]").addEventListener("click", () => this.playtestDraft());
    this.require<HTMLButtonElement>("[data-add-level]").addEventListener("click", () => this.addLevel());
    this.require<HTMLButtonElement>("[data-delete-level]").addEventListener("click", () => this.deleteCurrentLevel());
    this.require<HTMLButtonElement>("[data-reset-source]").addEventListener("click", () => {
      this.levels = exportableLevels(sourceLevels);
      this.currentIndex = 0;
      this.selection = null;
      this.tool = "select";
      this.placementPreset = null;
      this.clearDraft();
      this.fitLevel();
      this.renderAll();
      this.setStatus("Source data restored");
    });
    this.require<HTMLButtonElement>("[data-back-game]").addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("editor");
      url.searchParams.delete("playtestDraft");
      url.searchParams.delete("level");
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    });
    this.require<HTMLButtonElement>("[data-copy-export]").addEventListener("click", () => void this.copyExport());
    this.require<HTMLButtonElement>("[data-download-export]").addEventListener("click", () => this.downloadExport());
    this.require<HTMLButtonElement>("[data-apply-import]").addEventListener("click", () => this.applyImport());

    this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
    this.canvas.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    this.canvas.addEventListener("dragover", (event) => this.handleCanvasDragOver(event));
    this.canvas.addEventListener("dragleave", () => this.setCanvasDragOver(false));
    this.canvas.addEventListener("drop", (event) => this.handleCanvasDrop(event));
  }

  private handleInspectorChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (target.dataset.levelField) {
      this.updateLevelField(target.dataset.levelField, this.readInputValue(target));
    }
    if (target.dataset.objectField) {
      this.updateObjectField(target.dataset.objectField, this.readInputValue(target));
    }
  }

  private readInputValue(target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | number | boolean {
    if (target instanceof HTMLInputElement && target.type === "checkbox") return target.checked;
    if (target.dataset.fieldType === "number") return positiveNumber(target.value, 0);
    return target.value;
  }

  private updateLevelField(field: string, value: string | number | boolean): void {
    const level = this.level;
    if (field === "id" || field === "name" || field === "subtitle" || field === "hint") {
      (level as unknown as Record<string, string>)[field] = String(value);
    } else if (field === "soundtrackKey") {
      if (isLevelSoundtrackKey(value)) level.soundtrackKey = value;
      else delete level.soundtrackKey;
    } else if (field === "backgroundKey") {
      if (isLevelBackgroundKey(value)) level.backgroundKey = value;
      else delete level.backgroundKey;
    } else if (field.startsWith("backgroundAmbience.")) {
      this.updateBackgroundAmbienceField(field.split(".")[1], value);
    } else if (field === "bounds.x" || field === "bounds.y" || field === "bounds.w" || field === "bounds.h") {
      const key = field.split(".")[1] as keyof Rect;
      level.bounds[key] = Number(value);
      if (key === "w" || key === "h") level.bounds[key] = Math.max(1, level.bounds[key]);
    } else if (field === "index") {
      level.index = Math.max(0, Math.round(Number(value)));
    } else if (field.startsWith("score.")) {
      if (field === "score.unlimitedLives") {
        level.score.lives = value === true ? null : 3;
        this.afterMutation("Level updated");
        return;
      }
      const key = field.split(".")[1] as keyof Level["score"];
      if (key === "lives" || key === "timeBonusTargetSeconds") {
        level.score[key] = Math.max(1, Math.round(Number(value)));
      } else {
        level.score[key] = Math.max(0, Math.round(Number(value)));
      }
    }
    this.afterMutation("Level updated");
  }

  private updateBackgroundAmbienceField(field: string, value: string | number | boolean): void {
    const level = this.level;
    if (field === "preset") {
      const preset: LevelBackgroundAmbiencePreset = isBackgroundAmbiencePreset(value) ? value : "none";
      level.backgroundAmbience = defaultBackgroundAmbienceForPreset(preset);
      return;
    }

    const ambience = normalizeBackgroundAmbience(level.backgroundAmbience);
    const next: LevelBackgroundAmbience = { ...ambience };
    if (field === "color") {
      next.color = isBackgroundAmbienceColor(value) ? String(value).toLowerCase() : ambience.color;
    } else if (field === "intensity" || field === "drift" || field === "flicker" || field === "particles") {
      next[field] = Math.max(0, Math.min(1, Number(value)));
    }
    level.backgroundAmbience = normalizeBackgroundAmbience(next);
  }

  private updateObjectField(field: string, value: string | number | boolean): void {
    if (!this.selection) return;
    if (this.selection.kind === "start") {
      if (field === "x" || field === "y") this.level.start[field] = Number(value);
      this.afterMutation("Start updated");
      return;
    }
    const target = this.selectedRectObject();
    if (!target) return;
    if (field === "x" || field === "y" || field === "w" || field === "h") {
      if (this.selection.kind === "exit") {
        target[field] = field === "w" || field === "h" ? Math.max(1, Number(value)) : Number(value);
      } else {
        target[field] = field === "w" || field === "h" ? snapSize(Number(value)) : snap(Number(value));
        this.snapToNearbySurface(this.selection.kind, target);
      }
    } else if (field === "id") {
      const nextId = normalizedObjectIdValue(value);
      if (!nextId) {
        this.afterMutation("Object id cannot be empty");
        return;
      }
      if (this.objectIdExists(nextId, target)) {
        this.afterMutation(`Object id ${nextId} already exists`);
        return;
      }
      const previousId = target.id;
      target.id = nextId;
      if ("id" in this.selection) this.selection.id = target.id;
      if (this.selection.kind !== "exit") this.replaceObjectReferences(this.selection.kind, previousId, nextId);
    } else {
      this.updateSpecificObjectField(target, field, value);
    }
    this.afterMutation("Object updated");
  }

  private updateSpecificObjectField(target: RectObject, field: string, value: string | number | boolean): void {
    const record = target as unknown as Record<string, unknown>;
    if (field === "opensWith" || field === "disabledBy") {
      const items = csvToList(String(value));
      if (items.length > 0) record[field] = items;
      else delete record[field];
      return;
    }
    if (field === "requiresCore" || field === "label" || field === "tone") {
      const text = String(value).trim();
      if (text) record[field] = text;
      else delete record[field];
      return;
    }
    if (field === "kind") {
      if (this.selection?.kind === "monsters") record.kind = normalizeMonsterKind(value);
      else if (this.selection?.kind === "bosses") record.kind = normalizeBossKind(value);
      return;
    }
    if (field === "vulnerableFrom") {
      const vulnerability = normalizeMonsterVulnerability(value);
      if (vulnerability) record.vulnerableFrom = vulnerability;
      else delete record.vulnerableFrom;
      return;
    }
    if (field === "entrySide") {
      record.entrySide = normalizeBossEntrySide(value);
      return;
    }
    if (field === "weakSpot") {
      record.weakSpot = normalizeBossWeakSpot(value);
      return;
    }
    if (field === "checkpointX" || field === "checkpointY") {
      const existing = isRecord(record.checkpoint) ? record.checkpoint : {};
      record.checkpoint = {
        x: field === "checkpointX" ? Number(value) : numberValue(existing.x, target.x - 60),
        y: field === "checkpointY" ? Number(value) : numberValue(existing.y, target.y + target.h - 48)
      };
      return;
    }
    if (field === "scoreValue") {
      const score = nonNegativeInteger(value, 0);
      if (score > 0) record.score = score;
      else delete record.score;
      return;
    }
    if (field === "sprite") {
      record.sprite = normalizeSolidSprite(String(value).trim()) || "auto";
      return;
    }
    if (field === "material") {
      const material = normalizeTerrainMaterial(String(value).trim());
      if (material) record.material = material;
      else delete record.material;
      return;
    }
    if (field === "collision") {
      const collision = normalizeSolidCollision(String(value).trim());
      if (collision) record.collision = collision;
      else delete record.collision;
      return;
    }
    if (field === "size") {
      const size = normalizedCoreSize(value);
      if (size === "large") record.size = size;
      else delete record.size;
      return;
    }
    if (field === "axis") {
      record.axis = value === "y" ? "y" : "x";
      if (this.selection?.kind === "movingLasers") this.alignMovingLaserRectToBeam(target as MovingLaser);
      return;
    }
    if (field === "beamAxis") {
      if (value === "x" || value === "y") record.beamAxis = value;
      else delete record.beamAxis;
      this.alignMovingLaserRectToBeam(target as MovingLaser);
      return;
    }
    if (field === "direction") {
      record.direction = value === "-1" || value === -1 || value === "left" ? -1 : 1;
      return;
    }
    if (field === "actors") {
      record.actors = value === "player" || value === "both" ? value : "echo";
      return;
    }
    if (field === "conveyorSpeed") {
      record.speed = Math.max(0, Number(value));
      return;
    }
    if (field === "powerX") {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric !== 0) record.powerX = numeric;
      else delete record.powerX;
      return;
    }
    if (field === "powerY" || field === "duration" || field === "introSeconds" || field === "health") {
      record[field] = field === "powerY" ? Math.max(1, Number(value)) : positiveInteger(value, 1);
      return;
    }
    if (field === "pathStart" || field === "pathEnd") {
      const moving = target as PathableObject;
      const path = movingPath(moving);
      setMovingPath(moving, field === "pathStart" ? snap(Number(value)) : path.start, field === "pathEnd" ? snap(Number(value)) : path.end);
      return;
    }
    if (field === "speed") {
      const moving = target as PathableObject;
      const speed = Math.max(1, Number(value));
      moving.period = Math.max(1, Math.round((120 * Math.max(1, moving.distance || 0)) / speed));
      return;
    }
    if (field === "distance" || field === "period" || field === "phase") {
      if (field === "distance") record.distance = nonNegativeNumber(value, 0);
      else if (field === "period") record.period = positiveInteger(value, 1);
      else record.phase = Number(value);
      return;
    }
    if (field === "once" || field === "inverted" || field === "killable") {
      if (field === "killable") {
        if (value === true) delete record.killable;
        else record.killable = false;
        return;
      }
      if (value === true) record[field] = true;
      else delete record[field];
      return;
    }
    if (field === "startsOn") {
      record.startsOn = value === true;
    }
  }

  private alignMovingLaserRectToBeam(laser: MovingLaser): void {
    alignMovingLaserRectToBeam(laser);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      if (this.isEditableTarget(event.target) || !this.canDuplicateSelection()) return;
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (this.isEditableTarget(event.target)) return;
    if (!this.selection || this.selection.kind === "start" || this.selection.kind === "exit") return;
    event.preventDefault();
    this.deleteSelection();
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  private solidPresetFromValue(value: unknown): SolidPreset | null {
    return value === "floor" || value === "wall" || value === "block" ? value : null;
  }

  private paletteLabel(tool: Tool, preset: SolidPreset | null = null): string {
    if (tool === "solids" && preset) return solidPresetLabels[preset];
    return toolLabels[tool];
  }

  private handleToolDragStart(event: DragEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-palette-kind]");
    if (!button || !event.dataTransfer) return;
    const tool = button.dataset.paletteKind as PlaceableTool;
    const preset = tool === "solids" ? this.solidPresetFromValue(button.dataset.solidPreset) : null;
    this.paletteDragTool = tool;
    this.paletteDragPreset = preset;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-echo-shift-tool", tool);
    if (preset) event.dataTransfer.setData("application/x-echo-shift-solid-preset", preset);
    event.dataTransfer.setData("text/plain", tool);
    button.classList.add("dragging");
    this.setStatus(`Drop ${this.paletteLabel(tool, preset)} into the level`);
  }

  private handleToolDragEnd(event: DragEvent): void {
    (event.target as HTMLElement).closest<HTMLButtonElement>("[data-palette-kind]")?.classList.remove("dragging");
    this.paletteDragTool = null;
    this.paletteDragPreset = null;
    this.setCanvasDragOver(false);
  }

  private handleCanvasDragOver(event: DragEvent): void {
    const placement = this.placementFromDataTransfer(event.dataTransfer);
    if (!placement) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    this.setCanvasDragOver(true);
  }

  private handleCanvasDrop(event: DragEvent): void {
    const placement = this.placementFromDataTransfer(event.dataTransfer);
    if (!placement) return;
    event.preventDefault();
    this.setCanvasDragOver(false);
    this.paletteDragTool = null;
    this.paletteDragPreset = null;
    const rect = this.canvas.getBoundingClientRect();
    const world = snapPoint(this.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }));
    this.placeToolAt(placement.tool, world, placement.preset);
    this.tool = "select";
    this.placementPreset = null;
    this.renderToolbar();
  }

  private placementFromDataTransfer(dataTransfer: DataTransfer | null): PalettePlacement | null {
    const raw = dataTransfer?.getData("application/x-echo-shift-tool") || dataTransfer?.getData("text/plain") || this.paletteDragTool;
    if (raw === "start" || raw === "exit" || rectCollections.includes(raw as RectCollection)) {
      const tool = raw as PlaceableTool;
      const preset = tool === "solids" ? this.solidPresetFromValue(dataTransfer?.getData("application/x-echo-shift-solid-preset") || this.paletteDragPreset) : null;
      return { tool, preset };
    }
    return null;
  }

  private setCanvasDragOver(active: boolean): void {
    this.canvas.closest(".editor-canvas-panel")?.classList.toggle("drag-over", active);
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    const rawWorld = this.screenToWorld({ x: event.offsetX, y: event.offsetY });
    const world = snapPoint(rawWorld);

    if (event.button === 1 || event.altKey) {
      this.drag = {
        mode: "pan",
        pointerStart: { x: event.clientX, y: event.clientY },
        viewStart: { x: this.view.x, y: this.view.y }
      };
      return;
    }

    if (this.tool === "select") {
      const pathHit = this.hitMotionEndpoint(rawWorld);
      const resizeHit = this.hitResizeHandle(rawWorld);
      if (pathHit && (!resizeHit || pathHit.distance <= resizeHit.distance)) {
        this.selection = pathHit.selection;
        this.drag = {
          mode: "path",
          selection: pathHit.selection,
          endpoint: pathHit.endpoint
        };
        this.activePanel = "inspect";
        this.renderAll();
        return;
      }

      if (resizeHit) {
        this.drag = {
          mode: "resize",
          selection: resizeHit.selection,
          handle: resizeHit.handle,
          pointerStartWorld: world,
          startRect: resizeHit.rect
        };
        this.activePanel = "inspect";
        this.renderAll();
        return;
      }

      const hit = this.hitTest(world);
      this.selection = hit;
      if (!hit) {
        this.drag = {
          mode: "pan",
          pointerStart: { x: event.clientX, y: event.clientY },
          viewStart: { x: this.view.x, y: this.view.y }
        };
        this.renderAll();
        return;
      }
      const startRect = this.rectForSelection(hit);
      this.drag = startRect
        ? {
            mode: "move",
            selection: hit,
            pointerStartWorld: world,
            startRect
          }
        : null;
      this.activePanel = "inspect";
      this.renderAll();
      return;
    }

    if (this.tool === "start") {
      this.placeToolAt("start", world);
      return;
    }

    if (this.tool === "exit") {
      this.placeToolAt("exit", world);
      return;
    }

    const kind = this.tool as RectCollection;
    const object = this.placeToolAt(kind, world, kind === "solids" ? this.placementPreset : null);
    if (!object) return;
    this.drag = {
      mode: "create",
      kind,
      id: object.id,
      preset: kind === "solids" ? this.placementPreset : null,
      origin: world,
      startRect: { x: object.x, y: object.y, w: object.w, h: object.h }
    };
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    if (this.drag.mode === "pan") {
      const dx = (event.clientX - this.drag.pointerStart.x) / this.view.w;
      const dy = (event.clientY - this.drag.pointerStart.y) / this.view.w;
      this.view.x = this.drag.viewStart.x - dx;
      this.view.y = this.drag.viewStart.y - dy;
      this.renderCanvas();
      return;
    }

    const world = snapPoint(this.screenToWorld({ x: event.offsetX, y: event.offsetY }));
    if (this.drag.mode === "move") {
      const dx = world.x - this.drag.pointerStartWorld.x;
      const dy = world.y - this.drag.pointerStartWorld.y;
      this.moveSelection(this.drag.selection, this.drag.startRect, dx, dy);
      this.renderObjectList();
      this.renderInspector();
      this.renderValidation();
      this.renderExport();
      this.renderCanvas();
      return;
    }

    if (this.drag.mode === "resize") {
      const dx = world.x - this.drag.pointerStartWorld.x;
      const dy = world.y - this.drag.pointerStartWorld.y;
      this.resizeSelection(this.drag.selection, this.drag.startRect, this.drag.handle, dx, dy);
      this.renderObjectList();
      this.renderInspector();
      this.renderValidation();
      this.renderExport();
      this.renderCanvas();
      return;
    }

    if (this.drag.mode === "path") {
      const target = this.findObject(this.drag.selection.kind, this.drag.selection.id);
      if (!target) return;
      const moving = target as MovingPlatform | PatrolDrone | MovingLaser;
      const axisValue = moving.axis === "x" ? world.x : world.y;
      const path = movingPath(moving);
      setMovingPath(moving, this.drag.endpoint === "start" ? axisValue : path.start, this.drag.endpoint === "end" ? axisValue : path.end);
      this.renderObjectList();
      this.renderInspector();
      this.renderValidation();
      this.renderExport();
      this.renderCanvas();
      return;
    }

    const target = this.findObject(this.drag.kind, this.drag.id);
    if (!target) return;
    const size = defaultSizeFor(this.drag.kind, this.drag.kind === "solids" ? this.drag.preset : null);
    const minX = Math.min(this.drag.origin.x, world.x);
    const minY = Math.min(this.drag.origin.y, world.y);
    const maxX = Math.max(this.drag.origin.x, world.x);
    const maxY = Math.max(this.drag.origin.y, world.y);
    target.x = minX;
    target.y = minY;
    target.w = Math.max(size.w, maxX - minX);
    target.h = Math.max(size.h, maxY - minY);
    if (Math.abs(world.x - this.drag.origin.x) < GRID && Math.abs(world.y - this.drag.origin.y) < GRID) {
      Object.assign(target, this.drag.startRect);
    }
    this.snapToNearbySurface(this.drag.kind, target);
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.drag && this.drag.mode !== "pan") this.persistDraft("Draft autosaved");
    this.drag = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (delta === 0) return;
    const factor = clamp(Math.exp(-delta * 0.002), 0.72, 1.32);
    this.zoomAtScreenPoint({ x: event.offsetX, y: event.offsetY }, factor);
  }

  private moveSelection(selection: Selection, startRect: Rect, dx: number, dy: number): void {
    if (selection.kind === "start") {
      this.level.start = { x: startRect.x + dx, y: startRect.y + dy };
      return;
    }
    const rect = selection.kind === "exit" ? this.level.exit : this.findObject(selection.kind, selection.id);
    if (!rect) return;
    rect.x = startRect.x + dx;
    rect.y = startRect.y + dy;
    if (selection.kind !== "exit") this.snapToNearbySurface(selection.kind, rect);
  }

  private resizeSelection(selection: Selection, startRect: Rect, handle: ResizeHandle, dx: number, dy: number): void {
    if (!this.canResizeSelection(selection)) return;
    if (selection.kind === "start" || selection.kind === "exit") return;
    const rect = this.findObject(selection.kind, selection.id);
    if (!rect) return;

    Object.assign(rect, resizeRectOnGrid(startRect, handle, dx, dy));
    this.snapToNearbySurface(selection.kind, rect);
  }

  private hitResizeHandle(point: Vec2): { selection: Selection; handle: ResizeHandle; rect: Rect; distance: number } | null {
    if (!this.selection || !this.canResizeSelection(this.selection)) return null;
    const rect = this.rectForSelection(this.selection);
    if (!rect) return null;
    const tolerance = Math.max(8 / this.view.w, 5);
    let best: { selection: Selection; handle: ResizeHandle; rect: Rect; distance: number } | null = null;
    for (const { handle, point: handlePoint } of this.resizeHandlesForSelection(this.selection, rect)) {
      if (Math.abs(point.x - handlePoint.x) <= tolerance && Math.abs(point.y - handlePoint.y) <= tolerance) {
        const distance = pointDistance(point, handlePoint);
        if (!best || distance < best.distance) best = { selection: this.selection, handle, rect, distance };
      }
    }
    return best ? { selection: best.selection, handle: best.handle, rect: best.rect, distance: best.distance } : null;
  }

  private hitMotionEndpoint(point: Vec2): { selection: { kind: MovingKind; id: string }; endpoint: PathEndpoint; distance: number } | null {
    const tolerance = Math.max(HIT_TOLERANCE_PX / this.view.w, 6);
    const candidates: Array<{ kind: MovingKind; object: MovingPlatform | PatrolDrone | MovingLaser }> = [];
    const selected = this.selection;

    if (selected && (selected.kind === "platforms" || selected.kind === "drones" || selected.kind === "movingLasers")) {
      const object = this.findObject(selected.kind, selected.id);
      if (object) candidates.push({ kind: selected.kind, object: object as MovingPlatform | PatrolDrone | MovingLaser });
    }

    for (const kind of ["drones", "movingLasers", "platforms"] as MovingKind[]) {
      const objects = [...readCollection(this.level, kind)].reverse() as Array<MovingPlatform | PatrolDrone | MovingLaser>;
      for (const object of objects) candidates.push({ kind, object });
    }

    const seen = new Set<string>();
    let best: { selection: { kind: MovingKind; id: string }; endpoint: PathEndpoint; distance: number } | null = null;
    for (const candidate of candidates) {
      const key = `${candidate.kind}:${candidate.object.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const points = movingPathPoints(candidate.object);
      const startDistance = pointDistance(point, points.start);
      if (startDistance <= tolerance && (!best || startDistance < best.distance)) {
        best = { selection: { kind: candidate.kind, id: candidate.object.id }, endpoint: "start", distance: startDistance };
      }
      const endDistance = pointDistance(point, points.end);
      if (endDistance <= tolerance && (!best || endDistance < best.distance)) {
        best = { selection: { kind: candidate.kind, id: candidate.object.id }, endpoint: "end", distance: endDistance };
      }
    }
    return best;
  }

  private resizeHandlesForSelection(selection: Selection, rect: Rect): Array<{ handle: ResizeHandle; point: Vec2 }> {
    const handles = resizeHandlesForRect(rect);
    if (selection.kind !== "platforms" && selection.kind !== "movingLasers") return handles;
    const object = this.findObject(selection.kind, selection.id) as MovingPlatform | MovingLaser | null;
    if (!object) return handles;
    if (object.axis === "x") return handles.filter(({ handle }) => !handle.includes("w"));
    return handles.filter(({ handle }) => !handle.includes("n"));
  }

  private canResizeSelection(selection: Selection): boolean {
    return selection.kind !== "start" && selection.kind !== "exit" && selection.kind !== "plates" && selection.kind !== "timedSwitches" && selection.kind !== "drones";
  }

  private addObjectAtViewCenter(): void {
    if (!rectCollections.includes(this.tool as RectCollection)) {
      this.setStatus("Choose an object tool first");
      return;
    }
    const kind = this.tool as RectCollection;
    const world = snapPoint({
      x: this.view.x + this.canvas.width / this.view.w / 2,
      y: this.view.y + this.canvas.height / this.view.w / 2
    });
    this.placeToolAt(kind, world, kind === "solids" ? this.placementPreset : null);
  }

  private placeToolAt(tool: PlaceableTool, world: Vec2, solidPreset: SolidPreset | null = null): RectObject | null {
    if (tool === "start") {
      this.level.start = world;
      this.selection = { kind: "start" };
      this.activePanel = "inspect";
      this.afterMutation("Start placed");
      return null;
    }
    if (tool === "exit") {
      this.level.exit = { ...this.level.exit, x: world.x, y: world.y };
      this.selection = { kind: "exit" };
      this.activePanel = "inspect";
      this.afterMutation("Exit placed");
      return null;
    }
    const object = this.createObject(tool, world, solidPreset);
    this.snapToNearbySurface(tool, object);
    ensureCollection(this.level, tool).push(object);
    this.selection = { kind: tool, id: object.id };
    this.activePanel = "inspect";
    this.afterMutation(`${this.paletteLabel(tool, solidPreset)} added`);
    return object;
  }

  private snapToNearbySurface(kind: RectCollection, rect: Rect): void {
    if (!this.isSurfaceMounted(kind)) return;
    const snapDistance = kind === "crates" ? Math.max(SURFACE_SNAP_DISTANCE, rect.h + 4) : SURFACE_SNAP_DISTANCE;
    const surface = this.nearestSurfaceTop(kind, rect, snapDistance);
    if (surface === null) return;
    rect.y = surface - rect.h;
  }

  private isSurfaceMounted(kind: RectCollection): boolean {
    return (
      kind === "plates" ||
      kind === "timedSwitches" ||
      kind === "hazards" ||
      kind === "lasers" ||
      kind === "launchPads" ||
      kind === "conveyors" ||
      kind === "crates" ||
      kind === "monsters"
    );
  }

  private isStaticToolkitSurface(kind: RectCollection): boolean {
    return kind === "conveyors" || kind === "launchPads" || kind === "timedSwitches" || kind === "crates";
  }

  private nearestSurfaceTop(kind: RectCollection, rect: Rect, snapDistance = SURFACE_SNAP_DISTANCE): number | null {
    const movingSurfaces = this.isStaticToolkitSurface(kind) ? [] : readCollection(this.level, "platforms");
    const gameplaySolids = this.level.solids.filter(solidHasGameplayCollision);
    const candidates = [...gameplaySolids, ...movingSurfaces, ...readCollection(this.level, "oneWays"), ...readCollection(this.level, "conveyors")]
      .filter((surface) => rectsOverlapX(rect, surface))
      .map((surface) => surface.y)
      .filter((surfaceY) => {
        const bottomDistance = Math.abs(rect.y + rect.h - surfaceY);
        return rect.y <= surfaceY && bottomDistance <= snapDistance;
      })
      .sort((a, b) => Math.abs(rect.y + rect.h - a) - Math.abs(rect.y + rect.h - b));

    return candidates[0] ?? null;
  }

  private objectIdExists(id: string, ignored?: RectObject): boolean {
    if (!id) return false;
    return rectCollections.some((kind) => readCollection(this.level, kind).some((object) => object !== ignored && object.id === id));
  }

  private canDuplicateSelection(): boolean {
    return !!this.selection && this.selection.kind !== "start" && this.selection.kind !== "exit";
  }

  private duplicateSelection(): void {
    if (!this.selection) {
      this.setStatus("Select an object to duplicate");
      return;
    }
    if (this.selection.kind === "exit") {
      this.setStatus("Exit is unique and cannot be duplicated");
      return;
    }
    if (this.selection.kind === "start") {
      this.setStatus("Start is unique and cannot be duplicated");
      return;
    }
    const object = this.findObject(this.selection.kind, this.selection.id);
    if (!object) return;
    const copy = {
      ...(JSON.parse(JSON.stringify(object)) as RectObject),
      id: this.nextObjectId(this.selection.kind),
      x: object.x + GRID,
      y: this.isSurfaceMounted(this.selection.kind) ? object.y : object.y + GRID
    };
    this.snapToNearbySurface(this.selection.kind, copy);
    ensureCollection(this.level, this.selection.kind).push(copy);
    this.selection = { kind: this.selection.kind, id: copy.id };
    this.activePanel = "inspect";
    this.afterMutation("Object duplicated");
  }

  private deleteSelection(): void {
    if (!this.selection || this.selection.kind === "start" || this.selection.kind === "exit") {
      this.setStatus("Select a placed object to delete");
      return;
    }
    const { kind, id } = this.selection;
    const collection = ensureCollection(this.level, kind);
    const next = collection.filter((item) => item.id !== id);
    (this.level as unknown as Record<RectCollection, RectObject[]>)[kind] = next;
    this.removeDeletedObjectReferences(kind, id);
    this.selection = null;
    this.afterMutation("Object deleted");
  }

  private removeDeletedObjectReferences(kind: RectCollection, id: string): void {
    if (kind === "plates" || kind === "timedSwitches" || kind === "echoSensors") {
      for (const door of readCollection(this.level, "doors") as Door[]) {
        door.opensWith = (door.opensWith || []).filter((triggerId) => triggerId !== id);
      }
      for (const laser of [...readCollection(this.level, "lasers"), ...readCollection(this.level, "movingLasers")] as Array<Laser | MovingLaser>) {
        const next = (laser.disabledBy || []).filter((triggerId) => triggerId !== id);
        if (next.length > 0) laser.disabledBy = next;
        else delete laser.disabledBy;
      }
      for (const drone of readCollection(this.level, "drones") as PatrolDrone[]) {
        const next = (drone.disabledBy || []).filter((triggerId) => triggerId !== id);
        if (next.length > 0) drone.disabledBy = next;
        else delete drone.disabledBy;
      }
    }
    if (kind === "cores") {
      for (const door of readCollection(this.level, "doors") as Door[]) {
        if (door.requiresCore === id) delete door.requiresCore;
      }
    }
  }

  private replaceObjectReferences(kind: RectCollection, previousId: string, nextId: string): void {
    if (previousId === nextId) return;
    if (kind === "plates" || kind === "timedSwitches" || kind === "echoSensors") {
      for (const door of readCollection(this.level, "doors") as Door[]) {
        door.opensWith = replaceReferenceList(door.opensWith, previousId, nextId);
      }
      for (const laser of [...readCollection(this.level, "lasers"), ...readCollection(this.level, "movingLasers")] as Array<Laser | MovingLaser>) {
        const next = replaceReferenceList(laser.disabledBy, previousId, nextId);
        if (next.length > 0) laser.disabledBy = next;
        else delete laser.disabledBy;
      }
      for (const drone of readCollection(this.level, "drones") as PatrolDrone[]) {
        const next = replaceReferenceList(drone.disabledBy, previousId, nextId);
        if (next.length > 0) drone.disabledBy = next;
        else delete drone.disabledBy;
      }
    }
    if (kind === "cores") {
      for (const door of readCollection(this.level, "doors") as Door[]) {
        if (door.requiresCore === previousId) door.requiresCore = nextId;
      }
    }
  }

  private createObject(kind: RectCollection, point: Vec2, solidPreset: SolidPreset | null = null): RectObject {
    const size = defaultSizeFor(kind, solidPreset);
    const id = this.nextObjectId(kind, solidPreset ? solidPresetIdStems[solidPreset] : undefined);
    const base = { id, x: point.x, y: point.y, w: size.w, h: size.h };
    if (kind === "solids") {
      const tone: Solid["tone"] = solidPreset === "wall" ? "dark" : solidPreset === "block" ? "glass" : "steel";
      return { ...base, tone, sprite: solidPreset || undefined };
    }
    if (kind === "oneWays") return base as OneWayPlatform;
    if (kind === "conveyors") return { ...base, direction: 1, speed: 1.4 } as Conveyor;
    if (kind === "platforms") return { ...base, axis: "x", distance: 100, period: 180, phase: 0 } as MovingPlatform;
    if (kind === "hazards") return base as Hazard;
    if (kind === "launchPads") return { ...base, powerY: 12 } as LaunchPad;
    if (kind === "plates") return base as PressurePlate;
    if (kind === "timedSwitches") return { ...base, duration: 180 } as TimedSwitch;
    if (kind === "echoSensors") return { ...base, actors: "echo" } as EchoSensor;
    if (kind === "doors") return { ...base, opensWith: [] } as Door;
    if (kind === "lasers") return { ...base, startsOn: true } as Laser;
    if (kind === "movingLasers") return { ...base, startsOn: true, axis: "x", distance: 100, period: 180, phase: 0 } as MovingLaser;
    if (kind === "cores") return { ...base, label: id.split("-").at(-1)?.toUpperCase() } as Core;
    if (kind === "drones") return { ...base, axis: "x", distance: 120, period: 200, phase: 0 } as PatrolDrone;
    if (kind === "monsters") return { ...base, kind: "sprout-hopper", axis: "x", distance: 120, period: 180, phase: 0 } as Monster;
    if (kind === "bosses") {
      return {
        ...base,
        kind: "storm-relay-warden",
        entrySide: "right",
        weakSpot: "top",
        checkpoint: { x: base.x - 60, y: base.y + base.h - 48 },
        introSeconds: 17,
        health: 3,
        score: 3000
      } as Boss;
    }
    return base as PushableCrate;
  }

  private nextObjectId(kind: RectCollection, stemOverride?: string): string {
    const stem = stemOverride || objectIdStem(kind);
    let index = readCollection(this.level, kind).length + 1;
    let id = `${stem}-${index}`;
    while (this.objectIdExists(id)) {
      index += 1;
      id = `${stem}-${index}`;
    }
    return id;
  }

  private levelIdExists(id: string): boolean {
    return this.levels.some((level) => level.id === id);
  }

  private nextLevelId(stem: string, startIndex: number): string {
    let index = Math.max(1, startIndex);
    let id = `${stem}-${index}`;
    while (this.levelIdExists(id)) {
      index += 1;
      id = `${stem}-${index}`;
    }
    return id;
  }

  private createDraftLevel(index: number): Level {
    const width = 2200;
    return markAnchoredMotionModel({
      id: this.nextLevelId("new-level", index + 1),
      index,
      name: `New Level ${index + 1}`,
      subtitle: "Draft room",
      start: { x: 64, y: 450 },
      exit: { x: width - 150, y: 438, w: 48, h: 62 },
      bounds: { x: 0, y: 0, w: width, h: 540 },
      solids: [
        { id: "floor", x: 0, y: 500, w: width, h: 60, tone: "dark", sprite: "floor" },
        { id: "left-wall", x: -26, y: 0, w: 26, h: 560, tone: "glass", sprite: "wall" },
        { id: "right-wall", x: width, y: 0, w: 26, h: 560, tone: "glass", sprite: "wall" }
      ],
      score: normalizeScoreSettings(undefined, 2400),
      hint: "Add objects, test the route, then export the level JSON."
    });
  }

  private addLevel(): void {
    const insertAt = this.currentIndex + 1;
    this.levels.splice(insertAt, 0, this.createDraftLevel(insertAt));
    this.currentIndex = insertAt;
    this.afterLevelListMutation("Level added");
  }

  private deleteCurrentLevel(): void {
    if (this.levels.length <= 1) {
      this.setStatus("At least one level is required");
      return;
    }
    const currentName = this.level.name;
    if (!window.confirm(`Delete "${currentName}" from the draft?`)) return;
    this.levels.splice(this.currentIndex, 1);
    this.currentIndex = levelIndex(this.currentIndex, this.levels.length - 1, this.currentIndex - 1);
    this.afterLevelListMutation("Level deleted");
  }

  private afterLevelListMutation(status: string): void {
    this.reindexLevels();
    this.selection = null;
    this.drag = null;
    this.tool = "select";
    this.placementPreset = null;
    this.fitLevel();
    this.renderAll();
    this.persistDraft(status);
  }

  private reindexLevels(): void {
    this.levels.forEach((level, index) => {
      level.index = index;
    });
  }

  private renderAll(): void {
    this.renderLevelSelect();
    this.renderToolbar();
    this.renderPanelTabs();
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
    if (!this.hasFitInitialLevel) {
      this.fitLevel();
      this.hasFitInitialLevel = true;
      this.renderCanvas();
    }
  }

  private renderPanelTabs(): void {
    this.host.querySelectorAll<HTMLButtonElement>("[data-editor-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.editorTab === this.activePanel);
    });
    this.host.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== this.activePanel;
    });
  }

  private renderLevelSelect(): void {
    const select = this.require<HTMLSelectElement>("[data-level-select]");
    select.innerHTML = this.levels
      .map(
        (level, index) =>
          `<option value="${index}" ${index === this.currentIndex ? "selected" : ""}>${index + 1}. ${escapeHtml(level.name)}</option>`
      )
      .join("");
    const deleteButton = this.require<HTMLButtonElement>("[data-delete-level]");
    deleteButton.disabled = this.levels.length <= 1;
    deleteButton.title = deleteButton.disabled ? "At least one level is required" : "Delete selected level";
  }

  private renderToolbar(): void {
    this.host.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      const paletteKind = button.dataset.paletteKind as Tool | undefined;
      const preset = this.solidPresetFromValue(button.dataset.solidPreset);
      const active =
        this.tool === "select"
          ? button.dataset.tool === "select"
          : paletteKind === this.tool && (this.tool !== "solids" || preset === this.placementPreset);
      button.classList.toggle("active", active);
    });
    const duplicateButton = this.require<HTMLButtonElement>("[data-duplicate-object]");
    duplicateButton.disabled = !this.canDuplicateSelection();
    duplicateButton.title = duplicateButton.disabled ? "Select a placed object that can be duplicated" : "Duplicate selected object";
  }

  private renderObjectList(): void {
    const items = [
      this.objectListButton({ kind: "start" }, "Start", `x ${Math.round(this.level.start.x)}, y ${Math.round(this.level.start.y)}`),
      this.objectListButton({ kind: "exit" }, "Exit", this.rectSummary(this.level.exit)),
      ...rectCollections.flatMap((kind) => {
        const objects = readCollection(this.level, kind);
        if (objects.length === 0) {
          return [`<div class="object-group empty"><span>${collectionLabels[kind]}</span><em>0</em></div>`];
        }
        return [
          `<div class="object-group"><span>${collectionLabels[kind]}</span><em>${objects.length}</em></div>`,
          ...objects.map((object) => this.objectListButton({ kind, id: object.id }, object.id, this.rectSummary(object)))
        ];
      })
    ];
    this.require<HTMLElement>("[data-object-list]").innerHTML = items.join("");
  }

  private objectListButton(selection: Selection, name: string, meta: string): string {
    const selected = this.selectionMatches(selection) ? "active" : "";
    const id = "id" in selection ? `data-id="${escapeHtml(selection.id)}"` : "";
    return `
      <button type="button" class="object-row ${selected}" data-kind="${selection.kind}" ${id}>
        <span>${escapeHtml(name)}</span>
        <small>${escapeHtml(meta)}</small>
      </button>
    `;
  }

  private renderInspector(): void {
    const level = this.level;
    const selectionHtml = this.selection ? this.selectionInspectorHtml(this.selection) : `<div class="empty-inspector">No selection</div>`;
    this.require<HTMLElement>("[data-inspector]").innerHTML = `
      <div class="inspector-section">
        <h3>Level</h3>
        ${this.textField("ID", "id", level.id, "level")}
        ${this.textField("Name", "name", level.name, "level")}
        ${this.textField("Subtitle", "subtitle", level.subtitle, "level")}
        ${this.numberField("Index", "index", level.index, "level", 1)}
        <div class="inspector-grid four">
          ${this.numberField("X", "bounds.x", level.bounds.x, "level")}
          ${this.numberField("Y", "bounds.y", level.bounds.y, "level")}
          ${this.numberField("W", "bounds.w", level.bounds.w, "level")}
          ${this.numberField("H", "bounds.h", level.bounds.h, "level")}
        </div>
        ${this.soundtrackField(level)}
        ${this.backgroundField(level)}
        ${this.backgroundAmbienceField(level)}
        ${this.textAreaField("Hint", "hint", level.hint)}
      </div>
      <div class="inspector-section" data-score-settings>
        <h3>Scoring</h3>
        <p class="editor-field-note">Score uses cores, deaths, and a clear-time bonus. Rewinds do not count as deaths.</p>
        ${this.levelCheckboxField("Unlimited Lives", "score.unlimitedLives", level.score.lives === null)}
        <div class="inspector-grid three">
          ${this.numberField("Lives", "score.lives", level.score.lives ?? 3, "level", 1)}
          ${this.numberField("Core Score", "score.coreScore", level.score.coreScore, "level", 1)}
          ${this.numberField("Death Penalty", "score.deathPenalty", level.score.deathPenalty, "level", 1)}
          ${this.numberField("Bonus Target (s)", "score.timeBonusTargetSeconds", level.score.timeBonusTargetSeconds, "level", 1)}
          ${this.numberField("Score / Saved Sec", "score.timeBonusPerSecond", level.score.timeBonusPerSecond, "level", 1)}
        </div>
        <p class="editor-field-note" data-score-summary>${scoreSummary(level)}</p>
      </div>
      <div class="inspector-section">
        <h3>Selection</h3>
        ${selectionHtml}
      </div>
    `;
  }

  private selectionInspectorHtml(selection: Selection): string {
    if (selection.kind === "start") {
      return `<div class="inspector-grid two">
        ${this.numberField("X", "x", this.level.start.x, "object")}
        ${this.numberField("Y", "y", this.level.start.y, "object")}
      </div>`;
    }

    if (selection.kind === "exit") {
      const object = this.level.exit;
      return `
        <div class="inspector-grid four">
          ${this.numberField("X", "x", object.x, "object")}
          ${this.numberField("Y", "y", object.y, "object")}
          ${this.numberField("W", "w", object.w, "object")}
          ${this.numberField("H", "h", object.h, "object")}
        </div>
      `;
    }

    const object = this.findObject(selection.kind, selection.id);
    if (!object) return `<div class="empty-inspector">Missing object</div>`;
    const rectFields = `
      ${this.textField("ID", "id", String(object.id), "object")}
      <div class="inspector-grid four">
        ${this.numberField("X", "x", object.x, "object")}
        ${this.numberField("Y", "y", object.y, "object")}
        ${this.numberField("W", "w", object.w, "object")}
        ${this.numberField("H", "h", object.h, "object")}
      </div>
    `;
    return `${rectFields}${this.kindSpecificFields(selection.kind, object)}`;
  }

  private kindSpecificFields(kind: RectCollection, object: RectObject): string {
    const record = object as unknown as Record<string, unknown>;
    if (kind === "solids") {
      return `
        <div class="inspector-grid two">
          ${this.selectField("Sprite", "sprite", String(record.sprite || ""), [
            { value: "", label: "legacy/auto" },
            { value: "auto", label: "auto" },
            ...solidSpriteValues.filter((value) => value !== "auto")
          ])}
          ${this.selectField("Material", "material", String(record.material || ""), terrainMaterialOptions)}
          ${this.selectField("Collision", "collision", String(record.collision || ""), solidCollisionOptions)}
          ${this.selectField("Tone", "tone", String(record.tone || ""), ["", "steel", "glass", "warning", "dark"])}
        </div>
      `;
    }
    if (kind === "conveyors") {
      return `
        <div class="inspector-grid two">
          ${this.selectField("Direction", "direction", String(record.direction || 1), [
            { value: "1", label: "Right" },
            { value: "-1", label: "Left" }
          ])}
          ${this.numberField("Speed", "conveyorSpeed", Number(record.speed || 1.4), "object", 0.1)}
        </div>
      `;
    }
    if (kind === "platforms" || kind === "drones" || kind === "movingLasers") {
      const moving = object as MovingPlatform | PatrolDrone | MovingLaser;
      const path = movingPath(moving);
      const axisName = moving.axis === "x" ? "X" : "Y";
      const movingFields = `
        <div class="inspector-grid two">
          ${this.selectField("Axis", "axis", String(record.axis || "x"), ["x", "y"])}
          ${this.numberField("Speed", "speed", path.speed || 1, "object", 5)}
        </div>
        <div class="inspector-grid four">
          ${this.numberField(`Start ${axisName}`, "pathStart", path.start, "object")}
          ${this.numberField(`End ${axisName}`, "pathEnd", path.end, "object")}
          ${this.numberField("Cycle", "period", Number(record.period || 1), "object", 1)}
          ${this.numberField("Phase", "phase", Number(record.phase || 0), "object", 0.1)}
        </div>
      `;
      if (kind === "drones") {
        return `${movingFields}
          ${this.textField("Disabled By", "disabledBy", listToCsv(record.disabledBy as string[] | undefined), "object")}
        `;
      }
      if (kind !== "movingLasers") return movingFields;
      return `${movingFields}
        ${this.selectField("Beam", "beamAxis", String(record.beamAxis || "auto"), [
          { value: "auto", label: "Auto" },
          { value: "x", label: "Horizontal" },
          { value: "y", label: "Vertical" }
        ])}
        ${this.textField("Disabled By", "disabledBy", listToCsv(record.disabledBy as string[] | undefined), "object")}
        ${this.checkboxField("Starts On", "startsOn", record.startsOn !== false)}
      `;
    }
    if (kind === "launchPads") {
      return `
        <div class="inspector-grid two">
          ${this.numberField("Power X", "powerX", Number(record.powerX || 0), "object", 0.5)}
          ${this.numberField("Power Y", "powerY", Number(record.powerY || 12), "object", 0.5)}
        </div>
      `;
    }
    if (kind === "plates") {
      return `${this.textField("Label", "label", String(record.label || ""), "object")}${this.checkboxField("Once", "once", record.once === true)}`;
    }
    if (kind === "timedSwitches") {
      return `
        ${this.textField("Label", "label", String(record.label || ""), "object")}
        ${this.numberField("Duration", "duration", Number(record.duration || 180), "object", 1)}
      `;
    }
    if (kind === "echoSensors") {
      return `
        ${this.textField("Label", "label", String(record.label || ""), "object")}
        ${this.selectField("Actors", "actors", String(record.actors || "echo"), [
          { value: "echo", label: "Echo Only" },
          { value: "player", label: "Player Only" },
          { value: "both", label: "Either" }
        ])}
      `;
    }
    if (kind === "doors") {
      return `
        ${this.textField("Opens With", "opensWith", listToCsv(record.opensWith as string[] | undefined), "object")}
        ${this.textField("Requires Core", "requiresCore", String(record.requiresCore || ""), "object")}
        ${this.checkboxField("Inverted", "inverted", record.inverted === true)}
      `;
    }
    if (kind === "lasers") {
      return `
        ${this.textField("Disabled By", "disabledBy", listToCsv(record.disabledBy as string[] | undefined), "object")}
        ${this.checkboxField("Starts On", "startsOn", record.startsOn !== false)}
      `;
    }
    if (kind === "cores") {
      const requiredCoreIds = doorRequiredCoreIds(this.level.doors || []);
      const displayedSize = isMajorCore(record as Core, requiredCoreIds) ? "large" : "small";
      return `
        ${this.textField("Label", "label", String(record.label || ""), "object")}
        ${this.selectField("Size", "size", displayedSize, [
          { value: "small", label: "Small" },
          { value: "large", label: "Large" }
        ])}
      `;
    }
    if (kind === "monsters") {
      const monster = object as Monster;
      const axis = monster.axis || "x";
      const path = movingPath({
        ...monster,
        axis,
        distance: monster.distance || 0,
        period: monster.period || 180
      });
      const axisName = axis === "x" ? "X" : "Y";
      return `
        <div class="inspector-grid two">
          ${this.selectField("Kind", "kind", String(record.kind || "sprout-hopper"), monsterKinds.map((value) => ({ value, label: value })))}
          ${this.selectField("Vulnerable", "vulnerableFrom", String(record.vulnerableFrom || "default"), [
            { value: "default", label: "Default" },
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
            { value: "both", label: "Top or Bottom" }
          ])}
          ${this.numberField("Score", "scoreValue", Number(record.score || 0), "object", 50)}
          ${this.checkboxField("Killable", "killable", record.killable !== false)}
        </div>
        <div class="inspector-grid two">
          ${this.selectField("Axis", "axis", axis, ["x", "y"])}
          ${this.numberField("Speed", "speed", path.speed || 80, "object", 5)}
        </div>
        <div class="inspector-grid four">
          ${this.numberField(`Start ${axisName}`, "pathStart", path.start, "object")}
          ${this.numberField(`End ${axisName}`, "pathEnd", path.end, "object")}
          ${this.numberField("Cycle", "period", Number(record.period || 180), "object", 1)}
          ${this.numberField("Phase", "phase", Number(record.phase || 0), "object", 0.1)}
        </div>
      `;
    }
    if (kind === "bosses") {
      const checkpoint = isRecord(record.checkpoint) ? record.checkpoint : null;
      const checkpointX = checkpoint ? numberValue(checkpoint.x, object.x - 60) : object.x - 60;
      const checkpointY = checkpoint ? numberValue(checkpoint.y, object.y + object.h - 48) : object.y + object.h - 48;
      return `
        <div class="inspector-grid two">
          ${this.selectField("Kind", "kind", String(record.kind || "storm-relay-warden"), bossKinds.map((value) => ({ value, label: value })))}
          ${this.selectField("Entry", "entrySide", String(record.entrySide || "right"), bossEntrySides.map((value) => ({ value, label: value })))}
          ${this.selectField("Weak Spot", "weakSpot", String(record.weakSpot || "top"), bossWeakSpots.map((value) => ({ value, label: value })))}
          ${this.numberField("Intro Seconds", "introSeconds", Number(record.introSeconds || 17), "object", 1)}
          ${this.numberField("Health", "health", Number(record.health || 3), "object", 1)}
          ${this.numberField("Score", "scoreValue", Number(record.score || 0), "object", 100)}
        </div>
        <div class="inspector-grid two">
          ${this.numberField("Checkpoint X", "checkpointX", checkpointX, "object", GRID)}
          ${this.numberField("Checkpoint Y", "checkpointY", checkpointY, "object", GRID)}
        </div>
      `;
    }
    return "";
  }

  private textField(label: string, field: string, value: string, scope: "level" | "object"): string {
    const attr = scope === "level" ? "data-level-field" : "data-object-field";
    return `<label class="editor-field"><span>${label}</span><input ${attr}="${field}" value="${escapeHtml(value)}" /></label>`;
  }

  private textAreaField(label: string, field: string, value: string): string {
    return `<label class="editor-field"><span>${label}</span><textarea data-level-field="${field}">${escapeHtml(value)}</textarea></label>`;
  }

  private soundtrackField(level: Level): string {
    const auto = soundtracks[defaultSoundtrackKeyForLevel(level, this.currentIndex)];
    const options: SelectOption[] = [
      { value: "", label: `Auto: ${auto.title}` },
      ...levelSoundtrackKeys.map((key) => ({
        value: key,
        label: `${soundtracks[key].title} (${Math.round(soundtracks[key].durationSeconds)}s)`
      }))
    ];
    return this.selectField("Level MP3", "soundtrackKey", level.soundtrackKey || "", options, "level");
  }

  private backgroundField(level: Level): string {
    const auto = backgroundForLevel(level, this.currentIndex);
    const options: SelectOption[] = [
      { value: "", label: `Auto: ${auto.title}` },
      ...levelBackgroundKeys.map((key) => ({
        value: key,
        label: `${levelBackgrounds[key].title} (${levelBackgrounds[key].sourceSize.w}x${levelBackgrounds[key].sourceSize.h})`
      }))
    ];
    return this.selectField("Background", "backgroundKey", level.backgroundKey || "", options, "level");
  }

  private backgroundAmbienceField(level: Level): string {
    const ambience = normalizeBackgroundAmbience(level.backgroundAmbience);
    const options: SelectOption[] = backgroundAmbiencePresets.map((preset) => ({
      value: preset,
      label: backgroundAmbiencePresetLabels[preset]
    }));
    return `
      ${this.selectField("Ambience", "backgroundAmbience.preset", ambience.preset, options, "level")}
      <div class="inspector-grid two">
        ${this.colorField("Glow Color", "backgroundAmbience.color", ambience.color)}
        ${this.rangeField("Intensity", "backgroundAmbience.intensity", ambience.intensity)}
        ${this.rangeField("Drift", "backgroundAmbience.drift", ambience.drift)}
        ${this.rangeField("Flicker", "backgroundAmbience.flicker", ambience.flicker)}
        ${this.rangeField("Particles", "backgroundAmbience.particles", ambience.particles)}
      </div>
      <p class="editor-field-note">Ambience renders behind gameplay. Keep values subtle so floors, platforms, and hazards stay readable.</p>
    `;
  }

  private numberField(label: string, field: string, value: number, scope: "level" | "object", step = GRID): string {
    const attr = scope === "level" ? "data-level-field" : "data-object-field";
    return `<label class="editor-field"><span>${label}</span><input ${attr}="${field}" data-field-type="number" type="number" step="${step}" value="${Number(value.toFixed(2))}" /></label>`;
  }

  private rangeField(label: string, field: string, value: number): string {
    const percent = Math.round(value * 100);
    return `<label class="editor-field range-field"><span>${label} ${percent}%</span><input data-level-field="${field}" data-field-type="number" type="range" min="0" max="1" step="0.05" value="${Number(value.toFixed(2))}" /></label>`;
  }

  private colorField(label: string, field: string, value: string): string {
    return `<label class="editor-field color-field"><span>${label}</span><input data-level-field="${field}" type="color" value="${escapeHtml(value)}" /></label>`;
  }

  private checkboxField(label: string, field: string, checked: boolean): string {
    return `<label class="editor-check"><input data-object-field="${field}" type="checkbox" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
  }

  private levelCheckboxField(label: string, field: string, checked: boolean): string {
    return `<label class="editor-check"><input data-level-field="${field}" type="checkbox" ${checked ? "checked" : ""} /><span>${label}</span></label>`;
  }

  private selectField(label: string, field: string, value: string, options: SelectOption[], scope: "level" | "object" = "object"): string {
    const attr = scope === "level" ? "data-level-field" : "data-object-field";
    return `<label class="editor-field"><span>${label}</span><select ${attr}="${field}">${options
      .map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option || "default" : option.label;
        return `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
      })
      .join("")}</select></label>`;
  }

  private renderValidation(): void {
    const messages = this.validateLevels();
    const validation = this.require<HTMLElement>("[data-validation]");
    validation.dataset.editorValidation = messages.length === 0 ? "clean" : "issues";
    validation.innerHTML =
      messages.length === 0
        ? `<div class="validation-clean">No validation issues.</div>`
        : messages
            .map(
              (message) =>
                `<div class="validation-item ${message.severity}"><strong>${message.severity}</strong><span>${escapeHtml(message.text)}</span></div>`
            )
            .join("");
  }

  private validateLevels(): ValidationMessage[] {
    const messages = this.levels.flatMap((level, index) => this.validateLevel(level, index));
    const ids = new Map<string, number[]>();
    const indexes = new Map<number, string[]>();

    this.levels.forEach((level, index) => {
      const id = level.id.trim();
      if (id) ids.set(id, [...(ids.get(id) || []), index + 1]);
      indexes.set(level.index, [...(indexes.get(level.index) || []), level.name || `Level ${index + 1}`]);
    });

    for (const [id, positions] of ids) {
      if (positions.length > 1) {
        messages.push({
          severity: "error",
          text: `Duplicate level id ${id} appears at positions ${positions.join(", ")}.`
        });
      }
    }
    for (const [index, names] of indexes) {
      if (names.length > 1) {
        messages.push({
          severity: "error",
          text: `Duplicate level index ${index} is used by ${names.join(", ")}.`
        });
      }
    }

    return messages;
  }

  private validateLevel(level: Level, index: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    if (!level.id.trim()) messages.push({ severity: "error", text: `Level ${index + 1} has an empty id.` });
    if (level.index !== index) {
      messages.push({ severity: "warning", text: `${level.name} index is ${level.index}; expected ${index}.` });
    }
    if (!Number.isInteger(level.index) || level.index < 0) {
      messages.push({ severity: "error", text: `${level.name} index must be a non-negative integer.` });
    }
    if (level.soundtrackKey && !isLevelSoundtrackKey(level.soundtrackKey)) {
      messages.push({ severity: "error", text: `${level.name} references an unknown level soundtrack ${level.soundtrackKey}.` });
    }
    if (level.backgroundKey && !isLevelBackgroundKey(level.backgroundKey)) {
      messages.push({ severity: "error", text: `${level.name} references an unknown level background ${level.backgroundKey}.` });
    }
    if (level.backgroundAmbience) {
      const ambience = level.backgroundAmbience;
      if (ambience.preset && !isBackgroundAmbiencePreset(ambience.preset)) {
        messages.push({ severity: "error", text: `${level.name} ambience preset ${ambience.preset} is unknown.` });
      }
      if (ambience.color && !isBackgroundAmbienceColor(ambience.color)) {
        messages.push({ severity: "error", text: `${level.name} ambience color must be a #rrggbb hex value.` });
      }
      for (const key of ["intensity", "drift", "flicker", "particles"] as const) {
        const value = ambience[key];
        if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
          messages.push({ severity: "error", text: `${level.name} ambience ${key} must be between 0 and 1.` });
        }
      }
    }
    if (level.bounds.w <= 0 || level.bounds.h <= 0) {
      messages.push({ severity: "error", text: `${level.name} bounds must have positive size.` });
    }
    if (!rectInside(this.startRectForLevel(level), level.bounds)) {
      messages.push({ severity: "error", text: `${level.name} start footprint is outside bounds.` });
    }
    if (!rectInside(level.exit, level.bounds)) {
      messages.push({ severity: "error", text: `${level.name} exit is outside bounds.` });
    }
    if (level.score.lives !== null && (!Number.isInteger(level.score.lives) || level.score.lives <= 0)) {
      messages.push({ severity: "error", text: `${level.name} lives must be unlimited or a positive integer.` });
    }
    if (!Number.isInteger(level.score.coreScore) || level.score.coreScore < 0) {
      messages.push({ severity: "error", text: `${level.name} core score must be a non-negative integer.` });
    }
    if (!Number.isInteger(level.score.deathPenalty) || level.score.deathPenalty < 0) {
      messages.push({ severity: "error", text: `${level.name} death penalty must be a non-negative integer.` });
    }
    if (!Number.isInteger(level.score.timeBonusTargetSeconds) || level.score.timeBonusTargetSeconds <= 0) {
      messages.push({ severity: "error", text: `${level.name} time bonus target must be a positive whole second count.` });
    }
    if (!Number.isInteger(level.score.timeBonusPerSecond) || level.score.timeBonusPerSecond < 0) {
      messages.push({ severity: "error", text: `${level.name} score per saved second must be a non-negative integer.` });
    }

    const objectIds = new Map<string, string>();
    for (const kind of rectCollections) {
      for (const object of readCollection(level, kind)) {
        if (!object.id.trim()) {
          messages.push({ severity: "error", text: `${level.name} has an empty ${collectionLabels[kind]} id.` });
        } else if (objectIds.has(object.id)) {
          messages.push({ severity: "error", text: `${level.name} duplicates object id ${object.id}.` });
        }
        objectIds.set(object.id, kind);
        if (object.w <= 0 || object.h <= 0) {
          messages.push({ severity: "error", text: `${level.name}:${object.id} has non-positive size.` });
        }
        if (kind === "platforms" || kind === "drones" || kind === "movingLasers") {
          const moving = object as MovingPlatform | PatrolDrone | MovingLaser;
          if (!Number.isFinite(moving.distance) || moving.distance < 0) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid movement distance.` });
          }
          if (!Number.isFinite(moving.period) || moving.period <= 0) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid movement period.` });
          }
        }
        if (kind === "monsters") {
          const monster = object as Monster;
          if (!monsterKinds.includes(monster.kind as MonsterKind)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has unknown monster kind ${String(monster.kind)}.` });
          }
          if (monster.vulnerableFrom && !(["top", "bottom", "both"] as MonsterVulnerability[]).includes(monster.vulnerableFrom)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid monster vulnerability.` });
          }
          if (monster.distance !== undefined && (!Number.isFinite(monster.distance) || monster.distance < 0)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid monster movement distance.` });
          }
          if (monster.period !== undefined && (!Number.isFinite(monster.period) || monster.period <= 0)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid monster movement period.` });
          }
        }
        if (kind === "bosses") {
          const boss = object as Boss;
          if (!bossKinds.includes(boss.kind as Boss["kind"])) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has unknown boss kind ${String(boss.kind)}.` });
          }
          if (!bossEntrySides.includes((boss.entrySide || "right") as BossEntrySide)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid boss entry side.` });
          }
          if (!bossWeakSpots.includes((boss.weakSpot || "top") as BossWeakSpot)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid boss weak spot.` });
          }
          if (boss.introSeconds !== undefined && (!Number.isFinite(boss.introSeconds) || boss.introSeconds <= 0)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid boss intro seconds.` });
          }
          if (boss.health !== undefined && (!Number.isFinite(boss.health) || boss.health <= 0)) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid boss health.` });
          }
          if (boss.checkpoint && (!Number.isFinite(boss.checkpoint.x) || !Number.isFinite(boss.checkpoint.y))) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid boss checkpoint.` });
          }
        }
        if (kind === "conveyors") {
          const conveyor = object as Conveyor;
          if ((conveyor.direction !== -1 && conveyor.direction !== 1) || !Number.isFinite(conveyor.speed) || conveyor.speed < 0) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid conveyor settings.` });
          }
        }
        if (kind === "launchPads") {
          const launchPad = object as LaunchPad;
          if (!Number.isFinite(launchPad.powerY) || launchPad.powerY <= 0 || (launchPad.powerX !== undefined && !Number.isFinite(launchPad.powerX))) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid launch force.` });
          }
        }
        if (kind === "timedSwitches") {
          const timedSwitch = object as TimedSwitch;
          if (!Number.isFinite(timedSwitch.duration) || timedSwitch.duration <= 0) {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid timed switch duration.` });
          }
        }
        if (kind === "echoSensors") {
          const sensor = object as EchoSensor;
          if (sensor.actors && sensor.actors !== "echo" && sensor.actors !== "player" && sensor.actors !== "both") {
            messages.push({ severity: "error", text: `${level.name}:${object.id} has invalid sensor actor mode.` });
          }
        }
        if (this.isStaticToolkitSurface(kind)) {
          const movingSurface = this.movingPlatformMount(level, object);
          if (movingSurface) {
            messages.push({
              severity: "error",
              text: `${level.name}:${object.id} cannot ride moving platform ${movingSurface.id}; place it on a static surface.`
            });
          }
        }
        const structuralSolid =
          kind === "solids" &&
          this.isBoundaryStructuralSolid(level, object as Solid);
        if (!structuralSolid && !rectInside(object, level.bounds)) {
          messages.push({ severity: "warning", text: `${level.name}:${object.id} is outside level bounds.` });
        }
      }
    }

    const triggerIds = new Set([
      ...readCollection(level, "plates").map((plate) => plate.id),
      ...readCollection(level, "timedSwitches").map((timedSwitch) => timedSwitch.id),
      ...readCollection(level, "echoSensors").map((sensor) => sensor.id)
    ]);
    const coreIds = new Set(readCollection(level, "cores").map((core) => core.id));
    for (const door of readCollection(level, "doors") as Door[]) {
      for (const triggerId of door.opensWith || []) {
        if (!triggerIds.has(triggerId)) {
          messages.push({ severity: "error", text: `${level.name}:${door.id} references missing trigger ${triggerId}.` });
        }
      }
      if (door.requiresCore && !coreIds.has(door.requiresCore)) {
        messages.push({ severity: "error", text: `${level.name}:${door.id} references missing core ${door.requiresCore}.` });
      }
      const floorThreshold = level.bounds.y + level.bounds.h - 50;
      if (door.y + door.h >= floorThreshold && door.y > level.bounds.y + CLOSED_GATE_MAX_TOP) {
        messages.push({ severity: "warning", text: `${level.name}:${door.id} may be short enough to jump over.` });
      }
    }
    for (const laser of [...readCollection(level, "lasers"), ...readCollection(level, "movingLasers")] as Array<Laser | MovingLaser>) {
      for (const triggerId of laser.disabledBy || []) {
        if (!triggerIds.has(triggerId)) {
          messages.push({ severity: "error", text: `${level.name}:${laser.id} references missing trigger ${triggerId}.` });
        }
      }
    }
    for (const drone of readCollection(level, "drones") as PatrolDrone[]) {
      for (const triggerId of drone.disabledBy || []) {
        if (!triggerIds.has(triggerId)) {
          messages.push({ severity: "error", text: `${level.name}:${drone.id} references missing trigger ${triggerId}.` });
        }
      }
    }
    return messages;
  }

  private isBoundaryStructuralSolid(level: Level, solid: Solid): boolean {
    if (solid.id === "left-wall" || solid.id === "right-wall" || solid.id === "floor" || solid.id.startsWith("floor-")) return true;
    const floorBand = level.bounds.y + level.bounds.h - 80;
    const sideBand = 32;
    if (solid.sprite === "floor" && solid.y >= floorBand) return true;
    if (solid.sprite === "wall" && (solid.x <= level.bounds.x + sideBand || solid.x + solid.w >= level.bounds.x + level.bounds.w - sideBand)) return true;
    return false;
  }

  private movingPlatformMount(level: Level, rect: Rect): MovingPlatform | null {
    return (
      (level.platforms || []).find(
        (platform) => rectsOverlapX(rect, platform) && Math.abs(rect.y + rect.h - platform.y) <= 2
      ) || null
    );
  }

  private renderExport(): void {
    this.exportArea.value = `${JSON.stringify(exportableLevels(this.levels), null, 2)}\n`;
  }

  private renderCanvas(): void {
    if (!this.context) return;
    this.resizeCanvas();
    this.canvas.dataset.editorView = JSON.stringify({ x: this.view.x, y: this.view.y, w: this.view.w });
    const ctx = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(this.view.w, this.view.w);
    ctx.translate(-this.view.x, -this.view.y);
    this.drawGrid();
    this.drawBounds();
    this.drawCollections();
    this.drawStartAndExit();
    this.drawSelectionHandles();
    ctx.restore();
    this.renderZoomReadout();
  }

  private drawGrid(): void {
    const ctx = this.context;
    const visible = this.visibleWorldRect();
    const startX = Math.floor(visible.x / GRID) * GRID;
    const endX = visible.x + visible.w;
    const startY = Math.floor(visible.y / GRID) * GRID;
    const endY = visible.y + visible.h;
    ctx.lineWidth = 1 / this.view.w;
    ctx.strokeStyle = "rgba(67, 247, 255, 0.08)";
    for (let x = startX; x <= endX; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 227, 90, 0.13)";
    for (let x = Math.floor(visible.x / 100) * 100; x <= endX; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
  }

  private drawBounds(): void {
    const ctx = this.context;
    const bounds = this.level.bounds;
    ctx.fillStyle = "#081322";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.strokeStyle = "rgba(67, 247, 255, 0.75)";
    ctx.lineWidth = 2 / this.view.w;
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  private drawCollections(): void {
    this.canvas.dataset.editorSolidRenderOrder = this.sortedSolidsForRender()
      .map((solid) => `${solid.id}:${solidRenderDepth(solid).toFixed(3)}`)
      .join(",");
    for (const kind of rectCollections) {
      const objects = kind === "solids" ? this.sortedSolidsForRender() : readCollection(this.level, kind);
      for (const object of objects) {
        this.drawObject(kind, object);
      }
    }
  }

  private sortedSolidsForRender(): Solid[] {
    return this.level.solids
      .map((solid, index) => ({ solid, index }))
      .sort((a, b) => solidRenderDepth(a.solid) - solidRenderDepth(b.solid) || a.index - b.index)
      .map(({ solid }) => solid);
  }

  private drawObject(kind: RectCollection, object: RectObject): void {
    const ctx = this.context;
    const style = styleForKind(kind, object);
    const selected = this.selectionMatches({ kind, id: object.id });
    const drawMotionPath = (): void => {
      if (kind === "platforms" || kind === "drones" || kind === "movingLasers") {
        this.drawMotionPath(kind, object as MovingPlatform | PatrolDrone | MovingLaser, selected);
      }
    };

    if (kind === "oneWays") {
      this.drawOneWay(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "conveyors") {
      this.drawConveyor(object as Conveyor, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "cores") {
      this.drawDiamond(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "launchPads") {
      this.drawLaunchPad(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "echoSensors") {
      this.drawEchoSensor(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "hazards") {
      this.drawHazard(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "movingLasers") {
      this.drawMovingLaser(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "drones") {
      this.drawDrone(object, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "solids") {
      this.drawSolid(object as Solid, style, selected);
      drawMotionPath();
      return;
    }
    if (kind === "bosses") {
      this.drawBossArena(object as Boss, style, selected);
      return;
    }

    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    this.drawObjectLabel(object, object.id, style.text);
    drawMotionPath();
  }

  private drawBossArena(object: Boss, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.setLineDash([16 / this.view.w, 10 / this.view.w]);
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    ctx.setLineDash([]);

    const checkpoint = object.checkpoint || { x: object.x - 60, y: object.y + object.h - 48 };
    const radius = Math.max(9 / this.view.w, 7);
    ctx.fillStyle = "rgba(80, 255, 194, 0.9)";
    ctx.strokeStyle = "#041018";
    ctx.lineWidth = 2 / this.view.w;
    ctx.beginPath();
    ctx.arc(checkpoint.x, checkpoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(80, 255, 194, 0.55)";
    ctx.lineWidth = 2 / this.view.w;
    ctx.beginPath();
    ctx.moveTo(checkpoint.x - radius * 1.7, checkpoint.y);
    ctx.lineTo(checkpoint.x + radius * 1.7, checkpoint.y);
    ctx.moveTo(checkpoint.x, checkpoint.y - radius * 1.7);
    ctx.lineTo(checkpoint.x, checkpoint.y + radius * 1.7);
    ctx.stroke();
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawSolid(object: Solid, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    const collision = solidCollisionFor(object);
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);

    if (collision === "top-only") {
      ctx.strokeStyle = "#fff8bf";
      ctx.lineWidth = 3 / this.view.w;
      ctx.beginPath();
      ctx.moveTo(object.x, object.y);
      ctx.lineTo(object.x + object.w, object.y);
      ctx.stroke();
    } else if (collision === "decorative") {
      ctx.strokeStyle = "rgba(236, 251, 255, 0.5)";
      ctx.lineWidth = 1.5 / this.view.w;
      for (let x = object.x + 8; x < object.x + object.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, object.y + object.h - 4);
        ctx.lineTo(x + 8, object.y + 4);
        ctx.stroke();
      }
    }

    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawOneWay(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.beginPath();
    ctx.moveTo(object.x, object.y);
    ctx.lineTo(object.x + object.w, object.y);
    ctx.stroke();
    for (let x = object.x + 8; x < object.x + object.w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, object.y + object.h - 3);
      ctx.lineTo(x + 7, object.y + 4);
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawConveyor(object: Conveyor, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    const direction = object.direction >= 0 ? 1 : -1;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    for (let x = object.x + 12; x < object.x + object.w - 8; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x - direction * 7, object.y + object.h / 2);
      ctx.lineTo(x + direction * 7, object.y + object.h / 2);
      ctx.lineTo(x + direction * 2, object.y + object.h / 2 - 5);
      ctx.moveTo(x + direction * 7, object.y + object.h / 2);
      ctx.lineTo(x + direction * 2, object.y + object.h / 2 + 5);
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawLaunchPad(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    for (let x = object.x + 6; x < object.x + object.w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, object.y + object.h - 3);
      ctx.lineTo(x + 6, object.y + 4);
      ctx.lineTo(x + 12, object.y + object.h - 3);
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawEchoSensor(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    ctx.strokeRect(object.x, object.y, object.w, object.h);
    ctx.setLineDash([8 / this.view.w, 5 / this.view.w]);
    ctx.strokeRect(object.x + 5, object.y + 5, Math.max(0, object.w - 10), Math.max(0, object.h - 10));
    ctx.setLineDash([]);
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawMovingLaser(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    const beam = this.movingLaserBeamRect(object as MovingLaser);
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(beam.x, beam.y, beam.w, beam.h);
    ctx.strokeRect(beam.x, beam.y, beam.w, beam.h);
    ctx.beginPath();
    if (beam.w >= beam.h) {
      ctx.moveTo(beam.x, beam.y + beam.h / 2);
      ctx.lineTo(beam.x + beam.w, beam.y + beam.h / 2);
    } else {
      ctx.moveTo(beam.x + beam.w / 2, beam.y);
      ctx.lineTo(beam.x + beam.w / 2, beam.y + beam.h);
    }
    ctx.stroke();
    this.drawObjectLabel(beam, object.id, style.text);
  }

  private movingLaserBeamRect(laser: MovingLaser): Rect {
    const centerX = laser.x + laser.w / 2;
    const centerY = laser.y + laser.h / 2;
    const span = Math.max(laser.w, laser.h);
    const cross = Math.min(laser.w, laser.h);
    const beamAxis = movingLaserBeamAxis(laser);
    const w = beamAxis === "x" ? span : cross;
    const h = beamAxis === "x" ? cross : span;
    return {
      x: centerX - w / 2,
      y: centerY - h / 2,
      w,
      h
    };
  }

  private drawHazard(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.fillRect(object.x, object.y, object.w, object.h);
    for (let x = object.x; x < object.x + object.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, object.y + object.h);
      ctx.lineTo(x + 6, object.y);
      ctx.lineTo(x + 12, object.y + object.h);
      ctx.closePath();
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawDrone(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.roundRect(object.x, object.y, object.w, object.h, 5);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawDiamond(object: RectObject, style: { fill: string; stroke: string; text: string }, selected: boolean): void {
    const ctx = this.context;
    const cx = object.x + object.w / 2;
    const cy = object.y + object.h / 2;
    const large = isMajorCore(object as Core, doorRequiredCoreIds(this.level.doors || []));
    if (large) {
      const radius = Math.max(object.w, object.h) * 1.18;
      ctx.fillStyle = "rgba(67, 247, 255, 0.16)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = selected ? "#fff8bf" : "#43f7ff";
      ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.74, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = selected ? "#fff8bf" : style.stroke;
    ctx.lineWidth = selected ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.moveTo(cx, object.y);
    ctx.lineTo(object.x + object.w, cy);
    ctx.lineTo(cx, object.y + object.h);
    ctx.lineTo(object.x, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (large) {
      ctx.strokeStyle = "#43f7ff";
      ctx.lineWidth = 1.5 / this.view.w;
      ctx.beginPath();
      ctx.moveTo(cx, object.y + object.h * 0.18);
      ctx.lineTo(object.x + object.w * 0.82, cy);
      ctx.lineTo(cx, object.y + object.h * 0.82);
      ctx.lineTo(object.x + object.w * 0.18, cy);
      ctx.closePath();
      ctx.stroke();
    }
    this.drawObjectLabel(object, object.id, style.text);
  }

  private drawStartAndExit(): void {
    const ctx = this.context;
    const startRect = this.startRect();
    const startStyle = styleForKind("start");
    ctx.fillStyle = startStyle.fill;
    ctx.strokeStyle = this.selectionMatches({ kind: "start" }) ? "#fff8bf" : startStyle.stroke;
    ctx.lineWidth = this.selectionMatches({ kind: "start" }) ? 4 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.roundRect(startRect.x, startRect.y, startRect.w, startRect.h, 5);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(startRect, "start", startStyle.text);

    const exit = this.level.exit;
    const exitStyle = styleForKind("exit");
    ctx.fillStyle = exitStyle.fill;
    ctx.strokeStyle = this.selectionMatches({ kind: "exit" }) ? "#fff8bf" : exitStyle.stroke;
    ctx.lineWidth = this.selectionMatches({ kind: "exit" }) ? 4 / this.view.w : 3 / this.view.w;
    ctx.beginPath();
    ctx.ellipse(exit.x + exit.w / 2, exit.y + exit.h / 2, exit.w / 2, exit.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.drawObjectLabel(exit, "exit", exitStyle.text);
  }

  private drawMotionPath(kind: MovingKind, object: MovingPlatform | PatrolDrone | MovingLaser, selected: boolean): void {
    const ctx = this.context;
    const { start, end } = movingPathPoints(object);
    const color = kind === "platforms" ? "#ffe35a" : "#ff4f8b";
    const fill = kind === "platforms" ? "rgba(255, 227, 90, 0.95)" : "rgba(255, 79, 139, 0.95)";
    const radius = selected ? 6 / this.view.w : 4 / this.view.w;

    ctx.strokeStyle = selected ? color : kind === "platforms" ? "rgba(255, 227, 90, 0.38)" : "rgba(255, 79, 139, 0.34)";
    ctx.lineWidth = selected ? 3 / this.view.w : 2 / this.view.w;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = fill;
    ctx.strokeStyle = "#ecfbff";
    ctx.lineWidth = 1.5 / this.view.w;
    for (const point of [start, end]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawSelectionHandles(): void {
    if (!this.selection || !this.canResizeSelection(this.selection)) return;
    const rect = this.rectForSelection(this.selection);
    if (!rect) return;
    const ctx = this.context;
    const size = Math.max(8 / this.view.w, 5);
    ctx.fillStyle = "#fff8bf";
    ctx.strokeStyle = "#05070d";
    ctx.lineWidth = 1.5 / this.view.w;
    for (const { point } of this.resizeHandlesForSelection(this.selection, rect)) {
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    }
  }

  private drawObjectLabel(rect: Rect, label: string, color: string): void {
    if (this.view.w < 0.28) return;
    const ctx = this.context;
    ctx.fillStyle = color;
    ctx.font = `${Math.max(10 / this.view.w, 8)}px EchoInterface, Arial, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(label, rect.x + 4 / this.view.w, rect.y + 3 / this.view.w, Math.max(0, rect.w - 8));
  }

  private hitTest(point: Vec2): Selection | null {
    const tolerance = HIT_TOLERANCE_PX / this.view.w;
    const candidates: Array<{ selection: Selection; rect: Rect }> = [];
    for (const kind of [...rectCollections].reverse()) {
      const objects = kind === "solids" ? [...this.sortedSolidsForRender()].reverse() : [...readCollection(this.level, kind)].reverse();
      for (const object of objects) {
        candidates.push({ selection: { kind, id: object.id }, rect: object });
      }
    }
    if (rectContainsWithTolerance(this.level.exit, point, 0)) return { kind: "exit" };
    if (rectContainsWithTolerance(this.startRect(), point, 0)) return { kind: "start" };
    for (const candidate of candidates) {
      if (rectContainsWithTolerance(candidate.rect, point, 0)) return candidate.selection;
    }
    if (rectContainsWithTolerance(this.level.exit, point, tolerance)) return { kind: "exit" };
    if (rectContainsWithTolerance(this.startRect(), point, tolerance)) return { kind: "start" };
    for (const candidate of candidates) {
      if (rectContainsWithTolerance(candidate.rect, point, tolerance)) return candidate.selection;
    }
    return null;
  }

  private rectForSelection(selection: Selection): Rect | null {
    if (selection.kind === "start") return this.startRect();
    if (selection.kind === "exit") return { ...this.level.exit };
    const object = this.findObject(selection.kind, selection.id);
    return object ? { x: object.x, y: object.y, w: object.w, h: object.h } : null;
  }

  private startRect(): Rect {
    return this.startRectForLevel(this.level);
  }

  private startRectForLevel(level: Level): Rect {
    return { x: level.start.x, y: level.start.y, w: PLAYER_RECT.w, h: PLAYER_RECT.h };
  }

  private selectedRectObject(): RectObject | null {
    if (!this.selection || this.selection.kind === "start") return null;
    if (this.selection.kind === "exit") return this.level.exit as RectObject;
    return this.findObject(this.selection.kind, this.selection.id);
  }

  private findObject(kind: RectCollection, id: string): RectObject | null {
    return readCollection(this.level, kind).find((item) => item.id === id) || null;
  }

  private selectionMatches(selection: Selection): boolean {
    if (!this.selection || this.selection.kind !== selection.kind) return false;
    if (!("id" in this.selection) && !("id" in selection)) return true;
    return "id" in this.selection && "id" in selection && this.selection.id === selection.id;
  }

  private rectSummary(rect: Rect): string {
    return `${Math.round(rect.x)}, ${Math.round(rect.y)} / ${Math.round(rect.w)} x ${Math.round(rect.h)}`;
  }

  private screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x / this.view.w + this.view.x,
      y: point.y / this.view.w + this.view.y
    };
  }

  private visibleWorldRect(): Rect {
    return {
      x: this.view.x,
      y: this.view.y,
      w: this.canvas.width / this.view.w,
      h: this.canvas.height / this.view.w
    };
  }

  private resizeCanvas(): void {
    const width = Math.max(320, Math.floor(this.canvas.clientWidth));
    const height = Math.max(280, Math.floor(this.canvas.clientHeight));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  private fitLevel(): void {
    const margin = 80;
    const bounds = this.level.bounds;
    const zoomX = this.canvas.width / (bounds.w + margin * 2);
    const zoomY = this.canvas.height / (bounds.h + margin * 2);
    this.view.w = clamp(Math.min(zoomX, zoomY), 0.16, 1.4);
    this.view.x = bounds.x - margin;
    this.view.y = bounds.y - margin;
    this.renderZoomReadout();
  }

  private centerOnStart(): void {
    this.view.w = clamp(this.view.w || 1, 0.65, 1.25);
    this.view.x = this.level.start.x - this.canvas.width / this.view.w * 0.18;
    this.view.y = this.level.start.y - this.canvas.height / this.view.w * 0.64;
    this.renderZoomReadout();
  }

  private zoomAtCanvasCenter(factor: number): void {
    this.zoomAtScreenPoint({ x: this.canvas.width / 2, y: this.canvas.height / 2 }, factor);
  }

  private zoomAtScreenPoint(point: Vec2, factor: number): void {
    const before = this.screenToWorld(point);
    this.view.w = clamp(this.view.w * factor, 0.16, 2.2);
    const after = this.screenToWorld(point);
    this.view.x += before.x - after.x;
    this.view.y += before.y - after.y;
    this.renderCanvas();
  }

  private renderZoomReadout(): void {
    const readout = this.host.querySelector<HTMLElement>("[data-zoom-readout]");
    if (readout) readout.textContent = `${Math.round(this.view.w * 100)}%`;
  }

  private afterMutation(status: string): void {
    this.renderPanelTabs();
    this.renderObjectList();
    this.renderInspector();
    this.renderValidation();
    this.renderExport();
    this.renderCanvas();
    this.persistDraft(status);
  }

  private persistDraft(status: string): boolean {
    const draft: EditorDraft = {
      motionModel: ANCHORED_MOTION_MODEL,
      levels: exportableLevels(this.levels),
      currentIndex: this.currentIndex
    };
    try {
      window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      this.setStatus(status);
      return true;
    } catch {
      this.setStatus(`${status}; draft storage unavailable`);
      return false;
    }
  }

  private playtestDraft(): void {
    if (!this.persistDraft("Draft saved for playtest")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("editor");
    url.searchParams.set("playtestDraft", "1");
    url.searchParams.set("level", String(this.currentIndex));
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  }

  private loadDraft(): EditorDraft | null {
    try {
      const raw = window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.levels)) return null;
      const draftAnchored = usesAnchoredMotionModel(parsed);
      const levels = parsed.levels
        .map((level, index) => normalizeImportedLevel(level, index, draftAnchored))
        .filter((level): level is Level => Boolean(level));
      if (levels.length === 0) return null;
      return {
        motionModel: ANCHORED_MOTION_MODEL,
        levels,
        currentIndex: levelIndex(parsed.currentIndex, levels.length - 1)
      };
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    try {
      window.localStorage.removeItem(EDITOR_DRAFT_STORAGE_KEY);
    } catch {
      this.setStatus("Draft storage unavailable");
    }
  }

  private applyImport(): void {
    const raw = this.importArea.value.trim();
    if (!raw) {
      this.setStatus("Import field is empty");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const imported = parsed
          .map((level, index) => normalizeImportedLevel(level, index))
          .filter((level): level is Level => Boolean(level));
        if (imported.length === 0) throw new Error("No valid levels found");
        this.levels = imported;
        this.reindexLevels();
        this.currentIndex = levelIndex(this.currentIndex, this.levels.length - 1);
      } else {
        const imported = normalizeImportedLevel(parsed, this.currentIndex);
        if (!imported) throw new Error("No valid level found");
        imported.index = this.currentIndex;
        this.levels[this.currentIndex] = imported;
        this.reindexLevels();
      }
      this.selection = null;
      this.importArea.value = "";
      this.fitLevel();
      this.renderAll();
      this.persistDraft("Import applied");
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : "Import failed");
    }
  }

  private async copyExport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.exportArea.value);
      this.setStatus("Export copied");
    } catch {
      this.exportArea.focus();
      this.exportArea.select();
      document.execCommand("copy");
      this.setStatus("Export selected");
    }
  }

  private downloadExport(): void {
    const blob = new Blob([this.exportArea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "echo-shift-levels.json";
    anchor.click();
    URL.revokeObjectURL(url);
    this.setStatus("Export downloaded");
  }

  private setStatus(message: string): void {
    this.statusElement.textContent = message;
  }

  private require<T extends Element>(selector: string): T {
    const element = this.host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing editor element: ${selector}`);
    return element;
  }
}

export const mountLevelEditor = (host: HTMLElement): (() => void) => {
  const editor = new LevelEditor(host);
  editor.mount();
  return () => editor.destroy();
};
