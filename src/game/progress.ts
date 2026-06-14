import type { LevelScore } from "./types";

const KEY = "echo-shift-progress-v1";

type ProgressData = {
  unlocked: number;
  scores: Record<string, LevelScore>;
};

type ProgressReadResult =
  | { ok: true; data: ProgressData }
  | { ok: false; data: ProgressData; message: string };

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
  finiteNumber(value.timeBonus) &&
  (value.legacy === undefined || typeof value.legacy === "boolean");

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
      timeBonus: nonNegativeInteger(value.timeBonus),
      ...(value.legacy === true ? { legacy: true } : {})
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
    timeBonus: 0,
    legacy: true
  };
};

const normalizedScores = (value: unknown): Record<string, LevelScore> | null => {
  if (!isRecord(value)) return null;
  const scores: Record<string, LevelScore> = {};
  for (const [key, score] of Object.entries(value)) {
    const normalized = normalizeLevelScore(key, score);
    if (!normalized) return null;
    scores[key] = normalized;
  }
  return scores;
};

const emptyProgress = (): ProgressData => ({ ...fallback, scores: {} });

const damagedProgress = (): ProgressReadResult => ({
  ok: false,
  data: emptyProgress(),
  message: "Local progress data is damaged."
});

const readProgress = (): ProgressReadResult => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ok: true, data: emptyProgress() };
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return damagedProgress();
    const scores = normalizedScores(parsed.scores);
    if (!scores) return damagedProgress();
    return {
      ok: true,
      data: {
        unlocked: Math.max(1, nonNegativeInteger(parsed.unlocked, 1)),
        scores
      }
    };
  } catch {
    return damagedProgress();
  }
};

const writeProgress = (data: ProgressData): boolean => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

export const getUnlockedLevelCount = (): number => readProgress().data.unlocked;

export const getBestScores = (): Record<string, LevelScore> => readProgress().data.scores;

export const isBetterLevelScore = (score: LevelScore, previous: LevelScore | undefined): boolean => {
  if (!previous) return true;
  if (previous.legacy && !score.legacy) return true;
  if (score.legacy && !previous.legacy) return false;
  if (score.score !== previous.score) return score.score > previous.score;
  if (score.deaths !== previous.deaths) return score.deaths < previous.deaths;
  if (score.echoes !== previous.echoes) return score.echoes < previous.echoes;
  return score.frames < previous.frames;
};

export const recordLevelScore = (score: LevelScore, completedIndex: number): boolean => {
  const progress = readProgress();
  if (!progress.ok) return false;
  const data = progress.data;
  const previous = data.scores[score.levelId];

  if (isBetterLevelScore(score, previous)) {
    data.scores[score.levelId] = score;
  }

  data.unlocked = Math.max(data.unlocked, completedIndex + 2);
  return writeProgress(data);
};

export const unlockAllLevelsForSession = (count: number): void => {
  const progress = readProgress();
  if (!progress.ok) return;
  const data = progress.data;
  data.unlocked = Math.max(data.unlocked, count);
  writeProgress(data);
};
