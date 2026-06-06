import { rectsOverlap } from "./geometry";
import {
  BOSS_HIT_BOUNCE_SPEED,
  BOSS_INVULNERABLE_FRAMES,
  MONSTER_BOUNCE_SPEED,
  actorKillsMonster,
  bossAttackRectsAt,
  bossBodyRectAt,
  bossIntroFrames,
  bossScore,
  bossTakesHit,
  createBossRuntimeState,
  monsterRectAt,
  monsterScore,
  type BossRuntimeState
} from "./enemies";
import {
  actorTouchesLaser,
  actorTouchesHazard,
  closedDoorRects,
  createObjectState,
  playerTouchesHazard,
  updateObjects,
  type ObjectState
} from "./objects";
import { makeActor, moveActor, platformFramesAt } from "./player";
import {
  inputFrameAt,
  recordInputFrame,
  trimRecording,
  type EchoRecording
} from "./recording";
import { finalScoreForLevel, timeBonusForFrames } from "./scoring";
import type { ActorBody, Boss, BossSnapshot, InputFrame, Level, Monster, Rect, SimulationSnapshot, StepEvents } from "./types";

const MIN_ECHO_FRAMES = 18;
const LAUNCH_PAD_FACE_TOLERANCE = 3;
const LAUNCH_PAD_COOLDOWN_FRAMES = 12;
const LAUNCH_PAD_CONTROL_LOCK_FRAMES = 10;
const LAUNCH_PAD_FLOAT_FRAMES = 54;
const LAUNCH_PAD_SPEED_SCALE = 0.94;

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
  private readonly currentAttemptCollectedCoreIds = new Set<string>();
  private readonly currentAttemptKilledMonsterIds = new Map<string, number>();
  private readonly currentAttemptDefeatedBossIds = new Map<string, number>();

  constructor(level: Level) {
    this.level = level;
    this.player = makeActor("player", "player", level.start);
    this.resetAttempt(false);
  }

  resetLevel(): void {
    this.echoRecordings.length = 0;
    this.totalFrames = 0;
    this.score = 0;
    this.deaths = 0;
    this.currentAttemptCollectedCoreIds.clear();
    this.currentAttemptKilledMonsterIds.clear();
    this.currentAttemptDefeatedBossIds.clear();
    this.resetAttempt(false);
  }

  rewindToEcho(): boolean {
    const frames = trimRecording(this.currentRecording);
    if (frames.length < MIN_ECHO_FRAMES) {
      this.resetAttempt(false);
      return false;
    }

    this.echoRecordings.push({
      id: `echo-${this.echoRecordings.length + 1}`,
      frames,
      createdAtFrame: this.totalFrames
    });
    this.resetAttempt(false);
    return true;
  }

  resetAttempt(keepRecording = false): void {
    this.removeDiscardedAttemptScore();
    this.tick = 0;
    this.dead = false;
    this.won = false;
    this.player = makeActor("player", "player", this.level.start);
    this.echoes = this.echoRecordings.map((recording) =>
      makeActor(recording.id, "echo", this.level.start)
    );
    this.objectState = createObjectState(this.level);
    this.killedMonsterIds.clear();
    this.resetBossStates();
    if (!keepRecording) this.currentRecording = [];
  }

  resetLifeAttempt(): void {
    this.resetAttempt(false);
    this.totalFrames = 0;
    this.score = 0;
    this.currentAttemptCollectedCoreIds.clear();
    this.currentAttemptKilledMonsterIds.clear();
    this.currentAttemptDefeatedBossIds.clear();
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
      died: false,
      playerLaserVaporized: false,
      echoLaserVaporized: 0,
      livesExhausted: false,
      monsterKills: [],
      bossIntroStarted: null,
      bossHit: null,
      bossDefeated: null,
      won: false
    };

    if (this.won || this.dead) return events;

    const platforms = platformFramesAt(this.level.platforms, this.tick);
    const doors = closedDoorRects(this.level, this.objectState.openDoors);
    const solids = this.level.solids;
    const baseDynamic = {
      oneWays: this.level.oneWays,
      conveyors: this.level.conveyors,
      crates: this.objectState.crates
    };
    const dynamicFor = (actor: ActorBody) => ({
      ...baseDynamic,
      actorBlockers: [this.player, ...this.echoes].filter((other) => other !== actor && other.alive)
    });

    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      if (!echo.alive) continue;
      const recording = this.echoRecordings[index];
      const echoInput = inputFrameAt(recording.frames, this.tick);
      const previousY = echo.y;
      moveActor(echo, echoInput, solids, doors, platforms, this.level.bounds, dynamicFor(echo));
      this.applyLaunchPads(echo, previousY);
    }

    let previousPlayerY = this.player.y;
    if (!this.dead) {
      recordInputFrame(this.currentRecording, input);
      previousPlayerY = this.player.y;
      const moved = moveActor(this.player, input, solids, doors, platforms, this.level.bounds, dynamicFor(this.player));
      events.jumped = moved.jumped;
      events.landed = moved.landed;
      events.launchPadId = this.applyLaunchPads(this.player, previousPlayerY);
      events.launched = events.launchPadId !== null;
    }

    const previousObjectState = this.objectState;
    let objectUpdate = updateObjects(this.level, [this.player, ...this.aliveEchoes()], previousObjectState, this.tick);
    this.objectState = objectUpdate.state;

    for (;;) {
      const echoVaporization = this.vaporizeHazardousEchoes();
      if (!echoVaporization.vaporized) break;
      events.echoLaserVaporized += echoVaporization.laserVaporized;
      objectUpdate = updateObjects(this.level, [this.player, ...this.aliveEchoes()], previousObjectState, this.tick);
      this.objectState = objectUpdate.state;
    }

    events.switched = objectUpdate.switched;
    events.core = objectUpdate.core;
    events.cores = objectUpdate.cores;
    for (const core of objectUpdate.cores) this.addCoreScore(core.id);

    if (!this.dead) this.updateBosses(events, previousPlayerY);
    if (!this.dead) this.updateMonsters(events, previousPlayerY);

    if (!this.dead && playerTouchesHazard(this.level, this.player, this.objectState, this.tick)) {
      events.playerLaserVaporized = actorTouchesLaser(this.level, this.player, this.objectState, this.tick);
      this.markPlayerDead(events);
    }

    if (!this.dead && !this.player.alive) {
      this.markPlayerDead(events);
    }

    if (!this.dead && rectsOverlap(this.player, this.level.exit)) {
      this.won = true;
      events.won = true;
    }

    this.tick += 1;
    this.totalFrames += 1;
    return events;
  }

  snapshot(): SimulationSnapshot {
    return {
      player: { ...this.player },
      echoes: this.aliveEchoes().map((echo) => ({ ...echo })),
      activePlates: new Set(this.objectState.activePlates),
      openDoors: new Set(this.objectState.openDoors),
      collectedCores: new Set(this.objectState.collectedCores),
      blockedLasers: new Set(this.objectState.blockedLasers),
      crates: new Map([...this.objectState.crates.entries()].map(([id, rect]) => [id, { ...rect }])),
      killedMonsters: new Set(this.killedMonsterIds),
      bosses: this.bossSnapshots(),
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
    if (this.level.score.lives === null) return null;
    return Math.max(0, this.level.score.lives - this.deaths);
  }

  timeBonus(): number {
    return timeBonusForFrames(this.totalFrames, this.level.score);
  }

  finalScore(): number {
    return finalScoreForLevel(this.level, this.totalFrames, this.score);
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

  private updateMonsters(events: StepEvents, previousPlayerY: number): void {
    for (const monster of this.level.monsters || []) {
      if (this.killedMonsterIds.has(monster.id)) continue;
      const rect = monsterRectAt(monster, this.tick);
      if (!rectsOverlap(this.player, rect)) continue;
      if (actorKillsMonster(this.player, previousPlayerY, monster, rect)) {
        this.killMonster(monster, rect, events);
        continue;
      }
      this.markPlayerDead(events);
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

  private updateBosses(events: StepEvents, previousPlayerY: number): void {
    for (const boss of this.level.bosses || []) {
      const state = this.bossStates.get(boss.id);
      if (!state || state.phase === "defeated") continue;

      if (state.phase === "idle" && rectsOverlap(this.player, boss)) {
        state.phase = "intro";
        state.introFrames = 0;
        events.bossIntroStarted ||= boss.id;
      }

      if (state.phase === "intro") {
        state.introFrames += 1;
        if (state.introFrames >= bossIntroFrames(boss)) {
          state.phase = "active";
          state.introFrames = bossIntroFrames(boss);
        }
      } else if (state.phase === "active") {
        state.invulnerableFrames = Math.max(0, state.invulnerableFrames - 1);
      }

      if (state.phase !== "active") continue;
      const body = bossBodyRectAt(boss, state, this.tick);
      if (bossTakesHit(this.player, previousPlayerY, body, state)) {
        this.hitBoss(boss, state, body, events);
        continue;
      }

      const attacks = bossAttackRectsAt(boss, state, this.tick);
      if (rectsOverlap(this.player, body) || attacks.some((attack) => rectsOverlap(this.player, attack))) {
        this.markPlayerDead(events);
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
    events.bossHit = {
      id: boss.id,
      health: state.health,
      x: body.x + body.w / 2,
      y: body.y + body.h / 2
    };
    if (state.health > 0) return;

    const score = bossScore(boss);
    state.phase = "defeated";
    this.currentAttemptDefeatedBossIds.set(boss.id, score);
    this.score += score;
    events.bossDefeated = {
      id: boss.id,
      score,
      x: body.x + body.w / 2,
      y: body.y + body.h / 2
    };
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
      if (!state) return [];
      const body = bossBodyRectAt(boss, state, this.tick);
      return [
        {
          id: boss.id,
          phase: state.phase,
          health: state.health,
          introFrames: state.introFrames,
          invulnerableFrames: state.invulnerableFrames,
          body,
          attacks: bossAttackRectsAt(boss, state, this.tick)
        }
      ];
    });
  }

  private markPlayerDead(events: StepEvents): void {
    this.dead = true;
    this.player.alive = false;
    this.deaths += 1;
    this.score = Math.max(0, this.score - this.level.score.deathPenalty);
    events.died = true;
    const remaining = this.livesRemaining();
    events.livesExhausted = remaining !== null && remaining <= 0;
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
