import { rectsOverlap } from "./geometry";
import {
  BOSS_HIT_BOUNCE_SPEED,
  BOSS_INVULNERABLE_FRAMES,
  BOSS_DEFEAT_DEPARTURE_FRAMES,
  BOSS_DEFEAT_PAUSE_FRAMES,
  MONSTER_BOUNCE_SPEED,
  actorKillsMonster,
  bossAttackCycleFramesFor,
  bossAttackWindupFramesFor,
  advanceBossDefeatDeparture,
  advanceBossActiveMotion,
  bossAttackWarningRectsAt,
  bossAttackRectsAt,
  bossBodyDamages,
  bossBodyRectAt,
  bossFloorIceRectsAt,
  bossFloorShockRectsAt,
  bossIntroFrames,
  bossScore,
  bossTakesHit,
  bossWeakSpot,
  bossWeakSpotRectAt,
  createBossRuntimeState,
  monsterRectAt,
  monsterScore,
  recoverBossAfterHit,
  settleBossAtIntroEnd,
  startBossDefeatDeparture,
  type BossRuntimeState
} from "./enemies";
import {
  actorHazardContact,
  actorTouchesLaser,
  actorTouchesHazard,
  closedDoorRects,
  collectBlockedLasers,
  collectOpenDoors,
  createObjectState,
  doorRequiredCoreIds,
  droneIsActive,
  droneRectAt,
  isMajorCore,
  laserIsActive,
  movingLaserRectAt,
  updateObjects,
  type ObjectState
} from "./objects";
import { makeActor, moveActor, platformFramesAt } from "./player";
import {
  inputFrameAt,
  cloneInputFrame,
  recordInputFrame,
  trimRecording,
  type EchoRecording
} from "./recording";
import { finalScoreForLevel, timeBonusForFrames } from "./scoring";
import { solidHasFullCollision, solidHasGameplayCollision } from "./solidCollision";
import { TERRAIN_TILE_SIZE } from "./terrainMaterials";
import type { ActorBody, Boss, BossAttackSnapshot, BossSnapshot, Core, InputFrame, Level, Monster, Rect, SimulationSnapshot, Solid, SpilledCore, StepEvents } from "./types";

const MIN_ECHO_FRAMES = 18;
const LAUNCH_PAD_FACE_TOLERANCE = 3;
const LAUNCH_PAD_COOLDOWN_FRAMES = 12;
const LAUNCH_PAD_CONTROL_LOCK_FRAMES = 10;
const LAUNCH_PAD_FLOAT_FRAMES = 54;
const LAUNCH_PAD_SPEED_SCALE = 0.94;
const CORE_SAVE_INVULNERABILITY_FRAMES = 90;
const CORE_SPILL_PICKUP_DELAY_FRAMES = 54;
const CORE_SPILL_TTL_FRAMES = 300;
const CORE_SPILL_GRAVITY = 0.42;
const CORE_SPILL_MAX_FALL_SPEED = 7.6;
const CORE_SPILL_DRAG = 0.982;
const CORE_SPILL_BOUNCE = 0.56;
const CORE_SPILL_MAX_RECOVERABLE = 8;
const CORE_SAVE_BOUNCE_SPEED = -8.8;
const CORE_SAVE_KNOCKBACK_SPEED = 4.2;

type BossCheckpoint = {
  bossId: string;
  player: ActorBody;
  echoes: ActorBody[];
  echoRecordings: EchoRecording[];
  currentRecording: number[];
  objectState: ObjectState;
  killedMonsterIds: Set<string>;
  bossStates: Map<string, BossRuntimeState>;
  currentAttemptCollectedCoreIds: Set<string>;
  currentAttemptKilledMonsterIds: Map<string, number>;
  currentAttemptDefeatedBossIds: Map<string, number>;
  runtimeSolids: Solid[];
  terrainRevision: number;
  handledArchiveImpactKeys: Set<string>;
  handledArchiveImpactSoundKeys: Set<string>;
  tick: number;
  totalFrames: number;
  score: number;
  deaths: number;
  coreSpillSerial: number;
  protectedCoreSaveIds: Set<string>;
  recoveredSpillCoreIds: Set<string>;
};

type SnapshotOptions = {
  cloneTransientCoreState?: boolean;
  cloneRuntimeSolids?: boolean;
};

const cloneActor = (actor: ActorBody): ActorBody => ({ ...actor });

const cloneObjectState = (state: ObjectState): ObjectState => ({
  activePlates: new Set(state.activePlates),
  latchedPlates: new Set(state.latchedPlates),
  timedSwitchTimers: new Map(state.timedSwitchTimers),
  openDoors: new Set(state.openDoors),
  collectedCores: new Set(state.collectedCores),
  claimedCores: new Set(state.claimedCores),
  coreOffsets: new Map([...state.coreOffsets.entries()].map(([id, offset]) => [id, { ...offset }])),
  spilledCores: new Map([...state.spilledCores.entries()].map(([id, core]) => [id, { ...core }])),
  blockedLasers: new Set(state.blockedLasers),
  crates: new Map([...state.crates.entries()].map(([id, rect]) => [id, { ...rect }]))
});

const cloneCheckpointObjectState = (state: ObjectState): ObjectState => ({
  ...cloneObjectState(state),
  coreOffsets: new Map(),
  spilledCores: new Map()
});

const setsMatch = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

const cloneBossStates = (states: Map<string, BossRuntimeState>): Map<string, BossRuntimeState> =>
  new Map([...states.entries()].map(([id, state]) => [id, { ...state, floorIcePatches: state.floorIcePatches.map((patch) => ({ ...patch })) }]));

const cloneSolids = (solids: Solid[]): Solid[] => solids.map((solid) => ({ ...solid }));

const solidHasDefaultFullCollision = (solid: Solid): boolean => solid.collision === undefined || solid.collision === "solid";

const solidLooksLikeErodibleFloor = (solid: Solid): boolean => {
  const floorLikeId = solid.id === "floor" || solid.id.startsWith("floor-") || solid.id.includes("floor");
  return solidHasDefaultFullCollision(solid) && (solid.sprite === "floor" || floorLikeId) && solid.w >= TERRAIN_TILE_SIZE;
};

const archiveErosionHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const archiveImpactShouldErode = (impactKey: string): boolean => archiveErosionHash(impactKey) % 2 === 0;

const archiveImpactTileCount = (impactKey: string, maxTiles: 1 | 2): 1 | 2 => {
  if (maxTiles === 1) return 1;
  return archiveErosionHash(`${impactKey}:tiles`) % 2 === 0 ? 1 : 2;
};

const cloneEchoRecordings = (recordings: EchoRecording[]): EchoRecording[] =>
  recordings.map((recording) => ({
    ...recording,
    anchor: recording.anchor ? cloneActor(recording.anchor) : undefined,
    frames: recording.frames instanceof Uint8Array ? new Uint8Array(recording.frames) : recording.frames.map(cloneInputFrame)
  }));

type RoomSimulationOptions = {
  lives?: number | null;
};

export class RoomSimulation {
  readonly level: Level;
  readonly echoRecordings: EchoRecording[] = [];
  player: ActorBody;
  echoes: ActorBody[] = [];
  currentRecording: number[] = [];
  objectState: ObjectState = createObjectState();
  tick = 0;
  totalFrames = 0;
  score = 0;
  deaths = 0;
  dead = false;
  won = false;
  readonly killedMonsterIds = new Set<string>();
  readonly bossStates = new Map<string, BossRuntimeState>();
  private runtimeSolids: Solid[] = [];
  private terrainRevision = 0;
  private readonly handledArchiveImpactKeys = new Set<string>();
  private readonly handledArchiveImpactSoundKeys = new Set<string>();
  private readonly currentAttemptCollectedCoreIds = new Set<string>();
  private readonly currentAttemptKilledMonsterIds = new Map<string, number>();
  private readonly currentAttemptDefeatedBossIds = new Map<string, number>();
  private bossCheckpoint: BossCheckpoint | null = null;
  private readonly initialLives: number | null;
  private readonly requiredCoreIds: Set<string>;
  private remainingLives: number | null;
  private coreInvulnerabilityFrames = 0;
  private coreSpillSerial = 0;
  private readonly protectedCoreSaveIds = new Set<string>();
  private readonly recoveredSpillCoreIds = new Set<string>();

  constructor(level: Level, options: RoomSimulationOptions = {}) {
    this.level = level;
    this.requiredCoreIds = doorRequiredCoreIds(level.doors || []);
    this.initialLives = this.normalizedLives(options.lives === undefined ? level.score.lives : options.lives);
    this.remainingLives = this.initialLives;
    this.player = makeActor("player", "player", level.start);
    this.resetAttempt(false);
  }

  resetLevel(lives: number | null = this.initialLives): void {
    this.bossCheckpoint = null;
    this.echoRecordings.length = 0;
    this.totalFrames = 0;
    this.score = 0;
    this.deaths = 0;
    this.remainingLives = this.normalizedLives(lives);
    this.currentAttemptCollectedCoreIds.clear();
    this.currentAttemptKilledMonsterIds.clear();
    this.currentAttemptDefeatedBossIds.clear();
    this.coreInvulnerabilityFrames = 0;
    this.coreSpillSerial = 0;
    this.protectedCoreSaveIds.clear();
    this.recoveredSpillCoreIds.clear();
    this.resetAttempt(false);
  }

