import type { Level } from "../game/types";
import { isBackgroundAmbienceColor, isBackgroundAmbiencePreset, normalizeBackgroundAmbience } from "../game/backgroundAmbience";
import { isLevelBackgroundKey } from "../game/backgrounds";
import { normalizeScoreSettings } from "../game/scoring";
import { normalizeSolid, solidSpriteValues } from "../game/solidSprites";
import { isLevelSoundtrackKey } from "../game/soundtracks";
import { ANCHORED_MOTION_MODEL, normalizeLevelMotionModel, usesAnchoredMotionModel } from "./motionModel";

export const EDITOR_DRAFT_STORAGE_KEY = "echo-shift-level-editor-draft-v1";

export type EditorDraftSnapshot = {
  motionModel: typeof ANCHORED_MOTION_MODEL;
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
const optionalBackgroundAmbience = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) &&
    (value.preset === undefined || isBackgroundAmbiencePreset(value.preset)) &&
    (value.color === undefined || isBackgroundAmbienceColor(value.color)) &&
    (value.intensity === undefined || (finiteValue(value.intensity) && value.intensity >= 0 && value.intensity <= 1)) &&
    (value.drift === undefined || (finiteValue(value.drift) && value.drift >= 0 && value.drift <= 1)) &&
    (value.flicker === undefined || (finiteValue(value.flicker) && value.flicker >= 0 && value.flicker <= 1)) &&
    (value.particles === undefined || (finiteValue(value.particles) && value.particles >= 0 && value.particles <= 1)));

const optionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean";

const optionalStringArray = (value: unknown): boolean => value === undefined || (Array.isArray(value) && value.every(stringValue));

const scoreSettingsLike = (value: unknown): boolean =>
  isRecord(value) &&
  positiveIntegerValue(value.lives) &&
  nonNegativeIntegerValue(value.coreScore) &&
  nonNegativeIntegerValue(value.deathPenalty) &&
  positiveIntegerValue(value.timeBonusTargetSeconds) &&
  nonNegativeIntegerValue(value.timeBonusPerSecond);

const legacyMedalSettingsLike = (value: unknown): boolean =>
  isRecord(value) &&
  positiveIntegerValue(value.gold) &&
  positiveIntegerValue(value.silver) &&
  value.silver >= value.gold;

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

const solidSpriteValue = (value: unknown): boolean =>
  value === undefined || solidSpriteValues.includes(value as (typeof solidSpriteValues)[number]);

const solidLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.tone) && solidSpriteValue(value.sprite);
const oneWayLike = (value: unknown): boolean => objectRectLike(value);
const conveyorLike = (value: unknown): boolean =>
  objectRectLike(value) && (value.direction === -1 || value.direction === 1) && finiteValue(value.speed) && value.speed >= 0;
const hazardLike = (value: unknown): boolean => objectRectLike(value);
const launchPadLike = (value: unknown): boolean =>
  objectRectLike(value) && finiteValue(value.powerY) && value.powerY > 0 && (value.powerX === undefined || finiteValue(value.powerX));
const plateLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.label) && optionalBoolean(value.once);
const timedSwitchLike = (value: unknown): boolean =>
  objectRectLike(value) && positiveIntegerValue(value.duration) && optionalString(value.label);
const echoSensorLike = (value: unknown): boolean =>
  objectRectLike(value) &&
  (value.actors === undefined || value.actors === "echo" || value.actors === "player" || value.actors === "both") &&
  optionalString(value.label);
const coreLike = (value: unknown): boolean => objectRectLike(value) && optionalString(value.label);
const doorLike = (value: unknown): boolean =>
  objectRectLike(value) && optionalStringArray(value.opensWith) && optionalString(value.requiresCore) && optionalBoolean(value.inverted);
const laserLike = (value: unknown): boolean =>
  objectRectLike(value) && optionalStringArray(value.disabledBy) && optionalBoolean(value.startsOn);
const droneLike = (value: unknown): boolean => movingObjectLike(value) && optionalStringArray((value as Record<string, unknown>).disabledBy);
const movingLaserLike = (value: unknown): boolean => movingObjectLike(value) && optionalStringArray((value as Record<string, unknown>).disabledBy) && optionalBoolean((value as Record<string, unknown>).startsOn);
const crateLike = (value: unknown): boolean => objectRectLike(value);

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
    optionalBackgroundAmbience(value.backgroundAmbience) &&
    isRecord(value.start) &&
    finiteValue(value.start.x) &&
    finiteValue(value.start.y) &&
    rectLike(value.exit) &&
    rectLike(value.bounds) &&
    Array.isArray(value.solids) &&
    value.solids.every(solidLike) &&
    optionalObjectArray(value.oneWays, oneWayLike) &&
    optionalObjectArray(value.conveyors, conveyorLike) &&
    optionalObjectArray(value.platforms, movingObjectLike) &&
    optionalObjectArray(value.launchPads, launchPadLike) &&
    optionalObjectArray(value.drones, droneLike) &&
    optionalObjectArray(value.plates, plateLike) &&
    optionalObjectArray(value.timedSwitches, timedSwitchLike) &&
    optionalObjectArray(value.echoSensors, echoSensorLike) &&
    optionalObjectArray(value.doors, doorLike) &&
    optionalObjectArray(value.lasers, laserLike) &&
    optionalObjectArray(value.movingLasers, movingLaserLike) &&
    optionalObjectArray(value.cores, coreLike) &&
    optionalObjectArray(value.hazards, hazardLike) &&
    optionalObjectArray(value.crates, crateLike) &&
    (scoreSettingsLike(value.score) || legacyMedalSettingsLike(medalFrames)) &&
    stringValue(value.hint)
  );
};

const normalizedDraftLevel = (level: Level, draftAnchored: boolean): Level => {
  const legacyLevel = level as Level & { medalFrames?: Record<string, unknown>; perfectEchoes?: unknown };
  const normalized = normalizeLevelMotionModel(level, draftAnchored || usesAnchoredMotionModel(level)) as Level & {
    medalFrames?: Record<string, unknown>;
    perfectEchoes?: unknown;
  };
  const { medalFrames, perfectEchoes, ...levelWithoutLegacy } = normalized;
  void perfectEchoes;
  return {
    ...levelWithoutLegacy,
    score: normalizeScoreSettings(legacyLevel.score, legacyLevel.medalFrames?.gold),
    ...(level.backgroundAmbience ? { backgroundAmbience: normalizeBackgroundAmbience(level.backgroundAmbience) } : {}),
    solids: normalized.solids.map(normalizeSolid)
  };
};

export const readEditorDraftSnapshot = (): EditorDraftSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.levels)) return null;
    if (parsed.levels.length === 0 || !parsed.levels.every(levelLike)) return null;
    const draftAnchored = usesAnchoredMotionModel(parsed);
    const levels = parsed.levels.map((level) => normalizedDraftLevel(level, draftAnchored));
    return {
      motionModel: ANCHORED_MOTION_MODEL,
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
