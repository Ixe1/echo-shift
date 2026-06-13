import type { Level } from "./types";

export const DEFAULT_GLOBAL_LIVES = 3;
export const CORES_PER_BONUS_LIFE = 30;

type CampaignVitals = {
  lives: number;
  collectedCoreCount: number;
  collectedCoreKeys: Set<string>;
};

export type CoreLifeAward = {
  counted: boolean;
  livesAwarded: number;
  lives: number;
  collectedCoreCount: number;
};

const defaultVitals = (): CampaignVitals => ({
  lives: DEFAULT_GLOBAL_LIVES,
  collectedCoreCount: 0,
  collectedCoreKeys: new Set<string>()
});

let campaignVitals = defaultVitals();

const finiteLifeCount = (value: unknown, fallback = DEFAULT_GLOBAL_LIVES): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
};

export const resetCampaignVitals = (lives = DEFAULT_GLOBAL_LIVES): void => {
  campaignVitals = {
    lives: finiteLifeCount(lives),
    collectedCoreCount: 0,
    collectedCoreKeys: new Set<string>()
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

  const previousBonusLives = Math.floor(campaignVitals.collectedCoreCount / CORES_PER_BONUS_LIFE);
  campaignVitals.collectedCoreKeys.add(key);
  campaignVitals.collectedCoreCount += 1;
  const nextBonusLives = Math.floor(campaignVitals.collectedCoreCount / CORES_PER_BONUS_LIFE);
  const livesAwarded = Math.max(0, nextBonusLives - previousBonusLives);
  if (livesAwarded > 0) campaignVitals.lives += livesAwarded;

  return {
    counted: true,
    livesAwarded,
    lives: campaignVitals.lives,
    collectedCoreCount: campaignVitals.collectedCoreCount
  };
};

export const campaignCoreCount = (): number => campaignVitals.collectedCoreCount;