  rewindToEcho(): boolean {
    const frames = trimRecording(this.currentRecording);
    const added = frames.length >= MIN_ECHO_FRAMES;
    if (added) {
      const echo = this.echoAnchorFromPlayer(`echo-${this.echoRecordings.length + 1}`);
      this.echoRecordings.push({
        id: echo.id,
        frames: Uint8Array.of(0),
        createdAtFrame: this.totalFrames,
        anchor: cloneActor(echo)
      });
      this.echoes.push(echo);
    }

    this.teleportPlayerToStart();
    this.resetRewindCoreSaveState();
    return added;
  }

  resetAttempt(keepRecording = false): void {
    this.bossCheckpoint = null;
    this.removeDiscardedAttemptScore();
    this.tick = 0;
    this.dead = false;
    this.won = false;
    this.player = makeActor("player", "player", this.level.start);
    this.echoes = this.echoRecordings.map((recording) => this.echoActorForRecording(recording));
    this.objectState = createObjectState(this.level);
    this.killedMonsterIds.clear();
    this.resetBossStates();
    this.resetRuntimeTerrain();
    this.coreInvulnerabilityFrames = 0;
    this.coreSpillSerial = 0;
    this.protectedCoreSaveIds.clear();
    this.recoveredSpillCoreIds.clear();
    if (!keepRecording) this.currentRecording = [];
  }

  private echoAnchorFromPlayer(id: string): ActorBody {
    return this.stationaryEchoActor(id, this.player);
  }

  private echoActorForRecording(recording: EchoRecording): ActorBody {
    if (recording.anchor) {
      return this.stationaryEchoActor(recording.id, recording.anchor);
    }
    return makeActor(recording.id, "echo", this.level.start);
  }

  private stationaryEchoActor(id: string, source: ActorBody): ActorBody {
    return {
      ...cloneActor(source),
      id,
      kind: "echo",
      vx: 0,
      vy: 0,
      onGround: false,
      coyote: 0,
      jumpBuffer: 0,
      launchCooldown: 0,
      launchControlLock: 0,
      launchFloatFrames: 0,
      prevJump: false,
      standingOn: null,
      alive: true
    };
  }

  private syncAnchoredEcho(echo: ActorBody, anchor: ActorBody): void {
    const alive = echo.alive;
    echo.x = anchor.x;
    echo.y = anchor.y;
    echo.w = anchor.w;
    echo.h = anchor.h;
    echo.vx = 0;
    echo.vy = 0;
    echo.onGround = false;
    echo.coyote = 0;
    echo.jumpBuffer = 0;
    echo.launchCooldown = 0;
    echo.launchControlLock = 0;
    echo.launchFloatFrames = 0;
    echo.prevJump = false;
    echo.facing = anchor.facing;
    echo.standingOn = null;
    echo.alive = alive;
  }

  private teleportPlayerToStart(): void {
    this.dead = false;
    this.won = false;
    this.player = this.playerForRewindTarget();
    this.clearCoreOffsets();
    this.currentRecording = [];
  }

  private clearCoreOffsets(): void {
    if (this.objectState.coreOffsets.size === 0) return;
    this.objectState = { ...this.objectState, coreOffsets: new Map() };
  }

  private resetRewindCoreSaveState(): void {
    this.coreInvulnerabilityFrames = 0;
  }

  private hasUnclaimedPlacedCores(): boolean {
    return (this.level.cores || []).some((core) => !this.objectState.claimedCores.has(core.id));
  }

  private clearEchoes(): void {
    this.echoRecordings.length = 0;
    this.echoes = [];
    this.currentRecording = [];
  }

  private triggersForActors(actors: ActorBody[]): { activePlates: Set<string>; timedSwitchTimers: Map<string, number> } {
    const liveActors = actors.filter((actor) => actor.alive);
    const actorOverlaps = (rect: Rect): boolean => liveActors.some((actor) => rectsOverlap(actor, rect));
    const activePlates = new Set<string>();
    const crateRects = [...this.objectState.crates.values()];
    const timedSwitchTimers = new Map(this.objectState.timedSwitchTimers);
    for (const timedSwitch of this.level.timedSwitches || []) {
      if (actorOverlaps(timedSwitch) || crateRects.some((crate) => rectsOverlap(crate, timedSwitch))) {
        timedSwitchTimers.set(timedSwitch.id, Math.max(1, Math.round(timedSwitch.duration)));
      }
    }
    for (const id of this.objectState.latchedPlates) activePlates.add(id);
    for (const [id, remaining] of timedSwitchTimers) {
      if (remaining > 0) activePlates.add(id);
    }
    for (const plate of this.level.plates || []) {
      if (actorOverlaps(plate) || crateRects.some((crate) => rectsOverlap(crate, plate))) {
        activePlates.add(plate.id);
      }
    }
    for (const sensor of this.level.echoSensors || []) {
      const actorMode = sensor.actors || "echo";
      if (
        liveActors.some(
          (actor) =>
            (actorMode === "both" || actorMode === actor.kind) &&
            rectsOverlap(actor, sensor)
        )
      ) {
        activePlates.add(sensor.id);
      }
    }
    return { activePlates, timedSwitchTimers };
  }

  private recomputeObjectStateForActors(
    actors: ActorBody[],
    options: { clearCoreOffsets?: boolean; clearSpilledCores?: boolean } = {}
  ): void {
    const defeatedBossIds = new Set(this.currentAttemptDefeatedBossIds.keys());
    const { activePlates, timedSwitchTimers } = this.triggersForActors(actors);
    const latchedPlates = new Set(this.objectState.latchedPlates);
    for (const plate of this.level.plates || []) {
      if (plate.once && activePlates.has(plate.id)) latchedPlates.add(plate.id);
    }
    const crateRects = [...this.objectState.crates.values()];
    this.objectState = {
      ...this.objectState,
      activePlates,
      latchedPlates,
      timedSwitchTimers,
      openDoors: collectOpenDoors(this.level.doors || [], activePlates, this.objectState.collectedCores, defeatedBossIds),
      blockedLasers: collectBlockedLasers([...(this.level.lasers || []), ...(this.level.movingLasers || [])], crateRects, activePlates, this.tick),
      coreOffsets: options.clearCoreOffsets ? new Map() : this.objectState.coreOffsets,
      spilledCores: options.clearSpilledCores ? new Map() : this.objectState.spilledCores
    };
  }

  private recomputeObjectStateWithoutEchoes(includePlayer: boolean, clearTransientCores: boolean): void {
    this.recomputeObjectStateForActors(includePlayer && this.player.alive ? [this.player] : [], {
      clearCoreOffsets: clearTransientCores,
      clearSpilledCores: clearTransientCores
    });
  }

  private clearCheckpointEchoesAndObjectState(): void {
    this.clearEchoes();
    this.recomputeObjectStateWithoutEchoes(true, true);
  }

  clearEchoesForDeathPresentation(): void {
    this.clearEchoes();
    this.recomputeObjectStateForActors([], { clearCoreOffsets: true });
  }

  private playerForRewindTarget(): ActorBody {
    if (this.bossCheckpoint) {
      return {
        ...cloneActor(this.bossCheckpoint.player),
        id: "player",
        kind: "player",
        alive: true
      };
    }
    return makeActor("player", "player", this.level.start);
  }

  resetLifeAttempt(): void {
    if (this.bossCheckpoint) {
      this.restoreBossCheckpoint(false);
      this.clearCheckpointEchoesAndObjectState();
      return;
    }
    this.clearEchoes();
    this.resetAttempt(false);
    this.totalFrames = 0;
    this.score = 0;
    this.currentAttemptCollectedCoreIds.clear();
    this.currentAttemptKilledMonsterIds.clear();
    this.currentAttemptDefeatedBossIds.clear();
    this.coreInvulnerabilityFrames = 0;
    this.coreSpillSerial = 0;
    this.protectedCoreSaveIds.clear();
    this.recoveredSpillCoreIds.clear();
  }

  step(input: InputFrame): StepEvents {
    const events: StepEvents = {
      jumped: false,
      launched: false,
      launchPadId: null,
      landed: false,
      switched: false,
      core: null,
      cores: [],
      coreSpill: null,
      died: false,
      playerLaserVaporized: false,
      echoLaserVaporized: 0,
      livesExhausted: false,
      monsterKills: [],
      bossIntroStarted: null,
      bossCheckpointActivated: null,
      bossHit: null,
      bossHits: [],
      bossDefeated: null,
      bossDefeateds: [],
      bossSoundCues: [],
      bossDepartureFinished: null,
      bossDepartureFinishedIds: [],
      bossPortalUnlocked: false,
      won: false
    };

    if (this.won || this.dead) return events;
    this.coreInvulnerabilityFrames = Math.max(0, this.coreInvulnerabilityFrames - 1);

    const platforms = platformFramesAt(this.level.platforms, this.tick);
    const solids = this.runtimeSolids;
    const defeatedBossIds = new Set(this.currentAttemptDefeatedBossIds.keys());
    const doors = closedDoorRects(this.level, this.objectState.openDoors);
    const objectUpdateOptions = this.hasUnclaimedPlacedCores()
      ? {
          magnetBlockerSolids: () => solids,
          magnetBlockers: () => [
            ...(this.level.oneWays || []),
            ...(this.level.conveyors || []),
            ...platforms.map((platform) => ({ ...platform.current }))
          ]
        }
      : undefined;
    const baseDynamic = {
      oneWays: this.level.oneWays,
      conveyors: this.level.conveyors,
      crates: this.objectState.crates,
      ice: this.currentBossFloorIceRects()
    };
    const movementDoomedEchoIds = this.movementDoomedEchoIds();
    const dynamicFor = (actor: ActorBody) => ({
      ...baseDynamic,
      actorBlockers: [this.player, ...this.echoes].filter((other) => this.actorCanBlockMovementFor(actor, other, movementDoomedEchoIds))
    });

    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      if (!echo.alive) continue;
      const recording = this.echoRecordings[index];
      if (recording.anchor) {
        this.syncAnchoredEcho(echo, recording.anchor);
        continue;
      }
      const echoInput = inputFrameAt(recording.frames, this.tick);
      const previousY = echo.y;
      moveActor(echo, echoInput, solids, doors, platforms, this.level.bounds, dynamicFor(echo));
      this.applyLaunchPads(echo, previousY);
    }

