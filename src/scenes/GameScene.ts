import Phaser from "phaser";
import { updateEditorDraftCurrentIndex } from "../data/editorDraft";
import { getLevel, isDraftPlaytestActive, levels } from "../data/levels";
import { tutorialLevel } from "../data/tutorialLevel";
import { audio } from "../game/audio";
import { selectBossCameraFocus } from "../game/bossCamera";
import { backgroundAmbienceForLevel, backgroundAmbienceIsActive, type NormalizedBackgroundAmbience } from "../game/backgroundAmbience";
import { backgroundForLevel } from "../game/backgrounds";
import {
  bossAttackActiveFramesFor,
  bossAttackCycleFramesFor,
  bossAttackWindupFramesFor,
  bossIsVulnerable,
  monsterAnimationProfileForKind,
  monsterRectAt,
  monsterVisualTransformForKind
} from "../game/enemies";
import {
  BOSS_ATLAS_KEY,
  BOSS_STATE_FRAME_COUNT,
  CRYO_BOSS_CLEAN_KEY,
  MONSTER_ATLAS_KEY,
  POOF_FRAME_COUNT,
  POOF_SHEET_KEY,
  STORM_BOSS_CLEAN_KEY,
  bossFrameForKind,
  monsterFrameForKind,
  type BossSpriteState
} from "../game/enemySprites";
import { rectCenter, rectsOverlap } from "../game/geometry";
import { doorRequiredCoreIds, droneIsActive, droneRectAt, isMajorCore, laserIsActive, movingLaserRectAt } from "../game/objects";
import { platformRectAt } from "../game/player";
import { recordLevelScore } from "../game/progress";
import { solidCollisionFor } from "../game/solidCollision";
import { solidRenderDepth, solidVisualRoleFor } from "../game/solidRenderOrder";
import { soundtrackForBoss, soundtrackForLevel } from "../game/soundtracks";
import { RoomSimulation } from "../game/state";
import {
  effectiveSolidDecorDensity,
  gardenTerrainDecorProps,
  terrainDecorPropTextureKey,
  terrainDecorPropsForMaterial,
  type TerrainDecorPropCategory,
  type TerrainDecorPropDefinition
} from "../game/terrainDecorProps";
import {
  terrainMaterialForSolid,
  terrainTileFrame,
  TERRAIN_TILE_KEY,
  TERRAIN_TILE_SIZE,
  TERRAIN_TILE_VARIANT_COUNT,
  type TerrainBaseTileRole
} from "../game/terrainMaterials";
import type {
  ActorBody,
  Boss,
  BossAttackSnapshot,
  BossFloorIceSnapshot,
  BossKind,
  BossSnapshot,
  Core,
  Door,
  InputFrame,
  Level,
  LevelScore,
  Monster,
  MovingPlatform,
  Rect,
  Solid,
  SolidDecorDensity,
  TerrainMaterial
} from "../game/types";
import { Hud } from "../ui/hud";
import { uiRoot } from "../ui/dom";

type ActiveTerrainDecorDensity = Exclude<SolidDecorDensity, "auto" | "off">;

const STEP_MS = 1000 / 60;
const BACKGROUND_DRIFT_PADDING = 16;
const BACKGROUND_AMBIENCE_REDRAW_FRAMES = 4;
const DEATH_FALL_MS = 1700;
const DEATH_FADE_OUT_MS = 360;
const DEATH_FADE_IN_MS = 360;
const DEATH_BOUNCE_SPEED = -8.8;
const DEATH_FALL_GRAVITY = 0.52;
const CORE_MAJOR_KEY = "core-major";
const OBJECT_ATLAS_KEY = "object-atlas";
const LAUNCH_PAD_KEY = "launch-pad";
const LAUNCH_PAD_FRAME_WIDTH = 256;
const LAUNCH_PAD_FRAME_HEIGHT = 192;
const LAUNCH_PAD_ACTIVE_MS = 360;
const HAZARD_VENT_KEY = "hazard-vent";
const HAZARD_VENT_FRAME_WIDTH = 352;
const HAZARD_VENT_FRAME_HEIGHT = 288;
const HAZARD_VENT_FRAMES = 6;
const RUN_FRAMES = [1, 2, 3, 4] as const;
const LEVEL_INTRO_MS = 3000;
const LEVEL_INTRO_OUTRO_MS = 820;
const MUSIC_LOADING_OVERLAY_DELAY_MS = 220;
const BOSS_MUSIC_FADE_MS = 620;
const PLAYER_CAMERA_REFERENCE_HEIGHT = 540;
const PLAYER_CAMERA_ZOOM = 1.152;
const BOSS_ARENA_CAMERA_ZOOM = 1.2;
const TERRAIN_SURFACE_CAP_OVERLAP = 16;
const TERRAIN_DECOR_MIN_SOLID_HEIGHT = 28;
const TERRAIN_DECOR_MIN_SEGMENT_WIDTH = 96;
const TERRAIN_DECOR_PROP_SURFACE_SLOT: Record<ActiveTerrainDecorDensity, number> = { low: 88, medium: 64, high: 48 };
const TERRAIN_DECOR_PROP_SURFACE_CHANCE: Record<ActiveTerrainDecorDensity, number> = { low: 0.25, medium: 0.42, high: 0.64 };
const TERRAIN_DECOR_PROP_LARGE_CHANCE: Record<ActiveTerrainDecorDensity, number> = { low: 0, medium: 0.34, high: 1 };
const TERRAIN_DECOR_PROP_OVERHANG_CHANCE: Record<ActiveTerrainDecorDensity, number> = { low: 0, medium: 0.28, high: 0.54 };
const TERRAIN_DECOR_PROP_WALL_CHANCE: Record<ActiveTerrainDecorDensity, number> = { low: 0, medium: 0.2, high: 0.48 };
const BOSS_DEFEAT_BURST_OFFSETS = [
  { x: 0.28, y: 0.34, start: 0, tint: 0xffe35a },
  { x: 0.62, y: 0.42, start: 18, tint: 0xff8b3d },
  { x: 0.44, y: 0.22, start: 34, tint: 0xffffff },
  { x: 0.76, y: 0.58, start: 52, tint: 0xffe35a },
  { x: 0.2, y: 0.66, start: 70, tint: 0xff8b3d },
  { x: 0.54, y: 0.72, start: 88, tint: 0xffffff },
  { x: 0.35, y: 0.5, start: 108, tint: 0xffe35a },
  { x: 0.68, y: 0.28, start: 128, tint: 0xff8b3d }
] as const;
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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

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
  killedMonsters: Set<string>;
  bosses: BossSnapshot[];
  exitUnlocked: boolean;
  bossCheckpointActive: boolean;
  bossCheckpointBossId: string | null;
  tick: number;
  totalFrames: number;
  score: number;
  deaths: number;
  livesRemaining: number | null;
  dead: boolean;
  won: boolean;
};

type DeathPresentation = {
  actor: ActorBody;
  elapsedMs: number;
  livesExhausted: boolean;
  fadeStarted: boolean;
};

type RetryPresentation = {
  elapsedMs: number;
};

type FxBurst = {
  id: number;
  x: number;
  y: number;
  color: number;
  label?: string;
  startedAt: number;
  durationMs: number;
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
};

