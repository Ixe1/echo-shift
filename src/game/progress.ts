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

const levelScoreLike = (value: unknown): value is LevelScore =>
  isRecord(value) &&
  typeof value.levelId === "string" &&
  typeof value.score === "number" &&
  Number.isFinite(value.score) &&
  typeof value.frames === "number" &&
  Number.isFinite(value.frames) &&
  typeof value.echoes === "number" &&
  Number.isFinite(value.echoes) &&
  typeof value.deaths === "number" &&
  Number.isFinite(value.deaths) &&
  typeof value.cores === "number" &&
  Number.isFinite(value.cores) &&
  typeof value.timeBonus === "number" &&
  Number.isFinite(value.timeBonus);

const normalizedScores = (value: unknown): Record<string, LevelScore> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, score]) => levelScoreLike(score))) as Record<string, LevelScore>;
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
