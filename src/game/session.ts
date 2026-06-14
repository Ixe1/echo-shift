import type { Level } from "./types";

export const DEFAULT_GLOBAL_LIVES = 3;
export const CORES_PER_BONUS_LIFE = 30;

type CampaignVitals = {
  lives: number;
  collectedCoreCount: number;
  collectedCoreKeys: Set<string>;
  awardedBonusLives: number;
};

export type CoreLifeAward = {
  counted: boolean;
  livesAwarded: number;
  lives: number;
  collectedCoreCount: number;
};

export type CampaignRunSummary = {
  score: number;
  frames: number;
  deaths: number;
  cores: number;
  levels: number;
};

const defaultVitals = (): CampaignVitals => ({
  lives: DEFAULT_GLOBAL_LIVES,
  collectedCoreCount: 0,
  collectedCoreKeys: new Set<string>(),
  awardedBonusLives: 0
});

let campaignVitals = defaultVitals();
let campaignRunSummary: CampaignRunSummary = {
  score: 0,
  frames: 0,
  deaths: 0,
  cores: 0,
  levels: 0
};

const finiteLifeCount = (value: unknown, fallback = DEFAULT_GLOBAL_LIVES): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
};

export const resetCampaignCoreBonusProgress = (): void => {
  campaignVitals.collectedCoreCount = 0;
  campaignVitals.collectedCoreKeys.clear();
  campaignVitals.awardedBonusLives = 0;
};

export const resetCampaignVitals = (lives = DEFAULT_GLOBAL_LIVES): void => {
  campaignVitals = {
    lives: finiteLifeCount(lives),
    collectedCoreCount: 0,
    collectedCoreKeys: new Set<string>(),
    awardedBonusLives: 0
  };
  campaignRunSummary = {
    score: 0,
    frames: 0,
    deaths: 0,
    cores: 0,
    levels: 0
  };
};

export const levelUsesFiniteLives = (level: Pick<Level, "score">): boolean => level.score.lives !== null;

export const campaignLivesForLevel = (level: Pick<Level, "score">): number | null =>
  levelUsesFiniteLives(level) ? campaignVitals.lives : null;

export const syncCampaignLives = (lives: number | null): void => {
  if (lives === null) return;
  campaignVitals.lives = finiteLifeCount(lives);
};

export const registerCampaignCorePickup = (levelId: string, coreId: string): CoreLifeAward => {
  const key = `${levelId}:${coreId}`;
  if (campaignVitals.collectedCoreKeys.has(key)) {
    return {
      counted: false,
      livesAwarded: 0,
      lives: campaignVitals.lives,
      collectedCoreCount: campaignVitals.collectedCoreCount
    };
  }

  campaignVitals.collectedCoreKeys.add(key);
  const award = syncCampaignCoreBonusProgress(campaignVitals.collectedCoreCount + 1);

  return {
    counted: true,
    livesAwarded: award.livesAwarded,
    lives: award.lives,
    collectedCoreCount: award.collectedCoreCount
  };
};

export const syncCampaignCoreBonusProgress = (carriedCoreCount: number): CoreLifeAward => {
  const nextCoreCount = finiteLifeCount(carriedCoreCount, 0);
  const nextBonusLives = Math.floor(nextCoreCount / CORES_PER_BONUS_LIFE);
  const livesAwarded = Math.max(0, nextBonusLives - campaignVitals.awardedBonusLives);
  if (livesAwarded > 0) {
    campaignVitals.lives += livesAwarded;
    campaignVitals.awardedBonusLives += livesAwarded;
  }
  const counted = nextCoreCount !== campaignVitals.collectedCoreCount || livesAwarded > 0;
  campaignVitals.collectedCoreCount = nextCoreCount;
  return {
    counted,
    livesAwarded,
    lives: campaignVitals.lives,
    collectedCoreCount: campaignVitals.collectedCoreCount
  };
};

export const campaignCoreCount = (): number => campaignVitals.collectedCoreCount;

export const recordCampaignLevelScore = (score: Pick<CampaignRunSummary, "score" | "frames" | "deaths" | "cores">): CampaignRunSummary => {
  campaignRunSummary = {
    score: campaignRunSummary.score + finiteLifeCount(score.score, 0),
    frames: campaignRunSummary.frames + finiteLifeCount(score.frames, 0),
    deaths: campaignRunSummary.deaths + finiteLifeCount(score.deaths, 0),
    cores: campaignRunSummary.cores + finiteLifeCount(score.cores, 0),
    levels: campaignRunSummary.levels + 1
  };
  return currentCampaignRunSummary();
};

export const currentCampaignRunSummary = (): CampaignRunSummary => ({ ...campaignRunSummary });
