import { rectCenter, rectsOverlap } from "./geometry";
import { oscillatingOffsetAt } from "./motion";
import type {
  ActorBody,
  Boss,
  BossAttackSnapshot,
  BossEntrySide,
  BossFloorIceSnapshot,
  BossKind,
  BossPhase,
  BossWeakSpot,
  Monster,
  MonsterKind,
  MonsterVulnerability,
  Rect,
  Solid
} from "./types";

export const BOSS_INTRO_SECONDS = 17;
export const BOSS_INTRO_FRAMES = BOSS_INTRO_SECONDS * 60;
export const BOSS_INVULNERABLE_FRAMES = 54;
export const BOSS_HIT_BOUNCE_SPEED = -12.2;
export const MONSTER_BOUNCE_SPEED = -10.8;
export const BOSS_ATTACK_CYCLE_FRAMES = 180;
export const BOSS_ATTACK_WINDUP_FRAMES = 56;
export const BOSS_ATTACK_ACTIVE_FRAMES = 48;
export const BOSS_VULNERABLE_READY_FRAMES = 18;
export const BOSS_VULNERABLE_FRAMES = BOSS_ATTACK_CYCLE_FRAMES - BOSS_ATTACK_WINDUP_FRAMES - BOSS_ATTACK_ACTIVE_FRAMES - BOSS_VULNERABLE_READY_FRAMES;

const STORM_ATTACK_CYCLE_FRAMES = 330;
const STORM_ATTACK_WINDUP_FRAMES = 112;
const STORM_ATTACK_ACTIVE_FRAMES = 54;
const STORM_VULNERABLE_READY_FRAMES = 72;
const STORM_VULNERABLE_WEAK_SPOT_CLEARANCE = 88;
const STORM_HIT_PAUSE_FRAMES = 48;
const STORM_HIT_RISE_FRAMES = 120;
const STORM_HIT_PATROL_FRAMES = 54;
const STORM_HIT_RECOVERY_FRAMES = STORM_HIT_PAUSE_FRAMES + STORM_HIT_RISE_FRAMES + STORM_HIT_PATROL_FRAMES;
const STORM_FLOOR_SHOCK_CORE_WIDTH = 72;
const STORM_FLOOR_SHOCK_TILE_WIDTH = 32;
const STORM_FLOOR_SHOCK_WIDTH = STORM_FLOOR_SHOCK_CORE_WIDTH + STORM_FLOOR_SHOCK_TILE_WIDTH * 2;
const STORM_FLOOR_SHOCK_HEIGHT = 10;
const STORM_VERTICAL_FLIGHT_EASE = 0.055;

const CRYO_ATTACK_CYCLE_FRAMES = 336;
const CRYO_ATTACK_WINDUP_FRAMES = 104;
const CRYO_ATTACK_ACTIVE_FRAMES = 50;
const CRYO_VULNERABLE_READY_FRAMES = 68;
const CRYO_VULNERABLE_WEAK_SPOT_CLEARANCE = 86;
const CRYO_HIT_PAUSE_FRAMES = 48;
const CRYO_HIT_RISE_FRAMES = 126;
const CRYO_HIT_PATROL_FRAMES = 60;
const CRYO_HIT_RECOVERY_FRAMES = CRYO_HIT_PAUSE_FRAMES + CRYO_HIT_RISE_FRAMES + CRYO_HIT_PATROL_FRAMES;
const CRYO_FLOOR_ICE_WIDTH = 128;
const CRYO_FLOOR_ICE_HEIGHT = 8;
const CRYO_FLOOR_ICE_LIFE_FRAMES = 7 * 60;
const CRYO_FLOOR_ICE_MAX_PATCHES = 3;
const CRYO_VERTICAL_FLIGHT_EASE = 0.045;

type BossTimingSource = BossKind | { kind?: BossKind };

