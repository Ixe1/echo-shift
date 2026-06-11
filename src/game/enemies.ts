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
export const BOSS_DEFEAT_DEPARTURE_FRAMES = 170;
export const DEFAULT_MONSTER_SCORE = 200;

const BOSS_ENTRY_OFFSCREEN_PADDING = 720;
const MONSTER_STOMP_TOP_GRACE = 14;
const MONSTER_STOMP_DEPTH_RATIO = 0.82;
const MONSTER_ATTACK_SENSOR_HEIGHT = 8;
const MONSTER_ATTACK_SENSOR_INSET_X = 2;
const MONSTER_ATTACK_SIDE_GRACE_MIN = 10;
const MONSTER_ATTACK_SIDE_GRACE_RATIO = 0.35;
const MONSTER_VERTICAL_SPEED_GRACE = 0.35;
const MONSTER_UNDERSIDE_ENTRY_GRACE = 6;
const MONSTER_UNDERSIDE_DEPTH_RATIO = 0.75;

const STORM_ATTACK_CYCLE_FRAMES = 330;
const STORM_ATTACK_WINDUP_FRAMES = 112;
const STORM_ATTACK_ACTIVE_FRAMES = 54;
const STORM_VULNERABLE_READY_FRAMES = 72;
const STORM_VULNERABLE_WEAK_SPOT_CLEARANCE = 88;
const STORM_HIT_PAUSE_FRAMES = 48;
const STORM_HIT_RISE_FRAMES = 120;
const STORM_HIT_PATROL_FRAMES = 54;
const STORM_HIT_RECOVERY_FRAMES = STORM_HIT_PAUSE_FRAMES + STORM_HIT_RISE_FRAMES + STORM_HIT_PATROL_FRAMES;
const STORM_NORMAL_RISE_FRAMES = 104;
const STORM_FLOOR_SHOCK_CORE_WIDTH = 72;
const STORM_FLOOR_SHOCK_TILE_WIDTH = 32;
const STORM_FLOOR_SHOCK_WIDTH = STORM_FLOOR_SHOCK_CORE_WIDTH + STORM_FLOOR_SHOCK_TILE_WIDTH * 2;
const STORM_FLOOR_SHOCK_HEIGHT = 10;
const STORM_VERTICAL_FLIGHT_EASE = 0.055;

const CRYO_ATTACK_CYCLE_FRAMES = 324;
const CRYO_ATTACK_WINDUP_FRAMES = 96;
const CRYO_ATTACK_ACTIVE_FRAMES = 50;
const CRYO_VULNERABLE_READY_FRAMES = 68;
const CRYO_VULNERABLE_WEAK_SPOT_CLEARANCE = 86;
const CRYO_HIT_PAUSE_FRAMES = 48;
const CRYO_HIT_RISE_FRAMES = 126;
const CRYO_HIT_PATROL_FRAMES = 60;
const CRYO_HIT_RECOVERY_FRAMES = CRYO_HIT_PAUSE_FRAMES + CRYO_HIT_RISE_FRAMES + CRYO_HIT_PATROL_FRAMES;
const CRYO_NORMAL_RISE_FRAMES = 80;
const CRYO_BEAM_WIDTH = 34;
const CRYO_FLOOR_ICE_WIDTH = 128;
const CRYO_FLOOR_ICE_HEIGHT = 8;
const CRYO_FLOOR_ICE_LIFE_FRAMES = 21 * 60;
const CRYO_FLOOR_ICE_MAX_PATCHES = 4;
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
  departureFrames: number;
  departureStartX: number;
  departureStartY: number;
  floorIcePatches: BossFloorIceSnapshot[];
};

type MonsterDefinition = {
  score: number;
  killable: boolean;
  vulnerableFrom: MonsterVulnerability;
  defaultMotion: {
    axis: "x" | "y";
    distance: number;
    speed: number;
    phase?: number;
  };
  animation: MonsterAnimationProfile;
};

export type MonsterAnimationStyle =
  | "hop"
  | "hover"
  | "grounded-roll"
  | "grounded-glide"
  | "grounded-crawl"
  | "hanging-sway"
  | "heavy-grounded"
  | "mechanical-step"
  | "pendulum-sway"
  | "pulse-float"
  | "slither";

export type MonsterAnimationProfile = {
  frameInterval: number;
  style: MonsterAnimationStyle;
  liftAmplitude: number;
  liftPeriod: number;
  tiltAmplitude: number;
  stretchAmplitude: number;
  squashAmplitude: number;
};

