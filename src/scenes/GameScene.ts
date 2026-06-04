import Phaser from "phaser";
import { updateEditorDraftCurrentIndex } from "../data/editorDraft";
import { getLevel, isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { backgroundForLevel } from "../game/backgrounds";
import { rectCenter } from "../game/geometry";
import { droneIsActive, droneRectAt, laserIsActive, movingLaserRectAt } from "../game/objects";
import { platformRectAt } from "../game/player";
import { recordLevelScore } from "../game/progress";
import { legacySolidSprite } from "../game/solidSprites";
import { soundtrackForLevel } from "../game/soundtracks";
import { RoomSimulation } from "../game/state";
import type { ActorBody, Door, InputFrame, Level, LevelScore, MovingPlatform, Rect, Solid } from "../game/types";
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
type SolidOutlineSide = "top" | "bottom" | "left" | "right";
type SolidOutlineSegment = {
  side: SolidOutlineSide;
  from: number;
  to: number;
};

type RenderView = {
  player: ActorBody;
  echoes: ActorBody[];
  activePlates: Set<string>;
  openDoors: Set<string>;
  collectedCores: Set<string>;
  blockedLasers: Set<string>;
  crates: Map<string, Rect>;
  tick: number;
  totalFrames: number;
  score: number;
  deaths: number;
  livesRemaining: number;
  dead: boolean;
  won: boolean;
};

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
  private _simulation: RoomSimulation | null = null;
  private _keys: KeyMap | null = null;
  private _hud: Hud | null = null;
  private _world: Phaser.GameObjects.Graphics | null = null;
  private _structureOutlines: Phaser.GameObjects.Graphics | null = null;
  private _fx: Phaser.GameObjects.Graphics | null = null;
  private accumulator = 0;
  private pausedByHud = false;
  private completeHandled = false;
  private retryRequired = false;
  private virtualInput: InputFrame = { left: false, right: false, jump: false };
  private echoTrails = new Map<string, Array<{ x: number; y: number }>>();
  private actorSprites = new Map<string, Phaser.GameObjects.Image>();
  private coreSprites = new Map<string, Phaser.GameObjects.Image>();
  private objectAssets = new Map<string, ObjectAsset>();
  private activeObjectAssetIds = new Set<string>();
  private readonly activeActorSpriteIds = new Set<string>();
  private readonly activeCoreSpriteIds = new Set<string>();
  private solidAssetFrames: string[] = [];
  private tileAssetPhases: string[] = [];
  private tileAssetOrigins: string[] = [];
  private laserAssetTransforms: string[] = [];
  private laserAssetPositions: string[] = [];
  private doorAssetTransforms: string[] = [];
  private echoSensorAssetFrames: string[] = [];
  private solidOutlineRects: string[] = [];
  private diagnosticsEnabled = false;
  private lowChurnGraphics = false;
  private readonly renderEchoes: ActorBody[] = [];
  private readonly renderView: RenderView = {
    player: null as unknown as ActorBody,
    echoes: this.renderEchoes,
    activePlates: new Set(),
    openDoors: new Set(),
    collectedCores: new Set(),
    blockedLasers: new Set(),
    crates: new Map(),
    tick: 0,
    totalFrames: 0,
    score: 0,
    deaths: 0,
    livesRemaining: 0,
    dead: false,
    won: false
  };
  private readonly beamRenderRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly hazardRenderRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private exitSprite?: Phaser.GameObjects.Image;
  private backgroundImages: Phaser.GameObjects.Image[] = [];
  private cameraTarget?: Phaser.GameObjects.Zone;
  private playerCastUntil = 0;
  private sceneCleanupRegistered = false;

  constructor() {
    super("GameScene");
  }

  private get simulation(): RoomSimulation {
    if (!this._simulation) throw new Error("GameScene simulation unavailable");
    return this._simulation;
  }

  private set simulation(simulation: RoomSimulation) {
    this._simulation = simulation;
  }

  private get keys(): KeyMap {
    if (!this._keys) throw new Error("GameScene keys unavailable");
    return this._keys;
  }

  private set keys(keys: KeyMap) {
    this._keys = keys;
  }

  private get hud(): Hud {
    if (!this._hud) throw new Error("GameScene HUD unavailable");
    return this._hud;
  }

  private set hud(hud: Hud) {
    this._hud = hud;
  }

  private get world(): Phaser.GameObjects.Graphics {
    if (!this._world) throw new Error("GameScene world graphics unavailable");
    return this._world;
  }

  private set world(world: Phaser.GameObjects.Graphics) {
    this._world = world;
  }

  private get structureOutlines(): Phaser.GameObjects.Graphics {
    if (!this._structureOutlines) throw new Error("GameScene structure outline graphics unavailable");
    return this._structureOutlines;
  }

  private set structureOutlines(structureOutlines: Phaser.GameObjects.Graphics) {
    this._structureOutlines = structureOutlines;
  }

  private get fx(): Phaser.GameObjects.Graphics {
    if (!this._fx) throw new Error("GameScene FX graphics unavailable");
    return this._fx;
  }

  private set fx(fx: Phaser.GameObjects.Graphics) {
    this._fx = fx;
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex || 0;
    this.level = getLevel(this.levelIndex);
    this.simulation = new RoomSimulation(this.level);
    this.accumulator = 0;
    this.pausedByHud = false;
    this.completeHandled = false;
    this.retryRequired = false;
    this.virtualInput = { left: false, right: false, jump: false };
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.actorSprites.clear();
    this.coreSprites.clear();
    this.objectAssets.clear();
    this.activeObjectAssetIds.clear();
    this.activeActorSpriteIds.clear();
    this.activeCoreSpriteIds.clear();
    this.solidAssetFrames = [];
    this.tileAssetPhases = [];
    this.tileAssetOrigins = [];
    this.laserAssetTransforms = [];
    this.laserAssetPositions = [];
    this.doorAssetTransforms = [];
    this.echoSensorAssetFrames = [];
    this.solidOutlineRects = [];
    this.diagnosticsEnabled = this.shouldExposeRenderDiagnostics();
    this.lowChurnGraphics = this.shouldUseLowChurnGraphics();
    this.renderEchoes.length = 0;
    this.exitSprite = undefined;
    this.backgroundImages = [];
    this.cameraTarget = undefined;
  }

  create(): void {
    this.syncDraftPlaytestUrl();
    audio.playMusic(soundtrackForLevel(this.level, this.levelIndex).key);
    this.cameras.main.setBounds(this.level.bounds.x, this.level.bounds.y, this.level.bounds.w, this.level.bounds.h);
    this.cameras.main.setBackgroundColor("#05070d");
    this.configureCameraFrame();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.configureCameraFrame, this);
    this.createBackgroundImages();
    this.cameraTarget = this.add.zone(this.level.start.x, this.level.start.y, 1, 1);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.12, 0.08);
    this.world = this.add.graphics().setDepth(0);
    this.structureOutlines = this.add.graphics().setDepth(2);
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
    this.registerSceneCleanup();
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
      score: this.simulation.score,
      lives: this.simulation.livesRemaining(),
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
    if (this.retryRequired) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.restartLevel();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.rewind();
    if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.retryAttempt();
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) this.togglePause();
  }

  private handleEvents(events: ReturnType<RoomSimulation["step"]>): void {
    if (events.jumped || events.launched) audio.play("jump");
    if (events.landed) audio.play("land");
    if (events.switched) audio.play("switch");
    if (events.cores.length > 0) {
      audio.play("core");
      for (const core of events.cores) {
        this.spawnBurst(core, 0xffe35a);
        this.spawnEffectFrame(core, 2, 0.42);
      }
    }
    if (events.died) {
      audio.play("death");
      this.cameras.main.shake(180, 0.006);
      if (events.livesExhausted) {
        this.pausedByHud = true;
        this.retryRequired = true;
        this.hud.showRetryRequired(this.level.name);
      } else {
        this.hud.toast(`Signal lost. ${this.simulation.livesRemaining()} lives left.`);
      }
    }
    if (events.won) this.completeLevel();
  }

  private rewind(): void {
    if (this.completeHandled || this.pausedByHud || this.retryRequired) return;
    const added = this.simulation.rewindToEcho();
    audio.play("rewind");
    this.playerCastUntil = this.time.now + 360;
    this.hud.scan();
    this.cameras.main.flash(220, 67, 247, 255, false);
    this.echoTrails.clear();
    this.hud.toast(added ? `Echo ${this.simulation.echoRecordings.length} anchored` : "Attempt reset");
  }

  private retryAttempt(): void {
    if (this.completeHandled || this.pausedByHud || this.retryRequired) return;
    this.simulation.resetLevel();
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    audio.play("select");
    this.hud.toast("Run reset");
  }

  private restartLevel(): void {
    this.completeHandled = false;
    this.pausedByHud = false;
    this.retryRequired = false;
    this.virtualInput = { left: false, right: false, jump: false };
    audio.resumeMusic();
    this.simulation.resetLevel();
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.hud.hideModal();
    this.hud.toast(`${this.level.index + 1}: ${this.level.name}`);
  }

  private togglePause(force?: boolean): void {
    if (this.completeHandled || this.retryRequired) return;
    this.pausedByHud = force ?? !this.pausedByHud;
    if (this.pausedByHud) {
      this.hud.showPause(this.level.name);
      audio.pauseMusic();
    } else {
      this.hud.hideModal();
      audio.resumeMusic();
    }
    audio.play("select");
  }

  private completeLevel(): void {
    if (this.completeHandled) return;
    this.completeHandled = true;
    audio.play("portal");
    const score: LevelScore = {
      levelId: this.level.id,
      score: this.simulation.finalScore(),
      frames: this.simulation.totalFrames,
      echoes: this.simulation.echoRecordings.length,
      deaths: this.simulation.deaths,
      cores: this.simulation.objectState.collectedCores.size,
      timeBonus: this.simulation.timeBonus()
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

  private configureCameraFrame = (): void => {
    const camera = this.cameras.main;
    const zoom = Math.max(0.1, this.scale.height / this.level.bounds.h);
    camera.setZoom(zoom);
    camera.setDeadzone(
      Math.min(340, Math.max(190, this.scale.width * 0.24)),
      Math.min(170, Math.max(96, this.scale.height * 0.2))
    );
  };

  private registerSceneCleanup(): void {
    if (this.sceneCleanupRegistered) return;
    this.sceneCleanupRegistered = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownScene);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdownScene);
  }

  private shutdownScene = (): void => {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdownScene);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdownScene);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.configureCameraFrame, this);
    this.sceneCleanupRegistered = false;
    this._hud?.destroy();
    this._hud = null;
    this._simulation = null;
    this._keys = null;
    this._world = null;
    this._structureOutlines = null;
    this._fx = null;
    this.echoTrails.clear();
    this.actorSprites.clear();
    this.coreSprites.clear();
    this.objectAssets.clear();
    this.activeObjectAssetIds.clear();
    this.activeActorSpriteIds.clear();
    this.activeCoreSpriteIds.clear();
    this.solidAssetFrames = [];
    this.tileAssetPhases = [];
    this.tileAssetOrigins = [];
    this.laserAssetTransforms = [];
    this.laserAssetPositions = [];
    this.doorAssetTransforms = [];
    this.echoSensorAssetFrames = [];
    this.solidOutlineRects = [];
    this.renderEchoes.length = 0;
    this.exitSprite = undefined;
    this.backgroundImages = [];
    this.cameraTarget = undefined;
  };

  private renderWorld(): void {
    const snapshot = this.liveRenderView();
    this.cameraTarget?.setPosition(snapshot.player.x + snapshot.player.w / 2, snapshot.player.y + snapshot.player.h / 2);
    this.beginObjectAssetSync();
    this.world.clear();
    this.structureOutlines.clear();
    this.fx.clear();
    if (!this.lowChurnGraphics) this.drawBackground();
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
    if (!this.lowChurnGraphics) this.drawForegroundText(snapshot.tick);
    this.finishObjectAssetSync();
    this.syncSpriteLayer(snapshot);
    this.exposeRenderDiagnostics(snapshot);
  }

  private liveRenderView(): RenderView {
    const simulation = this.simulation;
    const objectState = simulation.objectState;
    this.renderEchoes.length = 0;
    for (const echo of simulation.echoes) {
      if (echo.alive) this.renderEchoes.push(echo);
    }

    const view = this.renderView;
    view.player = simulation.player;
    view.activePlates = objectState.activePlates;
    view.openDoors = objectState.openDoors;
    view.collectedCores = objectState.collectedCores;
    view.blockedLasers = objectState.blockedLasers;
    view.crates = objectState.crates;
    view.tick = simulation.tick;
    view.totalFrames = simulation.totalFrames;
    view.score = simulation.score;
    view.deaths = simulation.deaths;
    view.livesRemaining = simulation.livesRemaining();
    view.dead = simulation.dead;
    view.won = simulation.won;
    return view;
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
      const frame = this.solidFrame(solid);
      if (this.diagnosticsEnabled) this.solidAssetFrames.push(`${solid.id}:${frame}`);
      this.syncTileAsset(
        `solid:${solid.id}`,
        frame,
        solid,
        1,
        0.96,
        0.42
      );
      this.drawSolidReadabilityOutline(solid);
    }
  }

  private drawPlatforms(tick: number): void {
    for (const platform of this.level.platforms || []) {
      const rect = platformRectAt(platform, tick);
      this.syncPlatformAsset(platform, rect);
      if (this.lowChurnGraphics) continue;
      this.world.lineStyle(1, 0xffe35a, 0.18);
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
      if (this.lowChurnGraphics) continue;
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
      if (this.lowChurnGraphics) continue;
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
    }
  }

  private drawDoors(openDoors: Set<string>): void {
    for (const door of this.level.doors || []) {
      const open = openDoors.has(door.id);
      this.syncDoorAsset(door, open);
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
    }
  }

  private drawEchoSensors(activePlates: Set<string>): void {
    for (const sensor of this.level.echoSensors || []) {
      const active = activePlates.has(sensor.id);
      const frame = active ? OBJECT_FRAME.plateActive : OBJECT_FRAME.block;
      this.syncImageAsset(
        `echo-sensor:${sensor.id}`,
        frame,
        sensor.x + sensor.w / 2,
        sensor.y + sensor.h / 2,
        Math.max(42, sensor.w),
        Math.max(42, sensor.h),
        3,
        active ? 0.9 : 0.48
      );
      if (this.diagnosticsEnabled) {
        this.echoSensorAssetFrames.push(`echo-sensor:${sensor.id}:${frame}:${active ? "active" : "inactive"}`);
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
      this.syncLaserAsset(`laser:${laser.id}`, active ? OBJECT_FRAME.laserActive : OBJECT_FRAME.laserInactive, visual, 6, active ? 0.96 : 0.42);
      if (active) this.drawLaserCore(laser, blockedLasers.has(laser.id));
    }
  }

  private drawMovingLasers(tick: number, activePlates: Set<string>, blockedLasers: Set<string>): void {
    for (const laser of this.level.movingLasers || []) {
      const rect = movingLaserRectAt(laser, tick);
      const active = laserIsActive(laser, activePlates);
      this.syncLaserAsset(
        `moving-laser:${laser.id}`,
        active ? OBJECT_FRAME.laserActive : OBJECT_FRAME.laserInactive,
        this.expandedBeamRect(rect),
        6,
        active ? 0.94 : 0.42
      );
      if (this.lowChurnGraphics) {
        if (active) this.drawLaserCore(rect, blockedLasers.has(laser.id));
        continue;
      }
      this.world.lineStyle(1, 0xff4f8b, 0.22);
      if (laser.axis === "x") {
        this.world.lineBetween(laser.x, laser.y + laser.h / 2, laser.x + laser.distance, laser.y + laser.h / 2);
      } else {
        this.world.lineBetween(laser.x + laser.w / 2, laser.y, laser.x + laser.w / 2, laser.y + laser.distance);
      }
      if (active) this.drawLaserCore(rect, blockedLasers.has(laser.id));
    }
  }

  private drawHazards(): void {
    for (const hazard of this.level.hazards || []) {
      this.hazardRenderRect.x = hazard.x;
      this.hazardRenderRect.y = hazard.y - 4;
      this.hazardRenderRect.w = hazard.w;
      this.hazardRenderRect.h = hazard.h + 8;
      this.syncTileAsset(`hazard:${hazard.id}`, OBJECT_FRAME.warning, this.hazardRenderRect, 2, 0.74, 0.38);
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
      if (this.lowChurnGraphics) continue;
      this.world.lineStyle(1, active ? 0xff4f8b : 0x43f7ff, active ? 0.2 : 0.16);
      if (drone.axis === "x") {
        this.world.lineBetween(drone.x, drone.y + drone.h / 2, drone.x + drone.distance, drone.y + drone.h / 2);
      } else {
        this.world.lineBetween(drone.x + drone.w / 2, drone.y, drone.x + drone.w / 2, drone.y + drone.distance);
      }
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

  private shouldExposeRenderDiagnostics(): boolean {
    if (!import.meta.env.DEV) return false;
    const diagnostics = new URLSearchParams(window.location.search).get("diagnostics");
    if (diagnostics === "0") return false;
    if (diagnostics === "1") return true;
    return typeof navigator !== "undefined" && navigator.webdriver;
  }

  private shouldUseLowChurnGraphics(): boolean {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fullGraphics") === "1") return false;
    if (params.get("lowChurnGraphics") === "1") return true;
    if (this.diagnosticsEnabled) return false;
    return false;
  }

  private exposeRenderDiagnostics(snapshot: RenderView): void {
    if (!this.diagnosticsEnabled) return;
    document.documentElement.dataset.echoShiftVisibleEchoTints = snapshot.echoes
      .map((echo) => `${echo.id}:${this.echoTint(echo).toString(16)}`)
      .join(",");
    document.documentElement.dataset.echoShiftDroneStates = (this.level.drones || [])
      .map((drone) => `${drone.id}:${droneIsActive(drone, snapshot.activePlates) ? "active" : "inactive"}`)
      .join(",");
    document.documentElement.dataset.echoShiftObjectAssetCount = String(this.activeObjectAssetIds.size);
    document.documentElement.dataset.echoShiftSolidAssetFrames = this.solidAssetFrames.join(",");
    document.documentElement.dataset.echoShiftTileAssetPhases = this.tileAssetPhases.join("|");
    document.documentElement.dataset.echoShiftTileAssetOrigins = this.tileAssetOrigins.join("|");
    document.documentElement.dataset.echoShiftLaserAssetTransforms = this.laserAssetTransforms.join("|");
    document.documentElement.dataset.echoShiftLaserAssetPositions = this.laserAssetPositions.join("|");
    document.documentElement.dataset.echoShiftDoorAssetTransforms = this.doorAssetTransforms.join("|");
    document.documentElement.dataset.echoShiftEchoSensorAssetFrames = this.echoSensorAssetFrames.join("|");
    document.documentElement.dataset.echoShiftSolidOutlineRects = this.solidOutlineRects.join("|");
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

  private syncSpriteLayer(snapshot: RenderView): void {
    this.syncActorSprites(snapshot);
    this.syncCoreSprites(snapshot);
    this.syncExitSprite(snapshot);
  }

  private syncActorSprites(snapshot: RenderView): void {
    if (!this.textures.exists("time-runner")) return;

    const activeIds = this.activeActorSpriteIds;
    activeIds.clear();
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

  private syncCoreSprites(snapshot: RenderView): void {
    if (!this.textures.exists("time-effects")) return;
    const activeIds = this.activeCoreSpriteIds;
    activeIds.clear();

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

  private syncExitSprite(snapshot: RenderView): void {
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

  private drawSolidReadabilityOutline(solid: Solid): void {
    const segments = this.solidOutlineSegments(solid);
    if (segments.length === 0) return;
    const outlines = this.structureOutlines;
    outlines.lineStyle(1, 0x43f7ff, solid.tone === "glass" ? 0.52 : 0.4);
    for (const segment of segments) {
      this.drawSolidOutlineSegment(solid, segment);
    }
    outlines.lineStyle(1, 0x9cfbff, 0.2);
    for (const segment of segments) {
      if (segment.side !== "top" || segment.to - segment.from <= 4) continue;
      outlines.lineBetween(segment.from + 2, solid.y + 3, segment.to - 2, solid.y + 3);
    }
    if (this.diagnosticsEnabled) {
      const sides = segments.map((segment) => `${segment.side}:${Math.round(segment.from)}-${Math.round(segment.to)}`).join(";");
      this.solidOutlineRects.push(`${solid.id}:${Math.round(solid.x)},${Math.round(solid.y)}:${Math.round(solid.w)}x${Math.round(solid.h)}:43f7ff:${Math.round(outlines.depth)}:${sides}`);
    }
  }

  private solidOutlineSegments(solid: Solid): SolidOutlineSegment[] {
    const width = Math.max(0, solid.w);
    const height = Math.max(0, solid.h);
    if (width <= 0 || height <= 0) return [];
    const frame = this.solidFrame(solid);
    const segments: Record<SolidOutlineSide, Array<{ from: number; to: number }>> = {
      top: [{ from: solid.x, to: solid.x + solid.w }],
      bottom: [{ from: solid.x, to: solid.x + solid.w }],
      left: [{ from: solid.y, to: solid.y + solid.h }],
      right: [{ from: solid.y, to: solid.y + solid.h }]
    };

    for (const neighbor of this.level.solids) {
      if (neighbor === solid || this.solidFrame(neighbor) !== frame) continue;
      const horizontalOverlap = this.overlapSpan(solid.x, solid.x + solid.w, neighbor.x, neighbor.x + neighbor.w);
      const verticalOverlap = this.overlapSpan(solid.y, solid.y + solid.h, neighbor.y, neighbor.y + neighbor.h);
      if (horizontalOverlap && this.sameCoordinate(neighbor.y + neighbor.h, solid.y)) {
        segments.top = this.subtractSolidOutlineSpan(segments.top, horizontalOverlap.from, horizontalOverlap.to);
      }
      if (horizontalOverlap && this.sameCoordinate(neighbor.y, solid.y + solid.h)) {
        segments.bottom = this.subtractSolidOutlineSpan(segments.bottom, horizontalOverlap.from, horizontalOverlap.to);
      }
      if (verticalOverlap && this.sameCoordinate(neighbor.x + neighbor.w, solid.x)) {
        segments.left = this.subtractSolidOutlineSpan(segments.left, verticalOverlap.from, verticalOverlap.to);
      }
      if (verticalOverlap && this.sameCoordinate(neighbor.x, solid.x + solid.w)) {
        segments.right = this.subtractSolidOutlineSpan(segments.right, verticalOverlap.from, verticalOverlap.to);
      }
    }

    return (["top", "bottom", "left", "right"] as SolidOutlineSide[]).flatMap((side) =>
      segments[side].map((segment) => ({ side, ...segment }))
    );
  }

  private drawSolidOutlineSegment(solid: Solid, segment: SolidOutlineSegment): void {
    const outlines = this.structureOutlines;
    if (segment.side === "top") {
      outlines.lineBetween(segment.from + 0.5, solid.y + 0.5, segment.to - 0.5, solid.y + 0.5);
      return;
    }
    if (segment.side === "bottom") {
      outlines.lineBetween(segment.from + 0.5, solid.y + solid.h - 0.5, segment.to - 0.5, solid.y + solid.h - 0.5);
      return;
    }
    if (segment.side === "left") {
      outlines.lineBetween(solid.x + 0.5, segment.from + 0.5, solid.x + 0.5, segment.to - 0.5);
      return;
    }
    outlines.lineBetween(solid.x + solid.w - 0.5, segment.from + 0.5, solid.x + solid.w - 0.5, segment.to - 0.5);
  }

  private overlapSpan(aFrom: number, aTo: number, bFrom: number, bTo: number): { from: number; to: number } | null {
    const from = Math.max(aFrom, bFrom);
    const to = Math.min(aTo, bTo);
    return to - from > 0.01 ? { from, to } : null;
  }

  private subtractSolidOutlineSpan(
    segments: Array<{ from: number; to: number }>,
    from: number,
    to: number
  ): Array<{ from: number; to: number }> {
    const next: Array<{ from: number; to: number }> = [];
    for (const segment of segments) {
      const overlapFrom = Math.max(segment.from, from);
      const overlapTo = Math.min(segment.to, to);
      if (overlapTo - overlapFrom <= 0.01) {
        next.push(segment);
        continue;
      }
      if (overlapFrom - segment.from > 0.01) next.push({ from: segment.from, to: overlapFrom });
      if (segment.to - overlapTo > 0.01) next.push({ from: overlapTo, to: segment.to });
    }
    return next;
  }

  private sameCoordinate(a: number, b: number): boolean {
    return Math.abs(a - b) <= 0.01;
  }

  private beginObjectAssetSync(): void {
    this.activeObjectAssetIds.clear();
    if (!this.diagnosticsEnabled) return;
    this.solidAssetFrames.length = 0;
    this.tileAssetPhases.length = 0;
    this.tileAssetOrigins.length = 0;
    this.laserAssetTransforms.length = 0;
    this.laserAssetPositions.length = 0;
    this.doorAssetTransforms.length = 0;
    this.echoSensorAssetFrames.length = 0;
    this.solidOutlineRects.length = 0;
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
    tileOffsetX = 0,
    tileOrigin: Rect = rect
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
    asset.tilePositionX = tileOrigin.x / Math.max(tileScale, 0.01) + tileOffsetX;
    asset.tilePositionY = tileOrigin.y / Math.max(tileScale, 0.01);
    this.activeObjectAssetIds.add(id);
    if (this.diagnosticsEnabled && (id.startsWith("platform:") || id.startsWith("moving-laser:"))) {
      this.tileAssetPhases.push(`${id}:${Math.round(asset.tilePositionX)},${Math.round(asset.tilePositionY)}`);
      this.tileAssetOrigins.push(`${id}:${Math.round(tileOrigin.x)}:${Math.round(tileOrigin.y)}`);
    }
  }

  private syncDoorAsset(door: Door, open: boolean): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY) || door.w <= 0 || door.h <= 0) return;
    const frame = open ? OBJECT_FRAME.doorOpen : OBJECT_FRAME.doorClosed;
    const asset = this.assetFor(`door:${door.id}`, "image", frame) as Phaser.GameObjects.Image;
    const width = Math.max(34, door.w * 1.72);
    const height = Math.max(44, door.h);
    asset
      .setVisible(true)
      .setDepth(4)
      .setAlpha(open ? 0.76 : 0.98)
      .setOrigin(0.5, 0)
      .setPosition(door.x + door.w / 2, door.y)
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(width, height);
    this.activeObjectAssetIds.add(`door:${door.id}`);
    if (this.diagnosticsEnabled) {
      const left = asset.x - asset.displayWidth * asset.originX;
      const top = asset.y - asset.displayHeight * asset.originY;
      this.doorAssetTransforms.push(
        `door:${door.id}:${frame}:logic:${Math.round(door.x)},${Math.round(door.y)},${Math.round(door.w)},${Math.round(door.h)}:pos:${Math.round(asset.x)},${Math.round(asset.y)}:origin:${asset.originX},${asset.originY}:box:${Math.round(left)},${Math.round(top)},${Math.round(asset.displayWidth)},${Math.round(asset.displayHeight)}`
      );
    }
  }

  private solidFrame(solid: Solid): number {
    const sprite = solid.sprite || legacySolidSprite(solid);
    if (sprite === "floor") return OBJECT_FRAME.floor;
    if (sprite === "wall") return OBJECT_FRAME.wall;
    if (sprite === "block") return OBJECT_FRAME.block;
    if (sprite === "warning") return OBJECT_FRAME.warning;
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
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(width, height);
    this.activeObjectAssetIds.add(id);
  }

  private syncPlatformAsset(platform: MovingPlatform, rect: Rect): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY) || rect.w <= 0 || rect.h <= 0) return;
    const id = `platform:${platform.id}`;
    const width = Math.max(rect.w * 1.12, rect.w + 28);
    const height = Math.max(50, rect.h * 3.2);
    const contentTopRatio = 64 / 256;
    const asset = this.assetFor(id, "image", OBJECT_FRAME.platform) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(3)
      .setAlpha(0.98)
      .setOrigin(0.5, 0)
      .setPosition(rect.x + rect.w / 2, rect.y - height * contentTopRatio)
      .setRotation(0)
      .setFrame(OBJECT_FRAME.platform)
      .setDisplaySize(width, height);
    this.activeObjectAssetIds.add(id);

    const tileScale = 0.44;
    if (this.diagnosticsEnabled) {
      this.tileAssetPhases.push(`${id}:${Math.round(platform.x / tileScale)},${Math.round(platform.y / tileScale)}`);
      this.tileAssetOrigins.push(`${id}:${Math.round(platform.x)}:${Math.round(platform.y)}`);
    }
  }

  private syncLaserAsset(id: string, frame: number, rect: Rect, depth: number, alpha: number): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY) || rect.w <= 0 || rect.h <= 0) return;
    const horizontal = rect.w >= rect.h;
    const asset = this.assetFor(id, "image", frame) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(alpha)
      .setOrigin(0.5, 0.5)
      .setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2)
      .setRotation(horizontal ? 0 : Math.PI / 2)
      .setFrame(frame)
      .setDisplaySize(horizontal ? rect.w : rect.h, horizontal ? rect.h : rect.w);
    this.activeObjectAssetIds.add(id);
    if (this.diagnosticsEnabled) {
      this.laserAssetTransforms.push(`${id}:${horizontal ? "h" : "v"}:${Math.round(rect.w)}x${Math.round(rect.h)}`);
      this.laserAssetPositions.push(`${id}:${Math.round(rect.x + rect.w / 2)}:${Math.round(rect.y + rect.h / 2)}`);
    }
  }

  private assetFor(id: string, kind: "tile" | "image", frame: number): ObjectAsset {
    const existing = this.objectAssets.get(id);
    if (existing) {
      if ((kind === "tile" && existing.type === "TileSprite") || (kind === "image" && existing.type === "Image")) return existing;
      existing.destroy();
      this.objectAssets.delete(id);
    }
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
      this.beamRenderRect.x = rect.x;
      this.beamRenderRect.y = rect.y + rect.h / 2 - h / 2;
      this.beamRenderRect.w = rect.w;
      this.beamRenderRect.h = h;
      return this.beamRenderRect;
    }
    const w = Math.max(rect.w, 10);
    this.beamRenderRect.x = rect.x + rect.w / 2 - w / 2;
    this.beamRenderRect.y = rect.y;
    this.beamRenderRect.w = w;
    this.beamRenderRect.h = rect.h;
    return this.beamRenderRect;
  }

  private drawLaserCore(rect: Rect, blocked: boolean): void {
    const horizontal = rect.w >= rect.h;
    const span = horizontal ? rect.w : rect.h;
    const cross = horizontal ? rect.h : rect.w;
    const glowSize = Math.max(4, Math.min(8, cross * 0.42));
    const coreSize = Math.max(2, Math.min(4, cross * 0.22));
    const glowColor = blocked ? 0xffe35a : 0xff4f8b;
    const coreColor = blocked ? 0xfff4a0 : 0xffffff;
    const pulseColor = blocked ? 0xffe35a : 0xff2f6c;

    this.world.fillStyle(glowColor, blocked ? 0.18 : 0.24);
    if (horizontal) {
      const centerY = rect.y + rect.h / 2;
      this.world.fillRect(rect.x, centerY - glowSize / 2, rect.w, glowSize);
      this.world.fillStyle(coreColor, blocked ? 0.24 : 0.36);
      this.world.fillRect(rect.x, centerY - coreSize / 2, rect.w, coreSize);
      this.world.fillStyle(pulseColor, blocked ? 0.14 : 0.2);
      for (let x = rect.x + ((this.simulation.tick * 2) % 18); x < rect.x + span; x += 22) {
        this.world.fillRect(x, centerY - glowSize / 2, 5, glowSize);
      }
      return;
    }

    const centerX = rect.x + rect.w / 2;
    this.world.fillRect(centerX - glowSize / 2, rect.y, glowSize, rect.h);
    this.world.fillStyle(coreColor, blocked ? 0.24 : 0.36);
    this.world.fillRect(centerX - coreSize / 2, rect.y, coreSize, rect.h);
    this.world.fillStyle(pulseColor, blocked ? 0.14 : 0.2);
    for (let y = rect.y + ((this.simulation.tick * 2) % 18); y < rect.y + span; y += 22) {
      this.world.fillRect(centerX - glowSize / 2, y, glowSize, 5);
    }
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
    let trail = this.echoTrails.get(actor.id);
    if (!trail) {
      trail = [];
      this.echoTrails.set(actor.id, trail);
    }
    if (trail.length < 16) {
      trail.push({ x: actor.x, y: actor.y });
      return;
    }
    const point = trail.shift();
    if (!point) return;
    point.x = actor.x;
    point.y = actor.y;
    trail.push(point);
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