const bossKindForTiming = (source?: BossTimingSource): BossKind | undefined => (typeof source === "string" ? source : source?.kind);

export const bossAttackCycleFramesFor = (source?: BossTimingSource): number => {
  const kind = bossKindForTiming(source);
  if (kind === "storm-relay-warden") return STORM_ATTACK_CYCLE_FRAMES;
  if (kind === "cryo-conservator") return CRYO_ATTACK_CYCLE_FRAMES;
  return BOSS_ATTACK_CYCLE_FRAMES;
};

export const bossAttackWindupFramesFor = (source?: BossTimingSource): number => {
  const kind = bossKindForTiming(source);
  if (kind === "storm-relay-warden") return STORM_ATTACK_WINDUP_FRAMES;
  if (kind === "cryo-conservator") return CRYO_ATTACK_WINDUP_FRAMES;
  return BOSS_ATTACK_WINDUP_FRAMES;
};

export const bossAttackActiveFramesFor = (source?: BossTimingSource): number => {
  const kind = bossKindForTiming(source);
  if (kind === "storm-relay-warden") return STORM_ATTACK_ACTIVE_FRAMES;
  if (kind === "cryo-conservator") return CRYO_ATTACK_ACTIVE_FRAMES;
  return BOSS_ATTACK_ACTIVE_FRAMES;
};

export const bossAttackEndFrameFor = (source?: BossTimingSource): number =>
  bossAttackWindupFramesFor(source) + bossAttackActiveFramesFor(source);

export const bossVulnerableStartFrameFor = (source?: BossTimingSource): number =>
  bossAttackEndFrameFor(source) +
  (bossKindForTiming(source) === "storm-relay-warden"
    ? STORM_VULNERABLE_READY_FRAMES
    : bossKindForTiming(source) === "cryo-conservator"
      ? CRYO_VULNERABLE_READY_FRAMES
      : BOSS_VULNERABLE_READY_FRAMES);

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
  kind: BossKind;
  phase: BossPhase;
  introFrames: number;
  activeFrames: number;
  health: number;
  invulnerableFrames: number;
  bodyX: number;
  bodyY: number;
  targetX: number;
  targetY: number;
  attackX: number;
  attackY: number;
  recoveryFrames: number;
  floorIcePatches: BossFloorIceSnapshot[];
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
  bossWeakSpots.includes(value as BossWeakSpot) ? (value as BossWeakSpot) : "bottom";

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
  if (kind === "archive-custodian" || kind === "clockwork-regent") return "core";
  return "bottom";
};

export const bossWeakSpot = (boss: Boss): BossWeakSpot => boss.weakSpot || defaultBossWeakSpotForKind(boss.kind);

export const createBossRuntimeState = (boss: Boss): BossRuntimeState => {
  const body = bossRestingBodyRect(boss);
  const center = rectCenter(body);
  return {
    id: boss.id,
    kind: boss.kind,
    phase: "idle",
    introFrames: 0,
    activeFrames: 0,
    health: bossHealth(boss),
    invulnerableFrames: 0,
    bodyX: body.x,
    bodyY: body.y,
    targetX: center.x,
    targetY: center.y,
    attackX: center.x,
    attackY: center.y,
    recoveryFrames: 0,
    floorIcePatches: []
  };
};

export const bossIsVulnerable = (
  state: Pick<BossRuntimeState, "phase" | "activeFrames" | "invulnerableFrames"> & Partial<Pick<BossRuntimeState, "kind" | "recoveryFrames">>
): boolean => {
  if (state.phase !== "active" || state.invulnerableFrames > 0 || (state.recoveryFrames || 0) > 0) return false;
  const cycle = state.activeFrames % bossAttackCycleFramesFor(state);
  return cycle >= bossVulnerableStartFrameFor(state);
};