export type MonsterVisualTransform = {
  yOffset: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

const monsterAnimation = (
  style: MonsterAnimationStyle,
  frameInterval: number,
  options: Partial<Omit<MonsterAnimationProfile, "frameInterval" | "style">> = {}
): MonsterAnimationProfile => ({
  frameInterval,
  style,
  liftAmplitude: 0,
  liftPeriod: 48,
  tiltAmplitude: 0,
  stretchAmplitude: 0,
  squashAmplitude: 0,
  ...options
});

const monsterDefinitions: Record<MonsterKind, MonsterDefinition> = {
  "sprout-hopper": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 120, speed: 80 },
    animation: monsterAnimation("hop", 4, { liftAmplitude: 18, liftPeriod: 22, tiltAmplitude: 0.09, stretchAmplitude: 0.08, squashAmplitude: 0.14 })
  },
  "glasswing-wisp": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "bottom",
    defaultMotion: { axis: "y", distance: 96, speed: 58, phase: 0.3 },
    animation: monsterAnimation("hover", 4, { liftAmplitude: 12, liftPeriod: 36, tiltAmplitude: 0.16, stretchAmplitude: 0.035, squashAmplitude: 0.025 })
  },
  "root-roller": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 160, speed: 112 },
    animation: monsterAnimation("grounded-roll", 4, { liftPeriod: 20, tiltAmplitude: 0.055, stretchAmplitude: 0.018, squashAmplitude: 0.018 })
  },
  "gutter-skimmer": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 180, speed: 132 },
    animation: monsterAnimation("grounded-glide", 3, { liftPeriod: 18, tiltAmplitude: 0.025, stretchAmplitude: 0.07, squashAmplitude: 0.025 })
  },
  "copper-leech": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "bottom",
    defaultMotion: { axis: "y", distance: 72, speed: 44 },
    animation: monsterAnimation("hanging-sway", 9, { liftPeriod: 64, tiltAmplitude: 0.08, stretchAmplitude: 0.01, squashAmplitude: 0.05 })
  },
  "storm-snail": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 72, speed: 32 },
    animation: monsterAnimation("heavy-grounded", 14, { liftPeriod: 80, tiltAmplitude: 0.01, stretchAmplitude: 0.005, squashAmplitude: 0.025 })
  },
  "frost-crawler": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 118, speed: 64 },
    animation: monsterAnimation("grounded-crawl", 7, { liftPeriod: 34, tiltAmplitude: 0.025, stretchAmplitude: 0.04, squashAmplitude: 0.025 })
  },
  "cryo-puffer": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "bottom",
    defaultMotion: { axis: "y", distance: 120, speed: 48, phase: 0.15 },
    animation: monsterAnimation("pulse-float", 6, { liftAmplitude: 3.5, liftPeriod: 52, tiltAmplitude: 0.035, stretchAmplitude: 0.05, squashAmplitude: 0.05 })
  },
  "shard-wisp": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "both",
    defaultMotion: { axis: "y", distance: 130, speed: 104, phase: 0.5 },
    animation: monsterAnimation("hover", 4, { liftAmplitude: 6, liftPeriod: 38, tiltAmplitude: 0.1, stretchAmplitude: 0.025, squashAmplitude: 0.015 })
  },
  bookbeetle: {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 132, speed: 74 },
    animation: monsterAnimation("grounded-crawl", 8, { liftPeriod: 42, tiltAmplitude: 0.03, stretchAmplitude: 0.035, squashAmplitude: 0.02 })
  },
  "page-mote": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "both",
    defaultMotion: { axis: "y", distance: 110, speed: 92, phase: 0.2 },
    animation: monsterAnimation("hover", 5, { liftAmplitude: 4.2, liftPeriod: 46, tiltAmplitude: 0.09, stretchAmplitude: 0.02, squashAmplitude: 0.015 })
  },
  "index-mimic": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 64, speed: 36 },
    animation: monsterAnimation("heavy-grounded", 13, { liftPeriod: 96, tiltAmplitude: 0.02, stretchAmplitude: 0.01, squashAmplitude: 0.03 })
  },
  "gear-tick": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 150, speed: 122 },
    animation: monsterAnimation("mechanical-step", 4, { liftPeriod: 16, tiltAmplitude: 0.08, stretchAmplitude: 0.035, squashAmplitude: 0.035 })
  },
  "pendulum-drone": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "y", distance: 160, speed: 68, phase: 0.4 },
    animation: monsterAnimation("pendulum-sway", 5, { liftAmplitude: 1.5, liftPeriod: 70, tiltAmplitude: 0.13, stretchAmplitude: 0.01, squashAmplitude: 0.01 })
  },
  "sand-winder": {
    score: DEFAULT_MONSTER_SCORE,
    killable: true,
    vulnerableFrom: "top",
    defaultMotion: { axis: "x", distance: 220, speed: 86 },
    animation: monsterAnimation("slither", 5, { liftPeriod: 30, tiltAmplitude: 0.04, stretchAmplitude: 0.06, squashAmplitude: 0.015 })
  }
};