type GameSceneData = {
  levelIndex?: number;
  tutorial?: boolean;
};

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private tutorialMode = false;
  private level!: Level;
  private _simulation: RoomSimulation | null = null;
  private _keys: KeyMap | null = null;
  private _hud: Hud | null = null;
  private _backgroundDetail: Phaser.GameObjects.Graphics | null = null;
  private _world: Phaser.GameObjects.Graphics | null = null;
  private _backgroundFx: Phaser.GameObjects.Graphics | null = null;
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
  private staticObjectAssetIds = new Set<string>();
  private readonly activeActorSpriteIds = new Set<string>();
  private readonly activeCoreSpriteIds = new Set<string>();
  private staticSolidAssetFrames: string[] = [];
  private staticTerrainDecorFrames: string[] = [];
  private staticTerrainDecorPropFrames: string[] = [];
  private tileAssetPhases: string[] = [];
  private tileAssetOrigins: string[] = [];
  private laserAssetTransforms: string[] = [];
  private laserAssetPositions: string[] = [];
  private doorAssetTransforms: string[] = [];
  private coreSpriteFrames: string[] = [];
  private echoSensorAssetFrames: string[] = [];
  private launchPadSpriteFrames: string[] = [];
  private hazardVentSpriteFrames: string[] = [];
  private monsterSpriteFrames: string[] = [];
  private bossSpriteFrames: string[] = [];
  private bossEffectFrames: string[] = [];
  private staticSolidOutlineRects: string[] = [];
  private lastCameraSample = "";
  private lastCameraWorldView = "";
  private backgroundTextureFilter = "";
  private objectAtlasTextureFilter = "";
  private launchPadTextureFilter = "";
  private monsterAtlasTextureFilter = "";
  private bossAtlasTextureFilter = "";
  private terrainTextureFilter = "";
  private terrainDecorPropTextureFilter = "";
  private requiredCoreIds = new Set<string>();
  private diagnosticsEnabled = false;
  private lowChurnGraphics = false;
  private perfOverlayEnabled = false;
  private perfOverlay: HTMLElement | null = null;
  private perfSamples: Array<{ delta: number; update: number; render: number }> = [];
  private perfLastUpdate = 0;
  private readonly renderEchoes: ActorBody[] = [];
  private readonly renderView: RenderView = {
    player: null as unknown as ActorBody,
    echoes: this.renderEchoes,
    activePlates: new Set(),
    openDoors: new Set(),
    collectedCores: new Set(),
    blockedLasers: new Set(),
    crates: new Map(),
    killedMonsters: new Set(),
    bosses: [],
    exitUnlocked: true,
    bossCheckpointActive: false,
    bossCheckpointBossId: null,
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
  private backgroundImages: Phaser.GameObjects.TileSprite[] = [];
  private backgroundImageTint: number | null = null;
  private backgroundAmbienceRenderTick = -1;
  private texturePrewarmSprites: Phaser.GameObjects.Image[] = [];
  private cameraTarget?: Phaser.GameObjects.Zone;
  private playerCastUntil = 0;
  private deathPresentation: DeathPresentation | null = null;
  private retryPresentation: RetryPresentation | null = null;
  private introActive = false;
  private introElapsedMs = 0;
  private levelIntroOverlay: HTMLElement | null = null;
  private musicLoadingActive = false;
  private musicLoadingOverlay: HTMLElement | null = null;
  private musicLoadingTimer: number | null = null;
  private musicLoadingToken = 0;
  private lastTutorialHint = "";
  private readonly launchPadActiveUntil = new Map<string, number>();
  private readonly fxBursts: FxBurst[] = [];
  private fxBurstSerial = 0;
  private bossMusicActive = false;
  private bossMusicKey: ReturnType<typeof soundtrackForBoss>["key"] | null = null;
  private sceneCleanupRegistered = false;
  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.repeat) return;
    event.preventDefault();
    this.togglePause();
  };

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

  private get backgroundDetail(): Phaser.GameObjects.Graphics {
    if (!this._backgroundDetail) throw new Error("GameScene background detail graphics unavailable");
    return this._backgroundDetail;
  }

  private set backgroundDetail(backgroundDetail: Phaser.GameObjects.Graphics) {
    this._backgroundDetail = backgroundDetail;
  }

  private get world(): Phaser.GameObjects.Graphics {
    if (!this._world) throw new Error("GameScene world graphics unavailable");
    return this._world;
  }

  private set world(world: Phaser.GameObjects.Graphics) {
    this._world = world;
  }

  private get backgroundFx(): Phaser.GameObjects.Graphics {
    if (!this._backgroundFx) throw new Error("GameScene background FX graphics unavailable");
    return this._backgroundFx;
  }

  private set backgroundFx(backgroundFx: Phaser.GameObjects.Graphics) {
    this._backgroundFx = backgroundFx;
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

  init(data: GameSceneData): void {
    this.tutorialMode = data.tutorial === true;
    this.levelIndex = this.tutorialMode ? 0 : data.levelIndex || 0;
    this.level = this.tutorialMode ? tutorialLevel : getLevel(this.levelIndex);
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
    this.staticObjectAssetIds.clear();
    this.activeActorSpriteIds.clear();
    this.activeCoreSpriteIds.clear();
    this.staticSolidAssetFrames = [];
    this.tileAssetPhases = [];
    this.tileAssetOrigins = [];
    this.laserAssetTransforms = [];
    this.laserAssetPositions = [];
    this.doorAssetTransforms = [];
    this.coreSpriteFrames = [];
    this.echoSensorAssetFrames = [];
    this.launchPadSpriteFrames = [];
    this.hazardVentSpriteFrames = [];
    this.monsterSpriteFrames = [];
    this.bossSpriteFrames = [];
    this.staticSolidOutlineRects = [];
    this.lastCameraSample = "";
    this.lastCameraWorldView = "";
    this.backgroundTextureFilter = "";
    this.objectAtlasTextureFilter = "";
    this.launchPadTextureFilter = "";
    this.monsterAtlasTextureFilter = "";
    this.bossAtlasTextureFilter = "";
    this.terrainTextureFilter = "";
    this.terrainDecorPropTextureFilter = "";
    this.requiredCoreIds = doorRequiredCoreIds(this.level.doors || []);
    this.diagnosticsEnabled = this.shouldExposeRenderDiagnostics();
    this.lowChurnGraphics = this.shouldUseLowChurnGraphics();
    this.perfOverlayEnabled = this.shouldShowPerfOverlay();
    this.perfSamples = [];
    this.perfLastUpdate = 0;
    this.renderEchoes.length = 0;
    this.exitSprite = undefined;
    this.backgroundImages = [];
    this.backgroundImageTint = null;
    this.backgroundAmbienceRenderTick = -1;
    this.texturePrewarmSprites = [];
    this.cameraTarget = undefined;
    this.deathPresentation = null;
    this.retryPresentation = null;
    this.introActive = false;
    this.introElapsedMs = 0;
    this.levelIntroOverlay = null;
    this.musicLoadingActive = false;
    this.musicLoadingOverlay = null;
    this.musicLoadingTimer = null;
    this.musicLoadingToken = 0;
    this.lastTutorialHint = "";
    this.launchPadActiveUntil.clear();
    this.fxBursts.length = 0;
    this.fxBurstSerial = 0;
    this.bossMusicActive = false;
    this.bossMusicKey = null;
  }

  create(): void {
    this.syncDraftPlaytestUrl();
    const levelMusicKey = this.currentLevelSoundtrackKey();
    const levelMusicReady = audio.isMusicReady(levelMusicKey);
    audio.playMusic(levelMusicKey);
    const levelMusicWarmup = audio.preloadMusic(levelMusicKey);
    this.cameras.main.setBounds(this.level.bounds.x, this.level.bounds.y, this.level.bounds.w, this.level.bounds.h);
    this.cameras.main.setBackgroundColor("#05070d");
    this.configureCameraFrame();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.configureCameraFrame, this);
    this.createBackgroundImages();
    this.configureWorldTextureFilters();
    this.cameraTarget = this.add.zone(this.level.start.x, this.level.start.y, 1, 1);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.12, 0.08);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.recordCameraDiagnostics, this);
    this.backgroundFx = this.add.graphics().setDepth(-15);
    this.backgroundDetail = this.add.graphics().setDepth(-10);
    if (!this.lowChurnGraphics) this.drawBackgroundDetail();
    this.world = this.add.graphics().setDepth(0);
    this.structureOutlines = this.add.graphics().setDepth(2);
    this.fx = this.add.graphics().setDepth(30);
    this.syncStaticLevelAssets();
    this.keys = this.createKeys();
    window.addEventListener("keydown", this.handleWindowKeyDown);
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
    this.mountPerfOverlay();
    this.hud.toast(`${isDraftPlaytestActive() ? "Draft playtest · " : ""}${this.level.index + 1}: ${this.level.name}`);
    this.registerSceneCleanup();
    this.prewarmLevelTextures();
    this.preloadUpcomingSoundtracks();
    this.renderWorld();
    this.updateHud();
    this.startLevelWhenMusicReady(levelMusicKey, levelMusicReady, levelMusicWarmup);
  }

  update(_time: number, delta: number): void {
    const updateStart = performance.now();
    if (this.musicLoadingActive) {
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.updateHud();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }
    if (this.introActive) this.updateLevelIntro(delta);
    if (this.levelIntroBlocksGameplay()) {
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.updateHud();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }
    if (this.retryPresentation) {
      this.updateRetryPresentation(delta);
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.updateHud();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }
    this.handleHotkeys();
    if (this.retryPresentation) {
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.updateHud();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }
    if (this.deathPresentation) {
      this.updateDeathPresentation(delta);
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.updateHud();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }
    if (this.pausedByHud || this.completeHandled) {
      const updateMs = performance.now() - updateStart;
      const renderStart = performance.now();
      this.renderWorld();
      this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
      return;
    }

    this.accumulator += Math.min(delta, 80);
    while (this.accumulator >= STEP_MS) {
      const events = this.simulation.step(this.readInput());
      this.handleEvents(events);
      this.accumulator -= STEP_MS;
      if (this.completeHandled) break;
    }

    const updateMs = performance.now() - updateStart;
    const renderStart = performance.now();
    this.renderWorld();
    this.updateHud();
    this.recordPerfSample(delta, updateMs, performance.now() - renderStart);
  }

  private updateHud(): void {
    this.hud.update({
      levelNumber: this.tutorialMode ? null : this.level.index + 1,
      levelName: this.level.name,
      frames: this.simulation.totalFrames,
      score: this.simulation.score,
      lives: this.simulation.livesRemaining()
    });
    this.updateTutorialHint();
  }

  private currentLevelSoundtrackKey(): ReturnType<typeof soundtrackForLevel>["key"] {
    return soundtrackForLevel(this.level, this.levelIndex).key;
  }

  private preloadUpcomingSoundtracks(): void {
    for (const boss of this.level.bosses || []) void audio.preloadMusic(soundtrackForBoss(boss).key);
    if (!this.tutorialMode && this.levelIndex + 1 < levels.length) {
      const nextLevelIndex = this.levelIndex + 1;
      void audio.preloadMusic(soundtrackForLevel(levels[nextLevelIndex], nextLevelIndex).key);
    }
  }

  private restartLevelMusic(): void {
    this.bossMusicActive = false;
    this.bossMusicKey = null;
    audio.playMusic(this.currentLevelSoundtrackKey(), { restart: true, fadeMs: BOSS_MUSIC_FADE_MS });
  }

  private currentBossSoundtrackKey(bossId?: string | null): ReturnType<typeof soundtrackForBoss>["key"] {
    const boss = this.activeBossForMusic(bossId);
    return soundtrackForBoss(boss).key;
  }

  private activeBossForMusic(preferredBossId?: string | null): Boss | undefined {
    const snapshots = this.simulation.bossSnapshots().filter((boss) => boss.phase === "intro" || boss.phase === "active");
    const snapshot = (preferredBossId ? snapshots.find((boss) => boss.id === preferredBossId) : undefined) || snapshots[0];
    return snapshot ? (this.level.bosses || []).find((boss) => boss.id === snapshot.id) : undefined;
  }

  private startBossMusic(bossId?: string | null): void {
    const key = this.currentBossSoundtrackKey(bossId);
    const restart = !this.bossMusicActive || this.bossMusicKey !== key;
    this.bossMusicActive = true;
    this.bossMusicKey = key;
    audio.playMusic(key, { restart, fadeMs: BOSS_MUSIC_FADE_MS });
  }

  private bossFightInProgress(): boolean {
    return this.simulation.bossFightInProgress();
  }

  private startLevelWhenMusicReady(
    key: ReturnType<typeof soundtrackForLevel>["key"],
    ready: boolean,
    warmup: Promise<boolean>
  ): void {
    if (ready) {
      this.startLevelIntro();
      return;
    }

    this.hud.hideToast();
    this.musicLoadingActive = true;
    const token = ++this.musicLoadingToken;
    this.writeMusicLoadingDiagnostics("pending");
    this.musicLoadingTimer = window.setTimeout(() => {
      if (this.musicLoadingToken === token && this.musicLoadingActive) this.showMusicLoadingOverlay(key);
    }, MUSIC_LOADING_OVERLAY_DELAY_MS);

    void warmup.finally(() => {
      if (this.musicLoadingToken !== token || !this.musicLoadingActive) return;
      this.finishMusicLoading();
      this.startLevelIntro();
    });
  }

  private showMusicLoadingOverlay(key: ReturnType<typeof soundtrackForLevel>["key"]): void {
    if (this.musicLoadingOverlay) return;
    const overlay = document.createElement("div");
    overlay.className = "music-loading";
    overlay.dataset.musicLoading = key;
    overlay.innerHTML = `
      <section class="music-loading-panel" aria-label="Preparing level audio">
        <div class="music-loading-meter" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="music-loading-copy">
          <span class="music-loading-kicker">${this.tutorialMode ? "Training soundtrack" : `Room ${String(this.level.index + 1).padStart(2, "0")} soundtrack`}</span>
          <strong>Tuning audio</strong>
          <span>Synchronising soundtrack</span>
        </div>
      </section>
    `;
    uiRoot().append(overlay);
    this.musicLoadingOverlay = overlay;
    this.writeMusicLoadingDiagnostics("visible");
  }

  private finishMusicLoading(): void {
    this.musicLoadingActive = false;
    if (this.musicLoadingTimer !== null) {
      window.clearTimeout(this.musicLoadingTimer);
      this.musicLoadingTimer = null;
    }
    this.musicLoadingOverlay?.remove();
    this.musicLoadingOverlay = null;
    this.writeMusicLoadingDiagnostics("idle");
  }

  private cancelMusicLoading(): void {
    this.musicLoadingToken += 1;
    this.finishMusicLoading();
  }

  private writeMusicLoadingDiagnostics(phase: string): void {
    if (!this.diagnosticsEnabled || typeof document === "undefined") return;
    document.documentElement.dataset.echoShiftMusicLoading = phase;
  }

  private startLevelIntro(): void {
    this.finishLevelIntro();
    this.hud.hideToast();
    this.introActive = true;
    this.introElapsedMs = 0;
    const overlay = document.createElement("div");
    overlay.className = "level-intro";
    overlay.dataset.levelIntro = "active";
    overlay.innerHTML = `
      <div class="level-intro-track" aria-hidden="true">
        <img class="level-intro-track-logo" src="/assets/echo-shift-logo.png" alt="" />
      </div>
      <section class="level-intro-card" aria-label="Level start">
        <div class="level-intro-number">${this.tutorialMode ? "T" : this.level.index + 1}</div>
        <div class="level-intro-copy">
          <span class="level-intro-kicker">${this.tutorialMode ? "Training" : `Room ${String(this.level.index + 1).padStart(2, "0")}`}</span>
          <strong>${escapeHtml(this.level.name)}</strong>
          <span>${escapeHtml(this.level.subtitle)}</span>
        </div>
        <div class="level-intro-ready">Ready</div>
      </section>
      <div class="level-intro-sweep" aria-hidden="true">
        <img class="level-intro-sweep-logo" src="/assets/echo-shift-logo.png" alt="" />
      </div>
    `;
    uiRoot().append(overlay);
    this.levelIntroOverlay = overlay;
    this.writeLevelIntroDiagnostics("active");
  }

  private updateLevelIntro(delta: number): void {
    if (!this.introActive) return;
    this.introElapsedMs += Math.min(delta, 120);
    if (this.introElapsedMs >= LEVEL_INTRO_MS - LEVEL_INTRO_OUTRO_MS) {
      this.levelIntroOverlay?.classList.add("is-exiting");
      this.writeLevelIntroDiagnostics("exiting");
    }
    if (this.introElapsedMs < LEVEL_INTRO_MS) return;
    this.finishLevelIntro();
  }

  private finishLevelIntro(): void {
    this.introActive = false;
    this.introElapsedMs = 0;
    this.levelIntroOverlay?.remove();
    this.levelIntroOverlay = null;
    this.writeLevelIntroDiagnostics("idle");
  }

  private levelIntroBlocksGameplay(): boolean {
    return this.introActive && this.introElapsedMs < LEVEL_INTRO_MS - LEVEL_INTRO_OUTRO_MS;
  }

  private writeLevelIntroDiagnostics(phase: string): void {
    if (!this.diagnosticsEnabled || typeof document === "undefined") return;
    document.documentElement.dataset.echoShiftLevelIntro = phase;
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
      t: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T)
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
    if (this.deathPresentation) return;
    if (this.retryRequired) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.restartLevel();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.rewind();
    if (Phaser.Input.Keyboard.JustDown(this.keys.t)) this.retryAttempt();
  }

  private handleEvents(events: ReturnType<RoomSimulation["step"]>): void {
    if (events.jumped) audio.play("jump");
    if (events.launched) {
      audio.play("launch");
      if (events.launchPadId) this.launchPadActiveUntil.set(events.launchPadId, this.time.now + LAUNCH_PAD_ACTIVE_MS);
    }
    if (events.landed) audio.play("land");
    if (events.switched) audio.play("switch");
    if (events.cores.length > 0) {
      for (const core of events.cores) {
        audio.play(this.corePickupIsLarge(core.id) ? "bigCore" : "core");
      }
    }
    for (let index = 0; index < events.echoLaserVaporized; index += 1) audio.play("echoLaserVaporized");
    if (events.bossIntroStarted) {
      this.startBossMusic(events.bossIntroStarted);
      this.hud.toast(events.bossCheckpointActivated ? "Boss checkpoint anchored" : "Boss approaching");
    }
    for (const kill of events.monsterKills) {
      audio.play("core");
      this.addFxBurst(kill.x, kill.y, 0xffe35a, `+${kill.score}`);
    }
    if (events.bossHit) {
      if (!events.bossDefeated) audio.play("switch");
      this.cameras.main.shake(events.bossDefeated ? 260 : 130, events.bossDefeated ? 0.007 : 0.003);
      this.addFxBurst(
        events.bossHit.x,
        events.bossHit.y,
        0xffffff,
        events.bossDefeated ? `+${events.bossDefeated.score}` : `${events.bossHit.health}`
      );
    }
    if (events.bossDefeated) {
      if (this.activeBossForMusic()) this.startBossMusic();
      else if (!this.bossFightInProgress()) this.restartLevelMusic();
    }
    if (events.bossPortalUnlocked) {
      const exitCenter = rectCenter(this.level.exit);
      this.restartLevelMusic();
      audio.play("portal");
      this.addFxBurst(exitCenter.x, exitCenter.y, 0x43f7ff, "OPEN");
    } else if (events.bossDepartureFinished && !this.activeBossForMusic() && !this.bossFightInProgress()) {
      this.restartLevelMusic();
    }
    if (events.died) {
      this.startDeathPresentation(events.livesExhausted, events.playerLaserVaporized);
    }
    if (events.won) this.completeLevel();
  }

  private corePickupIsLarge(coreId: string): boolean {
    const core = (this.level.cores || []).find((item) => item.id === coreId);
    return core ? this.coreIsLarge(core) : false;
  }

  private addFxBurst(x: number, y: number, color: number, label?: string): void {
    this.fxBursts.push({
      id: this.fxBurstSerial,
      x,
      y,
      color,
      label,
      startedAt: this.time.now,
      durationMs: 620
    });
    this.fxBurstSerial += 1;
  }

  private startDeathPresentation(livesExhausted: boolean, playerLaserVaporized: boolean): void {
    if (this.deathPresentation) return;
    audio.play(playerLaserVaporized ? "playerLaserVaporized" : "death");
    this.cameras.main.shake(180, 0.006);
    const player = this.simulation.player;
    this.deathPresentation = {
      actor: {
        ...player,
        vy: DEATH_BOUNCE_SPEED,
        vx: player.vx * 0.35,
        onGround: false,
        coyote: 0,
        jumpBuffer: 0,
        standingOn: null,
        alive: false
      },
      elapsedMs: 0,
      livesExhausted,
      fadeStarted: false
    };
    this.playerCastUntil = 0;
    this.virtualInput = { left: false, right: false, jump: false };
    if (!livesExhausted) {
      const lives = this.simulation.livesRemaining();
      this.hud.toast(lives === null ? "Signal lost. Retrying." : `Signal lost. ${lives} lives left.`);
    }
    this.writeDeathPresentationDiagnostics("fall");
  }

  private updateDeathPresentation(delta: number): void {
    const presentation = this.deathPresentation;
    if (!presentation) return;
    const stepMs = Math.min(delta, 80);
    const frameScale = stepMs / STEP_MS;
    presentation.elapsedMs += stepMs;
    presentation.actor.x += presentation.actor.vx * frameScale;
    presentation.actor.y += presentation.actor.vy * frameScale;
    presentation.actor.vy += DEATH_FALL_GRAVITY * frameScale;

    if (!presentation.fadeStarted && presentation.elapsedMs >= DEATH_FALL_MS) {
      presentation.fadeStarted = true;
      this.cameras.main.fadeOut(DEATH_FADE_OUT_MS, 5, 7, 13);
      this.writeDeathPresentationDiagnostics("fade-out");
    }

    if (presentation.elapsedMs < DEATH_FALL_MS + DEATH_FADE_OUT_MS) return;
    this.finishDeathPresentation(presentation);
  }

  private finishDeathPresentation(presentation: DeathPresentation): void {
    if (presentation.livesExhausted) {
      this.pausedByHud = true;
      this.retryRequired = true;
      this.deathPresentation = null;
      this.hud.showRetryRequired(this.level.name);
      this.writeDeathPresentationDiagnostics("retry-required");
      return;
    }

    this.simulation.resetLifeAttempt();
    this.accumulator = 0;
    this.pausedByHud = false;
    this.deathPresentation = null;
    this.echoTrails.clear();
    this.launchPadActiveUntil.clear();
    this.playerCastUntil = 0;
    this.cameraTarget?.setPosition(this.simulation.player.x + this.simulation.player.w / 2, this.simulation.player.y + this.simulation.player.h / 2);
    if (this.bossFightInProgress()) {
      this.startBossMusic(this.simulation.bossCheckpointBossId());
    } else {
      this.restartLevelMusic();
    }
    this.cameras.main.fadeIn(DEATH_FADE_IN_MS, 5, 7, 13);
    this.startLevelIntro();
    this.hud.hideModal();
    this.writeDeathPresentationDiagnostics("respawn");
  }

  private writeDeathPresentationDiagnostics(phase: string): void {
    if (!this.diagnosticsEnabled || typeof document === "undefined") return;
    document.documentElement.dataset.echoShiftDeathPresentation = phase;
  }

  private rewind(): void {
    if (this.levelIntroBlocksGameplay() || this.retryPresentation || this.deathPresentation || this.completeHandled || this.pausedByHud || this.retryRequired) return;
    if (this.bossFightInProgress()) {
      this.hud.toast("Rewind locked during boss fights");
      return;
    }
    const added = this.simulation.rewindToEcho();
    audio.play("rewind");
    this.playerCastUntil = this.time.now + 360;
    this.hud.scan();
    this.cameras.main.flash(220, 67, 247, 255, false);
    this.echoTrails.clear();
    if (this.bossMusicActive) this.restartLevelMusic();
    this.hud.toast(added ? `Echo ${this.simulation.echoRecordings.length} anchored` : "Attempt reset");
  }

  private retryAttempt(): void {
    if (this.levelIntroBlocksGameplay() || this.retryPresentation || this.deathPresentation || this.completeHandled || this.pausedByHud || this.retryRequired) return;
    this.startRetryPresentation();
    audio.play("select");
  }

  private startRetryPresentation(): void {
    this.finishLevelIntro();
    this.retryPresentation = { elapsedMs: 0 };
    this.virtualInput = { left: false, right: false, jump: false };
    this.hud.hideToast();
    this.cameras.main.fadeOut(DEATH_FADE_OUT_MS, 5, 7, 13);
  }

  private updateRetryPresentation(delta: number): void {
    const presentation = this.retryPresentation;
    if (!presentation) return;
    presentation.elapsedMs += Math.min(delta, 80);
    if (presentation.elapsedMs < DEATH_FADE_OUT_MS) return;
    this.finishRetryPresentation();
  }

  private finishRetryPresentation(): void {
    if (!this.retryPresentation) return;
    this.retryPresentation = null;
    this.simulation.resetLevel();
    this.accumulator = 0;
    this.completeHandled = false;
    this.pausedByHud = false;
    this.retryRequired = false;
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.launchPadActiveUntil.clear();
    this.restartLevelMusic();
    this.cameraTarget?.setPosition(this.level.start.x + this.simulation.player.w / 2, this.level.start.y + this.simulation.player.h / 2);
    this.cameras.main.fadeIn(DEATH_FADE_IN_MS, 5, 7, 13);
    this.startLevelIntro();
  }

  private restartLevel(): void {
    this.completeHandled = false;
    this.pausedByHud = false;
    this.retryRequired = false;
    this.deathPresentation = null;
    this.virtualInput = { left: false, right: false, jump: false };
    this.restartLevelMusic();
    this.cameras.main.fadeIn(DEATH_FADE_IN_MS, 5, 7, 13);
    this.simulation.resetLevel();
    this.playerCastUntil = 0;
    this.echoTrails.clear();
    this.launchPadActiveUntil.clear();
    this.startLevelIntro();
    this.hud.hideModal();
  }

  private togglePause(force?: boolean): void {
    if (this.retryPresentation || this.deathPresentation || this.completeHandled || this.retryRequired) return;
    if (this.musicLoadingActive) return;
    if (this.introActive) this.finishLevelIntro();
    this.pausedByHud = force ?? !this.pausedByHud;
    if (this.pausedByHud) {
      this.lastTutorialHint = "";
      this.hud.setTutorialHint(null);
      this.hud.showPause(this.level.name);
      audio.pauseMusic();
    } else {
      this.hud.hideModal();
      audio.resumeMusic();
      this.updateTutorialHint();
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
    if (!this.tutorialMode && !isDraftPlaytestActive()) recordLevelScore(score, this.level.index);
    this.cameras.main.flash(280, 255, 227, 90, false);
    if (this.tutorialMode) this.hud.showTutorialComplete(score);
    else this.hud.showComplete(score, this.levelIndex === levels.length - 1);
  }

  private nextLevel(): void {
    if (this.tutorialMode) {
      this.openTitle();
      return;
    }
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
    if (this.tutorialMode || !isDraftPlaytestActive()) return;
    const url = new URL(window.location.href);
    const nextLevel = String(this.levelIndex);
    if (url.searchParams.get("level") === nextLevel) return;
    url.searchParams.set("playtestDraft", "1");
    url.searchParams.set("level", nextLevel);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  private updateTutorialHint(): void {
    if (!this.tutorialMode) return;

    let message = "";
    if (!this.musicLoadingActive && !this.introActive && !this.completeHandled && !this.retryRequired && !this.deathPresentation) {
      const snapshot = this.simulation.snapshot();
      const playerCenterX = snapshot.player.x + snapshot.player.w / 2;
      if (snapshot.echoes.length === 0) {
        if (playerCenterX < 300) message = "Move with A / D or the arrow keys.";
        else if (playerCenterX < 560) message = "Jump with W, Up, or Space to cross the gap.";
        else if (playerCenterX < 1220 && !snapshot.activePlates.has("tutorial-plate")) message = "Stand on the plate near the gate.";
        else if (playerCenterX < 1220)
          message = "Press R to rewind. The replay becomes an echo that can hold the plate.";
        else if (playerCenterX < 2050) message = "Push crates onto plates. Crates keep doors open while you move ahead.";
        else if (playerCenterX < 2700) message = "Timed switches stay active briefly. Step on one, then move before the door closes.";
        else if (playerCenterX < 3260) message = "Small cores add score. Large cores marked as keys can unlock core doors.";
        else if (playerCenterX < 3740) message = "Timed laser switches disable beam gates briefly. Move as soon as the beam drops.";
        else if (playerCenterX < 4140) message = "The same timer quiets the moving beam. Cross before the laser returns.";
        else if (playerCenterX < 4480) message = "Moving platforms are one-way. Land on top and ride them across gaps.";
        else if (playerCenterX < 5020) message = "Drones are hazards, but plates can power them down. Crates can hold those plates too.";
        else message = "Avoid spark traps and reach the exit portal to finish the tutorial.";
      } else if (!snapshot.openDoors.has("tutorial-gate")) {
        message = "Let the echo reach the plate, then start moving when the gate opens.";
      } else if (playerCenterX < 1180) {
        message = "Your echo is holding the plate. Move through the open gate.";
      } else if (playerCenterX < 2050) {
        message = "Crates count as weight. Push one onto the next plate to open the crate gate.";
      } else if (playerCenterX < 2700) {
        message = "Timed switches do not need constant weight, but the timer runs down.";
      } else if (playerCenterX < 3260) {
        message = "Collect the large core before the core-locked door.";
      } else if (playerCenterX < 3740) {
        message = "The laser switch is temporary. Cross while the beam gate is disabled.";
      } else if (playerCenterX < 4140) {
        message = "Cross the moving beam while the timer is still holding it quiet.";
      } else if (playerCenterX < 4480) {
        message = "Ride the moving platform from above; it will not catch you from below.";
      } else if (playerCenterX < 5020) {
        message = "Use the crate plate to disable the drone before crossing its patrol.";
      } else {
        message = "Reach the exit portal to finish the tutorial.";
      }
    }

    if (message === this.lastTutorialHint) return;
    this.lastTutorialHint = message;
    this.hud.setTutorialHint(message || null);
  }

  private configureCameraFrame = (): void => {
    const camera = this.cameras.main;
    camera.setZoom(this.baseCameraZoom());
    camera.setRoundPixels(true);
    camera.setDeadzone(
      Math.min(340, Math.max(190, this.scale.width * 0.24)),
      Math.min(170, Math.max(96, this.scale.height * 0.2))
    );
    this.recordCameraDiagnostics();
  };

  private baseCameraZoom(): number {
    return Math.max(0.1, (this.scale.height / PLAYER_CAMERA_REFERENCE_HEIGHT) * PLAYER_CAMERA_ZOOM);
  }

  private bossArenaCameraZoom(arena: Rect): number {
    const paddedWidth = Math.max(1, arena.w + 96);
    const paddedHeight = Math.max(1, arena.h + 80);
    const fitZoom = Math.min(this.scale.width / paddedWidth, this.scale.height / paddedHeight) * BOSS_ARENA_CAMERA_ZOOM;
    return Math.max(0.1, Math.min(this.baseCameraZoom(), fitZoom));
  }

  private recordCameraDiagnostics = (): void => {
    const camera = this.cameras.main;
    if (this.diagnosticsEnabled) {
      this.lastCameraSample = `${camera.zoom.toFixed(4)}:${camera.scrollX.toFixed(2)},${camera.scrollY.toFixed(2)}`;
      const width = Math.floor(camera.width / Math.max(0.01, camera.zoomX) + 0.5);
      const height = Math.floor(camera.height / Math.max(0.01, camera.zoomY) + 0.5);
      const x = Math.floor(camera.scrollX + camera.width * camera.originX - width / 2 + 0.5);
      const y = Math.floor(camera.scrollY + camera.height * camera.originY - height / 2 + 0.5);
      this.lastCameraWorldView = `${x.toFixed(2)},${y.toFixed(2)},${width.toFixed(2)},${height.toFixed(2)}`;
      this.writeCameraDiagnostics();
    }
  };

  private writeCameraDiagnostics(): void {
    if (!this.diagnosticsEnabled) return;
    document.documentElement.dataset.echoShiftCameraSample = this.lastCameraSample;
    document.documentElement.dataset.echoShiftCameraSnap = this.lastCameraSample;
    document.documentElement.dataset.echoShiftCameraWorldView = this.lastCameraWorldView;
  }

  private registerSceneCleanup(): void {
    if (this.sceneCleanupRegistered) return;
    this.sceneCleanupRegistered = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownScene);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdownScene);
  }

  private shutdownScene = (): void => {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdownScene);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdownScene);
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.recordCameraDiagnostics, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.configureCameraFrame, this);
    window.removeEventListener("keydown", this.handleWindowKeyDown);
    this.sceneCleanupRegistered = false;
    this.destroyTexturePrewarmSprites();
    this.perfOverlay?.remove();
    this.perfOverlay = null;
    this._hud?.destroy();
    this._hud = null;
    this._simulation = null;
    this._keys = null;
    this._backgroundDetail = null;
    this._world = null;
    this._backgroundFx = null;
    this._structureOutlines = null;
    this._fx = null;
    this.echoTrails.clear();
    this.actorSprites.clear();
    this.coreSprites.clear();
    this.objectAssets.clear();
    this.activeObjectAssetIds.clear();
    this.staticObjectAssetIds.clear();
    this.activeActorSpriteIds.clear();
    this.activeCoreSpriteIds.clear();
    this.staticSolidAssetFrames = [];
    this.tileAssetPhases = [];
    this.tileAssetOrigins = [];
    this.laserAssetTransforms = [];
    this.laserAssetPositions = [];
    this.doorAssetTransforms = [];
    this.coreSpriteFrames = [];
    this.echoSensorAssetFrames = [];
    this.launchPadSpriteFrames = [];
    this.hazardVentSpriteFrames = [];
    this.monsterSpriteFrames = [];
    this.bossSpriteFrames = [];
    this.staticSolidOutlineRects = [];
    this.lastCameraSample = "";
    this.lastCameraWorldView = "";
    this.backgroundTextureFilter = "";
    this.objectAtlasTextureFilter = "";
    this.launchPadTextureFilter = "";
    this.monsterAtlasTextureFilter = "";
    this.bossAtlasTextureFilter = "";
    this.requiredCoreIds = new Set();
    this.perfSamples = [];
    this.perfLastUpdate = 0;
    this.renderEchoes.length = 0;
    this.exitSprite = undefined;
    this.backgroundImages = [];
    this.backgroundImageTint = null;
    this.backgroundAmbienceRenderTick = -1;
    this.texturePrewarmSprites = [];
    this.cameraTarget = undefined;
    this.deathPresentation = null;
    this.retryPresentation = null;
    this.cancelMusicLoading();
    this.finishLevelIntro();
    this.launchPadActiveUntil.clear();
    this.fxBursts.length = 0;
    this.fxBurstSerial = 0;
    this.fxBursts.length = 0;
    this.bossMusicActive = false;
    this.bossMusicKey = null;
  };

  private renderWorld(): void {
    const snapshot = this.liveRenderView();
    if (!this.deathPresentation) {
      const introBoss = snapshot.bosses.find((boss) => boss.phase === "intro");
      if (introBoss) {
        const boss = (this.level.bosses || []).find((item) => item.id === introBoss.id);
        const arena = boss || introBoss.body;
        const focus = rectCenter(arena);
        this.cameras.main.setZoom(this.bossArenaCameraZoom(arena));
        this.cameraTarget?.setPosition(focus.x, focus.y);
        this.cameras.main.centerOn(focus.x, focus.y);
      } else {
        const cameraBoss = selectBossCameraFocus(snapshot.bosses);
        if (cameraBoss) {
          const boss = (this.level.bosses || []).find((item) => item.id === cameraBoss.id);
          const arena = boss || cameraBoss.body;
          const focus = rectCenter(arena);
          this.cameras.main.setZoom(this.bossArenaCameraZoom(arena));
          this.cameraTarget?.setPosition(focus.x, focus.y);
          this.cameras.main.centerOn(focus.x, focus.y);
        } else {
          this.cameras.main.setZoom(this.baseCameraZoom());
          this.cameraTarget?.setPosition(snapshot.player.x + snapshot.player.w / 2, snapshot.player.y + snapshot.player.h / 2);
        }
      }
    }
    this.beginObjectAssetSync();
    this.world.clear();
    this.structureOutlines.clear();
    this.fx.clear();
    if (!this.lowChurnGraphics) this.syncBackgroundAmbience(snapshot.tick);
    this.drawConveyors();
    this.drawPlatforms(snapshot.tick);
    this.drawHazards();
    this.drawCrates(snapshot.crates);
    this.drawDoors(snapshot.openDoors);
    this.drawPlates(snapshot.activePlates);
    this.drawLaunchPads();
    this.drawTimedSwitches(snapshot.activePlates);
    this.drawEchoSensors(snapshot.activePlates);
    this.drawCores(snapshot.collectedCores);
    this.drawLasers(snapshot.activePlates, snapshot.blockedLasers);
    this.drawMovingLasers(snapshot.tick, snapshot.activePlates, snapshot.blockedLasers);
    this.drawDrones(snapshot.tick, snapshot.activePlates);
    this.drawMonsters(snapshot.tick, snapshot.killedMonsters);
    this.drawBosses(snapshot.bosses);
    if (snapshot.exitUnlocked) this.drawExit(this.level.exit, snapshot.won);
    this.drawEchoes(snapshot.echoes);
    this.drawActor(snapshot.player, snapshot.dead ? 0xff4f8b : 0x43f7ff, 1);
    this.drawFxBursts();
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
    view.player = this.deathPresentation?.actor || simulation.player;
    view.activePlates = objectState.activePlates;
    view.openDoors = objectState.openDoors;
    view.collectedCores = objectState.collectedCores;
    view.blockedLasers = objectState.blockedLasers;
    view.crates = objectState.crates;
    view.killedMonsters = simulation.killedMonsterIds;
    view.bosses = simulation.bossSnapshots();
    view.exitUnlocked = simulation.exitUnlocked();
    view.bossCheckpointActive = simulation.bossCheckpointActive();
    view.bossCheckpointBossId = simulation.bossCheckpointBossId();
    view.tick = simulation.tick;
    view.totalFrames = simulation.totalFrames;
    view.score = simulation.score;
    view.deaths = simulation.deaths;
    view.livesRemaining = simulation.livesRemaining();
    view.dead = simulation.dead || Boolean(this.deathPresentation);
    view.won = simulation.won;
    return view;
  }

  private drawBackgroundDetail(): void {
    const layer = this.backgroundDetail;
    const bounds = this.level.bounds;
    const floorTop = bounds.y + bounds.h - 40;
    const hasImageBackground = this.backgroundImages.length > 0;
    layer.clear();
    layer.fillStyle(0x05070d, hasImageBackground ? 0.26 : 1);
    layer.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    if (!hasImageBackground) {
      layer.fillStyle(0x081322, 0.92);
      layer.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

      for (let x = bounds.x + 42; x < bounds.x + bounds.w; x += 660) {
        layer.fillStyle(0x0f1830, 0.64);
        layer.fillRect(x, bounds.y + 90, 188, 300);
        layer.fillRect(x + 410, bounds.y + 70, 174, 330);
      }
    }

    layer.lineStyle(1, 0x43f7ff, 0.2);
    for (let x = bounds.x + 56; x < bounds.x + bounds.w; x += 660) {
      for (let y = bounds.y + 112; y <= bounds.y + 360; y += 38) {
        layer.lineBetween(x, y, x + 160, y + 10);
        layer.lineBetween(x + 662, y + 8, x + 810, y - 8);
      }
    }

    layer.lineStyle(1, 0x123246, 0.36);
    for (let x = bounds.x; x <= bounds.x + bounds.w; x += 40) {
      layer.lineBetween(x, bounds.y, x, bounds.y + bounds.h);
    }
    for (let y = bounds.y + 20; y <= bounds.y + bounds.h; y += 40) {
      layer.lineBetween(bounds.x, y, bounds.x + bounds.w, y);
    }

    layer.lineStyle(1, 0x5d2f83, 0.22);
    for (let x = bounds.x - 120; x < bounds.x + bounds.w; x += 120) {
      layer.lineBetween(x, bounds.y + bounds.h, x + 300, bounds.y);
    }

    layer.fillStyle(0x09111d, 0.86);
    layer.fillRect(bounds.x, floorTop, bounds.w, 40);
    layer.fillStyle(0x43f7ff, 0.14);
    for (let x = bounds.x + 330; x < bounds.x + bounds.w; x += 720) {
      layer.fillRect(x, floorTop + 7, 310, 4);
    }
    layer.fillStyle(0xbd5cff, 0.12);
    for (let x = bounds.x + 76; x < bounds.x + bounds.w; x += 560) {
      layer.fillRect(x, floorTop + 8, 150, 3);
    }
  }

  private syncBackgroundAmbience(tick: number): void {
    const ambience = backgroundAmbienceForLevel(this.level);
    this.syncBackgroundImageAmbience(tick, ambience);
    if (!backgroundAmbienceIsActive(ambience)) {
      if (this.backgroundAmbienceRenderTick !== -1) this.backgroundFx.clear();
      this.backgroundAmbienceRenderTick = -1;
      return;
    }
    if (this.backgroundAmbienceRenderTick === tick) return;
    if (tick !== 0 && tick % BACKGROUND_AMBIENCE_REDRAW_FRAMES !== 0) return;
    this.drawBackgroundAmbience(this.level.bounds, tick, ambience);
    this.backgroundAmbienceRenderTick = tick;
  }

  private drawBackgroundAmbience(bounds: Rect, tick: number, ambience: NormalizedBackgroundAmbience): void {
    if (!backgroundAmbienceIsActive(ambience)) return;
    const layer = this.backgroundFx;
    layer.clear();
    const color = Number.parseInt(ambience.color.slice(1), 16);
    const intensity = ambience.intensity;
    const drift = ambience.drift;
    const flicker = ambience.flicker;
    const particles = ambience.particles;
    const upperY = bounds.y + bounds.h * 0.08;
    const lowerY = bounds.y + bounds.h * 0.66;
    const activeHeight = lowerY - upperY;
    const shimmer = 0.55 + Math.sin(this.time.now / (520 - flicker * 260)) * 0.45;
    const scanOffset = Math.round(((tick * (0.22 + drift * 1.2)) % 360) - 360);

    layer.fillStyle(color, 0.04 + intensity * 0.11);
    for (let x = bounds.x + scanOffset; x < bounds.x + bounds.w + 360; x += 360) {
      layer.fillRect(x, upperY, 18 + drift * 30, activeHeight);
      layer.fillRect(x + 130, upperY + activeHeight * 0.12, 3 + drift * 12, activeHeight * 0.64);
    }

    layer.lineStyle(1, color, (0.14 + shimmer * 0.2) * intensity);
    for (let x = bounds.x + 96 + Math.round(scanOffset * 0.35); x < bounds.x + bounds.w + 240; x += 520) {
      const y = Math.round(upperY + 32 + ((x - bounds.x) % 170));
      layer.lineBetween(x, y, x + 190, y + 8);
      layer.lineBetween(x + 260, y + 76, x + 420, y + 62);
    }

    const particleCount = Math.round((bounds.w / 280) * particles * intensity);
    layer.fillStyle(color, 0.22 * intensity);
    for (let index = 0; index < particleCount; index += 1) {
      const seed = index * 97;
      const x = Math.round(bounds.x + ((seed * 53 + tick * (0.32 + drift)) % Math.max(1, bounds.w)));
      const y = Math.round(upperY + ((seed * 29 + tick * 0.12) % Math.max(1, activeHeight * 0.9)));
      const alpha = (0.08 + 0.24 * (0.5 + Math.sin((tick + seed) / 38) * 0.5)) * intensity;
      layer.fillStyle(color, alpha);
      layer.fillCircle(x, y, 1.7 + ((seed % 3) * 0.55));
    }
  }

  private syncBackgroundImageAmbience(tick: number, ambience: NormalizedBackgroundAmbience): void {
    const active = backgroundAmbienceIsActive(ambience);
    const flickerPeriod = 80 - ambience.flicker * 46;
    const shimmer = active ? 0.5 + Math.sin(tick / Math.max(18, flickerPeriod)) * 0.5 : 0;
    const driftX = active ? Math.sin(tick / 180) * 7 * ambience.drift * ambience.intensity : 0;
    const driftY = active ? Math.sin(tick / 260 + 1.4) * 2.5 * ambience.drift * ambience.intensity : 0;
    const alpha = active ? 0.78 + shimmer * 0.09 * ambience.intensity : 0.78;
    const tint = active && ambience.intensity >= 0.28 ? Number.parseInt(ambience.color.slice(1), 16) : null;

    if (this.backgroundImageTint !== tint) {
      for (const image of this.backgroundImages) {
        if (tint === null) image.clearTint();
        else image.setTint(tint);
      }
      this.backgroundImageTint = tint;
    }

    for (const image of this.backgroundImages) {
      image.setTilePosition(
        Math.round(-driftX / Math.max(0.01, image.tileScaleX)),
        Math.round(-driftY / Math.max(0.01, image.tileScaleY))
      );
      image.setAlpha(alpha);
    }
  }

  private createBackgroundImages(): void {
    const background = backgroundForLevel(this.level, this.levelIndex);
    const bounds = this.level.bounds;
    const scale = Math.max(bounds.h / background.sourceSize.h, 0.01);
    const startX = bounds.x - BACKGROUND_DRIFT_PADDING;
    const texture = this.textures.get(background.key);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.backgroundTextureFilter = `${background.key}:${Phaser.Textures.FilterMode.LINEAR}`;
    const image = this.add
      .tileSprite(startX, bounds.y, bounds.w + BACKGROUND_DRIFT_PADDING * 2, bounds.h, background.key)
      .setOrigin(0, 0)
      .setDepth(-20)
      .setAlpha(0.78)
      .setTileScale(scale, scale);
    this.backgroundImages.push(image);

    if (import.meta.env.DEV) {
      document.documentElement.dataset.echoShiftBackgroundKey = background.key;
      document.documentElement.dataset.echoShiftBackgroundPieces = String(this.backgroundImages.length);
      document.documentElement.dataset.echoShiftBackgroundAmbience = JSON.stringify(backgroundAmbienceForLevel(this.level));
    }
  }

  private configureWorldTextureFilters(): void {
    if (this.textures.exists(OBJECT_ATLAS_KEY)) {
      this.textures.get(OBJECT_ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.objectAtlasTextureFilter = `${OBJECT_ATLAS_KEY}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
    if (this.textures.exists(LAUNCH_PAD_KEY)) {
      this.textures.get(LAUNCH_PAD_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.launchPadTextureFilter = `${LAUNCH_PAD_KEY}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
    if (this.textures.exists(HAZARD_VENT_KEY)) {
      this.textures.get(HAZARD_VENT_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (this.textures.exists(MONSTER_ATLAS_KEY)) {
      this.textures.get(MONSTER_ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.monsterAtlasTextureFilter = `${MONSTER_ATLAS_KEY}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
    if (this.textures.exists(BOSS_ATLAS_KEY)) {
      this.textures.get(BOSS_ATLAS_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.bossAtlasTextureFilter = `${BOSS_ATLAS_KEY}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
    if (this.textures.exists(STORM_BOSS_CLEAN_KEY)) {
      this.textures.get(STORM_BOSS_CLEAN_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (this.textures.exists(CRYO_BOSS_CLEAN_KEY)) {
      this.textures.get(CRYO_BOSS_CLEAN_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (this.textures.exists(TERRAIN_TILE_KEY)) {
      this.textures.get(TERRAIN_TILE_KEY).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.terrainTextureFilter = `${TERRAIN_TILE_KEY}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
    const loadedDecorPropKeys = gardenTerrainDecorProps.map(terrainDecorPropTextureKey).filter((key) => this.textures.exists(key));
    for (const textureKey of loadedDecorPropKeys) {
      this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (loadedDecorPropKeys.length > 0) {
      this.terrainDecorPropTextureFilter = `terrain-decor-props:${loadedDecorPropKeys.length}:${Phaser.Textures.FilterMode.LINEAR}`;
    }
  }

  private syncStaticLevelAssets(): void {
    this.staticObjectAssetIds.clear();
    this.staticSolidAssetFrames = [];
    this.staticTerrainDecorFrames = [];
    this.staticTerrainDecorPropFrames = [];
    this.staticSolidOutlineRects = [];
    this.structureOutlines.clear();
    this.syncStaticSolids();
    this.syncStaticOneWayPlatforms();
    this.syncStaticHazards();
  }

  private syncStaticSolids(): void {
    for (const solid of this.level.solids) {
      const frame = this.solidFrame(solid);
      const material = terrainMaterialForSolid(solid);
      const depth = solidRenderDepth(solid);
      const tileIds = this.syncStaticSolidAsset(solid, frame, material, depth);
      const surfaceIds = this.syncStaticSolidSurfaceAssets(solid, material, depth);
      const propIds = this.syncStaticTerrainDecorProps(solid, material, depth);
      this.staticSolidAssetFrames.push(`${solid.id}:${frame}:${material}:${tileIds.length}:${solidCollisionFor(solid)}:${depth.toFixed(3)}`);
      for (const tileId of tileIds) this.markStaticObjectAsset(tileId);
      for (const surfaceId of surfaceIds) this.markStaticObjectAsset(surfaceId);
      for (const propId of propIds) this.markStaticObjectAsset(propId);
      this.drawSolidReadabilityOutline(solid);
    }
  }

  private syncStaticSolidAsset(solid: Solid, frame: number, material: TerrainMaterial, depth: number): string[] {
    if (solid.w <= 0 || solid.h <= 0) return [];
    if (!this.textures.exists(TERRAIN_TILE_KEY)) {
      this.syncFallbackSolidAsset(solid, frame, depth);
      return [`solid:${solid.id}`];
    }

    const ids: string[] = [];
    const columns = Math.max(1, Math.ceil(solid.w / TERRAIN_TILE_SIZE));
    const rows = Math.max(1, Math.ceil(solid.h / TERRAIN_TILE_SIZE));
    for (let row = 0; row < rows; row += 1) {
      const tileY = solid.y + row * TERRAIN_TILE_SIZE;
      const tileH = Math.min(TERRAIN_TILE_SIZE, solid.y + solid.h - tileY);
      if (tileH <= 0) continue;
      for (let column = 0; column < columns; column += 1) {
        const tileX = solid.x + column * TERRAIN_TILE_SIZE;
        const tileW = Math.min(TERRAIN_TILE_SIZE, solid.x + solid.w - tileX);
        if (tileW <= 0) continue;
        const role = this.terrainTileRole(frame, row);
        const tileFrame = terrainTileFrame(material, role, this.terrainTileVariant(solid, material, role, row, column));
        const id = `solid:${solid.id}:tile:${row}:${column}`;
        this.syncTerrainTileAsset(id, tileFrame, tileX, tileY, tileW, tileH, depth);
        ids.push(id);
      }
    }
    return ids;
  }

  private syncStaticSolidSurfaceAssets(solid: Solid, material: TerrainMaterial, depth: number): string[] {
    if (!this.textures.exists(TERRAIN_TILE_KEY) || solid.w <= 0 || solid.h <= 0) return [];
    const ids: string[] = [];
    const topSegments = this.solidSurfaceTopSegments(solid);
    for (let segmentIndex = 0; segmentIndex < topSegments.length; segmentIndex += 1) {
      const segment = topSegments[segmentIndex];
      const startColumn = Math.max(0, Math.floor((segment.from - solid.x) / TERRAIN_TILE_SIZE));
      const endColumn = Math.max(startColumn, Math.ceil((segment.to - solid.x) / TERRAIN_TILE_SIZE) - 1);
      const segmentWidth = segment.to - segment.from;
      for (let column = startColumn; column <= endColumn; column += 1) {
        const tileX = solid.x + column * TERRAIN_TILE_SIZE;
        const from = Math.max(segment.from, tileX);
        const to = Math.min(segment.to, tileX + TERRAIN_TILE_SIZE, solid.x + solid.w);
        const width = to - from;
        if (width <= 4) continue;

        const capVariant = this.terrainTileVariant(solid, material, "surfaceCap", segmentIndex, column);
        const capId = `solid:${solid.id}:surface:${segmentIndex}:${column}`;
        this.syncTerrainTileAsset(
          capId,
          terrainTileFrame(material, "surfaceCap", capVariant),
          from,
          solid.y - TERRAIN_SURFACE_CAP_OVERLAP,
          width,
          TERRAIN_TILE_SIZE,
          depth + 0.12
        );
        ids.push(capId);
        if (this.diagnosticsEnabled) {
          this.staticTerrainDecorFrames.push(
            `${capId}:cap:${material}:${capVariant}:${Math.round(from)},${Math.round(solid.y - TERRAIN_SURFACE_CAP_OVERLAP)}:${Math.round(width)}x${TERRAIN_TILE_SIZE}`
          );
        }

        if (!this.shouldPlaceTerrainDecor(solid, segmentWidth, column)) continue;
        if (Math.abs(from - tileX) > 0.01 || width < TERRAIN_TILE_SIZE - 0.01) continue;
        const decorRect = {
          x: from,
          y: solid.y - TERRAIN_TILE_SIZE,
          w: width,
          h: TERRAIN_TILE_SIZE
        };
        if (decorRect.w <= 12 || !this.terrainDecorHasClearance(solid, decorRect)) continue;
        const decorVariant = this.terrainTileVariant(solid, material, "surfaceDecor", segmentIndex, column);
        const decorId = `solid:${solid.id}:decor:${segmentIndex}:${column}`;
        this.syncTerrainTileAsset(
          decorId,
          terrainTileFrame(material, "surfaceDecor", decorVariant),
          decorRect.x,
          decorRect.y,
          decorRect.w,
          decorRect.h,
          depth + 0.16
        );
        ids.push(decorId);
        if (this.diagnosticsEnabled) {
          this.staticTerrainDecorFrames.push(
            `${decorId}:decor:${material}:${decorVariant}:${Math.round(decorRect.x)},${Math.round(decorRect.y)}:${Math.round(decorRect.w)}x${Math.round(decorRect.h)}`
          );
        }
      }
    }
    return ids;
  }

  private syncStaticTerrainDecorProps(solid: Solid, material: TerrainMaterial, depth: number): string[] {
    if (solid.w <= 0 || solid.h <= 0) return [];
    if (solidCollisionFor(solid) === "top-only") return [];
    const density = this.activeTerrainDecorDensity(effectiveSolidDecorDensity(solid, material));
    if (!density) return [];
    const props = terrainDecorPropsForMaterial(material).filter((prop) => this.textures.exists(terrainDecorPropTextureKey(prop)));
    if (props.length === 0) return [];

    const ids: string[] = [];
    const placedRects: Rect[] = [];
    const topSegments = this.solidSurfaceTopSegments(solid);
    for (let segmentIndex = 0; segmentIndex < topSegments.length; segmentIndex += 1) {
      const segment = topSegments[segmentIndex];
      const segmentWidth = segment.to - segment.from;
      if (segmentWidth < 40) continue;
      ids.push(...this.syncLargeTerrainDecorProp(solid, material, density, props, segment, segmentIndex, depth));
      ids.push(...this.syncSurfaceTerrainDecorProps(solid, material, density, props, segment, segmentIndex, depth, placedRects));
      ids.push(...this.syncOverhangTerrainDecorProp(solid, material, density, props, segment, segmentIndex, depth, placedRects));
      ids.push(...this.syncWallTerrainDecorProp(solid, material, density, props, segment, segmentIndex, depth, placedRects));
    }
    return ids;
  }

  private syncSurfaceTerrainDecorProps(
    solid: Solid,
    material: TerrainMaterial,
    density: ActiveTerrainDecorDensity,
    props: readonly TerrainDecorPropDefinition[],
    segment: { from: number; to: number },
    segmentIndex: number,
    depth: number,
    placedRects: Rect[]
  ): string[] {
    if (solid.h < TERRAIN_DECOR_MIN_SOLID_HEIGHT) return [];
    const segmentWidth = segment.to - segment.from;
    if (segmentWidth < 48) return [];
    const slotWidth = TERRAIN_DECOR_PROP_SURFACE_SLOT[density];
    const slotCount = Math.max(1, Math.floor(segmentWidth / slotWidth));
    const ids: string[] = [];

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const hash = this.terrainDecorHash(solid, material, "surface-prop", segmentIndex, slotIndex);
      if (this.terrainDecorRoll(hash) > TERRAIN_DECOR_PROP_SURFACE_CHANCE[density]) continue;
      const slotFrom = segment.from + (segmentWidth / slotCount) * slotIndex;
      const slotTo = slotIndex === slotCount - 1 ? segment.to : segment.from + (segmentWidth / slotCount) * (slotIndex + 1);
      const preferredCategory: TerrainDecorPropCategory =
        density !== "low" && hash % 5 === 0 ? "surface-medium" : "surface-small";
      const prop =
        this.pickTerrainDecorProp(props, preferredCategory, density, segmentWidth, hash >>> 8) ||
        this.pickTerrainDecorProp(props, "surface-small", density, segmentWidth, hash >>> 12);
      if (!prop) continue;
      const rect = this.surfaceTerrainDecorRect(solid, segment, slotFrom, slotTo, prop, hash);
      if (!rect || !this.canPlaceTerrainDecorProp(solid, prop, rect, placedRects)) continue;
      const id = `solid:${solid.id}:decor-prop:${segmentIndex}:${slotIndex}:${prop.id}`;
      this.syncTerrainDecorPropAsset(id, prop, rect, depth + prop.depthOffset, material, density);
      ids.push(id);
      placedRects.push(rect);
    }

    return ids;
  }

  private syncLargeTerrainDecorProp(
    solid: Solid,
    material: TerrainMaterial,
    density: ActiveTerrainDecorDensity,
    props: readonly TerrainDecorPropDefinition[],
    segment: { from: number; to: number },
    segmentIndex: number,
    depth: number
  ): string[] {
    const segmentWidth = segment.to - segment.from;
    if (this.terrainDecorRoll(this.terrainDecorHash(solid, material, "large-prop-chance", segmentIndex, 0)) > TERRAIN_DECOR_PROP_LARGE_CHANCE[density]) {
      return [];
    }
    const hash = this.terrainDecorHash(solid, material, "large-prop", segmentIndex, 0);
    const prop = this.pickTerrainDecorProp(props, "behind-surface-large", density, segmentWidth, hash);
    if (!prop) return [];

    const left = this.decorRangeValue(hash >>> 6, segment.from + 10, segment.to - prop.w - 10);
    const rect = {
      x: Math.round(left),
      y: Math.round(solid.y - prop.h + 14),
      w: prop.w,
      h: prop.h
    };
    if (!this.terrainDecorHasClearance(solid, this.terrainDecorPropClearanceRect(prop, rect))) return [];

    const id = `solid:${solid.id}:decor-prop:${segmentIndex}:large:${prop.id}`;
    this.syncTerrainDecorPropAsset(id, prop, rect, depth + prop.depthOffset, material, density);
    return [id];
  }

  private syncOverhangTerrainDecorProp(
    solid: Solid,
    material: TerrainMaterial,
    density: ActiveTerrainDecorDensity,
    props: readonly TerrainDecorPropDefinition[],
    segment: { from: number; to: number },
    segmentIndex: number,
    depth: number,
    placedRects: Rect[]
  ): string[] {
    if (solid.h < 36) return [];
    const segmentWidth = segment.to - segment.from;
    const chanceHash = this.terrainDecorHash(solid, material, "overhang-prop-chance", segmentIndex, 0);
    if (this.terrainDecorRoll(chanceHash) > TERRAIN_DECOR_PROP_OVERHANG_CHANCE[density]) return [];

    const hash = this.terrainDecorHash(solid, material, "overhang-prop", segmentIndex, 0);
    const prop = this.pickTerrainDecorProp(props, "overhang", density, segmentWidth, hash);
    if (!prop) return [];

    const left = this.decorRangeValue(hash >>> 6, segment.from + 8, segment.to - prop.w - 8);
    const rect = {
      x: Math.round(left),
      y: Math.round(solid.y + 2),
      w: prop.w,
      h: prop.h
    };
    if (!this.canPlaceTerrainDecorProp(solid, prop, rect, placedRects)) return [];

    const id = `solid:${solid.id}:decor-prop:${segmentIndex}:overhang:${prop.id}`;
    this.syncTerrainDecorPropAsset(id, prop, rect, depth + prop.depthOffset, material, density);
    placedRects.push(rect);
    return [id];
  }

  private syncWallTerrainDecorProp(
    solid: Solid,
    material: TerrainMaterial,
    density: ActiveTerrainDecorDensity,
    props: readonly TerrainDecorPropDefinition[],
    segment: { from: number; to: number },
    segmentIndex: number,
    depth: number,
    placedRects: Rect[]
  ): string[] {
    if (solid.h < 62) return [];
    const segmentWidth = segment.to - segment.from;
    const chanceHash = this.terrainDecorHash(solid, material, "wall-prop-chance", segmentIndex, 0);
    if (this.terrainDecorRoll(chanceHash) > TERRAIN_DECOR_PROP_WALL_CHANCE[density]) return [];

    const hash = this.terrainDecorHash(solid, material, "wall-prop", segmentIndex, 0);
    const candidates = props.filter(
      (prop) =>
        prop.category === "wall-decal" &&
        prop.densities.includes(density) &&
        segmentWidth >= prop.minSegmentWidth &&
        prop.h <= solid.h - 8
    );
    const prop = this.pickWeightedTerrainDecorProp(candidates, hash);
    if (!prop) return [];

    const left = this.decorRangeValue(hash >>> 5, segment.from + 8, segment.to - prop.w - 8);
    const top = this.decorRangeValue(hash >>> 13, solid.y + 10, solid.y + solid.h - prop.h - 8);
    const rect = {
      x: Math.round(left),
      y: Math.round(top),
      w: prop.w,
      h: prop.h
    };
    if (!this.canPlaceTerrainDecorProp(solid, prop, rect, placedRects)) return [];

    const id = `solid:${solid.id}:decor-prop:${segmentIndex}:wall:${prop.id}`;
    this.syncTerrainDecorPropAsset(id, prop, rect, depth + prop.depthOffset, material, density);
    placedRects.push(rect);
    return [id];
  }

  private activeTerrainDecorDensity(density: SolidDecorDensity): ActiveTerrainDecorDensity | null {
    if (density === "low" || density === "medium" || density === "high") return density;
    return null;
  }

  private pickTerrainDecorProp(
    props: readonly TerrainDecorPropDefinition[],
    category: TerrainDecorPropCategory,
    density: ActiveTerrainDecorDensity,
    segmentWidth: number,
    hash: number
  ): TerrainDecorPropDefinition | null {
    return this.pickWeightedTerrainDecorProp(
      props.filter(
        (prop) => prop.category === category && prop.densities.includes(density) && segmentWidth >= prop.minSegmentWidth
      ),
      hash
    );
  }

  private pickWeightedTerrainDecorProp(
    props: readonly TerrainDecorPropDefinition[],
    hash: number
  ): TerrainDecorPropDefinition | null {
    const totalWeight = props.reduce((sum, prop) => sum + Math.max(0, prop.weight), 0);
    if (totalWeight <= 0) return null;
    let pick = hash % totalWeight;
    for (const prop of props) {
      pick -= Math.max(0, prop.weight);
      if (pick < 0) return prop;
    }
    return props[0] || null;
  }

  private surfaceTerrainDecorRect(
    solid: Solid,
    segment: { from: number; to: number },
    slotFrom: number,
    slotTo: number,
    prop: TerrainDecorPropDefinition,
    hash: number
  ): Rect | null {
    if (segment.to - segment.from < prop.w + 4) return null;
    const slotCenter = (slotFrom + slotTo) / 2;
    const jitterSpan = Math.max(0, (slotTo - slotFrom - prop.w) * 0.72);
    const jitter = (this.terrainDecorRoll(hash >>> 16) - 0.5) * jitterSpan;
    const minCenter = segment.from + prop.w / 2 + 2;
    const maxCenter = segment.to - prop.w / 2 - 2;
    const center = Phaser.Math.Clamp(slotCenter + jitter, minCenter, maxCenter);
    return {
      x: Math.round(center - prop.w / 2),
      y: Math.round(solid.y - prop.h + 8),
      w: prop.w,
      h: prop.h
    };
  }

  private canPlaceTerrainDecorProp(
    solid: Solid,
    prop: TerrainDecorPropDefinition,
    rect: Rect,
    placedRects: Rect[]
  ): boolean {
    const paddedRect = { x: rect.x - 4, y: rect.y - 4, w: rect.w + 8, h: rect.h + 8 };
    if (placedRects.some((placed) => rectsOverlap(paddedRect, placed))) return false;
    return this.terrainDecorHasClearance(solid, this.terrainDecorPropClearanceRect(prop, rect));
  }

  private terrainDecorPropClearanceRect(prop: TerrainDecorPropDefinition, rect: Rect): Rect {
    return {
      x: rect.x + (rect.w - prop.clearance.w) / 2,
      y: rect.y + (rect.h - prop.clearance.h) / 2,
      w: prop.clearance.w,
      h: prop.clearance.h
    };
  }

  private syncTerrainDecorPropAsset(
    id: string,
    prop: TerrainDecorPropDefinition,
    rect: Rect,
    depth: number,
    material: TerrainMaterial,
    density: ActiveTerrainDecorDensity
  ): void {
    const asset = this.assetFor(id, "image", undefined, terrainDecorPropTextureKey(prop)) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(1)
      .setOrigin(0, 0)
      .setPosition(rect.x, rect.y)
      .setRotation(0)
      .setDisplaySize(rect.w, rect.h)
      .clearTint();
    this.activeObjectAssetIds.add(id);
    if (this.diagnosticsEnabled) {
      this.staticTerrainDecorPropFrames.push(
        `${id}:${prop.id}:${prop.category}:${material}:${density}:${prop.frame}:${Math.round(rect.x)},${Math.round(rect.y)}:${Math.round(rect.w)}x${Math.round(rect.h)}:${depth.toFixed(3)}`
      );
    }
  }

  private terrainDecorHash(solid: Solid, material: TerrainMaterial, role: string, row: number, column: number): number {
    let hash = 2166136261;
    const key = `${this.level.id}:${solid.id}:${material}:${role}:${row}:${column}`;
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private terrainDecorRoll(hash: number): number {
    return ((hash >>> 0) % 10000) / 10000;
  }

  private decorRangeValue(hash: number, min: number, max: number): number {
    if (max <= min) return min;
    return min + this.terrainDecorRoll(hash) * (max - min);
  }

  private solidSurfaceTopSegments(solid: Solid): Array<{ side: "top"; from: number; to: number }> {
    let segments: Array<{ from: number; to: number }> = [{ from: solid.x, to: solid.x + solid.w }];
    for (const neighbor of this.level.solids) {
      if (neighbor === solid) continue;
      const horizontalOverlap = this.overlapSpan(solid.x, solid.x + solid.w, neighbor.x, neighbor.x + neighbor.w);
      if (horizontalOverlap && this.sameCoordinate(neighbor.y + neighbor.h, solid.y)) {
        segments = this.subtractSolidOutlineSpan(segments, horizontalOverlap.from, horizontalOverlap.to);
      }
    }
    return segments.map((segment) => ({ side: "top", ...segment }));
  }

  private syncFallbackSolidAsset(solid: Solid, frame: number, depth: number): void {
    if (!this.textures.exists(OBJECT_ATLAS_KEY)) return;
    const asset = this.assetFor(`solid:${solid.id}`, "image", frame) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(1)
      .setOrigin(0.5, 0.5)
      .setPosition(solid.x + solid.w / 2, solid.y + solid.h / 2)
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(solid.w, solid.h)
      .clearTint();
    this.activeObjectAssetIds.add(`solid:${solid.id}`);
  }

  private terrainTileRole(frame: number, row: number): TerrainBaseTileRole {
    if (frame === OBJECT_FRAME.wall) return "wallFace";
    if (row === 0) return "floorTop";
    if (frame === OBJECT_FRAME.floor || frame === OBJECT_FRAME.warning) return "floorFace";
    return "blockFace";
  }

  private terrainTileVariant(solid: Solid, material: TerrainMaterial, role: string, row: number, column: number): number {
    let hash = 2166136261;
    const key = `${this.level.id}:${solid.id}:${material}:${role}:${row}:${column}`;
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % TERRAIN_TILE_VARIANT_COUNT;
  }

  private shouldPlaceTerrainDecor(solid: Solid, segmentWidth: number, column: number): boolean {
    if (solid.h < TERRAIN_DECOR_MIN_SOLID_HEIGHT || segmentWidth < TERRAIN_DECOR_MIN_SEGMENT_WIDTH) return false;
    if (solidCollisionFor(solid) === "top-only") return false;
    return this.terrainTileVariant(solid, terrainMaterialForSolid(solid), "decor-placement", 0, column) === 0;
  }

  private terrainDecorHasClearance(solid: Solid, rect: Rect): boolean {
    const padded = { x: rect.x - 10, y: rect.y - 10, w: rect.w + 20, h: rect.h + 22 };
    const startClearance = { x: this.level.start.x - 30, y: this.level.start.y - 64, w: 72, h: 92 };
    if (rectsOverlap(padded, startClearance) || rectsOverlap(padded, this.level.exit)) return false;
    const blockers: Rect[] = [
      ...this.level.solids.filter(
        (blocker) => blocker !== solid && solidCollisionFor(blocker) !== "decorative" && blocker.y < rect.y + rect.h - 0.01
      ),
      ...(this.level.platforms || []),
      ...(this.level.oneWays || []),
      ...(this.level.conveyors || []),
      ...(this.level.launchPads || []),
      ...(this.level.drones || []),
      ...(this.level.plates || []),
      ...(this.level.timedSwitches || []),
      ...(this.level.echoSensors || []),
      ...(this.level.doors || []),
      ...(this.level.lasers || []),
      ...(this.level.movingLasers || []),
      ...(this.level.cores || []),
      ...(this.level.hazards || []),
      ...(this.level.crates || []),
      ...(this.level.monsters || []),
      ...(this.level.bosses || [])
    ];
    return blockers.every((blocker) => !rectsOverlap(padded, blocker));
  }

  private syncTerrainTileAsset(id: string, frame: number, x: number, y: number, width: number, height: number, depth: number): void {
    const asset = this.assetFor(id, "image", frame, TERRAIN_TILE_KEY) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(depth)
      .setAlpha(1)
      .setOrigin(0, 0)
      .setPosition(Math.round(x), Math.round(y))
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(width, height)
      .clearTint();
    this.activeObjectAssetIds.add(id);
  }

  private syncStaticOneWayPlatforms(): void {
    for (const platform of this.level.oneWays || []) {
      this.syncTileAsset(`one-way:${platform.id}`, OBJECT_FRAME.oneWay, platform, 3, 0.88, 0.42);
      this.markStaticObjectAsset(`one-way:${platform.id}`);
    }
  }

  private syncStaticHazards(): void {
    if (this.textures.exists(HAZARD_VENT_KEY)) return;
    for (const hazard of this.level.hazards || []) {
      this.hazardRenderRect.x = hazard.x;
      this.hazardRenderRect.y = hazard.y - 4;
      this.hazardRenderRect.w = hazard.w;
      this.hazardRenderRect.h = hazard.h + 8;
      this.syncTileAsset(`hazard:${hazard.id}`, OBJECT_FRAME.warning, this.hazardRenderRect, 2, 0.74, 0.38);
      this.markStaticObjectAsset(`hazard:${hazard.id}`);
    }
  }

  private drawHazards(): void {
    if (!this.textures.exists(HAZARD_VENT_KEY)) return;
    for (const hazard of this.level.hazards || []) {
      const count = Math.max(1, Math.ceil(hazard.w / 96));
      const sliceWidth = hazard.w / count;
      const displayWidth = Math.max(84, sliceWidth + 18);
      const displayHeight = displayWidth * (HAZARD_VENT_FRAME_HEIGHT / HAZARD_VENT_FRAME_WIDTH);
      const baseFrame = Math.floor(this.time.now / 115);
      const offset = this.hazardFrameOffset(hazard.id);
      for (let index = 0; index < count; index += 1) {
        const frame = (baseFrame + offset + index * 2) % HAZARD_VENT_FRAMES;
        const x = hazard.x + sliceWidth * (index + 0.5);
        const y = hazard.y + hazard.h + 8;
        this.syncHazardVentAsset(hazard.id, index, frame, x, y, displayWidth, displayHeight);
      }
    }
  }

  private syncHazardVentAsset(
    hazardId: string,
    index: number,
    frame: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    if (!this.textures.exists(HAZARD_VENT_KEY) || width <= 0 || height <= 0) return;
    const id = `hazard-vent:${hazardId}:${index}`;
    const asset = this.assetFor(id, "image", frame, HAZARD_VENT_KEY) as Phaser.GameObjects.Image;
    asset
      .setVisible(true)
      .setDepth(7)
      .setAlpha(0.98)
      .setOrigin(0.5, 1)
      .setPosition(x, y)
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(width, height)
      .clearTint();
    this.activeObjectAssetIds.add(id);
    if (this.diagnosticsEnabled) {
      this.hazardVentSpriteFrames.push(`${id}:${frame}:${Math.round(x)},${Math.round(y)}:${Math.round(width)}x${Math.round(height)}`);
    }
  }

  private hazardFrameOffset(id: string): number {
    let offset = 0;
    for (let index = 0; index < id.length; index += 1) offset = (offset + id.charCodeAt(index)) % HAZARD_VENT_FRAMES;
    return offset;
  }

  private markStaticObjectAsset(id: string): void {
    this.staticObjectAssetIds.add(id);
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

  private drawLaunchPads(): void {
    for (const pad of this.level.launchPads || []) {
      const activeUntil = this.launchPadActiveUntil.get(pad.id) || 0;
      const active = activeUntil > this.time.now;
      if (!active && activeUntil > 0) this.launchPadActiveUntil.delete(pad.id);
      this.syncLaunchPadAsset(pad, active);
    }
  }

  private syncLaunchPadAsset(pad: Rect & { id: string }, active: boolean): void {
    const frame = active ? 1 : 0;
    const id = `launch-pad:${pad.id}`;
    if (this.textures.exists(LAUNCH_PAD_KEY)) {
      const width = Math.max(58, pad.w);
      const height = width * (LAUNCH_PAD_FRAME_HEIGHT / LAUNCH_PAD_FRAME_WIDTH);
      const asset = this.assetFor(id, "image", frame, LAUNCH_PAD_KEY) as Phaser.GameObjects.Image;
      asset
        .setVisible(true)
        .setDepth(6)
        .setAlpha(0.98)
        .setOrigin(0.5, 1)
        .setPosition(pad.x + pad.w / 2, pad.y + pad.h + 5)
        .setRotation(0)
        .setFrame(frame)
        .setDisplaySize(width, height)
        .clearTint();
      this.activeObjectAssetIds.add(id);
      if (this.diagnosticsEnabled) this.launchPadSpriteFrames.push(`${id}:${frame}:${active ? "active" : "idle"}`);
      return;
    }

    this.syncImageAsset(
      id,
      active ? OBJECT_FRAME.plateActive : OBJECT_FRAME.plateIdle,
      pad.x + pad.w / 2,
      pad.y + pad.h - 16,
      Math.max(54, pad.w),
      42,
      4,
      0.92
    );
    if (this.diagnosticsEnabled) this.launchPadSpriteFrames.push(`${id}:fallback:${active ? "active" : "idle"}`);
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
      if (this.diagnosticsEnabled) {
        this.echoSensorAssetFrames.push(`echo-sensor:${sensor.id}:hidden:${active ? "active" : "inactive"}`);
      }
    }
  }

  private drawCores(collectedCores: Set<string>): void {
    for (const core of this.level.cores || []) {
      if (collectedCores.has(core.id)) continue;
      const center = rectCenter(core);
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.12;
      const large = this.coreIsLarge(core);
      if (!this.textures.exists(large ? CORE_MAJOR_KEY : "time-effects")) {
        this.drawDiamond(center.x, center.y, (large ? 18 : 12) * pulse, large ? 0x43f7ff : 0xffe35a, 0.9, 0xffffff, 0.72);
      }
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

  private drawMonsters(tick: number, killedMonsters: Set<string>): void {
    this.monsterSpriteFrames = [];
    for (const monster of this.level.monsters || []) {
      if (killedMonsters.has(monster.id)) continue;
      const rect = monsterRectAt(monster, tick);
      this.syncMonsterSprite(monster, rect, tick);
    }
  }

  private syncMonsterSprite(monster: Monster, rect: Rect, tick: number): void {
    if (!this.textures.exists(MONSTER_ATLAS_KEY)) return;
    const { id, kind } = monster;
    const animation = monsterAnimationProfileForKind(kind);
    const animationTick = tick + id.length * 7;
    const animationFrame = Math.floor(animationTick / animation.frameInterval) % 4;
    const frame = monsterFrameForKind(kind, animationFrame);
    const center = rectCenter(rect);
    const visual = monsterVisualTransformForKind(kind, animationTick, animationFrame);
    const width = Math.max(44, rect.w * 2.15);
    const height = Math.max(44, rect.h * 2.25);
    const facingLeft = this.monsterFacingLeft(monster, rect, tick);
    const sprite = this.assetFor(`monster:${id}`, "image", frame, MONSTER_ATLAS_KEY) as Phaser.GameObjects.Image;
    sprite
      .setVisible(true)
      .setDepth(9)
      .setAlpha(0.98)
      .setOrigin(0.5, 1)
      .setPosition(Math.round(center.x), Math.round(rect.y + rect.h + 3 + visual.yOffset))
      .setRotation(visual.rotation * (facingLeft ? -1 : 1))
      .setFrame(frame)
      .setDisplaySize(width * visual.scaleX, height * visual.scaleY)
      .setFlipX(facingLeft)
      .clearTint();
    this.activeObjectAssetIds.add(`monster:${id}`);
    if (this.diagnosticsEnabled) {
      this.monsterSpriteFrames.push(
        `${id}:${MONSTER_ATLAS_KEY}:${frame}:anim${animationFrame}:${facingLeft ? "left" : "right"}:${Math.round(width)}x${Math.round(height)}:${animation.style}:y${Math.round(visual.yOffset)}`
      );
    }
  }

  private monsterFacingLeft(monster: Monster, rect: Rect, tick: number): boolean {
    if (monster.axis !== "x" || !monster.distance || monster.distance <= 0) return false;
    const previous = monsterRectAt(monster, Math.max(0, tick - 1));
    const dx = rect.x - previous.x;
    if (Math.abs(dx) > 0.05) return dx < 0;
    const next = monsterRectAt(monster, tick + 1);
    const nextDx = next.x - rect.x;
    if (Math.abs(nextDx) > 0.05) return nextDx < 0;
    return false;
  }

  private drawBosses(bosses: BossSnapshot[]): void {
    this.bossSpriteFrames = [];
    this.bossEffectFrames = [];
    for (const boss of this.level.bosses || []) {
      const snapshot = bosses.find((item) => item.id === boss.id);
      const color = this.bossColor(boss.kind);
      if (!snapshot || snapshot.phase === "defeated") continue;

      if (boss.kind === "storm-relay-warden") this.drawStormBossWindupEffect(boss, snapshot, color);
      if (boss.kind === "cryo-conservator") this.drawCryoBossWindupEffect(boss, snapshot, color);
      for (const attack of snapshot.attacks) {
        this.drawBossAttackEffect(attack, color);
      }
      if (boss.kind === "storm-relay-warden") {
        for (const shock of snapshot.floorShocks) {
          this.drawStormBossFloorShockEffect(shock, color);
        }
      }
      if (boss.kind === "cryo-conservator") {
        for (const ice of snapshot.floorIce) {
          this.drawCryoBossFloorIceEffect(ice, color);
        }
      }

      const body = snapshot.body;
      const introProgress = snapshot.phase === "intro" ? Math.min(1, snapshot.introFrames / Math.max(1, snapshot.introTotalFrames)) : 1;
      const flickerWhite =
        (snapshot.invulnerableFrames > 0 && Math.floor(this.simulation.tick / 4) % 2 === 0) ||
        (snapshot.phase === "departing" && Math.floor(this.simulation.tick / 5) % 2 === 0);
      if (snapshot.phase === "intro") this.drawBossIntroEffect(body, color, introProgress);
      this.syncBossSprite(boss.id, boss.kind, snapshot, flickerWhite, introProgress);
      if (snapshot.phase === "departing") this.drawBossDefeatEffects(snapshot, color);
      if (snapshot.phase === "active" && bossIsVulnerable(snapshot)) this.drawBossWeakSpot(snapshot, color, flickerWhite);
    }
  }

  private drawStormBossFloorShockEffect(shock: Rect, color: number): void {
    if (this.diagnosticsEnabled) {
      this.bossEffectFrames.push(`storm-floor-shock:${Math.round(shock.x)},${Math.round(shock.y)}:${Math.round(shock.w)}x${Math.round(shock.h)}`);
    }
    const pulse = Math.sin(this.simulation.tick / 3.5) * 0.5 + 0.5;
    const glowAlpha = 0.14 + pulse * 0.08;
    this.fx.fillStyle(color, glowAlpha);
    this.fx.fillRoundedRect(shock.x - 5, shock.y - 4, shock.w + 10, shock.h + 8, 5);
    this.fx.fillStyle(0xffffff, 0.28 + pulse * 0.16);
    this.fx.fillRoundedRect(shock.x + 5, shock.y + shock.h * 0.35, Math.max(2, shock.w - 10), 2 + pulse * 2, 2);
    this.fx.lineStyle(2, color, 0.52 + pulse * 0.18);
    this.fx.lineBetween(shock.x + 3, shock.y + shock.h * 0.72, shock.x + shock.w - 3, shock.y + shock.h * 0.72);
    const arcs = Math.max(3, Math.floor(shock.w / 18));
    for (let index = 0; index < arcs; index += 1) {
      const ratio = (index + 0.5) / arcs;
      const x = shock.x + shock.w * ratio;
      const flicker = (Math.sin(this.simulation.tick * 0.45 + index * 1.9) + 1) * 0.5;
      const height = 5 + flicker * 10;
      this.fx.lineStyle(1.5, index % 2 === 0 ? 0xffffff : color, 0.22 + flicker * 0.32);
      this.fx.lineBetween(x - 3, shock.y + shock.h, x + Math.sin(this.simulation.tick / 5 + index) * 4, shock.y + shock.h - height);
    }
  }

  private drawBossAttackEffect(attack: BossAttackSnapshot, color: number): void {
    const horizontal = attack.kind === "horizontal";
    const endX = horizontal ? (attack.originX <= attack.x + attack.w / 2 ? attack.x + attack.w : attack.x) : attack.originX;
    const endY = horizontal ? attack.originY : attack.y + attack.h;
    this.fx.fillStyle(color, 0.08);
    this.fx.fillRoundedRect(attack.x - 3, attack.y - 3, attack.w + 6, attack.h + 6, horizontal ? 7 : 12);
    this.fx.lineStyle(10, color, 0.2);
    this.fx.lineBetween(attack.originX, attack.originY, endX, endY);
    this.fx.lineStyle(4, 0xffffff, 0.58);
    this.fx.lineBetween(attack.originX, attack.originY, endX, endY);
    this.fx.fillStyle(0xffffff, 0.7);
    this.fx.fillCircle(attack.originX, attack.originY, 4.4);
    this.fx.fillStyle(color, 0.48);
    this.fx.fillCircle(attack.originX, attack.originY, 7.4);
    const distance = horizontal ? Math.abs(endX - attack.originX) : Math.abs(endY - attack.originY);
    const segments = Math.max(2, Math.floor(distance / 32));
    for (let index = 1; index < segments; index += 1) {
      const ratio = (index + ((this.simulation.tick % 12) / 12)) / segments;
      const x = attack.originX + (endX - attack.originX) * ratio;
      const y = attack.originY + (endY - attack.originY) * ratio;
      this.fx.fillStyle(color, 0.24);
      this.fx.fillCircle(x, y, 2.4);
    }
    if (!horizontal) {
      this.fx.fillStyle(0xffffff, 0.34);
      this.fx.fillCircle(endX, endY, 5.2);
      this.fx.fillStyle(color, 0.2);
      this.fx.fillCircle(endX, endY, 11);
    }
  }

  private drawStormBossWindupEffect(boss: Boss, snapshot: BossSnapshot, color: number): void {
    if (snapshot.phase !== "active" || snapshot.recoveryFrames > 0 || bossIsVulnerable(snapshot) || snapshot.attacks.length > 0) return;
    const windupFrames = bossAttackWindupFramesFor(boss.kind);
    const cycle = snapshot.activeFrames % bossAttackCycleFramesFor(boss.kind);
    if (cycle >= windupFrames) return;
    const body = snapshot.body;
    const progress = Math.max(0, Math.min(1, cycle / Math.max(1, windupFrames)));
    const originX = body.x + body.w / 2;
    const originY = body.y + body.h * 0.82;
    const endY = boss.y + boss.h - 10;
    const warningWidth = 12 + progress * 18;
    if (this.diagnosticsEnabled) {
      this.bossEffectFrames.push(`${boss.id}:storm-windup:${Math.round(progress * 100)}:${snapshot.recoveryFrames}`);
    }
    this.fx.fillStyle(color, 0.05 + progress * 0.13);
    this.fx.fillRoundedRect(originX - warningWidth / 2, originY, warningWidth, Math.max(16, endY - originY), 7);
    this.fx.lineStyle(2, color, 0.22 + progress * 0.35);
    this.fx.lineBetween(originX, originY, originX, endY);
    this.fx.lineStyle(1, 0xffffff, 0.16 + progress * 0.3);
    this.fx.lineBetween(originX - warningWidth * 0.34, originY + 6, originX - warningWidth * 0.34, endY);
    this.fx.lineBetween(originX + warningWidth * 0.34, originY + 6, originX + warningWidth * 0.34, endY);
    const pulse = 0.65 + Math.sin(this.simulation.tick / 6) * 0.12 + progress * 0.35;
    this.fx.fillStyle(0xffffff, 0.18 + progress * 0.35);
    this.fx.fillCircle(originX, originY, 4 + progress * 4);
    this.fx.lineStyle(2, 0xffffff, 0.14 + progress * 0.3);
    this.fx.strokeCircle(originX, originY, 12 * pulse);
    this.fx.lineStyle(2, color, 0.2 + progress * 0.32);
    this.fx.strokeCircle(originX, originY, 19 * pulse);
  }

  private drawCryoBossWindupEffect(boss: Boss, snapshot: BossSnapshot, color: number): void {
    if (snapshot.phase !== "active" || snapshot.recoveryFrames > 0 || bossIsVulnerable(snapshot) || snapshot.attacks.length > 0) return;
    const windupFrames = bossAttackWindupFramesFor(boss.kind);
    const cycle = snapshot.activeFrames % bossAttackCycleFramesFor(boss.kind);
    if (cycle >= windupFrames) return;
    if (snapshot.attackWarnings.length === 0) return;
    const progress = Math.max(0, Math.min(1, cycle / Math.max(1, windupFrames)));
    const warningWidth = 18 + progress * 24;
    if (this.diagnosticsEnabled) {
      const lanes = snapshot.attackWarnings.map((warning) => Math.round(warning.originX)).join(",");
      this.bossEffectFrames.push(`${boss.id}:cryo-windup:${Math.round(progress * 100)}:${snapshot.recoveryFrames}:lanes=${lanes}`);
    }
    for (const warning of snapshot.attackWarnings) {
      const originX = warning.originX;
      const originY = warning.originY;
      const endY = warning.y + warning.h;
      this.fx.fillStyle(color, 0.04 + progress * 0.11);
      this.fx.fillRoundedRect(originX - warningWidth / 2, originY, warningWidth, Math.max(16, endY - originY), 10);
      this.fx.lineStyle(2, color, 0.18 + progress * 0.32);
      this.fx.lineBetween(originX, originY, originX, endY);
      this.fx.lineStyle(1, 0xffffff, 0.16 + progress * 0.26);
      this.fx.lineBetween(originX - warningWidth * 0.42, originY + 4, originX - warningWidth * 0.42, endY);
      this.fx.lineBetween(originX + warningWidth * 0.42, originY + 4, originX + warningWidth * 0.42, endY);
      const pulse = 0.78 + Math.sin(this.simulation.tick / 9) * 0.08 + progress * 0.26;
      this.fx.fillStyle(0xffffff, 0.16 + progress * 0.28);
      this.fx.fillCircle(originX, originY, 4 + progress * 5);
      this.fx.lineStyle(2, color, 0.18 + progress * 0.3);
      this.fx.strokeCircle(originX, originY, 15 * pulse);
      this.fx.strokeCircle(originX, originY, 25 * pulse);
    }
  }

  private drawCryoBossFloorIceEffect(ice: BossFloorIceSnapshot, color: number): void {
    if (this.diagnosticsEnabled) {
      this.bossEffectFrames.push(
        `cryo-floor-ice:${Math.round(ice.x)},${Math.round(ice.y)}:${Math.round(ice.w)}x${Math.round(ice.h)}:${Math.round(ice.remainingFrames)}/${Math.round(ice.lifeFrames)}`
      );
    }
    const pulse = Math.sin(this.simulation.tick / 10) * 0.5 + 0.5;
    const lifeRatio = Math.max(0.18, Math.min(1, ice.remainingFrames / Math.max(1, ice.lifeFrames)));
    this.fx.fillStyle(color, (0.1 + pulse * 0.05) * lifeRatio);
    this.fx.fillRoundedRect(ice.x - 4, ice.y - 2, ice.w + 8, ice.h + 6, 5);
    this.fx.fillStyle(0xffffff, (0.16 + pulse * 0.12) * lifeRatio);
    this.fx.fillRoundedRect(ice.x + 4, ice.y + ice.h * 0.35, Math.max(2, ice.w - 8), 2, 2);
    const facets = Math.max(4, Math.floor(ice.w / 24));
    this.fx.lineStyle(1.25, 0xffffff, (0.18 + pulse * 0.16) * lifeRatio);
    for (let index = 0; index < facets; index += 1) {
      const x = ice.x + ((index + 0.5) / facets) * ice.w;
      this.fx.lineBetween(x - 8, ice.y + ice.h, x - 2, ice.y + 1);
      this.fx.lineBetween(x - 2, ice.y + 1, x + 9, ice.y + ice.h * 0.7);
    }
    this.fx.lineStyle(2, color, (0.32 + pulse * 0.18) * lifeRatio);
    this.fx.lineBetween(ice.x + 3, ice.y + ice.h, ice.x + ice.w - 3, ice.y + ice.h);
  }

  private drawBossIntroEffect(body: Rect, color: number, progress: number): void {
    const bodyCenter = rectCenter(body);
    const alpha = 0.16 + progress * 0.22;
    this.fx.lineStyle(2, color, alpha);
    this.fx.lineBetween(body.x + body.w * 0.18, body.y + body.h * 0.82, body.x + body.w * 0.82, body.y + body.h * 0.82);
    for (let i = 0; i < 6; i += 1) {
      const phase = (this.simulation.tick * 0.18 + i * 1.7) % 1;
      const nozzleX = body.x + body.w * (0.2 + (i % 3) * 0.3);
      const nozzleY = body.y + body.h * (0.72 + (i % 2) * 0.12);
      const drift = phase * (8 + progress * 16);
      this.fx.fillStyle(i % 2 === 0 ? color : 0xffffff, (1 - phase) * alpha);
      this.fx.fillCircle(nozzleX + Math.sin(this.simulation.tick / 11 + i) * 2, nozzleY + drift, 2.2 + progress * 1.4);
    }
    this.fx.fillStyle(0xffffff, 0.16 + progress * 0.18);
    this.fx.fillRoundedRect(bodyCenter.x - body.w * 0.16, body.y + body.h * 0.78, body.w * 0.32, 3, 2);
  }

  private drawBossDefeatEffects(snapshot: BossSnapshot, color: number): void {
    const body = snapshot.body;
    const total = Math.max(1, snapshot.departureTotalFrames);
    const progress = Math.max(0, Math.min(1, snapshot.departureFrames / total));
    let activeBursts = 0;
    for (let index = 0; index < BOSS_DEFEAT_BURST_OFFSETS.length; index += 1) {
      const burst = BOSS_DEFEAT_BURST_OFFSETS[index];
      const duration = 72 + (index % 3) * 8;
      const local = (snapshot.departureFrames - burst.start) / duration;
      if (local < 0 || local >= 1) continue;
      activeBursts += 1;
      const alpha = Math.max(0, 1 - local);
      const driftX = Math.sin(this.simulation.tick / 7 + index * 1.9) * body.w * 0.018;
      const driftY = Math.cos(this.simulation.tick / 9 + index * 1.3) * body.h * 0.018;
      const x = body.x + body.w * burst.x + driftX;
      const y = body.y + body.h * burst.y + driftY;
      const size = Math.max(36, Math.min(body.w, body.h) * (0.42 + local * 0.28));
      const frame = Math.min(POOF_FRAME_COUNT - 1, Math.max(0, Math.floor(local * POOF_FRAME_COUNT)));
      this.fx.fillStyle(0xff8b3d, alpha * 0.16);
      this.fx.fillCircle(x, y, size * (0.36 + local * 0.2));
      this.fx.lineStyle(2, index % 2 === 0 ? color : 0xffe35a, alpha * 0.36);
      this.fx.strokeCircle(x, y, size * (0.42 + local * 0.36));
      for (let spoke = 0; spoke < 4; spoke += 1) {
        const angle = local * Math.PI * 1.5 + spoke * Math.PI * 0.5 + index * 0.4;
        const inner = size * 0.18;
        const outer = size * (0.34 + local * 0.25);
        this.fx.lineStyle(1.5, spoke % 2 === 0 ? 0xffffff : 0xffe35a, alpha * 0.32);
        this.fx.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      }
      if (this.textures.exists(POOF_SHEET_KEY)) {
        const sprite = this.assetFor(`boss-defeat-fx:${snapshot.id}:${index}`, "image", frame, POOF_SHEET_KEY) as Phaser.GameObjects.Image;
        sprite
          .setVisible(true)
          .setDepth(26)
          .setAlpha(alpha * 0.9)
          .setOrigin(0.5, 0.5)
          .setPosition(Math.round(x), Math.round(y))
          .setRotation((index % 2 === 0 ? 1 : -1) * local * 0.28)
          .setFrame(frame)
          .setDisplaySize(size, size)
          .setTint(burst.tint);
        this.activeObjectAssetIds.add(`boss-defeat-fx:${snapshot.id}:${index}`);
      }
    }
    if (this.diagnosticsEnabled) {
      this.bossEffectFrames.push(
        `${snapshot.id}:defeat-depart:${Math.round(snapshot.departureFrames)}/${Math.round(total)}:bursts=${activeBursts}:x=${Math.round(body.x)}`
      );
    }
    this.fx.lineStyle(2, color, 0.16 + (1 - progress) * 0.16);
    this.fx.lineBetween(body.x + body.w * 0.16, body.y + body.h * 0.5, body.x + body.w * 0.86, body.y + body.h * 0.5 + Math.sin(this.simulation.tick / 8) * 8);
  }

  private syncBossSprite(id: string, kind: BossKind, snapshot: BossSnapshot, flickerWhite: boolean, introProgress: number): void {
    const useCleanStormSprite = kind === "storm-relay-warden" && this.textures.exists(STORM_BOSS_CLEAN_KEY);
    const useCleanCryoSprite = kind === "cryo-conservator" && this.textures.exists(CRYO_BOSS_CLEAN_KEY);
    const textureKey = useCleanStormSprite ? STORM_BOSS_CLEAN_KEY : useCleanCryoSprite ? CRYO_BOSS_CLEAN_KEY : BOSS_ATLAS_KEY;
    if (!this.textures.exists(textureKey)) return;
    const body = snapshot.body;
    const center = rectCenter(body);
    const spriteState = this.bossSpriteState(kind, snapshot, introProgress);
    const stateFrame = this.bossStateAnimationFrame(kind, id, snapshot, spriteState, introProgress);
    const useCleanSingleFrame = useCleanStormSprite || useCleanCryoSprite;
    const frame = useCleanSingleFrame ? 0 : bossFrameForKind(kind, spriteState, stateFrame);
    const activePulse = snapshot.phase === "active" && !useCleanSingleFrame ? Math.sin(this.simulation.tick / 18) * 0.015 : 0;
    const departureProgress =
      snapshot.phase === "departing" ? Math.max(0, Math.min(1, snapshot.departureFrames / Math.max(1, snapshot.departureTotalFrames))) : 0;
    const displayWidth = Math.max(148, body.w * 1.5) * (1 + activePulse);
    const displayHeight = Math.max(120, body.h * 1.42) * (1 + activePulse);
    const sprite = this.assetFor(`boss:${id}`, "image", frame, textureKey) as Phaser.GameObjects.Image;
    sprite
      .setVisible(true)
      .setDepth(13)
      .setAlpha(snapshot.phase === "intro" ? 0.72 + introProgress * 0.24 : snapshot.phase === "departing" ? 0.96 - departureProgress * 0.18 : 0.98)
      .setOrigin(0.5, 0.5)
      .setPosition(Math.round(center.x), Math.round(center.y))
      .setRotation(0)
      .setFrame(frame)
      .setDisplaySize(displayWidth, displayHeight)
      .setFlipX(false);
    if (flickerWhite) sprite.setTint(0xffffff);
    else sprite.clearTint();
    this.activeObjectAssetIds.add(`boss:${id}`);
    if (this.diagnosticsEnabled) {
      this.bossSpriteFrames.push(
        `${id}:${textureKey}:${frame}:${spriteState}:anim${stateFrame}:${snapshot.phase}:${bossIsVulnerable(snapshot) ? "vulnerable" : "guarded"}:${Math.round(displayWidth)}x${Math.round(displayHeight)}`
      );
    }
  }

  private bossStateAnimationFrame(kind: BossKind, id: string, snapshot: BossSnapshot, state: BossSpriteState, introProgress: number): number {
    if (kind === "storm-relay-warden" || kind === "cryo-conservator") return 0;
    if (snapshot.phase === "intro") return Math.min(BOSS_STATE_FRAME_COUNT - 1, Math.floor(introProgress * BOSS_STATE_FRAME_COUNT));
    if (snapshot.phase !== "active") return 0;
    const cycle = snapshot.activeFrames % bossAttackCycleFramesFor(snapshot);
    if (state === "windup") {
      return Math.min(BOSS_STATE_FRAME_COUNT - 1, Math.floor((cycle / Math.max(1, bossAttackWindupFramesFor(snapshot))) * BOSS_STATE_FRAME_COUNT));
    }
    if (state === "attack") {
      const attackFrame = cycle - bossAttackWindupFramesFor(snapshot);
      return Math.min(BOSS_STATE_FRAME_COUNT - 1, Math.floor((attackFrame / Math.max(1, bossAttackActiveFramesFor(snapshot))) * BOSS_STATE_FRAME_COUNT));
    }
    if (state === "vulnerable") return Math.floor((snapshot.activeFrames + id.length * 5) / 8) % BOSS_STATE_FRAME_COUNT;
    return Math.floor((this.simulation.tick + id.length * 11) / 16) % BOSS_STATE_FRAME_COUNT;
  }

  private bossSpriteState(kind: BossKind, snapshot: BossSnapshot, introProgress: number): BossSpriteState {
    if (kind === "storm-relay-warden" || kind === "cryo-conservator") return "idle";
    if (snapshot.phase === "active") {
      if (bossIsVulnerable(snapshot)) return "vulnerable";
      const cycle = snapshot.activeFrames % bossAttackCycleFramesFor(snapshot);
      const windupFrames = bossAttackWindupFramesFor(snapshot);
      if (cycle >= windupFrames && cycle < windupFrames + bossAttackActiveFramesFor(snapshot)) {
        return "attack";
      }
      return cycle < windupFrames ? "windup" : "idle";
    }
    if (snapshot.phase === "intro" && introProgress > 0.55 && Math.floor(this.simulation.tick / 18) % 2 === 1) return "windup";
    return "idle";
  }

  private drawBossWeakSpot(snapshot: BossSnapshot, color: number, flickerWhite: boolean): void {
    const spot = snapshot.weakSpot;
    const center = rectCenter(spot);
    const openAlpha = 0.7 + (Math.sin(this.simulation.tick / 8) * 0.5 + 0.5) * 0.24;
    const fill = flickerWhite ? 0xffffff : 0xffe35a;
    const pulse = 0.86 + Math.sin(this.simulation.tick / 7) * 0.08;
    this.fx.fillStyle(color, 0.12);
    this.fx.fillEllipse(center.x, center.y, spot.w * 1.05 * pulse, spot.h * 1.05 * pulse);
    this.fx.fillStyle(fill, openAlpha * 0.5);
    this.fx.fillEllipse(center.x, center.y, spot.w * 0.46, spot.h * 0.46);
    this.fx.lineStyle(2, flickerWhite ? color : 0xffffff, openAlpha * 0.7);
    this.fx.strokeEllipse(center.x, center.y, spot.w * 0.82 * pulse, spot.h * 0.82 * pulse);
    for (let index = 0; index < 4; index += 1) {
      const angle = this.simulation.tick / 11 + index * Math.PI * 0.5;
      const innerX = center.x + Math.cos(angle) * spot.w * 0.34;
      const innerY = center.y + Math.sin(angle) * spot.h * 0.34;
      const outerX = center.x + Math.cos(angle) * spot.w * 0.5;
      const outerY = center.y + Math.sin(angle) * spot.h * 0.5;
      this.fx.lineBetween(innerX, innerY, outerX, outerY);
    }
  }

  private drawFxBursts(): void {
    const now = this.time.now;
    for (let index = this.fxBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.fxBursts[index];
      const progress = (now - burst.startedAt) / burst.durationMs;
      if (progress >= 1) {
        this.fxBursts.splice(index, 1);
        continue;
      }
      const alpha = 1 - progress;
      if (this.textures.exists(POOF_SHEET_KEY)) {
        const frame = Math.min(POOF_FRAME_COUNT - 1, Math.max(0, Math.floor(progress * POOF_FRAME_COUNT)));
        const size = 46 + progress * 22;
        const sprite = this.assetFor(`fx:${burst.id}`, "image", frame, POOF_SHEET_KEY) as Phaser.GameObjects.Image;
        sprite
          .setVisible(true)
          .setDepth(24)
          .setAlpha(Math.max(0, alpha))
          .setOrigin(0.5, 0.5)
          .setPosition(burst.x, burst.y)
          .setRotation(0)
          .setFrame(frame)
          .setDisplaySize(size, size);
        if (burst.color === 0xffffff) sprite.setTint(0xffffff);
        else sprite.clearTint();
        this.activeObjectAssetIds.add(`fx:${burst.id}`);
      } else {
        this.fx.fillStyle(burst.color, alpha * 0.72);
        this.fx.fillCircle(burst.x, burst.y, 5 + progress * 8);
      }
    }
  }

  private bossColor(kind: string): number {
    if (kind.includes("cryo")) return 0x8eeaff;
    if (kind.includes("archive")) return 0xe0af67;
    if (kind.includes("clockwork")) return 0xffe35a;
    return 0x50ffc2;
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

  private shouldShowPerfOverlay(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get("perf") === "1" || params.get("frameStats") === "1";
  }

  private mountPerfOverlay(): void {
    if (!this.perfOverlayEnabled) return;
    const overlay = document.createElement("div");
    overlay.dataset.perfOverlay = "1";
    overlay.style.position = "absolute";
    overlay.style.top = "112px";
    overlay.style.left = "28px";
    overlay.style.zIndex = "30";
    overlay.style.padding = "8px 10px";
    overlay.style.border = "1px solid rgba(80, 255, 194, 0.42)";
    overlay.style.background = "rgba(5, 7, 13, 0.78)";
    overlay.style.color = "#dffcff";
    overlay.style.font = "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    overlay.style.whiteSpace = "pre";
    overlay.style.pointerEvents = "none";
    overlay.textContent = "Perf warmup...";
    uiRoot().append(overlay);
    this.perfOverlay = overlay;
  }

  private recordPerfSample(delta: number, updateMs: number, renderMs: number): void {
    if (!this.perfOverlayEnabled && !this.diagnosticsEnabled) return;
    const samples = this.perfSamples;
    samples.push({ delta, update: updateMs, render: renderMs });
    if (samples.length > 180) samples.shift();

    const now = performance.now();
    if (now - this.perfLastUpdate < 250) return;
    this.perfLastUpdate = now;

    const sortedDeltas = samples.map((sample) => sample.delta).sort((a, b) => a - b);
    const avgDelta = samples.reduce((sum, sample) => sum + sample.delta, 0) / Math.max(1, samples.length);
    const avgUpdate = samples.reduce((sum, sample) => sum + sample.update, 0) / Math.max(1, samples.length);
    const avgRender = samples.reduce((sum, sample) => sum + sample.render, 0) / Math.max(1, samples.length);
    const maxDelta = sortedDeltas[sortedDeltas.length - 1] || 0;
    const p95Delta = sortedDeltas[Math.min(sortedDeltas.length - 1, Math.floor(sortedDeltas.length * 0.95))] || 0;
    const spikes = samples.filter((sample) => sample.delta > 33).length;
    const stats = {
      fps: Math.round(1000 / Math.max(1, avgDelta)),
      avgDelta: Number(avgDelta.toFixed(2)),
      p95Delta: Number(p95Delta.toFixed(2)),
      maxDelta: Number(maxDelta.toFixed(2)),
      avgUpdate: Number(avgUpdate.toFixed(2)),
      avgRender: Number(avgRender.toFixed(2)),
      spikes
    };
    if (this.diagnosticsEnabled) document.documentElement.dataset.echoShiftPerfStats = JSON.stringify(stats);
    if (!this.perfOverlay) return;
    this.perfOverlay.textContent = [
      `FPS ${stats.fps}`,
      `Frame avg ${stats.avgDelta}ms`,
      `Frame p95 ${stats.p95Delta}ms`,
      `Frame max ${stats.maxDelta}ms`,
      `Update avg ${stats.avgUpdate}ms`,
      `Render avg ${stats.avgRender}ms`,
      `Spikes >33ms ${stats.spikes}`
    ].join("\n");
  }

  private prewarmLevelTextures(): void {
    const center = { x: this.level.start.x, y: this.level.start.y };
    const background = backgroundForLevel(this.level, this.levelIndex);
    const targets: Array<{ key: string; frame?: number }> = [
      { key: background.key },
      { key: OBJECT_ATLAS_KEY, frame: 0 },
      { key: LAUNCH_PAD_KEY, frame: 0 },
      { key: HAZARD_VENT_KEY, frame: 0 },
      { key: MONSTER_ATLAS_KEY, frame: 0 },
      { key: BOSS_ATLAS_KEY, frame: 0 },
      { key: POOF_SHEET_KEY, frame: 0 },
      { key: TERRAIN_TILE_KEY, frame: 0 },
      { key: "time-runner", frame: 0 },
      { key: "time-effects", frame: 0 },
      { key: CORE_MAJOR_KEY, frame: 0 }
    ];
    for (const target of targets) {
      if (!this.textures.exists(target.key)) continue;
      const sprite = this.add
        .image(center.x, center.y, target.key, target.frame)
        .setDepth(40)
        .setAlpha(0.001)
        .setScale(0.01);
      this.texturePrewarmSprites.push(sprite);
    }
    if (this.texturePrewarmSprites.length > 0) {
      this.time.delayedCall(180, () => this.destroyTexturePrewarmSprites());
    }
  }

  private destroyTexturePrewarmSprites(): void {
    for (const sprite of this.texturePrewarmSprites) {
      if (!sprite.scene) continue;
      sprite.destroy();
    }
    this.texturePrewarmSprites = [];
  }

  private exposeRenderDiagnostics(snapshot: RenderView): void {
    if (!this.diagnosticsEnabled) return;
    document.documentElement.dataset.echoShiftVisibleEchoTints = snapshot.echoes
      .map((echo) => `${echo.id}:${this.echoTint(echo).toString(16)}`)
      .join(",");
    document.documentElement.dataset.echoShiftDroneStates = (this.level.drones || [])
      .map((drone) => `${drone.id}:${droneIsActive(drone, snapshot.activePlates) ? "active" : "inactive"}`)
      .join(",");
    document.documentElement.dataset.echoShiftObjectAssetCount = String(this.activeObjectAssetIds.size + this.staticObjectAssetIds.size);
    document.documentElement.dataset.echoShiftSolidAssetFrames = this.staticSolidAssetFrames.join(",");
    document.documentElement.dataset.echoShiftTerrainDecorFrames = this.staticTerrainDecorFrames.join("|");
    document.documentElement.dataset.echoShiftTerrainDecorPropFrames = this.staticTerrainDecorPropFrames.join("|");
    document.documentElement.dataset.echoShiftTileAssetPhases = this.tileAssetPhases.join("|");
    document.documentElement.dataset.echoShiftTileAssetOrigins = this.tileAssetOrigins.join("|");
    document.documentElement.dataset.echoShiftLaserAssetTransforms = this.laserAssetTransforms.join("|");
    document.documentElement.dataset.echoShiftLaserAssetPositions = this.laserAssetPositions.join("|");
    document.documentElement.dataset.echoShiftDoorAssetTransforms = this.doorAssetTransforms.join("|");
    document.documentElement.dataset.echoShiftCoreSpriteFrames = this.coreSpriteFrames.join("|");
    document.documentElement.dataset.echoShiftExitUnlocked = snapshot.exitUnlocked ? "true" : "false";
    document.documentElement.dataset.echoShiftBossCheckpoint = snapshot.bossCheckpointActive ? "active" : "idle";
    document.documentElement.dataset.echoShiftEchoSensorAssetFrames = this.echoSensorAssetFrames.join("|");
    document.documentElement.dataset.echoShiftLaunchPadSpriteFrames = this.launchPadSpriteFrames.join("|");
    document.documentElement.dataset.echoShiftHazardVentSpriteFrames = this.hazardVentSpriteFrames.join("|");
    document.documentElement.dataset.echoShiftMonsterSpriteFrames = this.monsterSpriteFrames.join("|");
    document.documentElement.dataset.echoShiftBossSpriteFrames = this.bossSpriteFrames.join("|");
    document.documentElement.dataset.echoShiftBossEffectFrames = this.bossEffectFrames.join("|");
    document.documentElement.dataset.echoShiftSolidOutlineRects = this.staticSolidOutlineRects.join("|");
    document.documentElement.dataset.echoShiftDeathPresentation = this.retryRequired
      ? "retry-required"
      : this.deathPresentation
        ? this.deathPresentation.fadeStarted
          ? "fade-out"
          : "fall"
        : snapshot.dead
          ? "dead"
          : "idle";
    this.writeCameraDiagnostics();
    document.documentElement.dataset.echoShiftBackgroundFilter = this.backgroundTextureFilter;
    document.documentElement.dataset.echoShiftObjectAtlasFilter = this.objectAtlasTextureFilter;
    document.documentElement.dataset.echoShiftLaunchPadFilter = this.launchPadTextureFilter;
    document.documentElement.dataset.echoShiftMonsterAtlasFilter = this.monsterAtlasTextureFilter;
    document.documentElement.dataset.echoShiftBossAtlasFilter = this.bossAtlasTextureFilter;
    document.documentElement.dataset.echoShiftTerrainTileFilter = this.terrainTextureFilter;
    document.documentElement.dataset.echoShiftTerrainDecorPropFilter = this.terrainDecorPropTextureFilter;
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
    if (actor.onGround && Math.abs(actor.vx) > 1.1) return RUN_FRAMES[Math.floor(tick / 5) % RUN_FRAMES.length];
    if (actor.onGround && Math.abs(actor.vx) > 0.2) return 5;
    return 0;
  }

  private coreIsLarge(core: Core): boolean {
    return isMajorCore(core, this.requiredCoreIds);
  }

  private syncCoreSprites(snapshot: RenderView): void {
    const activeIds = this.activeCoreSpriteIds;
    activeIds.clear();
    this.coreSpriteFrames = [];

    for (const core of this.level.cores || []) {
      if (snapshot.collectedCores.has(core.id)) continue;
      const large = this.coreIsLarge(core);
      const textureKey = large ? CORE_MAJOR_KEY : "time-effects";
      if (!this.textures.exists(textureKey)) continue;
      const frame = snapshot.tick % 44 < 22 ? 0 : 1;
      const center = rectCenter(core);
      let sprite = this.coreSprites.get(core.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, textureKey, 0).setDepth(11);
        this.coreSprites.set(core.id, sprite);
      }
      sprite
        .setVisible(true)
        .setTexture(textureKey, frame)
        .setPosition(Math.round(center.x), Math.round(center.y))
        .setScale(large ? 0.58 : 0.34)
        .setAlpha(large ? 0.98 : 0.94);
      if (this.diagnosticsEnabled) this.coreSpriteFrames.push(`${core.id}:${textureKey}:${frame}:${large ? "large" : "small"}`);
      activeIds.add(core.id);
    }

    for (const [id, sprite] of this.coreSprites) {
      if (!activeIds.has(id)) sprite.setVisible(false);
    }
  }

  private syncExitSprite(snapshot: RenderView): void {
    if (!this.textures.exists("time-effects")) return;
    if (!snapshot.exitUnlocked) {
      this.exitSprite?.setVisible(false);
      return;
    }
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
    outlines.lineStyle(1, 0x43f7ff, terrainMaterialForSolid(solid) === "glass-energy" ? 0.52 : 0.4);
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
      this.staticSolidOutlineRects.push(`${solid.id}:${Math.round(solid.x)},${Math.round(solid.y)}:${Math.round(solid.w)}x${Math.round(solid.h)}:43f7ff:${Math.round(outlines.depth)}:${sides}`);
    }
  }

  private solidOutlineSegments(solid: Solid): SolidOutlineSegment[] {
    const width = Math.max(0, solid.w);
    const height = Math.max(0, solid.h);
    if (width <= 0 || height <= 0) return [];
    const frame = this.solidFrame(solid);
    const material = terrainMaterialForSolid(solid);
    const segments: Record<SolidOutlineSide, Array<{ from: number; to: number }>> = {
      top: [{ from: solid.x, to: solid.x + solid.w }],
      bottom: [{ from: solid.x, to: solid.x + solid.w }],
      left: [{ from: solid.y, to: solid.y + solid.h }],
      right: [{ from: solid.y, to: solid.y + solid.h }]
    };

    for (const neighbor of this.level.solids) {
      if (neighbor === solid || this.solidFrame(neighbor) !== frame || terrainMaterialForSolid(neighbor) !== material) continue;
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
    this.tileAssetPhases.length = 0;
    this.tileAssetOrigins.length = 0;
    this.laserAssetTransforms.length = 0;
    this.laserAssetPositions.length = 0;
    this.doorAssetTransforms.length = 0;
    this.echoSensorAssetFrames.length = 0;
    this.launchPadSpriteFrames.length = 0;
    this.hazardVentSpriteFrames.length = 0;
  }

  private finishObjectAssetSync(): void {
    for (const [id, asset] of this.objectAssets) {
      if (!this.activeObjectAssetIds.has(id) && !this.staticObjectAssetIds.has(id)) asset.setVisible(false);
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
    const orientation = door.orientation === "horizontal" ? "horizontal" : "vertical";
    const width = orientation === "horizontal" ? Math.max(44, door.w) : Math.max(34, door.w * 1.72);
    const height = orientation === "horizontal" ? Math.max(34, door.h * 1.72) : Math.max(44, door.h);
    const displayWidth = orientation === "horizontal" ? height : width;
    const displayHeight = orientation === "horizontal" ? width : height;
    const originX = 0.5;
    const originY = orientation === "horizontal" ? 0.5 : 0;
    const x = door.x + door.w / 2;
    const y = orientation === "horizontal" ? door.y + door.h / 2 : door.y;
    asset
      .setVisible(true)
      .setDepth(4)
      .setAlpha(open ? 0.76 : 0.98)
      .setOrigin(originX, originY)
      .setPosition(x, y)
      .setRotation(orientation === "horizontal" ? Math.PI / 2 : 0)
      .setFrame(frame)
      .setDisplaySize(displayWidth, displayHeight);
    this.activeObjectAssetIds.add(`door:${door.id}`);
    if (this.diagnosticsEnabled) {
      const left = orientation === "horizontal" ? asset.x - width / 2 : asset.x - asset.displayWidth * asset.originX;
      const top = orientation === "horizontal" ? asset.y - height / 2 : asset.y - asset.displayHeight * asset.originY;
      this.doorAssetTransforms.push(
        `door:${door.id}:${frame}:logic:${Math.round(door.x)},${Math.round(door.y)},${Math.round(door.w)},${Math.round(door.h)}:pos:${Math.round(asset.x)},${Math.round(asset.y)}:origin:${asset.originX},${asset.originY}:box:${Math.round(left)},${Math.round(top)},${Math.round(width)},${Math.round(height)}:orientation:${orientation}:rotation:${Math.round(Phaser.Math.RadToDeg(asset.rotation))}`
      );
    }
  }

  private solidFrame(solid: Solid): number {
    return OBJECT_FRAME[solidVisualRoleFor(solid)];
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

  private assetFor(id: string, kind: "tile" | "image", frame?: number | string, textureKey = OBJECT_ATLAS_KEY): ObjectAsset {
    const existing = this.objectAssets.get(id);
    if (existing) {
      const kindMatches = (kind === "tile" && existing.type === "TileSprite") || (kind === "image" && existing.type === "Image");
      if (kindMatches && existing.texture.key === textureKey) return existing;
      existing.destroy();
      this.objectAssets.delete(id);
    }
    const asset =
      kind === "tile"
        ? this.add.tileSprite(0, 0, 1, 1, textureKey, frame)
        : this.add.image(0, 0, textureKey, frame);
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

}