export const bossBodyDamages = (state: Pick<BossRuntimeState, "phase" | "activeFrames"> & Partial<Pick<BossRuntimeState, "kind" | "recoveryFrames">>): boolean => {
  if (state.phase !== "active" || (state.recoveryFrames || 0) > 0) return false;
  const cycle = state.activeFrames % bossAttackCycleFramesFor(state);
  return cycle >= bossAttackWindupFramesFor(state) && cycle < bossAttackEndFrameFor(state);
};

export const settleBossAtIntroEnd = (boss: Boss, state: BossRuntimeState): void => {
  const body = bossRestingBodyRect(boss);
  const center = rectCenter(body);
  state.bodyX = body.x;
  state.bodyY = body.y;
  state.targetX = center.x;
  state.targetY = center.y;
  state.attackX = center.x;
  state.attackY = center.y;
  state.recoveryFrames = 0;
  state.floorIcePatches = [];
};

export const advanceBossActiveMotion = (boss: Boss, state: BossRuntimeState, player: ActorBody, solids: Solid[]): void => {
  if (state.phase !== "active") return;
  const size = bossBodySize(boss);
  const cycle = state.activeFrames % bossAttackCycleFramesFor(boss.kind);
  const playerCenterX = player.x + player.w / 2;
  const playerCenterY = player.y + player.h / 2;
  const arena = bossMovementBounds(boss, size);
  if ((boss.kind === "storm-relay-warden" || boss.kind === "cryo-conservator") && state.recoveryFrames <= 0) {
    const patrolFrames = bossAttackWindupFramesFor(boss.kind);
    const retargetFrame = Math.max(1, Math.floor(patrolFrames * 0.45));
    if (cycle === retargetFrame) {
      const attackMinX = arena.minX + size.w / 2;
      const attackMaxX = arena.maxX + size.w / 2;
      state.attackX = clamp(playerCenterX, attackMinX, attackMaxX);
      state.attackY = clamp(playerCenterY, boss.y + 22, boss.y + boss.h - 22);
    }
  }
  if (((boss.kind === "storm-relay-warden" || boss.kind === "cryo-conservator") && state.activeFrames === 1) || cycle === 0) {
    const constrainedVerticalBoss = boss.kind === "storm-relay-warden" || boss.kind === "cryo-conservator";
    const attackMinX = constrainedVerticalBoss ? arena.minX + size.w / 2 : boss.x + 24;
    const attackMaxX = constrainedVerticalBoss ? arena.maxX + size.w / 2 : boss.x + boss.w - 24;
    state.attackX = clamp(playerCenterX, attackMinX, attackMaxX);
    state.attackY = clamp(playerCenterY, boss.y + 22, boss.y + boss.h - 22);
  }

  if (boss.kind === "storm-relay-warden") {
    advanceStormRelayMotion(boss, state, size, cycle, arena);
    return;
  }
  if (boss.kind === "cryo-conservator") {
    advanceCryoConservatorMotion(boss, state, size, cycle, arena);
    advanceCryoConservatorFloorIce(boss, state, cycle, solids);
    return;
  }

  const windupFrames = bossAttackWindupFramesFor(boss.kind);
  const activeEndFrame = bossAttackEndFrameFor(boss.kind);
  if (cycle < windupFrames) {
    state.targetX = clamp(playerCenterX, arena.minX + size.w / 2, arena.maxX + size.w / 2);
    state.targetY = clamp(playerCenterY - size.h * 0.95, arena.minY + size.h / 2, arena.maxY + size.h / 2);
  } else if (cycle < activeEndFrame) {
    state.targetX = clamp(state.attackX, arena.minX + size.w / 2, arena.maxX + size.w / 2);
    state.targetY = clamp(state.attackY - size.h * 0.52, arena.minY + size.h / 2, arena.maxY + size.h / 2);
  } else {
    state.targetX = clamp(state.attackX, arena.minX + size.w / 2, arena.maxX + size.w / 2);
    state.targetY = arena.minY + size.h * 0.55;
  }

  const desiredX = state.targetX - size.w / 2;
  const desiredY = state.targetY - size.h / 2;
  const ease = cycle < windupFrames ? 0.1 : cycle < activeEndFrame ? 0.18 : 0.12;
  state.bodyX += (desiredX - state.bodyX) * ease;
  state.bodyY += (desiredY - state.bodyY) * ease;
  state.bodyX = clamp(state.bodyX, arena.minX, arena.maxX);
  state.bodyY = clamp(state.bodyY, arena.minY, arena.maxY);
};