type MonsterDefinitionSource = MonsterKind | { kind?: MonsterKind };

const monsterKindForDefinition = (source?: MonsterDefinitionSource): MonsterKind => {
  const kind = typeof source === "string" ? source : source?.kind;
  return monsterKinds.includes(kind as MonsterKind) ? (kind as MonsterKind) : "sprout-hopper";
};

const monsterMotionPeriod = (distance: number, speed: number): number =>
  Math.max(1, Math.round((120 * Math.max(1, distance)) / Math.max(1, speed)));

export const defaultMonsterSpeedForKind = (source?: MonsterDefinitionSource): number =>
  monsterDefinitions[monsterKindForDefinition(source)].defaultMotion.speed;

export const defaultMonsterMotionForKind = (
  source?: MonsterDefinitionSource
): Required<Pick<Monster, "axis" | "distance" | "period" | "phase">> => {
  const motion = monsterDefinitions[monsterKindForDefinition(source)].defaultMotion;
  return {
    axis: motion.axis,
    distance: motion.distance,
    period: monsterMotionPeriod(motion.distance, motion.speed),
    phase: motion.phase || 0
  };
};

export const monsterAnimationProfileForKind = (
  source?: MonsterDefinitionSource
): Readonly<MonsterAnimationProfile> => monsterDefinitions[monsterKindForDefinition(source)].animation;

const animationPhase = (tick: number, period: number): number =>
  (tick / Math.max(1, period)) * Math.PI * 2;

export const monsterVisualTransformForKind = (
  source: MonsterDefinitionSource | undefined,
  tick: number,
  animationFrame = 0
): MonsterVisualTransform => {
  const profile = monsterAnimationProfileForKind(source);
  const phase = animationPhase(tick, profile.liftPeriod);
  const wave = Math.sin(phase);
  const counterWave = Math.cos(phase);
  const step = animationFrame % 2 === 0 ? -1 : 1;

  switch (profile.style) {
    case "hop": {
      const hop = Math.max(0, Math.sin(phase));
      const landingSquash = hop < 0.25 ? Math.max(0, Math.cos(phase * 2)) : 0;
      return {
        yOffset: -profile.liftAmplitude * hop,
        rotation: Math.sin(phase * 2) * profile.tiltAmplitude,
        scaleX: 1 + profile.squashAmplitude * landingSquash,
        scaleY: 1 - profile.squashAmplitude * landingSquash + profile.stretchAmplitude * hop
      };
    }
    case "hover":
      return {
        yOffset: wave * profile.liftAmplitude,
        rotation: Math.sin(phase * 0.7) * profile.tiltAmplitude,
        scaleX: 1 + counterWave * profile.stretchAmplitude,
        scaleY: 1 - counterWave * profile.squashAmplitude
      };
    case "pulse-float":
      return {
        yOffset: wave * profile.liftAmplitude,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + counterWave * profile.stretchAmplitude,
        scaleY: 1 + wave * profile.squashAmplitude
      };
    case "grounded-roll":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + counterWave * profile.stretchAmplitude,
        scaleY: 1 - counterWave * profile.squashAmplitude
      };
    case "grounded-glide":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + profile.stretchAmplitude,
        scaleY: 1 - profile.squashAmplitude
      };
    case "grounded-crawl":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + Math.abs(wave) * profile.stretchAmplitude,
        scaleY: 1 - Math.abs(wave) * profile.squashAmplitude
      };
    case "hanging-sway":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + counterWave * profile.stretchAmplitude,
        scaleY: 1 + Math.abs(wave) * profile.squashAmplitude
      };
    case "heavy-grounded":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + Math.max(0, counterWave) * profile.stretchAmplitude,
        scaleY: 1 - Math.max(0, counterWave) * profile.squashAmplitude
      };
    case "mechanical-step":
      return {
        yOffset: 0,
        rotation: step * profile.tiltAmplitude,
        scaleX: 1 + step * profile.stretchAmplitude,
        scaleY: 1 - step * profile.squashAmplitude
      };
    case "pendulum-sway":
      return {
        yOffset: wave * profile.liftAmplitude,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + counterWave * profile.stretchAmplitude,
        scaleY: 1 - counterWave * profile.squashAmplitude
      };
    case "slither":
      return {
        yOffset: 0,
        rotation: wave * profile.tiltAmplitude,
        scaleX: 1 + wave * profile.stretchAmplitude,
        scaleY: 1 - Math.abs(wave) * profile.squashAmplitude
      };
  }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const finiteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const cryoAttackLaneX = (body: Rect, state: BossRuntimeState, fallbackX: number): number => {
  return clamp(finiteNumber(state.attackX, fallbackX), body.x + body.w * 0.2, body.x + body.w * 0.8);
};

