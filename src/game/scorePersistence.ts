import { recordLevelScore } from "./progress";
import { recordCampaignLevelScore, type CampaignRunSummary } from "./session";
import type { LevelScore } from "./types";

export type ScorePersistenceResult = {
  recorded: boolean;
  campaignSummary: CampaignRunSummary | null;
};

export const recordEligibleScore = (score: LevelScore, levelIndex: number, scoreEligible: boolean): ScorePersistenceResult => {
  if (!scoreEligible) return { recorded: false, campaignSummary: null };
  recordLevelScore(score, levelIndex);
  return {
    recorded: true,
    campaignSummary: recordCampaignLevelScore(score)
  };
};
