import Phaser from "phaser";
import { updateEditorDraftCurrentIndex } from "../data/editorDraft";
import { getLevel, isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { backgroundForLevel } from "../game/backgrounds";
import { rectCenter } from "../game/geometry";
import { droneIsActive, droneRectAt, laserIsActive, movingLaserRectAt } from "../game/objects";
import { platformRectAt } from "../game/player";
import { recordLevelScore } from "../game/progress";
import { soundtrackForLevel } from "../game/soundtracks";
import { RoomSimulation } from "../game/state";
import type { ActorBody, InputFrame, Level, LevelScore, Rect, SimulationSnapshot, Solid } from "../game/types";
import { Hud } from "../ui/hud";

const STEP_MS = 1000 / 60;
const OBJECT_ATLAS_KEY = "object-atlas";
const OBJECT_FRAME = {
  floor: 0,
  wall: 1,
  block: 2,
  warning: 3,
  platform: 4,
  oneWay: 5,
  conveyor: 6,
  crate: 7,
  doorClosed: 8,
  doorOpen: 9,
  plateIdle: 10,
  plateActive: 11,
  laserActive: 12,
  laserInactive: 13,
  droneActive: 14,
  droneInactive: 15
} as const;

type ObjectAsset = Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image;

type KeyMap = {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  r: Phaser.Input.Keyboard.Key;
  t: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: Level;
  private simulation!: RoomSimulation;
  private keys!: KeyMap;
  private hud!: Hud;
  private world!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private pausedByHud = false;
  private completeHandled = false;
  private virtualInput: InputFrame = { left: false, right: false, jump: false };
  private echoTrails = new Map<string, Array<{ x: number; y: number }>>();
  private actorSprites = new Map<string, Phaser.GameObjects.Image>();
  private coreSprites = new Map<string, Phaser.GameObjects.Image>();
  private objectAssets = new Map<string, ObjectAsset>();
  private activeObjectAssetIds = new Set<string>();
  private solidAssetFrames: string[] = [];
  private exitSprite?: Phaser.GameObjects.Image;
  private backgroundImages: Phaser.GameObjects.Image[] = [];
  private cameraTarget?: Phaser.GameObjects.Zone;
  private playerCastUntil = 0;

  constructor() {
    super("GameScene");
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex || 0;
    this.level = getLevel(this.levelIndex);
    this.simulation = new RoomSimulation(this.level);
    this.accumulator = 0;
    this.pausedByHud = false;
    this.completeHandled = false;
    this.virtualInput = { left: false, right: false, jump: false };
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.actorSprites.clear();
    this.coreSprites.clear();
    this.objectAssets.clear();
    this.activeObjectAssetIds.clear();
    this.solidAssetFrames = [];
    this.exitSprite = undefined;
    this.backgroundImages = [];
    this.cameraTarget = undefined;
  }

  create(): void {
    this.syncDraftPlaytestUrl();
    audio.playMusic(soundtrackForLevel(this.level, this.levelIndex).key);
    this.cameras.main.setBounds(this.level.bounds.x, this.level.bounds.y, this.level.bounds.w, this.level.bounds.h);
    this.cameras.main.setBackgroundColor("#05070d");
    this.createBackgroundImages();
    this.cameraTarget = this.add.zone(this.level.start.x, this.level.start.y, 1, 1);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.12, 0.08);
    this.cameras.main.setDeadzone(250, 130);
    this.world = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(30);
    this.keys = this.createKeys();
    this.hud = new Hud({
      onRewind: () => this.rewind(),
      onRetry: () => this.retryAttempt(),
      onPause: () => this.togglePause(),
      onTitle: () => this.openTitle(),
      onNext: () => this.nextLevel(),
      onReplay: () => this.restartLevel(),
      onLevelSelect: () => this.openLevelSelect(),
      onEditor: () => this.openEditor(),
      onResume: () => this.togglePause(false),
      onVirtualInput: (control, active) => {
        this.virtualInput[control] = active;
      },
      draftPlaytest: isDraftPlaytestActive()
    });
    this.hud.toast(`${isDraftPlaytestActive() ? "Draft playtest · " : ""}${this.level.index + 1}: ${this.level.name}`);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hud.destroy());
    this.renderWorld();
  }

  update(_time: number, delta: number): void {
    this.handleHotkeys();
    if (this.pausedByHud || this.completeHandled) {
      this.renderWorld();
      return;
    }

    this.accumulator += Math.min(delta, 80);
    while (this.accumulator >= STEP_MS) {
      const events = this.simulation.step(this.readInput());
      this.handleEvents(events);
      this.accumulator -= STEP_MS;
      if (this.completeHandled) break;
    }

    this.renderWorld();
    this.hud.update({
      levelNumber: this.level.index + 1,
      levelName: this.level.name,
      frames: this.simulation.totalFrames,
      echoes: this.simulation.echoRecordings.length,
      medal: this.simulation.scoreMedal(),
      dead: this.simulation.dead
    });
  }

  private createKeys(): KeyMap {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input unavailable");
    return {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      r: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      t: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    };
  }

  private readInput(): InputFrame {
    return {
      left: this.keys.left.isDown || this.keys.a.isDown || this.virtualInput.left,
      right: this.keys.right.isDown || this.keys.d.isDown || this.virtualInput.right,
      jump: this.keys.up.isDown || this.keys.w.isDown || this.keys.space.isDown || this.virtualInput.jump
    };
  }

  private handleHotkeys(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.rewind();
    if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.retryAttempt();
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) this.togglePause();
  }

  private handleEvents(events: ReturnType<RoomSimulation["step"]>): void {
    if (events.jumped || events.launched) audio.play("jump");
    if (events.landed) audio.play("land");
    if (events.switched) audio.play("switch");
    if (events.core) {
      audio.play("core");
      this.spawnBurst(events.core, 0xffe35a);
      this.spawnEffectFrame(events.core, 2, 0.42);
    }
    if (events.died) {
      audio.play("death");
      this.cameras.main.shake(180, 0.006);
      this.hud.toast("Signal lost. Rewind or retry.");
    }
    if (events.won) this.completeLevel();
  }

  private rewind(): void {
    if (this.completeHandled || this.pausedByHud) return;
    const added = this.simulation.rewindToEcho();
    audio.play("rewind");
    this.playerCastUntil = this.time.now + 360;
    this.hud.scan();
    this.cameras.main.flash(220, 67, 247, 255, false);
    this.echoTrails.clear();
    this.hud.toast(added ? `Echo ${this.simulation.echoRecordings.length} anchored` : "Attempt reset");
  }

  private retryAttempt(): void {
    if (this.completeHandled || this.pausedByHud) return;
    this.simulation.resetAttempt(false);
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    audio.play("select");
    this.hud.toast("Attempt reset");
  }

  private restartLevel(): void {
    this.completeHandled = false;
    this.pausedByHud = false;
    this.virtualInput = { left: false, right: false, jump: false };
    this.simulation.resetLevel();
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.hud.hideModal();
    this.hud.toast(`${this.level.index + 1}: ${this.level.name}`);
  }

  private togglePause(force?: boolean): void {
    if (this.completeHandled) return;
    this.pausedByHud = force ?? !this.pausedByHud;
    if (this.pausedByHud) this.hud.showPause(this.level.name);
    else this.hud.hideModal();
    audio.play("select");
  }

  private completeLevel(): void {
    if (this.completeHandled) return;
    this.completeHandled = true;
    audio.play("portal");
    const score: LevelScore = {
      levelId: this.level.id,
      frames: this.simulation.totalFrames,
      echoes: this.simulation.echoRecordings.length,
      medal: this.simulation.scoreMedal()
    };
    if (!isDraftPlaytestActive()) recordLevelScore(score, this.level.index);
    this.cameras.main.flash(280, 255, 227, 90, false);
    this.hud.showComplete(score, this.levelIndex === levels.length - 1);
  }

  private nextLevel(): void {
    const next = Math.min(this.levelIndex + 1, levels.length - 1);
    this.scene.start("GameScene", { levelIndex: next });
  }

  private rememberDraftLevel(): void {
    if (isDraftPlaytestActive()) updateEditorDraftCurrentIndex(this.levelIndex);
  }

  private openTitle(): void {
    this.rememberDraftLevel();
    this.scene.start("MenuScene");
  }

  private openLevelSelect(): void {
    this.rememberDraftLevel();
    this.scene.start("LevelSelectScene");
  }

  private openEditor(): void {
    this.rememberDraftLevel();
    const url = new URL(window.location.href);
    url.searchParams.set("editor", "1");
    url.searchParams.delete("playtestDraft");
    url.searchParams.delete("level");
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  }

  private syncDraftPlaytestUrl(): void {
    if (!isDraftPlaytestActive()) return;
    const url = new URL(window.location.href);
    const nextLevel = String(this.levelIndex);
    if (url.searchParams.get("level") === nextLevel) return;
    url.searchParams.set("playtestDraft", "1");
    url.searchParams.set("level", nextLevel);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  private renderWorld(): void {
    const snapshot = this.simulation.snapshot();
    this.cameraTarget?.setPosition(snapshot.player.x + snapshot.player.w / 2, snapshot.player.y + snapshot.player.h / 2);
    this.beginObjectAssetSync();
    this.world.clear();
    this.fx.clear();
    this.drawBackground();
    this.drawSolids();
    this.drawOneWayPlatforms();
    this.drawConveyors();
    this.drawPlatforms(snapshot.tick);
    this.drawCrates(snapshot.crates);
    this.drawDoors(snapshot.openDoors);
    this.drawPlates(snapshot.activePlates);
    this.drawTimedSwitches(snapshot.activePlates);
    this.drawEchoSensors(snapshot.activePlates);
    this.drawLaunchPads();
    this.drawCores(snapshot.collectedCores);
    this.drawLasers(snapshot.activePlates, snapshot.blockedLasers);
    this.drawMovingLasers(snapshot.tick, snapshot.activePlates, snapshot.blockedLasers);
    this.drawHazards();
    this.drawDrones(snapshot.tick, snapshot.activePlates);
    this.drawExit(this.level.exit, snapshot.won);
    this.drawEchoes(snapshot.echoes);
    this.drawActor(snapshot.player, snapshot.dead ? 0xff4f8b : 0x43f7ff, 1);
    this.drawForegroundText(snapshot.tick);
    this.finishObjectAssetSync();
    this.syncSpriteLayer(snapshot);
    this.exposeRenderDiagnostics(snapshot);
  }

  private drawBackground(): void {
    const bounds = this.level.bounds;
    const floorTop = bounds.y + bounds.h - 40;
    const pulse = 0.5 + Math.sin(this.time.now / 900) * 0.5;
    const hasImageBackground = this.backgroundImages.length > 0;
    this.world.fillStyle(0x05070d, hasImageBackground ? 0.26 : 1);
    this.world.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    if (!hasImageBackground) {
      this.world.fillStyle(0x081322, 0.92);
      this.world.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

      for (let x = bounds.x + 42; x < bounds.x + bounds.w; x += 660) {
        this.world.fillStyle(0x0f1830, 0.64);
        this.world.fillRect(x, bounds.y + 90, 188, 300);
        this.world.fillRect(x + 410, bounds.y + 70, 174, 330);
      }
    }

    this.world.lineStyle(1, 0x43f7ff, 0.16 + pulse * 0.06);
    for (let x = bounds.x + 56; x < bounds.x + bounds.w; x += 660) {
      for (let y = bounds.y + 112; y <= bounds.y + 360; y += 38) {
        this.world.lineBetween(x, y, x + 160, y + 10);
        this.world.lineBetween(x + 662, y + 8, x + 810, y - 8);
      }
    }

    this.world.lineStyle(1, 0x123246, 0.36);
    for (let x = bounds.x; x <= bounds.x + bounds.w; x += 40) {
      this.world.lineBetween(x, bounds.y, x, bounds.y + bounds.h);
    }
    for (let y = bounds.y + 20; y <= bounds.y + bounds.h; y += 40) {
      this.world.lineBetween(bounds.x, y, bounds.x + bounds.w, y);
    }

    this.world.lineStyle(1, 0x5d2f83, 0.22);
    for (let x = bounds.x - 120; x < bounds.x + bounds.w; x += 120) {
      this.world.lineBetween(x, bounds.y + bounds.h, x + 300, bounds.y);
    }

    this.world.fillStyle(0x09111d, 0.86);
    this.world.fillRect(bounds.x, floorTop, bounds.w, 40);
    this.world.fillStyle(0x43f7ff, 0.1 + pulse * 0.08);
    for (let x = bounds.x + 330; x < bounds.x + bounds.w; x += 720) {
      this.world.fillRect(x, floorTop + 7, 310, 4);
    }
    this.world.fillStyle(0xbd5cff, 0.12);
    for (let x = bounds.x + 76; x < bounds.x + bounds.w; x += 560) {
      this.world.fillRect(x, floorTop + 8, 150, 3);
    }
  }

  private createBackgroundImages(): void {
    const background = backgroundForLevel(this.level, this.levelIndex);
    const bounds = this.level.bounds;
    const scale = Math.max(bounds.h / background.sourceSize.h, 0.01);
    const scaledWidth = background.sourceSize.w * scale;
    const startX = bounds.x;
    const endX = bounds.x + bounds.w;

    for (let x = startX; x < endX; x += scaledWidth) {
      const image = this.add
        .image(x, bounds.y, background.key)
        .setOrigin(0, 0)
        .setScale(scale)
        .setDepth(-20)
        .setAlpha(0.78);
      this.backgroundImages.push(image);
    }

    if (import.meta.env.DEV) {
      document.documentElement.dataset.echoShiftBackgroundKey = background.key;
      document.documentElement.dataset.echoShiftBackgroundPieces = String(this.backgroundImages.length);
    }
  }

  private drawSolids(): void {
    for (const solid of this.level.solids) {
      const color = solid.tone === "dark" ? 0x111827 : solid.tone === "warning" ? 0x473b18 : 0x17243a;
      const frame = this.solidFrame(solid);
      this.solidAssetFrames.push(`${solid.id}:${frame}`);
      this.syncTileAsset(
        `solid:${solid.id}`,
        frame,
        solid,
        1,
        0.96,
        0.42
      );
      this.drawNeonRect(solid, color, 0x43f7ff, 0.34);
      this.world.lineStyle(1, 0xffffff, 0.06);
      this.world.lineBetween(solid.x, solid.y + 4, solid.x + solid.w, solid.y + 4);
    }
  }

  private drawPlatforms(tick: number): void {
    for (const platform of this.level.platforms || []) {
      const rect = platformRectAt(platform, tick);
      this.syncTileAsset(`platform:${platform.id}`, OBJECT_FRAME.platform, rect, 3, 0.96, 0.44);
      this.drawNeonRect(rect, 0x1f2e46, 0xffe35a, 0.72);
      this.world.lineStyle(1, 0xffe35a, 0.28);
      if (platform.axis === "y") {
        this.world.lineBetween(platform.x + platform.w / 2, platform.y, platform.x + platform.w / 2, platform.y + platform.distance);
      } else {
        this.world.lineBetween(platform.x, platform.y + platform.h / 2, platform.x + platform.distance, platform.y + platform.h / 2);
      }
    }
  }

  private drawOneWayPlatforms(): void {
    for (const platform of this.level.oneWays || []) {
      this.syncTileAsset(`one-way:${platform.id}`, OBJECT_FRAME.oneWay, platform, 3, 0.88, 0.42);
      this.world.fillStyle(0x123247, 0.58);
      this.world.fillRect(platform.x, platform.y, platform.w, platform.h);
      this.world.lineStyle(2, 0x50ffc2, 0.78);
      this.world.lineBetween(platform.x, platform.y, platform.x + platform.w, platform.y);
      this.world.lineStyle(1, 0x50ffc2, 0.28);
      for (let x = platform.x + 8; x < platform.x + platform.w; x += 18) {
        this.world.lineBetween(x, platform.y + platform.h - 3, x + 7, platform.y + 4);
      }
    }
  }

  private drawConveyors(): void {
    for (const conveyor of this.level.conveyors || []) {
      const direction = conveyor.direction >= 0 ? 1 : -1;
      this.syncTileAsset(`conveyor:${conveyor.id}`, OBJECT_FRAME.conveyor, conveyor, 3, 0.95, 0.42, this.simulation.tick * direction * -3);
      this.drawNeonRect(conveyor, 0x15263a, 0xffe35a, 0.62);
      this.world.lineStyle(2, 0xffe35a, 0.72);
      for (let x = conveyor.x + 12; x < conveyor.x + conveyor.w - 8; x += 28) {
        const arrowX = x + ((this.simulation.tick * direction) % 28);
        const clampedX = Phaser.Math.Wrap(arrowX, conveyor.x + 8, conveyor.x + conveyor.w - 8);
        this.world.lineBetween(clampedX - direction * 8, conveyor.y + conveyor.h / 2, clampedX + direction * 8, conveyor.y + conveyor.h / 2);
        this.world.lineBetween(clampedX + direction * 8, conveyor.y + conveyor.h / 2, clampedX + direction * 3, conveyor.y + conveyor.h / 2 - 5);
        this.world.lineBetween(clampedX + direction * 8, conveyor.y + conveyor.h / 2, clampedX + direction * 3, conveyor.y + conveyor.h / 2 + 5);
      }
    }
  }

  private drawCrates(crates: Map<string, Rect>): void {
    for (const [id, crate] of crates) {
      this.syncImageAsset(
        `crate:${id}`,
        OBJECT_FRAME.crate,
        crate.x + crate.w / 2,
        crate.y + crate.h / 2,
        Math.max(48, crate.w * 1.08),
        Math.max(48, crate.h * 1.08),
        5,
        0.97
      );
      this.drawNeonRect(crate, 0x2c2438, 0xffe35a, 0.76);
      this.world.lineStyle(1, 0xffe35a, 0.36);
      this.world.lineBetween(crate.x + 6, crate.y + 6, crate.x + crate.w - 6, crate.y + crate.h - 6);
      this.world.lineBetween(crate.x + crate.w - 6, crate.y + 6, crate.x + 6, crate.y + crate.h - 6);
      this.world.fillStyle(0xffe35a, 0.72);
      this.world.fillRect(crate.x + 5, crate.y + crate.h - 5, Math.min(crate.w - 10, id.length * 3), 2);
    }
  }

  private drawDoors(openDoors: Set<string>): void {
    for (const door of this.level.doors || []) {
      const open = openDoors.has(door.id);
      this.syncTileAsset(`door:${door.id}`, open ? OBJECT_FRAME.doorOpen : OBJECT_FRAME.doorClosed, door, 4, open ? 0.54 : 0.98, 0.5);
      this.world.fillStyle(open ? 0x43f7ff : 0x29122d, open ? 0.09 : 0.92);
      this.world.fillRect(door.x, door.y, door.w, door.h);
      this.world.lineStyle(2, open ? 0x43f7ff : 0xff4f8b, open ? 0.38 : 0.9);
      this.world.strokeRect(door.x, door.y, door.w, door.h);
      for (let y = door.y + 10; y < door.y + door.h; y += 14) {
        this.world.lineStyle(1, open ? 0x43f7ff : 0xff4f8b, open ? 0.18 : 0.3);
        this.world.lineBetween(door.x + 3, y, door.x + door.w - 3, y);
      }
      const nodeColor = open ? 0x43f7ff : 0xff4f8b;
      this.world.fillStyle(nodeColor, open ? 0.42 : 0.86);
      this.world.fillCircle(door.x + door.w / 2, door.y + 15, 4);
      this.world.fillCircle(door.x + door.w / 2, door.y + door.h - 15, 4);
      this.world.lineStyle(1, nodeColor, open ? 0.2 : 0.56);
      this.world.lineBetween(door.x + door.w / 2, door.y + 21, door.x + door.w / 2, door.y + door.h - 21);
    }
  }

  private drawPlates(activePlates: Set<string>): void {
    for (const plate of this.level.plates || []) {
      const active = activePlates.has(plate.id);
      this.syncImageAsset(
        `plate:${plate.id}`,
        active ? OBJECT_FRAME.plateActive : OBJECT_FRAME.plateIdle,
        plate.x + plate.w / 2,
        plate.y + plate.h - 14,
        Math.max(48, plate.w),
        36,
        6,
        0.96
      );
      this.world.fillStyle(active ? 0xffe35a : 0x163247, active ? 0.9 : 0.78);
      this.world.fillRect(plate.x, plate.y, plate.w, plate.h);
      this.world.lineStyle(2, active ? 0xfff4a0 : 0x43f7ff, active ? 0.86 : 0.36);
      this.world.strokeRect(plate.x, plate.y, plate.w, plate.h);
    }
  }

  private drawTimedSwitches(activePlates: Set<string>): void {
    for (const timedSwitch of this.level.timedSwitches || []) {
      const active = activePlates.has(timedSwitch.id);
      this.syncImageAsset(
        `timed-switch:${timedSwitch.id}`,
        active ? OBJECT_FRAME.plateActive : OBJECT_FRAME.plateIdle,
        timedSwitch.x + timedSwitch.w / 2,
        timedSwitch.y + timedSwitch.h - 14,
        Math.max(50, timedSwitch.w),
        38,
        6,
        active ? 1 : 0.86
      );
      this.world.fillStyle(active ? 0xffe35a : 0x2b1d46, active ? 0.82 : 0.72);
      this.world.fillRoundedRect(timedSwitch.x, timedSwitch.y, timedSwitch.w, timedSwitch.h, 3);
      this.world.lineStyle(2, active ? 0xfff4a0 : 0xbd5cff, active ? 0.86 : 0.48);
      this.world.strokeRoundedRect(timedSwitch.x, timedSwitch.y, timedSwitch.w, timedSwitch.h, 3);
      this.world.lineStyle(1, active ? 0x05070d : 0xbd5cff, active ? 0.48 : 0.54);
      this.world.strokeCircle(timedSwitch.x + timedSwitch.w / 2, timedSwitch.y + timedSwitch.h / 2, Math.max(4, Math.min(timedSwitch.w, timedSwitch.h) / 3));
    }
  }

  private drawEchoSensors(activePlates: Set<string>): void {
    for (const sensor of this.level.echoSensors || []) {
      const active = activePlates.has(sensor.id);
      this.syncTileAsset(`echo-sensor:${sensor.id}`, active ? OBJECT_FRAME.doorOpen : OBJECT_FRAME.block, sensor, 3, active ? 0.62 : 0.42, 0.54);
      this.world.fillStyle(active ? 0x50ffc2 : 0x12283f, active ? 0.16 : 0.1);
      this.world.fillRect(sensor.x, sensor.y, sensor.w, sensor.h);
      this.world.lineStyle(2, active ? 0x50ffc2 : 0xbd5cff, active ? 0.82 : 0.48);
      this.world.strokeRect(sensor.x, sensor.y, sensor.w, sensor.h);
      this.world.lineStyle(1, active ? 0x50ffc2 : 0xbd5cff, active ? 0.32 : 0.24);
      for (let y = sensor.y + 8; y < sensor.y + sensor.h; y += 12) {
        this.world.lineBetween(sensor.x + 4, y, sensor.x + sensor.w - 4, y);
      }
    }
  }

  private drawLaunchPads(): void {
    for (const pad of this.level.launchPads || []) {
      this.syncImageAsset(
        `launch-pad:${pad.id}`,
        OBJECT_FRAME.plateActive,
        pad.x + pad.w / 2,
        pad.y + pad.h - 16,
        Math.max(54, pad.w),
        42,
        4,
        0.92
      );
      this.world.fillStyle(0x143447, 0.84);
      this.world.fillRect(pad.x, pad.y, pad.w, pad.h);
      this.world.lineStyle(2, 0x50ffc2, 0.86);
      this.world.strokeRect(pad.x, pad.y, pad.w, pad.h);
      this.world.fillStyle(0x50ffc2, 0.68);
      for (let x = pad.x + 6; x < pad.x + pad.w; x += 16) {
        this.world.fillTriangle(x, pad.y + pad.h - 3, x + 6, pad.y + 4, x + 12, pad.y + pad.h - 3);
      }
    }
  }

  private drawCores(collectedCores: Set<string>): void {
    for (const core of this.level.cores || []) {
      if (collectedCores.has(core.id)) continue;
      const center = rectCenter(core);
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.12;
      this.world.fillStyle(0xffe35a, 0.18);
      this.world.fillCircle(center.x, center.y, 22 * pulse);
      if (!this.textures.exists("time-effects")) {
        this.drawDiamond(center.x, center.y, 12 * pulse, 0xffe35a, 0.9, 0xffffff, 0.72);
      }
      this.world.lineStyle(2, 0xffffff, 0.7);
      this.world.strokeCircle(center.x, center.y, 17 * pulse);
      this.world.lineStyle(1, 0xffe35a, 0.5);
      this.world.lineBetween(center.x - 18, center.y, center.x + 18, center.y);
    }
  }

  private drawLasers(activePlates: Set<string>, blockedLasers: Set<string>): void {
    for (const laser of this.level.lasers || []) {
      const active = laserIsActive(laser, activePlates);
      const visual = this.expandedBeamRect(laser);
      this.syncTileAsset(`laser:${laser.id}`, active ? OBJECT_FRAME.laserActive : OBJECT_FRAME.laserInactive, visual, 6, active ? 0.96 : 0.42, 0.38, this.simulation.tick * -2);
      if (!active) {
        this.world.lineStyle(2, 0x43f7ff, 0.16);
        this.world.strokeRect(laser.x, laser.y, laser.w, laser.h);
        continue;
      }
      const blocked = blockedLasers.has(laser.id);
      this.world.fillStyle(blocked ? 0xffe35a : 0xff2f6c, blocked ? 0.3 : 0.72);
      this.world.fillRect(laser.x, laser.y, laser.w, laser.h);
      this.world.lineStyle(2, blocked ? 0xffe35a : 0xff4f8b, blocked ? 0.9 : 1);
      this.world.strokeRect(laser.x, laser.y, laser.w, laser.h);
      this.world.fillStyle(0xffffff, blocked ? 0.18 : 0.34);
      this.world.fillRect(laser.x, laser.y + laser.h / 2 - 1, laser.w, 2);
      this.world.fillStyle(blocked ? 0xffe35a : 0xffffff, blocked ? 0.14 : 0.28);
      for (let x = laser.x + ((this.simulation.tick * 2) % 16); x < laser.x + laser.w; x += 18) {
        this.world.fillRect(x, laser.y + 2, 7, Math.max(2, laser.h - 4));
      }
    }
  }

  private drawMovingLasers(tick: number, activePlates: Set<string>, blockedLasers: Set<string>): void {
    for (const laser of this.level.movingLasers || []) {
      const rect = movingLaserRectAt(laser, tick);
      const active = laserIsActive(laser, activePlates);
      this.syncTileAsset(`moving-laser:${laser.id}`, active ? OBJECT_FRAME.laserActive : OBJECT_FRAME.laserInactive, this.expandedBeamRect(rect), 6, active ? 0.94 : 0.42, 0.38, tick * -2);
      this.world.lineStyle(1, 0xff4f8b, 0.22);
      if (laser.axis === "x") {
        this.world.lineBetween(laser.x, laser.y + laser.h / 2, laser.x + laser.distance, laser.y + laser.h / 2);
      } else {
        this.world.lineBetween(laser.x + laser.w / 2, laser.y, laser.x + laser.w / 2, laser.y + laser.distance);
      }
      if (!active) {
        this.world.lineStyle(2, 0x43f7ff, 0.18);
        this.world.strokeRect(rect.x, rect.y, rect.w, rect.h);
        continue;
      }
      const blocked = blockedLasers.has(laser.id);
      this.world.fillStyle(blocked ? 0xffe35a : 0xff2f6c, blocked ? 0.28 : 0.72);
      this.world.fillRect(rect.x, rect.y, rect.w, rect.h);
      this.world.lineStyle(2, blocked ? 0xffe35a : 0xff4f8b, blocked ? 0.9 : 1);
      this.world.strokeRect(rect.x, rect.y, rect.w, rect.h);
      this.world.fillStyle(0xffffff, blocked ? 0.18 : 0.34);
      this.world.fillRect(rect.x, rect.y + rect.h / 2 - 1, rect.w, 2);
    }
  }

  private drawHazards(): void {
    for (const hazard of this.level.hazards || []) {
      this.syncTileAsset(`hazard:${hazard.id}`, OBJECT_FRAME.warning, { ...hazard, y: hazard.y - 4, h: hazard.h + 8 }, 2, 0.74, 0.38);
      this.world.fillStyle(0xff4f8b, 0.14);
      this.world.fillRect(hazard.x, hazard.y - 6, hazard.w, hazard.h + 10);
      this.world.fillStyle(0xff4f8b, 0.7);
      for (let x = hazard.x; x < hazard.x + hazard.w; x += 12) {
        this.world.fillTriangle(x, hazard.y + hazard.h, x + 6, hazard.y, x + 12, hazard.y + hazard.h);
        this.world.lineStyle(1, 0xffffff, 0.16);
        this.world.lineBetween(x + 6, hazard.y + 2, x + 6, hazard.y + hazard.h - 3);
      }
    }
  }

  private drawDrones(tick: number, activePlates: Set<string>): void {
    for (const drone of this.level.drones || []) {
      const rect = droneRectAt(drone, tick);
      const center = rectCenter(rect);
      const active = droneIsActive(drone, activePlates);
      this.syncImageAsset(
        `drone:${drone.id}`,
        active ? OBJECT_FRAME.droneActive : OBJECT_FRAME.droneInactive,
        center.x,
        center.y + 1,
        Math.max(52, rect.w * 1.86),
        Math.max(52, rect.h * 2.12),
        7,
        active ? 0.98 : 0.72
      );
      this.world.lineStyle(1, active ? 0xff4f8b : 0x43f7ff, active ? 0.2 : 0.16);
      if (drone.axis === "x") {
        this.world.lineBetween(drone.x, drone.y + drone.h / 2, drone.x + drone.distance, drone.y + drone.h / 2);
      } else {
        this.world.lineBetween(drone.x + drone.w / 2, drone.y, drone.x + drone.w / 2, drone.y + drone.distance);
      }
      this.world.fillStyle(active ? 0xff4f8b : 0x43f7ff, active ? 0.16 : 0.08);
      this.world.fillCircle(center.x, center.y, 24);
      this.world.fillStyle(active ? 0x160915 : 0x061722, active ? 0.94 : 0.62);
      this.world.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 5);
      this.world.lineStyle(2, active ? 0xff4f8b : 0x43f7ff, active ? 0.86 : 0.42);
      this.world.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 5);
      this.world.fillStyle(active ? 0xffe35a : 0x43f7ff, active ? 0.88 : 0.28);
      this.world.fillCircle(center.x - 5, center.y - 2, 2.5);
      this.world.fillCircle(center.x + 5, center.y - 2, 2.5);
      this.world.lineStyle(1, 0xffffff, 0.18);
      this.world.lineBetween(rect.x + 5, rect.y + rect.h - 6, rect.x + rect.w - 5, rect.y + rect.h - 6);
    }
  }

  private drawExit(exit: Rect, won: boolean): void {
    const center = rectCenter(exit);
    const spin = this.time.now / 260;
    this.world.fillStyle(won ? 0xffe35a : 0x43f7ff, 0.13);
    this.world.fillEllipse(center.x, center.y, exit.w * 1.4, exit.h * 1.2);
    this.world.fillStyle(0xbd5cff, 0.12);
    this.world.fillEllipse(center.x, center.y, exit.w * 1.1, exit.h * 0.88);
    this.world.lineStyle(3, won ? 0xffe35a : 0x43f7ff, 0.82);
    this.world.strokeEllipse(center.x, center.y, exit.w, exit.h);
    this.world.lineStyle(1, 0xffffff, 0.3);
    this.world.strokeEllipse(center.x, center.y, exit.w * 0.7, exit.h * 0.7);
    this.world.lineStyle(2, 0xbd5cff, 0.72);
    this.world.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = spin + i * 1.26;
      const x = center.x + Math.cos(angle) * exit.w * 0.32;
      const y = center.y + Math.sin(angle) * exit.h * 0.42;
      if (i === 0) this.world.moveTo(x, y);
      else this.world.lineTo(x, y);
    }
    this.world.closePath();
    this.world.strokePath();
  }

  private drawEchoes(echoes: ActorBody[]): void {
    for (let index = 0; index < echoes.length; index += 1) {
      const echo = echoes[index];
      const tint = this.echoTint(echo);
      this.updateTrail(echo);
      const trail = this.echoTrails.get(echo.id) || [];
      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i];
        this.world.fillStyle(tint, (i + 1) / trail.length * 0.12);
        this.world.fillRect(point.x, point.y, echo.w, echo.h);
      }
      this.drawActor(echo, tint, 0.42);
    }
  }

  private echoTint(echo: ActorBody): number {
    const match = echo.id.match(/(\d+)$/);
    const parsed = match ? Number(match[1]) : 1;
    const index = Number.isFinite(parsed) ? Math.max(0, parsed - 1) : 0;
    return index % 2 === 0 ? 0xbd5cff : 0x50ffc2;
  }

  private exposeRenderDiagnostics(snapshot: SimulationSnapshot): void {
    if (!import.meta.env.DEV) return;
    document.documentElement.dataset.echoShiftVisibleEchoTints = snapshot.echoes
      .map((echo) => `${echo.id}:${this.echoTint(echo).toString(16)}`)
      .join(",");
    document.documentElement.dataset.echoShiftDroneStates = (this.level.drones || [])
      .map((drone) => `${drone.id}:${droneIsActive(drone, snapshot.activePlates) ? "active" : "inactive"}`)
      .join(",");
    document.documentElement.dataset.echoShiftObjectAssetCount = String(this.activeObjectAssetIds.size);
    document.documentElement.dataset.echoShiftSolidAssetFrames = this.solidAssetFrames.join(",");
  }

  private drawActor(actor: ActorBody, color: number, alpha: number): void {
    const centerX = actor.x + actor.w / 2;
    const centerY = actor.y + actor.h / 2;
    this.world.fillStyle(color, alpha * 0.13);
    this.world.fillCircle(centerX, centerY, 28);
    this.world.fillStyle(0x000000, alpha * 0.26);
    this.world.fillEllipse(centerX, actor.y + actor.h + 3, actor.w * 0.94, 8);
    if (this.textures.exists("time-runner")) return;

    this.world.fillStyle(0x08111f, alpha);
    this.world.fillRoundedRect(actor.x + 2, actor.y + 9, actor.w - 4, actor.h - 13, 6);
    this.world.fillStyle(0x13233b, alpha);
    this.world.fillRoundedRect(actor.x + 5, actor.y, actor.w - 10, 18, 6);
    this.world.lineStyle(2, color, alpha);
    this.world.strokeRoundedRect(actor.x + 2, actor.y + 9, actor.w - 4, actor.h - 13, 6);
    this.world.strokeRoundedRect(actor.x + 5, actor.y, actor.w - 10, 18, 6);
    const visorX = actor.facing > 0 ? actor.x + actor.w - 14 : actor.x + 6;
    this.world.fillStyle(color, alpha * 0.88);
    this.world.fillRoundedRect(visorX, actor.y + 6, 8, 5, 2);
    this.world.fillStyle(0xffffff, alpha * 0.52);
    this.world.fillRect(visorX + 1, actor.y + 7, 3, 1);
    this.world.fillStyle(color, alpha * 0.52);
    this.world.fillRect(actor.x + 7, actor.y + actor.h - 8, 7, 3);
    this.world.fillRect(actor.x + actor.w - 14, actor.y + actor.h - 8, 7, 3);
    this.world.lineStyle(1, color, alpha * 0.42);
    this.world.lineBetween(centerX, actor.y + 20, centerX, actor.y + actor.h - 10);
    this.drawDiamond(centerX, actor.y + 24, 4, color, alpha * 0.9, 0xffffff, alpha * 0.3);
  }

  private syncSpriteLayer(snapshot: SimulationSnapshot): void {
    this.syncActorSprites(snapshot);
    this.syncCoreSprites(snapshot);
    this.syncExitSprite(snapshot);
  }

  private syncActorSprites(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-runner")) return;

    const activeIds = new Set<string>();
    this.syncActorSprite(snapshot.player, snapshot.dead, 0x43f7ff, 1, snapshot.tick);
    activeIds.add(snapshot.player.id);

    for (let index = 0; index < snapshot.echoes.length; index += 1) {
      const echo = snapshot.echoes[index];
      const tint = this.echoTint(echo);
      this.syncActorSprite(echo, false, tint, 0.58, snapshot.tick);
      activeIds.add(echo.id);
    }

    for (const [id, sprite] of this.actorSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
  }

  private syncActorSprite(actor: ActorBody, dead: boolean, tint: number, alpha: number, tick: number): void {
    let sprite = this.actorSprites.get(actor.id);
    if (!sprite) {
      sprite = this.add.image(0, 0, "time-runner", 0).setOrigin(0.5, 1).setDepth(16);
      this.actorSprites.set(actor.id, sprite);
    }

    sprite
      .setVisible(true)
      .setFrame(this.actorFrame(actor, dead, tick))
      .setPosition(Math.round(actor.x + actor.w / 2), Math.round(actor.y + actor.h + 5))
      .setFlipX(actor.facing < 0)
      .setAlpha(alpha)
      .setScale(actor.kind === "echo" ? 0.88 : 1);

    if (actor.kind === "echo") sprite.setTint(tint);
    else if (dead) sprite.setTint(0xff4f8b);
    else sprite.clearTint();
  }

  private actorFrame(actor: ActorBody, dead: boolean, tick: number): number {
    if (dead) return 7;
    if (actor.kind === "player" && this.time.now < this.playerCastUntil) return 6;
    if (!actor.onGround && actor.vy < -1.2) return 3;
    if (!actor.onGround && actor.vy > 1.2) return 4;
    if (actor.onGround && Math.abs(actor.vx) > 1.1) return tick % 16 < 8 ? 1 : 2;
    if (actor.onGround && Math.abs(actor.vx) > 0.2) return 5;
    return 0;
  }

  private syncCoreSprites(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-effects")) return;
    const activeIds = new Set<string>();

    for (const core of this.level.cores || []) {
      if (snapshot.collectedCores.has(core.id)) continue;
      const center = rectCenter(core);
      let sprite = this.coreSprites.get(core.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, "time-effects", 0).setDepth(11);
        this.coreSprites.set(core.id, sprite);
      }
      sprite
        .setVisible(true)
        .setFrame(snapshot.tick % 44 < 22 ? 0 : 1)
        .setPosition(Math.round(center.x), Math.round(center.y))
        .setScale(0.34)
        .setAlpha(0.94);
      activeIds.add(core.id);
    }

    for (const [id, sprite] of this.coreSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
  }

  private syncExitSprite(snapshot: SimulationSnapshot): void {
    if (!this.textures.exists("time-effects")) return;
    const center = rectCenter(this.level.exit);
    if (!this.exitSprite) {
      this.exitSprite = this.add.image(0, 0, "time-effects", 3).setDepth(10);
    }
    this.exitSprite
      .setVisible(true)
      .setFrame(snapshot.won ? 5 : snapshot.tick % 48 < 24 ? 3 : 4)
      .setPosition(Math.round(center.x), Math.round(center.y))
      .setScale(snapshot.won ? 0.72 : 0.66)
      .setAlpha(0.9);
  }

  private drawForegroundText(tick: number): void {
    const subtitleAlpha = 0.34 + Math.sin(tick / 45) * 0.08;
    this.world.lineStyle(1, 0x43f7ff, 0.16);
    this.world.strokeRect(18, 66, 260, 34);
    this.world.fillStyle(0x43f7ff, subtitleAlpha);
    this.world.fillRect(24, 76, Math.min(210, this.level.subtitle.length * 7), 3);
  }

  private drawNeonRect(rect: Rect, fill: number, stroke: number, alpha: number): void {
    this.world.fillStyle(fill, 0.95);
    this.world.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.world.lineStyle(2, stroke, alpha);
    this.world.strokeRect(rect.x, rect.y, rect.w, rect.h);
    this.world.fillStyle(0xffffff, 0.04);
    this.world.fillRect(rect.x + 3, rect.y + 3, Math.max(0, rect.w - 6), 3);
  }

  private beginObjectAssetSync(): void {
    this.activeObjectAssetIds.clear();
    this.solidAssetFrames = [];
  }

  private finishObjectAssetSync(): void {
    for (const [id, asset] of this.objectAssets) {
      if (!this.activeObjectAssetIds.has(id)) asset.setVisible(false);
    }
  }

  private syncTileAsset(
    id: string,
    frame: number,
    rect: Rect,
    depth: number,
    alpha: number,
    tileScale: number,
    tileOffsetX = 0
  ): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY) || rect.w <= 0 || rect.h <= 0) return;
    const asset = this.assetFor(id, "tile", frame) as Phaser.GameObjects.TileSprite;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(alpha)
      .setOrigin(0, 0)
      .setPosition(rect.x, rect.y)
      .setFrame(frame);
    asset.setSize(Math.max(1, rect.w), Math.max(1, rect.h));
    asset.tileScaleX = tileScale;
    asset.tileScaleY = tileScale;
    asset.tilePositionX = rect.x / Math.max(tileScale, 0.01) + tileOffsetX;
    asset.tilePositionY = rect.y / Math.max(tileScale, 0.01);
    this.activeObjectAssetIds.add(id);
  }

  private solidFrame(solid: Solid): number {
    if (solid.sprite === "floor") return OBJECT_FRAME.floor;
    if (solid.sprite === "wall") return OBJECT_FRAME.wall;
    if (solid.sprite === "block") return OBJECT_FRAME.block;
    if (solid.sprite === "warning") return OBJECT_FRAME.warning;
    if (solid.tone === "warning") return OBJECT_FRAME.warning;

    const width = Math.max(1, solid.w);
    const height = Math.max(1, solid.h);
    if (height >= width * 1.35) return OBJECT_FRAME.wall;
    if (width >= height * 2) return OBJECT_FRAME.floor;
    if (solid.tone === "glass") return OBJECT_FRAME.block;
    if (solid.tone === "dark") return OBJECT_FRAME.wall;
    return OBJECT_FRAME.block;
  }

  private syncImageAsset(
    id: string,
    frame: number,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    alpha: number
  ): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY) || width <= 0 || height <= 0) return;
    const asset = this.assetFor(id, "image", frame) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(alpha)
      .setOrigin(0.5, 0.5)
      .setPosition(x, y)
      .setFrame(frame)
      .setDisplaySize(width, height);
    this.activeObjectAssetIds.add(id);
  }

  private assetFor(id: string, kind: "tile" | "image", frame: number): ObjectAsset {
    const existing = this.objectAssets.get(id);
    if (existing) return existing;
    const asset =
      kind === "tile"
        ? this.add.tileSprite(0, 0, 1, 1, OBJECT_ATLAS_KEY, frame)
        : this.add.image(0, 0, OBJECT_ATLAS_KEY, frame);
    asset.setVisible(false);
    this.objectAssets.set(id, asset);
    return asset;
  }

  private expandedBeamRect(rect: Rect): Rect {
    const horizontal = rect.w >= rect.h;
    if (horizontal) {
      const h = Math.max(rect.h, 10);
      return { x: rect.x, y: rect.y + rect.h / 2 - h / 2, w: rect.w, h };
    }
    const w = Math.max(rect.w, 10);
    return { x: rect.x + rect.w / 2 - w / 2, y: rect.y, w, h: rect.h };
  }

  private drawDiamond(
    x: number,
    y: number,
    radius: number,
    fill: number,
    alpha: number,
    stroke: number,
    strokeAlpha: number
  ): void {
    this.world.fillStyle(fill, alpha);
    this.world.beginPath();
    this.world.moveTo(x, y - radius);
    this.world.lineTo(x + radius * 0.78, y);
    this.world.lineTo(x, y + radius);
    this.world.lineTo(x - radius * 0.78, y);
    this.world.closePath();
    this.world.fillPath();
    this.world.lineStyle(1, stroke, strokeAlpha);
    this.world.strokePath();
  }

  private updateTrail(actor: ActorBody): void {
    const trail = this.echoTrails.get(actor.id) || [];
    trail.push({ x: actor.x, y: actor.y });
    while (trail.length > 16) trail.shift();
    this.echoTrails.set(actor.id, trail);
  }

  private spawnBurst(origin: { x: number; y: number }, color: number): void {
    for (let i = 0; i < 9; i += 1) {
      const dot = this.add.circle(origin.x, origin.y, 3, color, 0.85).setDepth(26);
      const angle = (Math.PI * 2 * i) / 9;
      this.tweens.add({
        targets: dot,
        x: dot.x + Math.cos(angle) * 38,
        y: dot.y + Math.sin(angle) * 28,
        alpha: 0,
        scale: 0.3,
        duration: 360,
        ease: "Cubic.easeOut",
        onComplete: () => dot.destroy()
      });
    }
  }

  private spawnEffectFrame(origin: { x: number; y: number }, frame: number, scale: number): void {
    if (!this.textures.exists("time-effects")) return;
    const sprite = this.add.image(origin.x, origin.y, "time-effects", frame).setDepth(25).setScale(scale).setAlpha(0.9);
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: scale * 1.5,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => sprite.destroy()
    });
  }
}