const cryoUsesDualBeams = (boss: Boss, state: BossRuntimeState): boolean =>
  state.health > 0 && state.health <= bossHealth(boss) / 2;

const cryoAttackLaneXs = (boss: Boss, state: BossRuntimeState, body: Rect): number[] => {
  if (!cryoUsesDualBeams(boss, state)) return [cryoAttackLaneX(body, state, rectCenter(body).x)];
  return [body.x + body.w * 0.12, body.x + body.w * 0.88];
};

const cryoBeamRectForLane = (boss: Boss, body: Rect, originX: number): BossAttackSnapshot => {
  const originY = body.y + body.h * 0.74;
  const endY = boss.y + boss.h - 12;
  return {
    x: originX - CRYO_BEAM_WIDTH / 2,
    y: originY,
    w: CRYO_BEAM_WIDTH,
    h: Math.max(24, endY - originY),
    kind: "vertical",
    originX,
    originY
  };
};

const floorIceCenterX = (ice: Rect): number => ice.x + ice.w / 2;

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
  const footSensor = monsterActorFootSensor(actor);
  const headSensor = monsterActorHeadSensor(actor);
  const topZone = monsterTopVulnerabilityZone(rect);
  const bottomZone = monsterBottomVulnerabilityZone(rect);
  const topHit =
    (vulnerability === "top" || vulnerability === "both") &&
    actor.vy >= -MONSTER_VERTICAL_SPEED_GRACE &&
    rectsOverlap(footSensor, topZone) &&
    previousBottom <= rect.y + MONSTER_STOMP_TOP_GRACE &&
    currentBottom <= rect.y + Math.max(14, rect.h * MONSTER_STOMP_DEPTH_RATIO);
  const bottomHit =
    (vulnerability === "bottom" || vulnerability === "both") &&
    actor.vy <= MONSTER_VERTICAL_SPEED_GRACE &&
    rectsOverlap(headSensor, bottomZone) &&
    previousY >= rect.y + rect.h - MONSTER_UNDERSIDE_ENTRY_GRACE &&
    actor.y >= rect.y + rect.h - Math.max(14, rect.h * MONSTER_UNDERSIDE_DEPTH_RATIO);
  return topHit || bottomHit;
};

const monsterAttackSideGrace = (rect: Rect): number =>
  Math.max(MONSTER_ATTACK_SIDE_GRACE_MIN, rect.w * MONSTER_ATTACK_SIDE_GRACE_RATIO);

const monsterActorFootSensor = (actor: ActorBody): Rect => ({
  x: actor.x + MONSTER_ATTACK_SENSOR_INSET_X,
  y: actor.y + actor.h - MONSTER_ATTACK_SENSOR_HEIGHT,
  w: Math.max(1, actor.w - MONSTER_ATTACK_SENSOR_INSET_X * 2),
  h: MONSTER_ATTACK_SENSOR_HEIGHT
});

const monsterActorHeadSensor = (actor: ActorBody): Rect => ({
  x: actor.x + MONSTER_ATTACK_SENSOR_INSET_X,
  y: actor.y,
  w: Math.max(1, actor.w - MONSTER_ATTACK_SENSOR_INSET_X * 2),
  h: MONSTER_ATTACK_SENSOR_HEIGHT
});

const monsterTopVulnerabilityZone = (rect: Rect): Rect => {
  const sideGrace = monsterAttackSideGrace(rect);
  return {
    x: rect.x - sideGrace,
    y: rect.y - MONSTER_STOMP_TOP_GRACE,
    w: rect.w + sideGrace * 2,
    h: MONSTER_STOMP_TOP_GRACE + Math.max(14, rect.h * MONSTER_STOMP_DEPTH_RATIO)
  };
};

