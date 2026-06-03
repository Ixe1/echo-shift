import { rectsOverlap } from "./geometry";
import {
  closedDoorRects,
  createObjectState,
  playerTouchesHazard,
  updateObjects,
  type ObjectState
} from "./objects";
import { makeActor, moveActor, platformFramesAt } from "./player";
import {
  blankInputFrame,
  cloneInputFrame,
  trimRecording,
  type EchoRecording
} from "./recording";
import type { ActorBody, InputFrame, Level, Medal, SimulationSnapshot, StepEvents } from "./types";

const MIN_ECHO_FRAMES = 18;

export class RoomSimulation {
  readonly level: Level;
  readonly echoRecordings: EchoRecording[] = [];
  player: ActorBody;
  echoes: ActorBody[] = [];
  currentRecording: InputFrame[] = [];
  objectState: ObjectState = createObjectState();
  tick = 0;
  totalFrames = 0;
  dead = false;
  won = false;

  constructor(level: Level) {
    this.level = level;
    this.player = makeActor("player", "player", level.start);
    this.resetAttempt(false);
  }

  resetLevel(): void {
    this.echoRecordings.length = 0;
    this.totalFrames = 0;
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
      frames: frames.map(cloneInputFrame),
      createdAtFrame: this.totalFrames
    });
    this.resetAttempt(false);
    return true;
  }

  resetAttempt(keepRecording = false): void {
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
      died: false,
      won: false
    };

    if (this.won || this.dead) return events;

    const platforms = platformFramesAt(this.level.platforms, this.tick);
    const doors = closedDoorRects(this.level, this.objectState.openDoors);
    const solids = this.level.solids;
    const dynamic = {
      oneWays: this.level.oneWays,
      conveyors: this.level.conveyors,
      crates: this.objectState.crates
    };

    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      const recording = this.echoRecordings[index];
      const echoInput = recording.frames[this.tick] || blankInputFrame();
      const previousY = echo.y;
      moveActor(echo, echoInput, solids, doors, platforms, this.level.bounds, dynamic);
      this.applyLaunchPads(echo, previousY);
    }

    if (!this.dead) {
      this.currentRecording.push(cloneInputFrame(input));
      const previousY = this.player.y;
      const moved = moveActor(this.player, input, solids, doors, platforms, this.level.bounds, dynamic);
      events.jumped = moved.jumped;
      events.landed = moved.landed;
      events.launched = this.applyLaunchPads(this.player, previousY);
    }

    const objectUpdate = updateObjects(this.level, [this.player, ...this.echoes], this.objectState, this.tick);
    this.objectState = objectUpdate.state;
    events.switched = objectUpdate.switched;
    events.core = objectUpdate.core;

    if (!this.dead && playerTouchesHazard(this.level, this.player, this.objectState, this.tick)) {
      this.dead = true;
      this.player.alive = false;
      events.died = true;
    }

    if (!this.dead && !this.player.alive) {
      this.dead = true;
      events.died = true;
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
      echoes: this.echoes.map((echo) => ({ ...echo })),
      activePlates: new Set(this.objectState.activePlates),
      openDoors: new Set(this.objectState.openDoors),
      collectedCores: new Set(this.objectState.collectedCores),
      blockedLasers: new Set(this.objectState.blockedLasers),
      crates: new Map([...this.objectState.crates.entries()].map(([id, rect]) => [id, { ...rect }])),
      tick: this.tick,
      totalFrames: this.totalFrames,
      dead: this.dead,
      won: this.won
    };
  }

  scoreMedal(): Medal {
    if (
      this.echoRecordings.length <= this.level.perfectEchoes &&
      this.totalFrames <= this.level.medalFrames.gold
    ) {
      return "Quantum";
    }
    if (this.totalFrames <= this.level.medalFrames.gold) return "Gold";
    if (this.totalFrames <= this.level.medalFrames.silver) return "Silver";
    return "Bronze";
  }

  replaySummary(): string {
    const seconds = Math.floor(this.totalFrames / 60);
    const plates = [...this.objectState.activePlates].join(", ") || "none";
    const cores = [...this.objectState.collectedCores].join(", ") || "none";
    return `Level ${this.level.index + 1}, ${seconds}s, ${this.echoRecordings.length} echoes, plates ${plates}, cores ${cores}`;
  }

  private applyLaunchPads(actor: ActorBody, previousY: number): boolean {
    if (!actor.alive || actor.vy < 0) return false;
    const launchPad = (this.level.launchPads || []).find((pad) => {
      const previousFootY = previousY + actor.h;
      return rectsOverlap(actor, pad) && previousFootY <= pad.y + pad.h + 2 && actor.y + actor.h >= pad.y;
    });
    if (!launchPad) return false;
    actor.vx += launchPad.powerX || 0;
    actor.vy = -Math.max(1, launchPad.powerY);
    actor.onGround = false;
    actor.coyote = 0;
    actor.standingOn = null;
    return true;
  }
}