export const recoverBossAfterHit = (boss: Boss, state: BossRuntimeState): void => {
  if ((boss.kind !== "storm-relay-warden" && boss.kind !== "cryo-conservator") || state.phase !== "active" || state.health <= 0) return;
  const cycle = state.activeFrames % bossAttackCycleFramesFor(boss.kind);
  if (cycle < bossVulnerableStartFrameFor(boss.kind)) return;
  state.activeFrames = 0;
  const recoveryFrames = boss.kind === "cryo-conservator" ? CRYO_HIT_RECOVERY_FRAMES : STORM_HIT_RECOVERY_FRAMES;
  state.recoveryFrames = recoveryFrames;
  state.invulnerableFrames = Math.max(state.invulnerableFrames, recoveryFrames + 12);
};

export const bossBodyRectAt = (boss: Boss, state: BossRuntimeState, _tick: number): Rect => {
  const size = bossBodySize(boss);
  if (state.phase === "active") {
    const arena = bossMovementBounds(boss, size);
    return {
      x: clamp(finiteNumber(state.bodyX, bossRestingBodyRect(boss).x), arena.minX, arena.maxX),
      y: clamp(finiteNumber(state.bodyY, bossRestingBodyRect(boss).y), arena.minY, arena.maxY),
      w: size.w,
      h: size.h
    };
  }

  const target = bossRestingBodyRect(boss);
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

export const bossAttackRectsAt = (boss: Boss, state: BossRuntimeState, tick: number): BossAttackSnapshot[] => {
  if (state.phase !== "active" || state.recoveryFrames > 0) return [];
  const cycle = state.activeFrames % bossAttackCycleFramesFor(boss.kind);
  if (cycle < bossAttackWindupFramesFor(boss.kind) || cycle >= bossAttackEndFrameFor(boss.kind)) return [];
  const body = bossBodyRectAt(boss, state, tick);
  const bodyCenter = rectCenter(body);
  if (boss.kind === "storm-relay-warden") {
    const originX = clamp(finiteNumber(state.attackX, bodyCenter.x), body.x + body.w * 0.32, body.x + body.w * 0.68);
    const originY = body.y + body.h * 0.78;
    const endY = boss.y + boss.h - 10;
    return [
      {
        x: originX - 13,
        y: originY,
        w: 26,
        h: Math.max(24, endY - originY),
        kind: "vertical",
        originX,
        originY
      }
    ];
  }
  if (boss.kind === "cryo-conservator") {
    const originX = clamp(finiteNumber(state.attackX, bodyCenter.x), body.x + body.w * 0.28, body.x + body.w * 0.72);
    const originY = body.y + body.h * 0.74;
    const endY = boss.y + boss.h - 12;
    return [
      {
        x: originX - 17,
        y: originY,
        w: 34,
        h: Math.max(24, endY - originY),
        kind: "vertical",
        originX,
        originY
      }
    ];
  }
  if (boss.kind !== "clockwork-regent") {
    const direction = finiteNumber(state.attackX, bodyCenter.x) >= bodyCenter.x ? 1 : -1;
    const originX = direction > 0 ? body.x + body.w * 0.82 : body.x + body.w * 0.18;
    const originY = clamp(finiteNumber(state.attackY, bodyCenter.y), body.y + body.h * 0.32, body.y + body.h * 0.72);
    const startX = direction > 0 ? originX - 2 : boss.x + 12;
    const endX = direction > 0 ? boss.x + boss.w - 12 : originX + 2;
    return [
      {
        x: Math.min(startX, endX),
        y: originY - 7,
        w: Math.max(20, Math.abs(endX - startX)),
        h: 14,
        kind: "horizontal",
        originX,
        originY
      }
    ];
  }
  const originX = clamp(finiteNumber(state.attackX, bodyCenter.x), body.x + body.w * 0.22, body.x + body.w * 0.78);
  const originY = body.y + body.h * 0.66;
  const endY = boss.y + boss.h - 12;
  return [
    {
      x: originX - 14,
      y: originY,
      w: 28,
      h: Math.max(20, endY - originY),
      kind: "vertical",
      originX,
      originY
    }
  ];
};

export const bossFloorShockRectsAt = (boss: Boss, state: BossRuntimeState, tick: number, solids: Solid[]): Rect[] => {
  if (boss.kind !== "storm-relay-warden" || state.recoveryFrames > 0) return [];
  const shocks: Rect[] = [];
  for (const attack of bossAttackRectsAt(boss, state, tick)) {
    if (attack.kind !== "vertical") continue;
    const centerX = attack.originX;
    const floor = solids
      .filter((solid) => {
        if (solid.collision === "decorative") return false;
        if (solid.w <= 0 || solid.h <= 0) return false;
        if (centerX < solid.x - STORM_FLOOR_SHOCK_WIDTH / 2 || centerX > solid.x + solid.w + STORM_FLOOR_SHOCK_WIDTH / 2) return false;
        return solid.y >= attack.originY && solid.y <= attack.y + attack.h + 4;
      })
      .sort((a, b) => a.y - b.y)[0];
    if (!floor) continue;
    const width = Math.min(STORM_FLOOR_SHOCK_WIDTH, floor.w);
    const x = clamp(centerX - width / 2, floor.x, floor.x + floor.w - width);
    shocks.push({
      x,
      y: floor.y - STORM_FLOOR_SHOCK_HEIGHT,
      w: width,
      h: STORM_FLOOR_SHOCK_HEIGHT
    });
  }
  return shocks;
};

export const bossFloorIceRectsAt = (boss: Boss, state: BossRuntimeState, _tick: number, _solids: Solid[]): BossFloorIceSnapshot[] => {
  if (boss.kind !== "cryo-conservator" || state.phase !== "active") return [];
  return state.floorIcePatches.filter((patch) => patch.remainingFrames > 0).map((patch) => ({ ...patch }));
};

const cryoFloorIceRectForLane = (boss: Boss, state: BossRuntimeState, tick: number, solids: Solid[]): Rect | null => {
  const body = bossBodyRectAt(boss, state, tick);
  const bodyCenter = rectCenter(body);
  const centerX = clamp(finiteNumber(state.attackX, bodyCenter.x), body.x + body.w * 0.28, body.x + body.w * 0.72);
  const floor = solids
    .filter((solid) => {
      if (solid.collision === "decorative") return false;
      if (solid.w <= 0 || solid.h <= 0) return false;
      if (centerX < solid.x - CRYO_FLOOR_ICE_WIDTH / 2 || centerX > solid.x + solid.w + CRYO_FLOOR_ICE_WIDTH / 2) return false;
      return solid.y >= body.y && solid.y <= boss.y + boss.h + 4;
    })
    .sort((a, b) => a.y - b.y)[0];
  if (!floor) return null;
  const width = Math.min(CRYO_FLOOR_ICE_WIDTH, floor.w);
  return {
    x: clamp(centerX - width / 2, floor.x, floor.x + floor.w - width),
    y: floor.y - CRYO_FLOOR_ICE_HEIGHT,
    w: width,
    h: CRYO_FLOOR_ICE_HEIGHT
  };
};

const advanceCryoConservatorFloorIce = (boss: Boss, state: BossRuntimeState, cycle: number, solids: Solid[]): void => {
  state.floorIcePatches = state.floorIcePatches
    .map((patch) => ({ ...patch, remainingFrames: patch.remainingFrames - 1 }))
    .filter((patch) => patch.remainingFrames > 0);

  if (state.recoveryFrames > 0 || cycle !== bossAttackWindupFramesFor("cryo-conservator")) return;
  const patchRect = cryoFloorIceRectForLane(boss, state, 0, solids);
  if (!patchRect) return;
  const patch: BossFloorIceSnapshot = {
    ...patchRect,
    remainingFrames: CRYO_FLOOR_ICE_LIFE_FRAMES,
    lifeFrames: CRYO_FLOOR_ICE_LIFE_FRAMES
  };
  const refreshedIndex = state.floorIcePatches.findIndex((existing) => rectsOverlap(existing, patch));
  if (refreshedIndex >= 0) {
    state.floorIcePatches[refreshedIndex] = patch;
  } else {
    state.floorIcePatches.push(patch);
  }
  state.floorIcePatches.sort((a, b) => b.remainingFrames - a.remainingFrames);
  state.floorIcePatches = state.floorIcePatches.slice(0, CRYO_FLOOR_ICE_MAX_PATCHES);
};

const advanceStormRelayMotion = (
  boss: Boss,
  state: BossRuntimeState,
  size: { w: number; h: number },
  cycle: number,
  arena: { minX: number; minY: number; maxX: number; maxY: number }
): void => {
  const targetX = clamp(finiteNumber(state.attackX, state.targetX), arena.minX + size.w / 2, arena.maxX + size.w / 2);
  const highY = arena.minY + size.h * 0.48;
  const weakSpotHeight = clamp(size.h * 0.2, 16, 30);
  const vulnerableBodyY = clamp(boss.y + boss.h - STORM_VULNERABLE_WEAK_SPOT_CLEARANCE - size.h + weakSpotHeight + 4, arena.minY, arena.maxY);
  const lowY = vulnerableBodyY + size.h / 2;
  if (state.recoveryFrames > 0) {
    advanceStormRelayRecoveryMotion(state, size, arena, targetX, highY, lowY);
    return;
  }

  const activeEndFrame = bossAttackEndFrameFor("storm-relay-warden");
  const descentProgress =
    cycle <= activeEndFrame ? 0 : clamp((cycle - activeEndFrame) / Math.max(1, STORM_VULNERABLE_READY_FRAMES), 0, 1);
  const targetY = highY + (lowY - highY) * descentProgress;

  state.targetX = targetX;
  state.targetY = targetY;
  const desiredX = targetX - size.w / 2;
  const desiredY = targetY - size.h / 2;
  const windupFrames = bossAttackWindupFramesFor("storm-relay-warden");
  const ease = cycle < windupFrames ? 0.08 : cycle < activeEndFrame ? 0.14 : STORM_VERTICAL_FLIGHT_EASE;
  state.bodyX += (desiredX - state.bodyX) * ease;
  state.bodyY += (desiredY - state.bodyY) * ease;
  state.bodyX = clamp(state.bodyX, arena.minX, arena.maxX);
  state.bodyY = clamp(state.bodyY, arena.minY, arena.maxY);
};

const advanceStormRelayRecoveryMotion = (
  state: BossRuntimeState,
  size: { w: number; h: number },
  arena: { minX: number; minY: number; maxX: number; maxY: number },
  laneX: number,
  highY: number,
  lowY: number
): void => {
  const elapsed = STORM_HIT_RECOVERY_FRAMES - state.recoveryFrames;
  let targetX = laneX;
  let targetY = lowY;
  let ease = 0.16;

  if (elapsed >= STORM_HIT_PAUSE_FRAMES && elapsed < STORM_HIT_PAUSE_FRAMES + STORM_HIT_RISE_FRAMES) {
    const riseProgress = (elapsed - STORM_HIT_PAUSE_FRAMES) / Math.max(1, STORM_HIT_RISE_FRAMES);
    targetY = lowY + (highY - lowY) * riseProgress;
    ease = STORM_VERTICAL_FLIGHT_EASE;
  } else if (elapsed >= STORM_HIT_PAUSE_FRAMES + STORM_HIT_RISE_FRAMES) {
    const patrolElapsed = elapsed - STORM_HIT_PAUSE_FRAMES - STORM_HIT_RISE_FRAMES;
    const sway = Math.sin((patrolElapsed / Math.max(1, STORM_HIT_PATROL_FRAMES)) * Math.PI * 2) * Math.min(54, (arena.maxX - arena.minX) * 0.18);
    targetX = clamp(laneX + sway, arena.minX + size.w / 2, arena.maxX + size.w / 2);
    targetY = highY;
    ease = 0.1;
  }

  state.targetX = targetX;
  state.targetY = targetY;
  state.bodyX += (targetX - size.w / 2 - state.bodyX) * ease;
  state.bodyY += (targetY - size.h / 2 - state.bodyY) * ease;
  state.bodyX = clamp(state.bodyX, arena.minX, arena.maxX);
  state.bodyY = clamp(state.bodyY, arena.minY, arena.maxY);
  state.recoveryFrames = Math.max(0, state.recoveryFrames - 1);
  if (state.recoveryFrames === 0) state.activeFrames = 0;
};

const advanceCryoConservatorMotion = (
  boss: Boss,
  state: BossRuntimeState,
  size: { w: number; h: number },
  cycle: number,
  arena: { minX: number; minY: number; maxX: number; maxY: number }
): void => {
  const targetX = clamp(finiteNumber(state.attackX, state.targetX), arena.minX + size.w / 2, arena.maxX + size.w / 2);
  const highY = arena.minY + size.h * 0.42;
  const weakSpotHeight = clamp(size.h * 0.2, 16, 30);
  const vulnerableBodyY = clamp(boss.y + boss.h - CRYO_VULNERABLE_WEAK_SPOT_CLEARANCE - size.h + weakSpotHeight + 4, arena.minY, arena.maxY);
  const lowY = vulnerableBodyY + size.h / 2;
  if (state.recoveryFrames > 0) {
    advanceCryoConservatorRecoveryMotion(state, size, arena, targetX, highY, lowY);
    return;
  }

  const activeEndFrame = bossAttackEndFrameFor("cryo-conservator");
  const descentProgress =
    cycle <= activeEndFrame ? 0 : clamp((cycle - activeEndFrame) / Math.max(1, CRYO_VULNERABLE_READY_FRAMES), 0, 1);
  const targetY = highY + (lowY - highY) * descentProgress;
  const windupFrames = bossAttackWindupFramesFor("cryo-conservator");
  const patrolSway = cycle < windupFrames ? Math.sin(cycle / Math.max(1, windupFrames) * Math.PI * 2) * Math.min(24, (arena.maxX - arena.minX) * 0.08) : 0;

  state.targetX = clamp(targetX + patrolSway, arena.minX + size.w / 2, arena.maxX + size.w / 2);
  state.targetY = targetY;
  const desiredX = state.targetX - size.w / 2;
  const desiredY = targetY - size.h / 2;
  const ease = cycle < windupFrames ? 0.055 : cycle < activeEndFrame ? 0.12 : CRYO_VERTICAL_FLIGHT_EASE;
  state.bodyX += (desiredX - state.bodyX) * ease;
  state.bodyY += (desiredY - state.bodyY) * ease;
  state.bodyX = clamp(state.bodyX, arena.minX, arena.maxX);
  state.bodyY = clamp(state.bodyY, arena.minY, arena.maxY);
};

const advanceCryoConservatorRecoveryMotion = (
  state: BossRuntimeState,
  size: { w: number; h: number },
  arena: { minX: number; minY: number; maxX: number; maxY: number },
  laneX: number,
  highY: number,
  lowY: number
): void => {
  const elapsed = CRYO_HIT_RECOVERY_FRAMES - state.recoveryFrames;
  let targetX = laneX;
  let targetY = lowY;
  let ease = 0.14;

  if (elapsed >= CRYO_HIT_PAUSE_FRAMES && elapsed < CRYO_HIT_PAUSE_FRAMES + CRYO_HIT_RISE_FRAMES) {
    const riseProgress = (elapsed - CRYO_HIT_PAUSE_FRAMES) / Math.max(1, CRYO_HIT_RISE_FRAMES);
    targetY = lowY + (highY - lowY) * riseProgress;
    ease = CRYO_VERTICAL_FLIGHT_EASE;
  } else if (elapsed >= CRYO_HIT_PAUSE_FRAMES + CRYO_HIT_RISE_FRAMES) {
    const patrolElapsed = elapsed - CRYO_HIT_PAUSE_FRAMES - CRYO_HIT_RISE_FRAMES;
    const sway = Math.sin((patrolElapsed / Math.max(1, CRYO_HIT_PATROL_FRAMES)) * Math.PI * 2) * Math.min(42, (arena.maxX - arena.minX) * 0.14);
    targetX = clamp(laneX + sway, arena.minX + size.w / 2, arena.maxX + size.w / 2);
    targetY = highY;
    ease = 0.075;
  }

  state.targetX = targetX;
  state.targetY = targetY;
  state.bodyX += (targetX - size.w / 2 - state.bodyX) * ease;
  state.bodyY += (targetY - size.h / 2 - state.bodyY) * ease;
  state.bodyX = clamp(state.bodyX, arena.minX, arena.maxX);
  state.bodyY = clamp(state.bodyY, arena.minY, arena.maxY);
  state.recoveryFrames = Math.max(0, state.recoveryFrames - 1);
  if (state.recoveryFrames === 0) state.activeFrames = 0;
};

export const bossWeakSpotRectAt = (boss: Boss, body: Rect): Rect => {
  const spot = bossWeakSpot(boss);
  if (spot === "bottom") {
    const w = clamp(body.w * 0.42, 28, 58);
    const h = clamp(body.h * 0.2, 16, 30);
    return {
      x: body.x + body.w / 2 - w / 2,
      y: body.y + body.h - h - 4,
      w,
      h
    };
  }
  if (spot === "core") {
    const size = clamp(Math.min(body.w, body.h) * 0.38, 28, 54);
    return {
      x: body.x + body.w / 2 - size / 2,
      y: body.y + body.h * 0.58 - size / 2,
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
  if (!bossIsVulnerable(state)) return false;
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
  w: clamp(boss.w * 0.46, 104, 220),
  h: clamp(boss.h * 0.45, 58, 150)
});

const bossRestingBodyRect = (boss: Boss): Rect => {
  const size = bossBodySize(boss);
  const arena = bossMovementBounds(boss, size);
  return {
    x: boss.x + boss.w / 2 - size.w / 2,
    y: arena.maxY,
    w: size.w,
    h: size.h
  };
};

const bossMovementBounds = (boss: Boss, size: { w: number; h: number }): { minX: number; minY: number; maxX: number; maxY: number } => {
  const marginX = Math.min(72, Math.max(18, boss.w * 0.08));
  const marginY = Math.min(24, Math.max(6, boss.h * 0.05));
  const minY = boss.kind === "storm-relay-warden" || boss.kind === "cryo-conservator" ? boss.y : boss.y + marginY;
  return {
    minX: boss.x + marginX,
    minY,
    maxX: Math.max(boss.x + marginX, boss.x + boss.w - marginX - size.w),
    maxY: Math.max(minY, boss.y + boss.h - marginY - size.h)
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