    let previousPlayerX = this.player.x;
    let previousPlayerY = this.player.y;
    if (!this.dead) {
      recordInputFrame(this.currentRecording, input);
      previousPlayerX = this.player.x;
      previousPlayerY = this.player.y;
      const moved = moveActor(this.player, input, solids, doors, platforms, this.level.bounds, dynamicFor(this.player));
      events.jumped = moved.jumped;
      events.landed = moved.landed;
      events.launchPadId = this.applyLaunchPads(this.player, previousPlayerY);
      events.launched = events.launchPadId !== null;
    }

    if (!this.dead && !this.player.alive) {
      this.markPlayerDead(events);
    }

    if (this.objectState.spilledCores.size > 0) {
      const spilledCoreDoors = (this.level.doors || []).length > 0 ? this.spilledCoreDoorRects(defeatedBossIds, previousPlayerY) : [];
      this.advanceSpilledCores(this.spilledCoreSupportRects(spilledCoreDoors, platforms), this.spilledCoreBlockerRects(spilledCoreDoors));
    }

    const previousObjectState = this.objectState;
    let objectUpdate = updateObjects(this.level, this.objectActors(), previousObjectState, this.tick, defeatedBossIds, objectUpdateOptions);
    this.objectState = objectUpdate.state;

    for (;;) {
      const echoVaporization = this.vaporizeHazardousEchoes();
      if (!echoVaporization.vaporized) break;
      events.echoLaserVaporized += echoVaporization.laserVaporized;
      objectUpdate = updateObjects(this.level, this.objectActors(), previousObjectState, this.tick, defeatedBossIds, objectUpdateOptions);
      this.objectState = objectUpdate.state;
    }

    events.switched = objectUpdate.switched;
    events.core = objectUpdate.core;
    events.cores = objectUpdate.cores;
    for (const core of objectUpdate.cores) {
      this.addCoreScore(core.id);
      if (core.recovered) this.recoveredSpillCoreIds.add(core.id);
    }

    if (!this.dead && actorTouchesLaser(this.level, this.player, this.objectState, this.tick)) {
      this.discardCurrentFrameCorePickups(objectUpdate.cores, previousObjectState);
      events.core = null;
      events.cores = [];
      events.playerLaserVaporized = true;
      this.markPlayerDead(events);
    }

    if (!this.dead) this.updateBosses(events, previousPlayerY, previousPlayerX);
    if (!this.dead) this.updateMonsters(events, previousPlayerY);

    const hazardContact = !this.dead ? actorHazardContact(this.level, this.player, this.objectState, this.tick) : null;
    if (hazardContact) {
      if (hazardContact.kind === "laser") {
        events.playerLaserVaporized = true;
        this.markPlayerDead(events);
      } else {
        this.applyPlayerDamage(events, hazardContact.rect);
      }
    }

    if (!this.dead && !this.player.alive) {
      this.markPlayerDead(events);
    }

    if (
      !this.dead &&
      !events.bossPortalUnlocked &&
      !this.finalBossDefeatCompletesLevel() &&
      this.exitUnlocked() &&
      rectsOverlap(this.player, this.level.exit)
    ) {
      this.won = true;
      events.won = true;
    }

