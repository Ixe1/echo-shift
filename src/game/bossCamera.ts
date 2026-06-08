import type { BossPhase } from "./types";

type BossCameraCandidate = {
  phase: BossPhase;
};

export const selectBossCameraFocus = <T extends BossCameraCandidate>(bosses: readonly T[]): T | undefined =>
  bosses.find((boss) => boss.phase === "active") || bosses.find((boss) => boss.phase === "departing");
