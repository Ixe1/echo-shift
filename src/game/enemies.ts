import { rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import type {
  ActorBody,
  Boss,
  BossEntrySide,
  BossKind,
  BossPhase,
  BossWeakSpot,
  Monster,
  MonsterKind,
  MonsterVulnerability,
  Rect
} from "./types";

export const BOSS_INTRO_SECONDS = 17;
export const BOSS_INTRO_FRAMES = BOSS_INTRO_SECONDS * 60;
export const BOSS_INVULNERABLE_FRAMES = 54;
export const BOSS_HIT_BOUNCE_SPEED = -12.2;
export const MONSTER_BOUNCE_SPEED = -10.8;

export const monsterKinds = [
  "sprout-hopper",
  "glasswing-wisp",
  "root-roller",
  "gutter-skimmer",
  "copper-leech",
  "storm-snail",
  "frost-crawler",
  "cryo-puffer",
  "shard-wisp",
  "bookbeetle",
  "page-mote",
  "index-mimic",
  "gear-tick",
  "pendulum-drone",
  "sand-winder"
] as const satisfies readonly MonsterKind[];

export const bossKinds = [
  "storm-relay-warden",
  "cryo-conservator",
  "archive-custodian",
  "clockwork-regent"
] as const satisfies readonly BossKind[];

export const bossEntrySides = ["left", "right", "top", "bottom", "center"] as const satisfies readonly BossEntrySide[];
export const bossWeakSpots = ["top", "bottom", "core"] as const satisfies readonly BossWeakSpot[];

export type BossRuntimeState = {
  id: string;
  phase: BossPhase;
  introFrames: number;
  activeFrames: number;
  health: number;
  invulnerableFrames: number;
};

type MonsterDefinition = {
  score: number;
  killable: boolean;
  vulnerableFrom: MonsterVulnerability;
};

const monsterDefinitions: Record<MonsterKind, MonsterDefinition> = {
  "sprout-hopper": { score: 100, killable: true, vulnerableFrom: "top" },
  "glasswing-wisp": { score: 150, killable: true, vulnerableFrom: "bottom" },
  "root-roller": { score: 200, killable: true, vulnerableFrom: "top" },
  "gutter-skimmer": { score: 150, killable: true, vulnerableFrom: "top" },
  "copper-leech": { score: 200, killable: true, vulnerableFrom: "bottom" },
  "storm-snail": { score: 300, killable: true, vulnerableFrom: "top" },
  "frost-crawler": { score: 150, killable: true, vulnerableFrom: "top" },
  "cryo-puffer": { score: 250, killable: true, vulnerableFrom: "bottom" },
  "shard-wisp": { score: 200, killable: true, vulnerableFrom: "both" },
  bookbeetle: { score: 150, killable: true, vulnerableFrom: "top" },
  "page-mote": { score: 200, killable: true, vulnerableFrom: "both" },
  "index-mimic": { score: 400, killable: true, vulnerableFrom: "top" },
  "gear-tick": { score: 200, killable: true, vulnerableFrom: "top" },
  "pendulum-drone": { score: 300, killable: true, vulnerableFrom: "top" },
  "sand-winder": { score: 400, killable: true, vulnerableFrom: "top" }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const finiteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const normalizeMonsterKind = (value: unknown): MonsterKind =>
  monsterKinds.includes(value as MonsterKind) ? (value as MonsterKind) : "sprout-hopper";

export const normalizeMonsterVulnerability = (value: unknown): MonsterVulnerability | undefined =>
  value === "top" || value === "bottom" || value === "both" ? value : undefined;

export const normalizeBossKind = (value: unknown): BossKind =>
  bossKinds.includes(value as BossKind) ? (value as BossKind) : "storm-relay-warden";

export const normalizeBossEntrySide = (value: unknown): BossEntrySide =>
  bossEntrySides.includes(value as BossEntrySide) ? (value as BossEntrySide) : "right";

export const normalizeBossWeakSpot = (value: unknown): BossWeakSpot =>
  bossWeakSpots.includes(value as BossWeakSpot) ? (value as BossWeakSpot) : "top";

export const monsterScore = (monster: Monster): number =>
  Math.max(0, Math.round(finiteNumber(monster.score, monsterDefinitions[monster.kind].score)));

export const monsterKillable = (monster: Monster): boolean =>
  monster.killable !== false && monsterDefinitions[monster.kind].killable;

export const monsterVulnerability = (monster: Monster): MonsterVulnerability =>
  monster.vulnerableFrom || monsterDefinitions[monster.kind].vulnerableFrom;

export const monsterRectAt = (monster: Monster, tick: number): Rect => {
  const axis = monster.axis === "y" ? "y" : monster.axis === "x" ? "x" : null;
  const distance = Math.max(0, finiteNumber(monster.distance, 0));
  const period = Math.max(1, finiteNumber(monster.period, 1));
  const offset = axis && distance > 0 ? oscillatingOffsetAt(distance, period, finiteNumber(monster.phase, 0), tick) : 0;
  return {
    x: monster.x + (axis === "x" ? offset : 0),
    y: monster.y + (axis === "y" ? offset : 0),
    w: monster.w,
    h: monster.h
  };
};

export const actorKillsMonster = (actor: ActorBody, previousY: number, monster: Monster, rect: Rect): boolean => {
  if (!monsterKillable(monster) || !rectsOverlap(actor, rect)) return false;
  const vulnerability = monsterVulnerability(monster);
  const previousBottom = previousY + actor.h;
  const currentBottom = actor.y + actor.h;
  const topHit =
    (vulnerability === "top" || vulnerability === "both") &&
    actor.vy >= 0 &&
    previousBottom <= rect.y + 6 &&
    currentBottom <= rect.y + Math.max(10, rect.h * 0.7);
  const bottomHit =
    (vulnerability === "bottom" || vulnerability === "both") &&
    actor.vy <= 0 &&
    previousY >= rect.y + rect.h - 6 &&
    actor.y >= rect.y + Math.max(4, rect.h * 0.25);
  return topHit || bottomHit;
};

export const bossHealth = (boss: Boss): number => Math.max(1, Math.round(finiteNumber(boss.health, defaultBossHealth(boss.kind))));

export const bossScore = (boss: Boss): number => Math.max(0, Math.round(finiteNumber(boss.score, bossHealth(boss) * 1000)));

export const bossIntroFrames = (boss: Boss): number =>
  Math.max(1, Math.round(finiteNumber(boss.introSeconds, BOSS_INTRO_SECONDS) * 60));

export const defaultBossWeakSpotForKind = (kind: BossKind): BossWeakSpot => {
  if (kind === "cryo-conservator") return "bottom";
  if (kind === "clockwork-regent") return "core";
  return "top";
};

export const bossWeakSpot = (boss: Boss): BossWeakSpot => boss.weakSpot || defaultBossWeakSpotForKind(boss.kind);

export const createBossRuntimeState = (boss: Boss): BossRuntimeState => ({
  id: boss.id,
  phase: "idle",
  introFrames: 0,
  activeFrames: 0,
  health: bossHealth(boss),
  invulnerableFrames: 0
});

export const bossBodyRectAt = (boss: Boss, state: BossRuntimeState, tick: number): Rect => {
  const size = bossBodySize(boss);
  const target = bossTargetBodyRect(boss, size, tick);
  if (state.phase !== "intro") return target;

  const total = bossIntroFrames(boss);
  const progress = clamp(state.introFrames / total, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const start = bossEntryBodyRect(boss, size, target);
  return {
    x: start.x + (target.x - start.x) * eased,
    y: start.y + (target.y - start.y) * eased,
    w: size.w,
    h: size.h
  };
};

export const bossAttackRectsAt = (boss: Boss, state: BossRuntimeState, tick: number): Rect[] => {
  if (state.phase !== "active") return [];
  const body = bossBodyRectAt(boss, state, tick);
  const cycle = state.activeFrames % 180;
  if (cycle < 70) return [];
  if (cycle < 116) {
    return [
      {
        x: boss.x + 12,
        y: body.y + body.h * 0.58,
        w: Math.max(20, boss.w - 24),
        h: 14
      }
    ];
  }
  return [
    {
      x: body.x + body.w / 2 - 14,
      y: boss.y + 12,
      w: 28,
      h: Math.max(20, boss.h - 24)
    }
  ];
};

export const bossWeakSpotRectAt = (boss: Boss, body: Rect): Rect => {
  const spot = bossWeakSpot(boss);
  if (spot === "bottom") {
    const w = clamp(body.w * 0.42, 28, 58);
    const h = clamp(body.h * 0.2, 16, 30);
    return {
      x: body.x + body.w / 2 - w / 2,
      y: body.y + body.h - h + 4,
      w,
      h
    };
  }
  if (spot === "core") {
    const size = clamp(Math.min(body.w, body.h) * 0.34, 24, 48);
    return {
      x: body.x + body.w / 2 - size / 2,
      y: body.y + body.h * 0.42 - size / 2,
      w: size,
      h: size
    };
  }
  const w = clamp(body.w * 0.46, 32, 64);
  const h = clamp(body.h * 0.22, 16, 32);
  return {
    x: body.x + body.w / 2 - w / 2,
    y: body.y - 4,
    w,
    h
  };
};

export const bossTakesHit = (actor: ActorBody, previousY: number, boss: Boss, bossRect: Rect, state: BossRuntimeState): boolean => {
  if (state.phase !== "active" || state.invulnerableFrames > 0) return false;
  const weakSpotRect = bossWeakSpotRectAt(boss, bossRect);
  if (!rectsOverlap(actor, weakSpotRect)) return false;
  const weakSpotKind = bossWeakSpot(boss);
  const previousBottom = previousY + actor.h;
  const currentBottom = actor.y + actor.h;
  const topHit =
    (weakSpotKind === "top" || weakSpotKind === "core") &&
    actor.vy >= 0 &&
    previousBottom <= weakSpotRect.y + 8 &&
    currentBottom <= weakSpotRect.y + weakSpotRect.h + Math.max(6, weakSpotRect.h * 0.45);
  const bottomHit =
    (weakSpotKind === "bottom" || weakSpotKind === "core") &&
    actor.vy <= 0 &&
    previousY >= weakSpotRect.y + weakSpotRect.h - 8 &&
    actor.y >= weakSpotRect.y - Math.max(6, weakSpotRect.h * 0.4);
  return topHit || bottomHit;
};

const defaultBossHealth = (kind: BossKind): number => {
  if (kind === "clockwork-regent") return 5;
  if (kind === "archive-custodian") return 4;
  return 3;
};

const bossBodySize = (boss: Boss): { w: number; h: number } => ({
  w: clamp(boss.w * 0.2, 72, 140),
  h: clamp(boss.h * 0.36, 72, 150)
});

const bossTargetBodyRect = (boss: Boss, size: { w: number; h: number }, tick: number): Rect => {
  const marginX = Math.min(80, Math.max(20, boss.w * 0.12));
  const marginY = Math.min(54, Math.max(18, boss.h * 0.12));
  const travelX = Math.max(0, boss.w - size.w - marginX * 2);
  const travelY = Math.max(0, boss.h - size.h - marginY * 2);
  const xWave = (1 - Math.cos(tick / 96)) / 2;
  const yWave = (1 - Math.cos(tick / 132 + Math.PI / 2)) / 2;
  return {
    x: boss.x + marginX + travelX * xWave,
    y: boss.y + marginY + travelY * yWave,
    w: size.w,
    h: size.h
  };
};

const bossEntryBodyRect = (boss: Boss, size: { w: number; h: number }, target: Rect): Rect => {
  const side = normalizeBossEntrySide(boss.entrySide);
  if (side === "left") return { ...target, x: boss.x - size.w - 24 };
  if (side === "right") return { ...target, x: boss.x + boss.w + 24 };
  if (side === "top") return { ...target, y: boss.y - size.h - 24 };
  if (side === "bottom") return { ...target, y: boss.y + boss.h + 24 };
  return { ...target, x: boss.x + boss.w / 2 - size.w / 2, y: boss.y + boss.h / 2 - size.h / 2 };
};