    this.tick += 1;
    this.totalFrames += 1;
    return events;
  }

  snapshot(options: SnapshotOptions = {}): SimulationSnapshot {
    const cloneTransientCoreState = options.cloneTransientCoreState !== false;
    const cloneRuntimeSolids = options.cloneRuntimeSolids !== false;
    return {
      player: { ...this.player },
      echoes: this.aliveEchoes().map((echo) => ({ ...echo })),
      activePlates: new Set(this.objectState.activePlates),
      openDoors: new Set(this.objectState.openDoors),
      collectedCores: new Set(this.objectState.collectedCores),
      claimedCores: cloneTransientCoreState ? new Set(this.objectState.claimedCores) : this.objectState.claimedCores,
      coreOffsets: cloneTransientCoreState
        ? new Map([...this.objectState.coreOffsets.entries()].map(([id, offset]) => [id, { ...offset }]))
        : this.objectState.coreOffsets,
      spilledCores: cloneTransientCoreState
        ? new Map([...this.objectState.spilledCores.entries()].map(([id, core]) => [id, { ...core }]))
        : this.objectState.spilledCores,
      blockedLasers: new Set(this.objectState.blockedLasers),
      crates: new Map([...this.objectState.crates.entries()].map(([id, rect]) => [id, { ...rect }])),
      solids: cloneRuntimeSolids ? cloneSolids(this.runtimeSolids) : this.runtimeSolids,
      terrainRevision: this.terrainRevision,
      coreInvulnerabilityFrames: this.coreInvulnerabilityFrames,
      killedMonsters: new Set(this.killedMonsterIds),
      bosses: this.bossSnapshots(),
      exitUnlocked: this.exitUnlocked(),
      bossCheckpointActive: this.bossCheckpoint !== null,
      bossCheckpointBossId: this.bossCheckpoint?.bossId || null,
      tick: this.tick,
      totalFrames: this.totalFrames,
      score: this.score,
      deaths: this.deaths,
      livesRemaining: this.livesRemaining(),
      dead: this.dead,
      won: this.won
    };
  }

  livesRemaining(): number | null {
    return this.remainingLives;
  }

  carriedCoreCount(): number {
    return this.objectState.collectedCores.size;
  }

  setLivesRemaining(lives: number | null): void {
    this.remainingLives = this.normalizedLives(lives);
  }

  timeBonus(): number {
    return timeBonusForFrames(this.totalFrames, this.level.score);
  }

  finalScore(): number {
    return finalScoreForLevel(this.level, this.totalFrames, this.score);
  }

  exitUnlocked(): boolean {
    const bosses = this.level.bosses || [];
    if (bosses.length === 0) return true;
    return bosses.every((boss) => this.bossStates.get(boss.id)?.phase === "defeated");
  }

  finalBossDefeatCompletesLevel(): boolean {
    return this.level.completion === "boss-defeat" && (this.level.bosses || []).length > 0;
  }

  bossCheckpointActive(): boolean {
    return this.bossCheckpoint !== null;
  }

  bossCheckpointBossId(): string | null {
    return this.bossCheckpoint?.bossId || null;
  }

  bossFightInProgress(): boolean {
    return [...this.bossStates.values()].some((state) => state.phase === "intro" || state.phase === "active" || state.phase === "departing");
  }

  replaySummary(): string {
    const seconds = Math.floor(this.totalFrames / 60);
    const plates = [...this.objectState.activePlates].join(", ") || "none";
    const cores = [...this.objectState.collectedCores].join(", ") || "none";
    return `Level ${this.level.index + 1}, ${seconds}s, ${this.score} score, ${this.deaths} deaths, ${this.echoRecordings.length} echoes, plates ${plates}, cores ${cores}`;
  }

  private addCoreScore(coreId: string): void {
    if (this.currentAttemptCollectedCoreIds.has(coreId)) return;
    this.currentAttemptCollectedCoreIds.add(coreId);
    this.score += this.level.score.coreScore;
  }

  private resetBossStates(): void {
    this.bossStates.clear();
    for (const boss of this.level.bosses || []) {
      this.bossStates.set(boss.id, createBossRuntimeState(boss));
    }
  }

  private checkpointPlayerSnapshot(x: number, y: number): ActorBody {
    return {
      ...cloneActor(this.player),
      x,
      y,
      vx: 0,
      vy: 0,
      onGround: true,
      coyote: 0,
      jumpBuffer: 0,
      launchCooldown: 0,
      launchControlLock: 0,
      launchFloatFrames: 0,
      prevJump: false,
      standingOn: null,
      alive: true
    };
  }

  private captureBossCheckpoint(boss: Boss, events: StepEvents, playerX: number, playerY: number): void {
    if (this.bossCheckpoint?.bossId === boss.id) return;
    const checkpointX = Number.isFinite(boss.checkpoint?.x) ? Number(boss.checkpoint?.x) : playerX;
    const checkpointY = Number.isFinite(boss.checkpoint?.y) ? Number(boss.checkpoint?.y) : playerY;
    const checkpointPlayer = this.checkpointPlayerSnapshot(checkpointX, checkpointY);
    this.bossCheckpoint = {
      bossId: boss.id,
      player: checkpointPlayer,
      echoes: this.echoes.map(cloneActor),
      echoRecordings: cloneEchoRecordings(this.echoRecordings),
      currentRecording: [...this.currentRecording],
      objectState: cloneCheckpointObjectState(this.objectState),
      killedMonsterIds: new Set(this.killedMonsterIds),
      bossStates: this.checkpointBossStates(),
      currentAttemptCollectedCoreIds: new Set(this.currentAttemptCollectedCoreIds),
      currentAttemptKilledMonsterIds: new Map(this.currentAttemptKilledMonsterIds),
      currentAttemptDefeatedBossIds: new Map(this.currentAttemptDefeatedBossIds),
      runtimeSolids: cloneSolids(this.runtimeSolids),
      terrainRevision: this.terrainRevision,
      handledArchiveImpactKeys: new Set(this.handledArchiveImpactKeys),
      handledArchiveImpactSoundKeys: new Set(this.handledArchiveImpactSoundKeys),
      tick: this.tick,
      totalFrames: this.totalFrames,
      score: this.score,
      deaths: this.deaths,
      coreSpillSerial: this.coreSpillSerial,
      protectedCoreSaveIds: new Set(this.protectedCoreSaveIds),
      recoveredSpillCoreIds: new Set(this.recoveredSpillCoreIds)
    };
    events.bossCheckpointActivated = boss.id;
  }

  private checkpointPlayerForRollover(bossId: string): ActorBody {
    const boss = (this.level.bosses || []).find((candidate) => candidate.id === bossId);
    const checkpointX = boss && Number.isFinite(boss.checkpoint?.x) ? Number(boss.checkpoint?.x) : this.player.x;
    const checkpointY = boss && Number.isFinite(boss.checkpoint?.y) ? Number(boss.checkpoint?.y) : this.player.y;
    return this.checkpointPlayerSnapshot(checkpointX, checkpointY);
  }

  private refreshDoorStateForDefeatedBosses(events?: StepEvents): void {
    const openDoors = collectOpenDoors(
      this.level.doors || [],
      this.objectState.activePlates,
      this.objectState.collectedCores,
      new Set(this.currentAttemptDefeatedBossIds.keys())
    );
    if (setsMatch(this.objectState.openDoors, openDoors)) return;
    this.objectState = { ...this.objectState, openDoors };
    if (events) events.switched = true;
  }

  private checkpointBossStates(): Map<string, BossRuntimeState> {
    const states = cloneBossStates(this.bossStates);
    for (const id of this.currentAttemptDefeatedBossIds.keys()) {
      const state = states.get(id);
      if (!state) continue;
      state.phase = "defeated";
      state.departureFrames = Math.max(state.departureFrames, 0);
      state.invulnerableFrames = 0;
      state.recoveryFrames = 0;
      state.floorIcePatches = [];
    }
    return states;
  }

  private restoreBossCheckpoint(restoreEchoState = true): void {
    const checkpoint = this.bossCheckpoint;
    if (!checkpoint) return;
    const currentDeaths = this.deaths;
    const spentRecoveredSpillCoreIds = new Set<string>();
    for (const id of checkpoint.recoveredSpillCoreIds) {
      if (checkpoint.objectState.collectedCores.has(id) && !this.objectState.collectedCores.has(id)) {
        spentRecoveredSpillCoreIds.add(id);
      }
    }
    this.tick = checkpoint.tick;
    this.totalFrames = checkpoint.totalFrames;
    this.score = checkpoint.score;
    this.deaths = currentDeaths;
    this.dead = false;
    this.won = false;
    this.player = { ...cloneActor(checkpoint.player), alive: true };
    this.echoes = restoreEchoState ? checkpoint.echoes.map((echo) => ({ ...cloneActor(echo), alive: echo.alive })) : [];
    this.echoRecordings.length = 0;
    if (restoreEchoState) this.echoRecordings.push(...cloneEchoRecordings(checkpoint.echoRecordings));
    this.currentRecording = [];
    this.objectState = cloneObjectState(checkpoint.objectState);
    this.killedMonsterIds.clear();
    for (const id of checkpoint.killedMonsterIds) this.killedMonsterIds.add(id);
    this.bossStates.clear();
    for (const [id, state] of cloneBossStates(checkpoint.bossStates)) this.bossStates.set(id, state);
    this.currentAttemptCollectedCoreIds.clear();
    for (const id of checkpoint.currentAttemptCollectedCoreIds) this.currentAttemptCollectedCoreIds.add(id);
    this.currentAttemptKilledMonsterIds.clear();
    for (const [id, score] of checkpoint.currentAttemptKilledMonsterIds) this.currentAttemptKilledMonsterIds.set(id, score);
    this.currentAttemptDefeatedBossIds.clear();
    for (const [id, score] of checkpoint.currentAttemptDefeatedBossIds) this.currentAttemptDefeatedBossIds.set(id, score);
    this.runtimeSolids = cloneSolids(checkpoint.runtimeSolids);
    this.terrainRevision = checkpoint.terrainRevision;
    this.handledArchiveImpactKeys.clear();
    for (const key of checkpoint.handledArchiveImpactKeys) this.handledArchiveImpactKeys.add(key);
    this.handledArchiveImpactSoundKeys.clear();
    for (const key of checkpoint.handledArchiveImpactSoundKeys) this.handledArchiveImpactSoundKeys.add(key);
    this.coreInvulnerabilityFrames = 0;
    this.coreSpillSerial = checkpoint.coreSpillSerial;
    const spentProtectedCoreSaveIds = new Set(this.protectedCoreSaveIds);
    this.protectedCoreSaveIds.clear();
    for (const id of checkpoint.protectedCoreSaveIds) this.protectedCoreSaveIds.add(id);
    for (const id of spentProtectedCoreSaveIds) {
      if (checkpoint.objectState.collectedCores.has(id)) this.protectedCoreSaveIds.add(id);
    }
    this.recoveredSpillCoreIds.clear();
    for (const id of checkpoint.recoveredSpillCoreIds) this.recoveredSpillCoreIds.add(id);
    for (const id of spentRecoveredSpillCoreIds) {
      this.objectState.collectedCores.delete(id);
      this.recoveredSpillCoreIds.add(id);
      this.removeCoreScore(id);
    }
  }

  private refreshBossCheckpointAfterCoreSave(): void {
    const checkpoint = this.bossCheckpoint;
    if (!checkpoint) return;
    const checkpointKnownCoreIds = new Set([...checkpoint.objectState.claimedCores, ...checkpoint.objectState.collectedCores]);
    const objectState = cloneCheckpointObjectState(checkpoint.objectState);
    for (const id of [...objectState.collectedCores]) {
      if (!this.objectState.collectedCores.has(id)) objectState.collectedCores.delete(id);
    }
    objectState.openDoors = collectOpenDoors(
      this.level.doors || [],
      objectState.activePlates,
      objectState.collectedCores,
      new Set(this.currentAttemptDefeatedBossIds.keys())
    );
    objectState.blockedLasers = collectBlockedLasers(
      [...(this.level.lasers || []), ...(this.level.movingLasers || [])],
      [...objectState.crates.values()],
      objectState.activePlates,
      checkpoint.tick
    );
    const currentAttemptCollectedCoreIds = new Set(checkpoint.currentAttemptCollectedCoreIds);
    for (const id of [...currentAttemptCollectedCoreIds]) {
      if (!this.currentAttemptCollectedCoreIds.has(id)) currentAttemptCollectedCoreIds.delete(id);
    }
    const removedCheckpointCoreScore = (checkpoint.currentAttemptCollectedCoreIds.size - currentAttemptCollectedCoreIds.size) * this.level.score.coreScore;
    const protectedCoreSaveIds = new Set([...this.protectedCoreSaveIds].filter((id) => checkpointKnownCoreIds.has(id)));
    const recoveredSpillCoreIds = new Set(checkpoint.recoveredSpillCoreIds);
    for (const id of this.recoveredSpillCoreIds) {
      if (checkpointKnownCoreIds.has(id)) recoveredSpillCoreIds.add(id);
    }
    this.bossCheckpoint = {
      ...checkpoint,
      objectState,
      currentAttemptCollectedCoreIds,
      score: Math.max(0, checkpoint.score - removedCheckpointCoreScore),
      coreSpillSerial: this.coreSpillSerial,
      protectedCoreSaveIds,
      recoveredSpillCoreIds
    };
  }

  private resetRuntimeTerrain(): void {
    this.runtimeSolids = cloneSolids(this.level.solids);
    this.terrainRevision += 1;
    this.handledArchiveImpactKeys.clear();
    this.handledArchiveImpactSoundKeys.clear();
  }

  private archiveImpactKey(boss: Boss, state: BossRuntimeState, attack: BossAttackSnapshot): string {
    const cycleIndex = Math.floor(state.activeFrames / Math.max(1, bossAttackCycleFramesFor(boss.kind)));
    return `${boss.id}:${state.attackSequence}:${cycleIndex}:${attack.round || 1}:${Math.round(attack.originX)}`;
  }

  private archiveImpactSoundKey(boss: Boss, state: BossRuntimeState, attack: BossAttackSnapshot): string {
    const cycleIndex = Math.floor(state.activeFrames / Math.max(1, bossAttackCycleFramesFor(boss.kind)));
    return `${boss.id}:${state.attackSequence}:${cycleIndex}:${attack.round || 1}`;
  }

  private applyArchiveBookErosion(boss: Boss, state: BossRuntimeState, attacks: BossAttackSnapshot[], events: StepEvents): void {
    if (boss.kind !== "archive-custodian") return;
    for (const attack of attacks) {
      if (attack.attackType !== "archive-book" || attack.attackPhase !== "impact") continue;
      const key = this.archiveImpactKey(boss, state, attack);
      const soundKey = this.archiveImpactSoundKey(boss, state, attack);
      if (!this.handledArchiveImpactSoundKeys.has(soundKey)) {
        this.handledArchiveImpactSoundKeys.add(soundKey);
        events.bossSoundCues.push({
          id: boss.id,
          kind: boss.kind,
          cue: "archive-book-impact",
          x: attack.originX,
          y: attack.y + attack.h
        });
      }
      if ((attack.progress || 0) < 0.999) continue;
      if (this.handledArchiveImpactKeys.has(key)) continue;
      this.handledArchiveImpactKeys.add(key);
      this.erodeSolidAtArchiveImpact(attack, key);
    }
  }

  private erodeSolidAtArchiveImpact(attack: BossAttackSnapshot, impactKey: string): void {
    if (!archiveImpactShouldErode(impactKey)) return;

    const impactBottom = attack.y + attack.h;
    const laneLeft = attack.originX - attack.w / 2;
    const laneRight = attack.originX + attack.w / 2;
    const candidate = this.runtimeSolids
      .map((solid, index) => ({ solid, index }))
      .filter(
        ({ solid }) =>
          solid.erodesWith === "archive-book" &&
          solidLooksLikeErodibleFloor(solid) &&
          solid.x < laneRight &&
          solid.x + solid.w > laneLeft &&
          Math.abs(solid.y - impactBottom) <= 4
      )
      .sort((a, b) => a.solid.y - b.solid.y || a.index - b.index)[0];
    if (!candidate) return;

    const { solid, index } = candidate;
    const tileCount = archiveImpactTileCount(impactKey, solid.erosionTiles === 2 ? 2 : 1);
    const erodeWidth = Math.min(solid.w, tileCount * TERRAIN_TILE_SIZE);
    const erodeDepth = Math.min(solid.h, TERRAIN_TILE_SIZE);
    const solidRight = solid.x + solid.w;
    const solidBottom = solid.y + solid.h;
    const rawLeft = solid.x + Math.round((attack.originX - solid.x - erodeWidth / 2) / TERRAIN_TILE_SIZE) * TERRAIN_TILE_SIZE;
    const erodeLeft = Math.max(solid.x, Math.min(rawLeft, solidRight - erodeWidth));
    const erodeRight = Math.min(solidRight, erodeLeft + erodeWidth);

    const nextPieces: Solid[] = [];
    if (erodeLeft - solid.x >= 1) {
      nextPieces.push({
        ...solid,
        id: `${solid.id}:tl${this.terrainRevision}`,
        h: erodeDepth,
        w: erodeLeft - solid.x
      });
    }
    if (solidRight - erodeRight >= 1) {
      nextPieces.push({
        ...solid,
        id: `${solid.id}:tr${this.terrainRevision}`,
        x: erodeRight,
        h: erodeDepth,
        w: solidRight - erodeRight
      });
    }
    if (solidBottom - (solid.y + erodeDepth) >= 1) {
      nextPieces.push({
        ...solid,
        id: `${solid.id}:b${this.terrainRevision}`,
        y: solid.y + erodeDepth,
        h: solidBottom - (solid.y + erodeDepth)
      });
    }

    this.runtimeSolids.splice(index, 1, ...nextPieces);
    this.terrainRevision += 1;
  }

  private updateMonsters(events: StepEvents, previousPlayerY: number): void {
    for (const monster of this.level.monsters || []) {
      if (this.killedMonsterIds.has(monster.id)) continue;
      const rect = monsterRectAt(monster, this.tick);
      if (!rectsOverlap(this.player, rect)) continue;
      if (actorKillsMonster(this.player, previousPlayerY, monster, rect)) {
        this.killMonster(monster, rect, events);
        continue;
      }
      this.applyPlayerDamage(events, rect);
      return;
    }
  }

  private killMonster(monster: Monster, rect: Rect, events: StepEvents): void {
    const score = monsterScore(monster);
    this.killedMonsterIds.add(monster.id);
    this.currentAttemptKilledMonsterIds.set(monster.id, score);
    this.score += score;
    this.player.vy = MONSTER_BOUNCE_SPEED;
    this.player.onGround = false;
    this.player.coyote = 0;
    events.monsterKills.push({
      id: monster.id,
      score,
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2
    });
  }

  private updateBosses(events: StepEvents, previousPlayerY: number, previousPlayerX: number): void {
    for (const boss of this.level.bosses || []) {
      const state = this.bossStates.get(boss.id);
      if (!state || state.phase === "defeated") continue;

      if (state.phase === "departing") {
        if (advanceBossDefeatDeparture(boss, state)) {
          state.phase = "defeated";
          state.departureFrames = state.departureFrames || 0;
          events.bossDepartureFinished = boss.id;
          events.bossDepartureFinishedIds.push(boss.id);
          if (this.exitUnlocked()) {
            if (this.finalBossDefeatCompletesLevel()) {
              this.won = true;
              events.won = true;
            } else {
              events.bossPortalUnlocked = true;
            }
          }
        }
        continue;
      }

      if (state.phase === "idle" && rectsOverlap(this.player, boss)) {
        this.captureBossCheckpoint(boss, events, previousPlayerX, previousPlayerY);
        state.phase = "intro";
        state.introFrames = 0;
        events.bossIntroStarted = boss.id;
      }

      if (state.phase === "intro") {
        state.introFrames += 1;
        if (state.introFrames >= bossIntroFrames(boss)) {
          state.phase = "active";
          state.introFrames = bossIntroFrames(boss);
          state.activeFrames = 0;
          settleBossAtIntroEnd(boss, state);
        }
      } else if (state.phase === "active") {
        state.activeFrames += 1;
        state.invulnerableFrames = Math.max(0, state.invulnerableFrames - 1);
        const motionEvents = advanceBossActiveMotion(boss, state, this.player, this.runtimeSolids);
        const cycle = state.activeFrames % bossAttackCycleFramesFor(boss.kind);
        const attackStarts = cycle === bossAttackWindupFramesFor(boss.kind) && state.recoveryFrames <= 0;
        if (attackStarts && boss.kind === "storm-relay-warden") {
          events.bossSoundCues.push({
            id: boss.id,
            kind: boss.kind,
            cue: "storm-floor-beam",
            x: state.attackX,
            y: state.attackY
          });
        } else if (attackStarts && boss.kind === "cryo-conservator") {
          events.bossSoundCues.push({
            id: boss.id,
            kind: boss.kind,
            cue: "cryo-beam-fire",
            x: state.attackX,
            y: state.attackY
          });
        }
        if (motionEvents.cryoFloorIceFormed && boss.kind === "cryo-conservator") {
          events.bossSoundCues.push({
            id: boss.id,
            kind: boss.kind,
            cue: "cryo-floor-ice-form",
            x: state.attackX,
            y: state.attackY
          });
        }
      }

      if (state.phase !== "active") continue;
      const body = bossBodyRectAt(boss, state, this.tick);
      if (bossTakesHit(this.player, previousPlayerY, boss, body, state)) {
        this.hitBoss(boss, state, body, events);
        continue;
      }

      const attacks = bossAttackRectsAt(boss, state, this.tick, this.runtimeSolids);
      this.applyArchiveBookErosion(boss, state, attacks, events);
      const floorShocks = bossFloorShockRectsAt(boss, state, this.tick, this.runtimeSolids);
      const damageSource =
        bossBodyDamages(state) && rectsOverlap(this.player, body)
          ? body
          : attacks.find((attack) => rectsOverlap(this.player, attack)) || floorShocks.find((shock) => rectsOverlap(this.player, shock));
      if (damageSource) {
        this.applyPlayerDamage(events, damageSource);
        return;
      }
    }
  }

  private hitBoss(boss: Boss, state: BossRuntimeState, body: Rect, events: StepEvents): void {
    state.health = Math.max(0, state.health - 1);
    state.invulnerableFrames = BOSS_INVULNERABLE_FRAMES;
    this.player.vy = BOSS_HIT_BOUNCE_SPEED;
    this.player.onGround = false;
    this.player.coyote = 0;
    const hitEvent = {
      id: boss.id,
      health: state.health,
      x: body.x + body.w / 2,
      y: body.y + body.h / 2
    };
    events.bossHit = hitEvent;
    events.bossHits.push(hitEvent);
    if (state.health > 0) {
      recoverBossAfterHit(boss, state);
      return;
    }

    const score = bossScore(boss);
    startBossDefeatDeparture(boss, state, body);
    this.currentAttemptDefeatedBossIds.set(boss.id, score);
    this.score += score;
    this.refreshDoorStateForDefeatedBosses(events);
    const defeatEvent = {
      id: boss.id,
      score,
      x: body.x + body.w / 2,
      y: body.y + body.h / 2
    };
    events.bossDefeated = defeatEvent;
    events.bossDefeateds.push(defeatEvent);
    this.refreshBossCheckpointAfterDefeat(boss.id);
  }

  private refreshBossCheckpointAfterDefeat(defeatedBossId: string): void {
    if (!this.bossCheckpoint) return;
    const checkpointBossState = this.bossStates.get(this.bossCheckpoint.bossId);
    const checkpointBossActive = checkpointBossState?.phase === "intro" || checkpointBossState?.phase === "active";
    const nextBossId = checkpointBossActive
      ? this.bossCheckpoint.bossId
      : (this.level.bosses || [])
          .filter((boss) => boss.id !== defeatedBossId)
          .find((boss) => {
            const state = this.bossStates.get(boss.id);
            return state?.phase === "intro" || state?.phase === "active";
          })?.id;
    if (nextBossId) {
      const checkpointRolledToNewBoss = nextBossId !== this.bossCheckpoint.bossId;
      const objectState = cloneObjectState(this.objectState);
      objectState.openDoors = collectOpenDoors(
        this.level.doors || [],
        objectState.activePlates,
        objectState.collectedCores,
        new Set(this.currentAttemptDefeatedBossIds.keys())
      );
      this.bossCheckpoint = {
        ...this.bossCheckpoint,
        bossId: nextBossId,
        ...(checkpointRolledToNewBoss
          ? {
              player: this.checkpointPlayerForRollover(nextBossId),
              echoes: this.echoes.map(cloneActor),
              echoRecordings: cloneEchoRecordings(this.echoRecordings),
              currentRecording: [...this.currentRecording],
              tick: this.tick,
              totalFrames: this.totalFrames,
              deaths: this.deaths
            }
          : {}),
        objectState,
        killedMonsterIds: new Set(this.killedMonsterIds),
        bossStates: this.checkpointBossStates(),
        currentAttemptCollectedCoreIds: new Set(this.currentAttemptCollectedCoreIds),
        currentAttemptKilledMonsterIds: new Map(this.currentAttemptKilledMonsterIds),
        currentAttemptDefeatedBossIds: new Map(this.currentAttemptDefeatedBossIds),
        runtimeSolids: cloneSolids(this.runtimeSolids),
        terrainRevision: this.terrainRevision,
        handledArchiveImpactKeys: new Set(this.handledArchiveImpactKeys),
        handledArchiveImpactSoundKeys: new Set(this.handledArchiveImpactSoundKeys),
        score: this.score,
        coreSpillSerial: this.coreSpillSerial,
        protectedCoreSaveIds: new Set(this.protectedCoreSaveIds),
        recoveredSpillCoreIds: new Set(this.recoveredSpillCoreIds)
      };
    }
    else this.bossCheckpoint = null;
  }

  private removeDiscardedAttemptScore(): void {
    const discardedCoreScore = this.currentAttemptCollectedCoreIds.size * this.level.score.coreScore;
    const discardedMonsterScore = [...this.currentAttemptKilledMonsterIds.values()].reduce((sum, value) => sum + value, 0);
    const discardedBossScore = [...this.currentAttemptDefeatedBossIds.values()].reduce((sum, value) => sum + value, 0);
    if (discardedCoreScore + discardedMonsterScore + discardedBossScore > 0) {
      this.score = Math.max(0, this.score - discardedCoreScore - discardedMonsterScore - discardedBossScore);
    }
    this.currentAttemptCollectedCoreIds.clear();
    this.currentAttemptKilledMonsterIds.clear();
    this.currentAttemptDefeatedBossIds.clear();
  }

  bossSnapshots(): BossSnapshot[] {
    return (this.level.bosses || []).flatMap((boss) => {
      const state = this.bossStates.get(boss.id);
      if (!state || state.phase === "idle") return [];
      const body = bossBodyRectAt(boss, state, this.tick);
      const weakSpot = bossWeakSpotRectAt(boss, body);
      return [
        {
          id: boss.id,
          kind: boss.kind,
          phase: state.phase,
          health: state.health,
          introFrames: state.introFrames,
          introTotalFrames: bossIntroFrames(boss),
          activeFrames: state.activeFrames,
          invulnerableFrames: state.invulnerableFrames,
          recoveryFrames: state.recoveryFrames,
          departurePauseFrames: state.departurePauseFrames,
          departurePauseTotalFrames: BOSS_DEFEAT_PAUSE_FRAMES,
          departureFrames: state.departureFrames,
          departureTotalFrames: BOSS_DEFEAT_DEPARTURE_FRAMES,
          body,
          weakSpot,
          weakSpotKind: bossWeakSpot(boss),
          attackWarnings: bossAttackWarningRectsAt(boss, state, this.tick, this.runtimeSolids),
          attacks: bossAttackRectsAt(boss, state, this.tick, this.runtimeSolids),
          floorShocks: bossFloorShockRectsAt(boss, state, this.tick, this.runtimeSolids),
          floorIce: bossFloorIceRectsAt(boss, state, this.tick, this.runtimeSolids)
        }
      ];
    });
  }

  private currentBossFloorIceRects(): Rect[] {
    return (this.level.bosses || []).flatMap((boss) => {
      const state = this.bossStates.get(boss.id);
      return state ? bossFloorIceRectsAt(boss, state, this.tick, this.runtimeSolids) : [];
    });
  }

  private actorCanBlockMovementFor(actor: ActorBody, other: ActorBody, movementDoomedEchoIds: ReadonlySet<string>): boolean {
    if (other === actor || !other.alive) return false;
    if (other.kind === "echo" && movementDoomedEchoIds.has(other.id)) return false;
    return true;
  }

  private movementDoomedEchoIds(): Set<string> {
    const doomed = new Set<string>();
    for (const echo of this.aliveEchoes()) {
      if (this.echoTouchesNonSwitchableHazard(echo)) doomed.add(echo.id);
    }
    return doomed;
  }

  private echoTouchesNonSwitchableHazard(echo: ActorBody): boolean {
    if ((this.level.hazards || []).some((hazard) => rectsOverlap(echo, hazard))) return true;
    for (const laser of this.level.lasers || []) {
      if ((laser.disabledBy || []).length > 0) continue;
      if (!laserIsActive(laser, this.objectState.activePlates)) continue;
      if (this.objectState.blockedLasers.has(laser.id)) continue;
      if (rectsOverlap(echo, laser)) return true;
    }
    for (const laser of this.level.movingLasers || []) {
      if ((laser.disabledBy || []).length > 0) continue;
      if (!laserIsActive(laser, this.objectState.activePlates)) continue;
      if (this.objectState.blockedLasers.has(laser.id)) continue;
      if (rectsOverlap(echo, movingLaserRectAt(laser, this.tick))) return true;
    }
    for (const drone of this.level.drones || []) {
      if ((drone.disabledBy || []).length > 0) continue;
      if (droneIsActive(drone, this.objectState.activePlates) && rectsOverlap(echo, droneRectAt(drone, this.tick))) return true;
    }
    return false;
  }

  private objectActors(): ActorBody[] {
    return [this.player, ...this.echoes].filter((actor) => actor.alive);
  }

  private hasCoreSaveAvailable(objectState: ObjectState = this.objectState): boolean {
    return [...objectState.collectedCores].some((id) => this.coreCanSpill(id) || this.coreCanProtectOnce(id));
  }

  private currentDamageWouldKillPlayer(objectState: ObjectState = this.objectState): boolean {
    return this.coreInvulnerabilityFrames <= 0 && !this.hasCoreSaveAvailable(objectState);
  }

  private playerHazardContactWouldKill(objectState: ObjectState): boolean {
    const hazardContact = actorHazardContact(this.level, this.player, objectState, this.tick);
    if (!hazardContact) return false;
    return hazardContact.kind === "laser" || this.currentDamageWouldKillPlayer(objectState);
  }

  private playerMonsterContactWouldKill(previousPlayerY: number, objectState: ObjectState): boolean {
    if (!this.currentDamageWouldKillPlayer(objectState)) return false;
    for (const monster of this.level.monsters || []) {
      if (this.killedMonsterIds.has(monster.id)) continue;
      const rect = monsterRectAt(monster, this.tick);
      if (!rectsOverlap(this.player, rect)) continue;
      if (actorKillsMonster(this.player, previousPlayerY, monster, rect)) return false;
      return true;
    }
    return false;
  }

  private playerBossContactWouldKill(previousPlayerY: number, objectState: ObjectState): boolean {
    if (!this.currentDamageWouldKillPlayer(objectState)) return false;
    for (const boss of this.level.bosses || []) {
      const currentState = this.bossStates.get(boss.id);
      if (!currentState || currentState.phase === "defeated" || currentState.phase === "departing") continue;
      const state: BossRuntimeState = {
        ...currentState,
        floorIcePatches: currentState.floorIcePatches.map((patch) => ({ ...patch }))
      };

      if (state.phase === "idle" && rectsOverlap(this.player, boss)) {
        state.phase = "intro";
        state.introFrames = 0;
      }

      if (state.phase === "intro") {
        state.introFrames += 1;
        if (state.introFrames >= bossIntroFrames(boss)) {
          state.phase = "active";
          state.introFrames = bossIntroFrames(boss);
          state.activeFrames = 0;
          settleBossAtIntroEnd(boss, state);
        }
      } else if (state.phase === "active") {
        state.activeFrames += 1;
        state.invulnerableFrames = Math.max(0, state.invulnerableFrames - 1);
        advanceBossActiveMotion(boss, state, this.player, this.runtimeSolids);
      }

      if (state.phase !== "active") continue;
      const body = bossBodyRectAt(boss, state, this.tick);
      if (bossTakesHit(this.player, previousPlayerY, boss, body, state)) continue;
      const attacks = bossAttackRectsAt(boss, state, this.tick, this.runtimeSolids);
      const floorShocks = bossFloorShockRectsAt(boss, state, this.tick, this.runtimeSolids);
      const damageSource =
        bossBodyDamages(state) && rectsOverlap(this.player, body)
          ? body
          : attacks.find((attack) => rectsOverlap(this.player, attack)) || floorShocks.find((shock) => rectsOverlap(this.player, shock));
      if (damageSource) return true;
    }
    return false;
  }

  private playerShouldDriveSpilledCoreDoors(previousPlayerY: number, objectState: ObjectState): boolean {
    if (this.dead || !this.player.alive) return false;
    if (this.playerHazardContactWouldKill(objectState)) return false;
    if (this.playerMonsterContactWouldKill(previousPlayerY, objectState)) return false;
    if (this.playerBossContactWouldKill(previousPlayerY, objectState)) return false;
    return true;
  }

  private markPlayerDead(events: StepEvents): void {
    this.dead = true;
    this.player.alive = false;
    this.deaths += 1;
    if (this.remainingLives !== null) this.remainingLives = Math.max(0, this.remainingLives - 1);
    events.died = true;
    const remaining = this.livesRemaining();
    events.livesExhausted = remaining !== null && remaining <= 0;
    this.recomputeObjectStateForActors(this.aliveEchoes());
  }

  private discardCurrentFrameCorePickups(coreEvents: StepEvents["cores"], previousObjectState: ObjectState): void {
    if (coreEvents.length === 0) return;
    for (const core of coreEvents) {
      this.removeCoreScore(core.id);
      if (core.recovered) this.recoveredSpillCoreIds.delete(core.id);
    }
    const restored = cloneObjectState(previousObjectState);
    this.objectState = {
      ...this.objectState,
      collectedCores: restored.collectedCores,
      claimedCores: restored.claimedCores,
      coreOffsets: restored.coreOffsets,
      spilledCores: restored.spilledCores
    };
  }

  private applyPlayerDamage(events: StepEvents, source: Rect): void {
    if (this.coreInvulnerabilityFrames > 0) return;
    if (this.trySavePlayerWithCores(events, source)) return;
    this.markPlayerDead(events);
  }

  private trySavePlayerWithCores(events: StepEvents, source: Rect): boolean {
    const spillableCoreIds = [...this.objectState.collectedCores].filter((id) => this.coreCanSpill(id));
    const protectedCoreIds = [...this.objectState.collectedCores].filter((id) => this.coreCanProtectOnce(id));
    if (spillableCoreIds.length === 0 && protectedCoreIds.length === 0) return false;
    const recoverableCoreIds = spillableCoreIds.filter((id) => !this.recoveredSpillCoreIds.has(id));
    const spilledIds = this.recoverableSpillCoreIds(recoverableCoreIds);
    const spilledIdSet = new Set(spilledIds);
    const lostCoreIds = spillableCoreIds.filter((id) => !spilledIdSet.has(id));
    const protectedSaveIds = spillableCoreIds.length === 0 ? protectedCoreIds.slice(0, 1) : [];
    const nextCollectedCores = new Set(this.objectState.collectedCores);
    const nextSpilledCores = new Map([...this.objectState.spilledCores.entries()].map(([id, core]) => [id, { ...core }]));
    const playerCenter = this.rectCenter(this.player);
    const sourceCenter = this.rectCenter(source);
    const sourceDirection = playerCenter.x === sourceCenter.x ? this.player.facing || 1 : Math.sign(playerCenter.x - sourceCenter.x);
    const knockbackDirection = sourceDirection === 0 ? 1 : sourceDirection;

    for (const sourceId of spillableCoreIds) {
      nextCollectedCores.delete(sourceId);
      this.removeCoreScore(sourceId);
    }
    for (const sourceId of protectedSaveIds) this.protectedCoreSaveIds.add(sourceId);

    for (let index = 0; index < spilledIds.length; index += 1) {
      const sourceId = spilledIds[index];
      const core = this.coreById(sourceId);
      const width = Math.max(12, Math.min(24, core?.w || 18));
      const height = Math.max(12, Math.min(24, core?.h || 18));
      const scatterSlot = spilledIds.length === 1 ? -knockbackDirection : (index % 2 === 0 ? 1 : -1) * (Math.floor(index / 2) + 1);
      const scatterMagnitude = Math.abs(scatterSlot);
      const outward = scatterSlot * (2.3 + Math.min(3, scatterMagnitude) * 0.58) + knockbackDirection * 0.55;
      const looseId = `${sourceId}:spill:${this.coreSpillSerial}`;
      this.coreSpillSerial += 1;
      nextSpilledCores.set(looseId, {
        id: looseId,
        sourceId,
        x: playerCenter.x - width / 2 + scatterSlot * 14,
        y: playerCenter.y - height / 2 - 8,
        w: width,
        h: height,
        vx: outward,
        vy: -7.4 - (index % 3) * 0.7 - Math.min(1.2, scatterMagnitude * 0.16),
        ttlFrames: CORE_SPILL_TTL_FRAMES,
        pickupDelayFrames: CORE_SPILL_PICKUP_DELAY_FRAMES
      });
    }

    this.objectState = {
      ...this.objectState,
      collectedCores: nextCollectedCores,
      spilledCores: nextSpilledCores
    };
    this.refreshDoorStateForDefeatedBosses(events);
    this.refreshBossCheckpointAfterCoreSave();
    this.player.alive = true;
    this.player.vx = knockbackDirection * CORE_SAVE_KNOCKBACK_SPEED;
    this.player.vy = CORE_SAVE_BOUNCE_SPEED;
    this.player.onGround = false;
    this.player.coyote = 0;
    this.player.jumpBuffer = 0;
    this.player.standingOn = null;
    this.coreInvulnerabilityFrames = CORE_SAVE_INVULNERABILITY_FRAMES;
    events.coreSpill = {
      coreIds: spilledIds,
      lostCoreIds,
      protectedCoreIds: protectedSaveIds,
      x: playerCenter.x,
      y: playerCenter.y
    };
    return true;
  }

  private coreCanSpill(coreId: string): boolean {
    const core = this.coreById(coreId);
    return core ? !isMajorCore(core, this.requiredCoreIds) : false;
  }

  private coreCanProtectOnce(coreId: string): boolean {
    if (this.protectedCoreSaveIds.has(coreId)) return false;
    const core = this.coreById(coreId);
    return core ? isMajorCore(core, this.requiredCoreIds) : false;
  }

  private recoverableSpillCoreIds(coreIds: string[]): string[] {
    if (coreIds.length === 0) return [];
    const maxRecoverable = Math.min(CORE_SPILL_MAX_RECOVERABLE, coreIds.length, Math.max(1, Math.ceil(coreIds.length / 2)));
    const minRecoverable = coreIds.length >= 4 ? Math.min(2, maxRecoverable) : 1;
    const count = minRecoverable + (this.coreSpillHash(coreIds.join("|")) % (maxRecoverable - minRecoverable + 1));
    return [...coreIds]
      .sort((left, right) => this.coreSpillHash(left) - this.coreSpillHash(right))
      .slice(0, count);
  }

  private coreSpillHash(value: string): number {
    let hash = 2166136261;
    const seed = `${this.level.id}:${value}`;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private coreById(coreId: string): Core | undefined {
    return (this.level.cores || []).find((core) => core.id === coreId);
  }

  private rectCenter(rect: Rect): { x: number; y: number } {
    return {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2
    };
  }

  private removeCoreScore(coreId: string): void {
    if (!this.currentAttemptCollectedCoreIds.delete(coreId)) return;
    this.score = Math.max(0, this.score - this.level.score.coreScore);
  }

  private advanceSpilledCores(supports: Rect[], blockers: Rect[]): void {
    if (this.objectState.spilledCores.size === 0) return;
    const nextSpilledCores = new Map<string, SpilledCore>();
    for (const [id, looseCore] of this.objectState.spilledCores) {
      if (looseCore.ttlFrames <= 1) continue;
      const previousX = looseCore.x;
      const previousY = looseCore.y;
      const moved: SpilledCore = {
        ...looseCore,
        ttlFrames: looseCore.ttlFrames - 1,
        pickupDelayFrames: Math.max(0, looseCore.pickupDelayFrames - 1),
        vx: looseCore.vx * CORE_SPILL_DRAG,
        vy: Math.min(CORE_SPILL_MAX_FALL_SPEED, looseCore.vy + CORE_SPILL_GRAVITY)
      };
      moved.x += moved.vx;
      this.resolveSpilledCoreBounds(moved);
      this.resolveSpilledCoreHorizontal(moved, previousX, blockers);
      moved.y += moved.vy;
      this.resolveSpilledCoreVertical(moved, previousY, blockers);
      this.resolveSpilledCoreTerrain(moved, previousY, supports);
      this.resolveSpilledCorePenetration(moved, blockers);
      nextSpilledCores.set(id, moved);
    }
    this.objectState = { ...this.objectState, spilledCores: nextSpilledCores };
  }

  private spilledCoreDoorRects(defeatedBossIds: ReadonlySet<string>, previousPlayerY: number): Rect[] {
    let actors = [this.player, ...this.aliveEchoes()].filter((actor) => actor.alive);
    let projected = this.projectObjectStateForSpilledCoreDoors(actors, defeatedBossIds);
    for (;;) {
      const survivors = actors.filter((actor) => {
        if (actor.kind === "player") return this.playerShouldDriveSpilledCoreDoors(previousPlayerY, projected);
        return actor.kind !== "echo" || !actorTouchesHazard(this.level, actor, projected, this.tick);
      });
      if (survivors.length === actors.length) break;
      actors = survivors;
      projected = this.projectObjectStateForSpilledCoreDoors(actors, defeatedBossIds);
    }
    return closedDoorRects(this.level, projected.openDoors);
  }

  private projectObjectStateForSpilledCoreDoors(actors: ActorBody[], defeatedBossIds: ReadonlySet<string>): ObjectState {
    const projected = updateObjects(this.level, actors, { ...this.objectState, spilledCores: new Map() }, this.tick, defeatedBossIds, {
      advanceCoreMagnet: false
    }).state;
    const playerActor = actors.find((actor) => actor.kind === "player" && actor.alive);
    if (!playerActor) return projected;

    const collectedCores = new Set(projected.collectedCores);
    const claimedCores = new Set(projected.claimedCores);
    let recovered = false;
    for (const looseCore of this.objectState.spilledCores.values()) {
      if (looseCore.pickupDelayFrames > 0 || !rectsOverlap(playerActor, looseCore)) continue;
      claimedCores.add(looseCore.sourceId);
      collectedCores.add(looseCore.sourceId);
      recovered = true;
    }
    if (!recovered) return projected;
    return {
      ...projected,
      collectedCores,
      claimedCores,
      openDoors: collectOpenDoors(this.level.doors || [], projected.activePlates, collectedCores, defeatedBossIds)
    };
  }

  private spilledCoreSupportRects(doors: Rect[], platforms: Array<{ current: Rect }>): Rect[] {
    return [
      ...this.runtimeSolids.filter(solidHasGameplayCollision),
      ...doors,
      ...(this.level.oneWays || []),
      ...platforms.map((platform) => platform.current),
      ...(this.level.conveyors || []),
      ...this.objectState.crates.values()
    ];
  }

  private spilledCoreBlockerRects(doors: Rect[]): Rect[] {
    return [
      ...this.runtimeSolids.filter(solidHasFullCollision),
      ...doors,
      ...this.objectState.crates.values()
    ];
  }

  private resolveSpilledCoreBounds(core: SpilledCore): void {
    const minX = this.level.bounds.x;
    const maxX = this.level.bounds.x + this.level.bounds.w - core.w;
    if (core.x < minX) {
      core.x = minX;
      core.vx = Math.abs(core.vx) * CORE_SPILL_BOUNCE;
    } else if (core.x > maxX) {
      core.x = maxX;
      core.vx = -Math.abs(core.vx) * CORE_SPILL_BOUNCE;
    }
  }

  private resolveSpilledCoreHorizontal(core: SpilledCore, previousX: number, blockers: Rect[]): void {
    if (Math.abs(core.vx) < 0.01) return;
    for (const blocker of blockers) {
      if (!rectsOverlap(core, blocker)) continue;
      const previousRight = previousX + core.w;
      if (core.vx > 0 && previousRight <= blocker.x + 1) {
        core.x = blocker.x - core.w;
        core.vx = -Math.abs(core.vx) * CORE_SPILL_BOUNCE;
        return;
      }
      if (core.vx < 0 && previousX >= blocker.x + blocker.w - 1) {
        core.x = blocker.x + blocker.w;
        core.vx = Math.abs(core.vx) * CORE_SPILL_BOUNCE;
        return;
      }
    }
  }

  private resolveSpilledCoreVertical(core: SpilledCore, previousY: number, blockers: Rect[]): void {
    if (Math.abs(core.vy) < 0.01) return;
    for (const blocker of blockers) {
      if (!rectsOverlap(core, blocker)) continue;
      const previousBottom = previousY + core.h;
      if (core.vy < 0 && previousY >= blocker.y + blocker.h - 1) {
        core.y = blocker.y + blocker.h;
        core.vy = Math.abs(core.vy) * CORE_SPILL_BOUNCE;
        return;
      }
      if (core.vy > 0 && previousBottom <= blocker.y + 2) {
        core.y = blocker.y - core.h;
        core.vy = Math.abs(core.vy) > 1.2 ? -Math.abs(core.vy) * CORE_SPILL_BOUNCE : 0;
        core.vx *= 0.82;
        return;
      }
    }
  }

  private resolveSpilledCoreTerrain(core: SpilledCore, previousY: number, supports: Rect[]): void {
    if (core.vy < 0) return;
    const previousBottom = previousY + core.h;
    for (const support of supports) {
      if (previousBottom > support.y + 2) continue;
      if (core.y + core.h < support.y || core.y > support.y + support.h) continue;
      if (core.x + core.w <= support.x || core.x >= support.x + support.w) continue;
      core.y = support.y - core.h;
      core.vy = Math.abs(core.vy) > 1.2 ? -Math.abs(core.vy) * CORE_SPILL_BOUNCE : 0;
      core.vx *= 0.82;
      return;
    }
  }

  private resolveSpilledCorePenetration(core: SpilledCore, blockers: Rect[]): void {
    for (const blocker of blockers) {
      if (!rectsOverlap(core, blocker)) continue;
      const pushLeft = core.x + core.w - blocker.x;
      const pushRight = blocker.x + blocker.w - core.x;
      const pushUp = core.y + core.h - blocker.y;
      const pushDown = blocker.y + blocker.h - core.y;
      const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
      const shove = 1.2;
      if (minPush === pushLeft) {
        core.x = blocker.x - core.w;
        core.vx = -Math.max(Math.abs(core.vx), shove) * CORE_SPILL_BOUNCE;
      } else if (minPush === pushRight) {
        core.x = blocker.x + blocker.w;
        core.vx = Math.max(Math.abs(core.vx), shove) * CORE_SPILL_BOUNCE;
      } else if (minPush === pushUp) {
        core.y = blocker.y - core.h;
        core.vy = Math.abs(core.vy) > 1.2 ? -Math.abs(core.vy) * CORE_SPILL_BOUNCE : 0;
        core.vx *= 0.82;
      } else {
        core.y = blocker.y + blocker.h;
        core.vy = Math.max(Math.abs(core.vy), shove) * CORE_SPILL_BOUNCE;
      }
      return;
    }
  }

  private normalizedLives(value: number | null): number | null {
    if (value === null) return null;
    return Math.max(0, Math.round(value));
  }

  private applyLaunchPads(actor: ActorBody, previousY: number): string | null {
    actor.launchCooldown = Math.max(0, actor.launchCooldown - 1);
    if (!actor.alive || actor.launchCooldown > 0 || actor.vy < 0) return null;
    const launchPad = (this.level.launchPads || []).find((pad) => {
      const previousFootY = previousY + actor.h;
      const currentFootY = actor.y + actor.h;
      const footLeft = actor.x + 2;
      const footRight = actor.x + actor.w - 2;
      return (
        rectsOverlap(actor, pad) &&
        footLeft < pad.x + pad.w &&
        footRight > pad.x &&
        previousFootY <= pad.y + LAUNCH_PAD_FACE_TOLERANCE &&
        currentFootY >= pad.y
      );
    });
    if (!launchPad) return null;
    actor.y = launchPad.y - actor.h;
    if (launchPad.powerX !== undefined) actor.vx = launchPad.powerX;
    actor.vy = -Math.max(1, launchPad.powerY) * LAUNCH_PAD_SPEED_SCALE;
    actor.onGround = false;
    actor.coyote = 0;
    actor.jumpBuffer = 0;
    actor.launchCooldown = LAUNCH_PAD_COOLDOWN_FRAMES;
    actor.launchControlLock = LAUNCH_PAD_CONTROL_LOCK_FRAMES;
    actor.launchFloatFrames = LAUNCH_PAD_FLOAT_FRAMES;
    actor.standingOn = null;
    return launchPad.id;
  }

  private aliveEchoes(): ActorBody[] {
    return this.echoes.filter((echo) => echo.alive);
  }

  private vaporizeHazardousEchoes(): { vaporized: boolean; laserVaporized: number } {
    let vaporized = false;
    let laserVaporized = 0;
    for (const echo of this.echoes) {
      if (echo.alive && actorTouchesHazard(this.level, echo, this.objectState, this.tick)) {
        if (actorTouchesLaser(this.level, echo, this.objectState, this.tick)) laserVaporized += 1;
        echo.alive = false;
        vaporized = true;
      }
    }
    return { vaporized, laserVaporized };
  }
}