const monsterBottomVulnerabilityZone = (rect: Rect): Rect => {
  const sideGrace = monsterAttackSideGrace(rect);
  const depth = Math.max(14, rect.h * MONSTER_UNDERSIDE_DEPTH_RATIO);
  return {
    x: rect.x - sideGrace,
    y: rect.y + rect.h - depth,
    w: rect.w + sideGrace * 2,
    h: depth + MONSTER_UNDERSIDE_ENTRY_GRACE
  };
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
    departureFrames: 0,
    departureStartX: body.x,
    departureStartY: body.y,
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
      const attackBounds = { minX: arena.minX + size.w / 2, maxX: arena.maxX + size.w / 2 };
      state.attackX = clamp(playerCenterX, attackBounds.minX, attackBounds.maxX);
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
  if (state.phase === "departing") {
    return {
      x: finiteNumber(state.bodyX, bossRestingBodyRect(boss).x),
      y: finiteNumber(state.bodyY, bossRestingBodyRect(boss).y),
      w: size.w,
      h: size.h
    };
  }
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

export const startBossDefeatDeparture = (boss: Boss, state: BossRuntimeState, body: Rect): void => {
  state.phase = "departing";
  state.departureFrames = 0;
  state.invulnerableFrames = 0;
  state.recoveryFrames = 0;
  state.activeFrames = 0;
  state.floorIcePatches = [];
  state.bodyX = body.x;
  state.bodyY = body.y;
  state.departureStartX = body.x;
  state.departureStartY = body.y;
  state.targetX = boss.x + boss.w + body.w * 4.2;
  state.targetY = body.y - Math.max(8, body.h * 0.12);
  state.attackX = body.x + body.w / 2;
  state.attackY = body.y + body.h / 2;
};

export const advanceBossDefeatDeparture = (boss: Boss, state: BossRuntimeState): boolean => {
  if (state.phase !== "departing") return false;
  state.departureFrames = Math.min(BOSS_DEFEAT_DEPARTURE_FRAMES, state.departureFrames + 1);
  const progress = state.departureFrames / BOSS_DEFEAT_DEPARTURE_FRAMES;
  const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
  const startX = finiteNumber(state.departureStartX, bossRestingBodyRect(boss).x);
  const startY = finiteNumber(state.departureStartY, bossRestingBodyRect(boss).y);
  const targetX = Math.max(
    finiteNumber(state.targetX, boss.x + boss.w + bossBodySize(boss).w * 4.2),
    boss.x + boss.w + bossBodySize(boss).w * 4.2
  );
  const targetY = finiteNumber(state.targetY, state.bodyY);
  state.bodyX = startX + (targetX - startX) * eased;
  state.bodyY = startY + (targetY - startY) * eased + Math.sin(state.departureFrames / 11) * 1.8;
  return state.departureFrames >= BOSS_DEFEAT_DEPARTURE_FRAMES;
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
    return cryoAttackLaneXs(boss, state, body).map((originX) => cryoBeamRectForLane(boss, body, originX));
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

export const bossAttackWarningRectsAt = (boss: Boss, state: BossRuntimeState, tick: number): BossAttackSnapshot[] => {
  if (boss.kind !== "cryo-conservator" || state.phase !== "active" || state.recoveryFrames > 0) return [];
  const cycle = state.activeFrames % bossAttackCycleFramesFor(boss.kind);
  if (cycle >= bossAttackWindupFramesFor(boss.kind) || bossIsVulnerable(state)) return [];
  const body = bossBodyRectAt(boss, state, tick);
  return cryoAttackLaneXs(boss, state, body).map((originX) => cryoBeamRectForLane(boss, body, originX));
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

const cryoFloorIceRectForLane = (boss: Boss, state: BossRuntimeState, tick: number, solids: Solid[], laneX: number): Rect | null => {
  const body = bossBodyRectAt(boss, state, tick);
  const centerX = laneX;
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
  const body = bossBodyRectAt(boss, state, 0);
  for (const laneX of cryoAttackLaneXs(boss, state, body)) {
    const patchRect = cryoFloorIceRectForLane(boss, state, 0, solids, laneX);
    if (!patchRect) continue;
    const patch: BossFloorIceSnapshot = {
      ...patchRect,
      remainingFrames: CRYO_FLOOR_ICE_LIFE_FRAMES,
      lifeFrames: CRYO_FLOOR_ICE_LIFE_FRAMES
    };
    const refreshedIndex = state.floorIcePatches.findIndex((existing) => Math.abs(floorIceCenterX(existing) - floorIceCenterX(patch)) <= CRYO_BEAM_WIDTH);
    if (refreshedIndex >= 0) {
      state.floorIcePatches[refreshedIndex] = patch;
    } else {
      state.floorIcePatches.push(patch);
    }
  }
  state.floorIcePatches.sort((a, b) => b.remainingFrames - a.remainingFrames);
  state.floorIcePatches = state.floorIcePatches.slice(0, CRYO_FLOOR_ICE_MAX_PATCHES);
};

const bossNormalVerticalTargetY = (
  cycle: number,
  activeEndFrame: number,
  riseFrames: number,
  readyFrames: number,
  highY: number,
  lowY: number,
  riseStartY: number
): number => {
  if (cycle <= activeEndFrame) {
    const riseProgress = clamp(cycle / Math.max(1, riseFrames), 0, 1);
    return riseStartY + (highY - riseStartY) * riseProgress;
  }
  const descentProgress = clamp((cycle - activeEndFrame) / Math.max(1, readyFrames), 0, 1);
  return highY + (lowY - highY) * descentProgress;
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
  const currentCenterY = finiteNumber(state.bodyY, lowY - size.h / 2) + size.h / 2;
  const introLiftStartY =
    state.activeFrames < STORM_ATTACK_CYCLE_FRAMES && currentCenterY > lowY + 12 ? arena.maxY + size.h / 2 : lowY;
  const targetY = bossNormalVerticalTargetY(cycle, activeEndFrame, STORM_NORMAL_RISE_FRAMES, STORM_VULNERABLE_READY_FRAMES, highY, lowY, introLiftStartY);

  state.targetX = targetX;
  state.targetY = targetY;
  const desiredX = targetX - size.w / 2;
  const desiredY = targetY - size.h / 2;
  const windupFrames = bossAttackWindupFramesFor("storm-relay-warden");
  const horizontalEase = cycle < windupFrames ? 0.08 : cycle < activeEndFrame ? 0.14 : STORM_VERTICAL_FLIGHT_EASE;
  state.bodyX += (desiredX - state.bodyX) * horizontalEase;
  state.bodyY += (desiredY - state.bodyY) * STORM_VERTICAL_FLIGHT_EASE;
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
  const currentCenterY = finiteNumber(state.bodyY, lowY - size.h / 2) + size.h / 2;
  const introLiftStartY =
    state.activeFrames < CRYO_ATTACK_CYCLE_FRAMES && currentCenterY > lowY + 12 ? arena.maxY + size.h / 2 : lowY;
  const targetY = bossNormalVerticalTargetY(cycle, activeEndFrame, CRYO_NORMAL_RISE_FRAMES, CRYO_VULNERABLE_READY_FRAMES, highY, lowY, introLiftStartY);
  const windupFrames = bossAttackWindupFramesFor("cryo-conservator");
  const patrolSway = cycle < windupFrames ? Math.sin(cycle / Math.max(1, windupFrames) * Math.PI * 2) * Math.min(24, (arena.maxX - arena.minX) * 0.08) : 0;

  state.targetX = clamp(targetX + patrolSway, arena.minX + size.w / 2, arena.maxX + size.w / 2);
  state.targetY = targetY;
  const desiredX = state.targetX - size.w / 2;
  const desiredY = targetY - size.h / 2;
  const horizontalEase = cycle < windupFrames ? 0.075 : cycle < activeEndFrame ? 0.12 : CRYO_VERTICAL_FLIGHT_EASE;
  state.bodyX += (desiredX - state.bodyX) * horizontalEase;
  state.bodyY += (desiredY - state.bodyY) * CRYO_VERTICAL_FLIGHT_EASE;
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
  if (side === "left") return { ...target, x: boss.x - size.w - BOSS_ENTRY_OFFSCREEN_PADDING };
  if (side === "right") return { ...target, x: boss.x + boss.w + BOSS_ENTRY_OFFSCREEN_PADDING };
  if (side === "top" || side === "center") return { ...target, y: boss.y - size.h - BOSS_ENTRY_OFFSCREEN_PADDING };
  if (side === "bottom") return { ...target, y: boss.y + boss.h + BOSS_ENTRY_OFFSCREEN_PADDING };
  return { ...target, y: boss.y - size.h - BOSS_ENTRY_OFFSCREEN_PADDING };
};
