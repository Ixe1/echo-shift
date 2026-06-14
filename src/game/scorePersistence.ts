import { recordLevelScore } from "./progress";
import { recordCampaignLevelScore, type CampaignRunSummary } from "./session";
import type { LevelScore } from "./types";

export type ScorePersistenceResult = {
  recorded: boolean;
  campaignSummary: CampaignRunSummary | null;
  message?: string;
};

export const recordEligibleScore = (score: LevelScore, levelIndex: number, scoreEligible: boolean): ScorePersistenceResult => {
  if (!scoreEligible) return { recorded: false, campaignSummary: null };
  if (!recordLevelScore(score, levelIndex)) {
    return {
      recorded: false,
      campaignSummary: null,
      message: "Could not save progress locally."
    };
  }
  return {
    recorded: true,
    campaignSummary: recordCampaignLevelScore(score)
  };
};
