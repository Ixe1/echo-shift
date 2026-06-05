import { rectsOverlap } from "./geometry";
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
import type { ActorBody, InputFrame, Level, SimulationSnapshot, StepEvents } from "./types";

const MIN_ECHO_FRAMES = 18;
const LAUNCH_PAD_FACE_TOLERANCE = 3;
const LAUNCH_PAD_COOLDOWN_FRAMES = 12;
const LAUNCH_PAD_CONTROL_LOCK_FRAMES = 10;

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
  private readonly currentAttemptCollectedCoreIds = new Set<string>();

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
    this.removeDiscardedCoreScore();
    this.tick = 0;
    this.dead = false;
    this.won = false;
    this.player = makeActor("player", "player", this.level.start);
    this.echoes = this.echoRecordings.map((recording) =>
      makeActor(recording.id, "echo", this.level.start)
    );
    this.objectState = createObjectState(this.level);
    if (!keepRecording) this.currentRecording = [];
  }

  step(input: InputFrame): StepEvents {
    const events: StepEvents = {
      jumped: false,
      launched: false,
      landed: false,
      switched: false,
      core: null,
      cores: [],
      died: false,
      playerLaserVaporized: false,
      echoLaserVaporized: 0,
      livesExhausted: false,
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

    if (!this.dead) {
      recordInputFrame(this.currentRecording, input);
      const previousY = this.player.y;
      const moved = moveActor(this.player, input, solids, doors, platforms, this.level.bounds, dynamicFor(this.player));
      events.jumped = moved.jumped;
      events.landed = moved.landed;
      events.launched = this.applyLaunchPads(this.player, previousY);
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
      tick: this.tick,
      totalFrames: this.totalFrames,
      score: this.score,
      deaths: this.deaths,
      livesRemaining: this.livesRemaining(),
      dead: this.dead,
      won: this.won
    };
  }

  livesRemaining(): number {
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

  private removeDiscardedCoreScore(): void {
    if (this.currentAttemptCollectedCoreIds.size === 0) return;
    this.score = Math.max(0, this.score - this.currentAttemptCollectedCoreIds.size * this.level.score.coreScore);
    this.currentAttemptCollectedCoreIds.clear();
  }

  private markPlayerDead(events: StepEvents): void {
    this.dead = true;
    this.player.alive = false;
    this.deaths += 1;
    this.score = Math.max(0, this.score - this.level.score.deathPenalty);
    events.died = true;
    events.livesExhausted = this.livesRemaining() <= 0;
  }

  private applyLaunchPads(actor: ActorBody, previousY: number): boolean {
    actor.launchCooldown = Math.max(0, actor.launchCooldown - 1);
    if (!actor.alive || actor.launchCooldown > 0 || actor.vy < 0) return false;
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
    if (!launchPad) return false;
    actor.y = launchPad.y - actor.h;
    if (launchPad.powerX !== undefined) actor.vx = launchPad.powerX;
    actor.vy = -Math.max(1, launchPad.powerY);
    actor.onGround = false;
    actor.coyote = 0;
    actor.jumpBuffer = 0;
    actor.launchCooldown = LAUNCH_PAD_COOLDOWN_FRAMES;
    actor.launchControlLock = LAUNCH_PAD_CONTROL_LOCK_FRAMES;
    actor.standingOn = null;
    return true;
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
