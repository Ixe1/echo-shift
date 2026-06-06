import type { Level, LevelScoreSettings } from "./types";

const FPS = 60;

export const DEFAULT_SCORE_SETTINGS: LevelScoreSettings = {
  lives: 3,
  coreScore: 100,
  deathPenalty: 500,
  timeBonusTargetSeconds: 30,
  timeBonusPerSecond: 100
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const positiveInteger = (value: unknown, fallback: number): number =>
  Math.max(1, Math.round(finiteNumber(value, fallback)));

const nonNegativeInteger = (value: unknown, fallback: number): number =>
  Math.max(0, Math.round(finiteNumber(value, fallback)));

const livesValue = (value: unknown, fallback: number | null): number | null =>
  value === null ? null : positiveInteger(value, typeof fallback === "number" ? fallback : 3);

const legacyGoldSeconds = (legacyGoldFrames: unknown): number | null => {
  const frames = finiteNumber(legacyGoldFrames, Number.NaN);
  if (!Number.isFinite(frames) || frames <= 0) return null;
  return Math.max(1, Math.round(frames / FPS));
};

export const scoreSettingsFromGoldFrames = (goldFrames: number): LevelScoreSettings => ({
  ...DEFAULT_SCORE_SETTINGS,
  timeBonusTargetSeconds: Math.max(1, Math.round(goldFrames / FPS))
});

export const normalizeScoreSettings = (
  value: unknown,
  legacyGoldFrames?: unknown
): LevelScoreSettings => {
  const record = isRecord(value) ? value : {};
  const fallbackTarget = legacyGoldSeconds(legacyGoldFrames) || DEFAULT_SCORE_SETTINGS.timeBonusTargetSeconds;
  return {
    lives: livesValue(record.lives, DEFAULT_SCORE_SETTINGS.lives),
    coreScore: nonNegativeInteger(record.coreScore, DEFAULT_SCORE_SETTINGS.coreScore),
    deathPenalty: nonNegativeInteger(record.deathPenalty, DEFAULT_SCORE_SETTINGS.deathPenalty),
    timeBonusTargetSeconds: positiveInteger(record.timeBonusTargetSeconds, fallbackTarget),
    timeBonusPerSecond: nonNegativeInteger(record.timeBonusPerSecond, DEFAULT_SCORE_SETTINGS.timeBonusPerSecond)
  };
};

export const timeBonusForFrames = (frames: number, settings: LevelScoreSettings): number => {
  const elapsedSeconds = frames / FPS;
  const savedSeconds = Math.max(0, Math.floor(settings.timeBonusTargetSeconds - elapsedSeconds));
  return savedSeconds * settings.timeBonusPerSecond;
};

export const finalScoreForLevel = (level: Level, frames: number, currentScore: number): number =>
  Math.max(0, Math.round(currentScore + timeBonusForFrames(frames, level.score)));

export const formatScore = (score: number): string => Math.max(0, Math.round(score)).toString().padStart(6, "0");
