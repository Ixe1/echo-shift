import type { LevelScore } from "./types";

const KEY = "echo-shift-progress-v1";

type ProgressData = {
  unlocked: number;
  scores: Record<string, LevelScore>;
};

const fallback: ProgressData = {
  unlocked: 1,
  scores: {}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const nonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (!finiteNumber(value)) return fallback;
  return Math.max(0, Math.round(value));
};

const levelScoreLike = (value: unknown): value is LevelScore =>
  isRecord(value) &&
  typeof value.levelId === "string" &&
  finiteNumber(value.score) &&
  finiteNumber(value.frames) &&
  finiteNumber(value.echoes) &&
  finiteNumber(value.deaths) &&
  finiteNumber(value.cores) &&
  finiteNumber(value.timeBonus);

const legacyLevelScoreLike = (value: unknown): value is { levelId: string; frames: number; echoes: number; medal: string } =>
  isRecord(value) &&
  typeof value.levelId === "string" &&
  finiteNumber(value.frames) &&
  finiteNumber(value.echoes) &&
  typeof value.medal === "string";

const normalizeLevelScore = (key: string, value: unknown): LevelScore | null => {
  if (levelScoreLike(value)) {
    return {
      levelId: value.levelId,
      score: nonNegativeInteger(value.score),
      frames: nonNegativeInteger(value.frames),
      echoes: nonNegativeInteger(value.echoes),
      deaths: nonNegativeInteger(value.deaths),
      cores: nonNegativeInteger(value.cores),
      timeBonus: nonNegativeInteger(value.timeBonus)
    };
  }
  if (!legacyLevelScoreLike(value)) return null;
  return {
    levelId: value.levelId || key,
    score: 0,
    frames: nonNegativeInteger(value.frames),
    echoes: nonNegativeInteger(value.echoes),
    deaths: 0,
    cores: 0,
    timeBonus: 0
  };
};

const normalizedScores = (value: unknown): Record<string, LevelScore> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, score]) => {
      const normalized = normalizeLevelScore(key, score);
      return normalized ? [[key, normalized]] : [];
    })
  );
};

const readProgress = (): ProgressData => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...fallback, scores: {} };
    const parsed = JSON.parse(raw) as ProgressData;
    return {
      unlocked: Math.max(1, parsed.unlocked || 1),
      scores: normalizedScores(parsed.scores)
    };
  } catch {
    return { ...fallback, scores: {} };
  }
};

const writeProgress = (data: ProgressData): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    return;
  }
};

export const getUnlockedLevelCount = (): number => readProgress().unlocked;

export const getBestScores = (): Record<string, LevelScore> => readProgress().scores;

export const isBetterLevelScore = (score: LevelScore, previous: LevelScore | undefined): boolean => {
  if (!previous) return true;
  if (score.score !== previous.score) return score.score > previous.score;
  if (score.deaths !== previous.deaths) return score.deaths < previous.deaths;
  if (score.echoes !== previous.echoes) return score.echoes < previous.echoes;
  return score.frames < previous.frames;
};

export const recordLevelScore = (score: LevelScore, completedIndex: number): void => {
  const data = readProgress();
  const previous = data.scores[score.levelId];

  if (isBetterLevelScore(score, previous)) {
    data.scores[score.levelId] = score;
  }

  data.unlocked = Math.max(data.unlocked, completedIndex + 2);
  writeProgress(data);
};

export const unlockAllLevelsForSession = (count: number): void => {
  const data = readProgress();
  data.unlocked = Math.max(data.unlocked, count);
  writeProgress(data);
};
