import type { BossKind, MonsterKind } from "./types";

export const BOSS_ATLAS_KEY = "boss-atlas";
export const BOSS_ATLAS_FRAME_WIDTH = 256;
export const BOSS_ATLAS_FRAME_HEIGHT = 256;
export const BOSS_FRAMES_PER_KIND = 4;

export const MONSTER_ATLAS_KEY = "monster-atlas";
export const MONSTER_ATLAS_FRAME_WIDTH = 96;
export const MONSTER_ATLAS_FRAME_HEIGHT = 96;
export const MONSTER_FRAMES_PER_KIND = 4;

export const POOF_SHEET_KEY = "enemy-poof";
export const POOF_FRAME_WIDTH = 96;
export const POOF_FRAME_HEIGHT = 96;
export const POOF_FRAME_COUNT = 6;

export type BossSpriteState = "idle" | "windup" | "attack" | "vulnerable";

const bossBaseFrames: Record<BossKind, number> = {
  "storm-relay-warden": 0,
  "cryo-conservator": 4,
  "archive-custodian": 8,
  "clockwork-regent": 12
};

const bossStateFrames: Record<BossSpriteState, number> = {
  idle: 0,
  windup: 1,
  attack: 2,
  vulnerable: 3
};

const monsterBaseFrames: Record<MonsterKind, number> = {
  "sprout-hopper": 0,
  "glasswing-wisp": 4,
  "root-roller": 8,
  "gutter-skimmer": 12,
  "copper-leech": 16,
  "storm-snail": 20,
  "frost-crawler": 24,
  "cryo-puffer": 28,
  "shard-wisp": 32,
  bookbeetle: 36,
  "page-mote": 40,
  "index-mimic": 44,
  "gear-tick": 48,
  "pendulum-drone": 52,
  "sand-winder": 56
};

export const bossFrameForKind = (kind: BossKind, state: BossSpriteState = "idle"): number =>
  (bossBaseFrames[kind] ?? bossBaseFrames["storm-relay-warden"]) + bossStateFrames[state];

export const monsterFrameForKind = (kind: MonsterKind, animationFrame = 0): number =>
  (monsterBaseFrames[kind] ?? monsterBaseFrames["sprout-hopper"]) + (((Math.round(animationFrame) % MONSTER_FRAMES_PER_KIND) + MONSTER_FRAMES_PER_KIND) % MONSTER_FRAMES_PER_KIND);
