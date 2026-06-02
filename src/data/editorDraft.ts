import type { Level } from "../game/types";
import { isLevelBackgroundKey } from "../game/backgrounds";
import { isLevelSoundtrackKey } from "../game/soundtracks";

export const EDITOR_DRAFT_STORAGE_KEY = "echo-shift-level-editor-draft-v1";

export type EditorDraftSnapshot = {
  levels: Level[];
  currentIndex: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const levelIndex = (value: unknown, maxIndex: number): number =>
  Math.max(0, Math.min(Math.max(0, maxIndex), Math.max(0, Math.round(finiteNumber(value, 0)))));

const finiteValue = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integerValue = (value: unknown): value is number => finiteValue(value) && Number.isInteger(value);
const positiveIntegerValue = (value: unknown): value is number => integerValue(value) && value > 0;
const nonNegativeIntegerValue = (value: unknown): value is number => integerValue(value) && value >= 0;

const stringValue = (value: unknown): value is string => typeof value === "string";

const optionalString = (value: unknown): boolean => value === undefined || stringValue(value);
const optionalLevelSoundtrackKey = (value: unknown): boolean => value === undefined || isLevelSoundtrackKey(value);
const optionalLevelBackgroundKey = (value: unknown): boolean => value === undefined || isLevelBackgroundKey(value);

const optionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean";

const optionalStringArray = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every(stringValue));

const rectLike = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && finiteValue(value.x) && finiteValue(value.y) && finiteValue(value.w) && finiteValue(value.h) && value.w > 0 && value.h > 0;

const objectRectLike = (value: unknown): value is Record<string, unknown> => rectLike(value) && stringValue(value.id) && value.id.length > 0;

const movingObjectLike = (value: unknown): boolean =>
  objectRectLike(value) &&
  (value.axis === "x" || value.axis === "y") &&
  finiteValue(value.distance) &&
  value.distance >= 0 &&
  finiteValue(value.period) &&
  value.period > 0 &&
  (value.phase === undefined || finiteValue(value.phase));

const solidLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.tone);
const hazardLike = (value: unknown): boolean => objectRectLike(value);
const plateLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.label) && optionalBoolean(value.once);
const coreLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.label);
const doorLike = (value: unknown): boolean =>
  objectRectLike(value) && optionalStringArray(value.opensWith) && optionalString(value.requiresCore) && optionalBoolean(value.inverted);
const laserLike = (value: unknown): boolean =>
  objectRectLike(value) && optionalStringArray(value.disabledBy) && optionalBoolean(value.startsOn);

const optionalObjectArray = (value: unknown, predicate: (item: unknown) => boolean): boolean =>
  value === undefined || (Array.isArray(value) && value.every(predicate));

const levelLike = (value: unknown): value is Level => {
  if (!isRecord(value)) return false;
  const medalFrames = value.medalFrames;
  return (
    stringValue(value.id) &&
    nonNegativeIntegerValue(value.index) &&
    stringValue(value.name) &&
    stringValue(value.subtitle) &&
    optionalLevelSoundtrackKey(value.soundtrackKey) &&
    optionalLevelBackgroundKey(value.backgroundKey) &&
    isRecord(value.start) &&
    finiteValue(value.start.x) &&
    finiteValue(value.start.y) &&
    rectLike(value.exit) &&
    rectLike(value.bounds) &&
    Array.isArray(value.solids) &&
    value.solids.every(solidLike) &&
    optionalObjectArray(value.platforms, movingObjectLike) &&
    optionalObjectArray(value.drones, movingObjectLike) &&
    optionalObjectArray(value.plates, plateLike) &&
    optionalObjectArray(value.doors, doorLike) &&
    optionalObjectArray(value.lasers, laserLike) &&
    optionalObjectArray(value.cores, coreLike) &&
    optionalObjectArray(value.hazards, hazardLike) &&
    nonNegativeIntegerValue(value.perfectEchoes) &&
    isRecord(medalFrames) &&
    positiveIntegerValue(medalFrames.gold) &&
    positiveIntegerValue(medalFrames.silver) &&
    medalFrames.silver >= medalFrames.gold &&
    stringValue(value.hint)
  );
};

export const readEditorDraftSnapshot = (): EditorDraftSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.levels)) return null;
    if (parsed.levels.length === 0 || !parsed.levels.every(levelLike)) return null;
    const levels = parsed.levels;
    return {
      levels,
      currentIndex: levelIndex(parsed.currentIndex, levels.length - 1)
    };
  } catch {
    return null;
  }
};

export const updateEditorDraftCurrentIndex = (index: number): void => {
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.levels) || parsed.levels.length === 0) return;
    parsed.currentIndex = levelIndex(index, parsed.levels.length - 1);
    window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    return;
  }
};

export const readEditorDraftCurrentIndex = (): number => {
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.levels) || parsed.levels.length === 0) return 0;
    return levelIndex(parsed.currentIndex, parsed.levels.length - 1);
  } catch {
    return 0;
  }
};
