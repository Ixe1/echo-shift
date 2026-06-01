import type { LevelScore, Medal } from "./types";

const KEY = "echo-shift-progress-v1";

type ProgressData = {
  unlocked: number;
  scores: Record<string, LevelScore>;
};

const fallback: ProgressData = {
  unlocked: 1,
  scores: {}
};

const readProgress = (): ProgressData => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...fallback, scores: {} };
    const parsed = JSON.parse(raw) as ProgressData;
    return {
      unlocked: Math.max(1, parsed.unlocked || 1),
      scores: parsed.scores || {}
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

const medalRank: Record<Medal, number> = {
  Quantum: 4,
  Gold: 3,
  Silver: 2,
  Bronze: 1
};

export const isBetterLevelScore = (score: LevelScore, previous: LevelScore | undefined): boolean => {
  if (!previous) return true;
  const medalDelta = medalRank[score.medal] - medalRank[previous.medal];
  if (medalDelta !== 0) return medalDelta > 0;
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
