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
    this.objectState = createObjectState();
    if (!keepRecording) this.currentRecording = [];
  }

  step(input: InputFrame): StepEvents {
    const events: StepEvents = {
      jumped: false,
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

    for (let index = 0; index < this.echoes.length; index += 1) {
      const echo = this.echoes[index];
      const recording = this.echoRecordings[index];
      const echoInput = recording.frames[this.tick] || blankInputFrame();
      moveActor(echo, echoInput, solids, doors, platforms, this.level.bounds);
    }

    if (!this.dead) {
      this.currentRecording.push(cloneInputFrame(input));
      const moved = moveActor(this.player, input, solids, doors, platforms, this.level.bounds);
      events.jumped = moved.jumped;
      events.landed = moved.landed;
    }

    const objectUpdate = updateObjects(this.level, [this.player, ...this.echoes], this.objectState);
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
}
