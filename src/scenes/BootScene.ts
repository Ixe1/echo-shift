import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { backgroundForLevel } from "../game/backgrounds";
import {
  BOSS_ATLAS_FRAME_HEIGHT,
  BOSS_ATLAS_FRAME_WIDTH,
  BOSS_ATLAS_KEY,
  ARCHIVE_BOSS_CLEAN_KEY,
  ARCHIVE_BOOK_VOLLEY_FRAME_HEIGHT,
  ARCHIVE_BOOK_VOLLEY_FRAME_WIDTH,
  ARCHIVE_BOOK_VOLLEY_KEY,
  CRYO_BOSS_CLEAN_KEY,
  MONSTER_ATLAS_FRAME_HEIGHT,
  MONSTER_ATLAS_FRAME_WIDTH,
  MONSTER_ATLAS_KEY,
  POOF_FRAME_HEIGHT,
  POOF_FRAME_WIDTH,
  POOF_SHEET_KEY,
  STORM_BOSS_CLEAN_KEY
} from "../game/enemySprites";
import { soundtrackForLevel } from "../game/soundtracks";
import { allTerrainDecorProps, terrainDecorPropSrc, terrainDecorPropTextureKey } from "../game/terrainDecorProps";
import { TERRAIN_TILE_KEY, TERRAIN_TILE_SIZE } from "../game/terrainMaterials";
import { clearUi, icon, uiRoot } from "../ui/dom";
import { bindMenuNavigation, type MenuNavigationBinding } from "../ui/menuNavigation";

const playtestLevelIndex = (): number => {
  const raw = new URLSearchParams(window.location.search).get("level");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(levels.length - 1, Math.round(parsed)));
};

export class BootScene extends Phaser.Scene {
  private menuNavigation: MenuNavigationBinding | null = null;
  private loadingScreen: HTMLElement | null = null;
  private loadingBar: HTMLElement | null = null;
  private loadingPercent: HTMLElement | null = null;
  private loadingStatus: HTMLElement | null = null;

  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.showLoadingScreen();
    this.bindLoadingProgress();
    this.load.image("echo-logo", "/assets/echo-shift-logo.webp");
    this.load.spritesheet("time-runner", "/assets/sprites/time-runner-sheet.png", {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.spritesheet("time-effects", "/assets/sprites/time-effects-sheet.png", {
      frameWidth: 96,
      frameHeight: 96
    });
    this.load.spritesheet("core-major", "/assets/sprites/core-major-sheet.png", {
      frameWidth: 128,
      frameHeight: 128
    });
    this.load.spritesheet("object-atlas", "/assets/sprites/object-atlas.png", {
      frameWidth: 256,
      frameHeight: 256
    });
    this.load.spritesheet("launch-pad", "/assets/sprites/launch-pad-sheet.png", {
      frameWidth: 256,
      frameHeight: 192
    });
    this.load.spritesheet("hazard-vent", "/assets/sprites/hazard-vent-sheet.png", {
      frameWidth: 352,
      frameHeight: 288
    });
    this.load.spritesheet(BOSS_ATLAS_KEY, "/assets/sprites/boss-atlas.png", {
      frameWidth: BOSS_ATLAS_FRAME_WIDTH,
      frameHeight: BOSS_ATLAS_FRAME_HEIGHT
    });
    this.load.spritesheet(STORM_BOSS_CLEAN_KEY, "/assets/sprites/storm-relay-warden-clean.png", {
      frameWidth: BOSS_ATLAS_FRAME_WIDTH,
      frameHeight: BOSS_ATLAS_FRAME_HEIGHT
    });
    this.load.spritesheet(CRYO_BOSS_CLEAN_KEY, "/assets/sprites/cryo-conservator-clean.png", {
      frameWidth: BOSS_ATLAS_FRAME_WIDTH,
      frameHeight: BOSS_ATLAS_FRAME_HEIGHT
    });
    this.load.spritesheet(ARCHIVE_BOSS_CLEAN_KEY, "/assets/sprites/archive-custodian-clean.png", {
      frameWidth: BOSS_ATLAS_FRAME_WIDTH,
      frameHeight: BOSS_ATLAS_FRAME_HEIGHT
    });
    this.load.spritesheet(ARCHIVE_BOOK_VOLLEY_KEY, "/assets/sprites/archive-book-volley-sheet.png", {
      frameWidth: ARCHIVE_BOOK_VOLLEY_FRAME_WIDTH,
      frameHeight: ARCHIVE_BOOK_VOLLEY_FRAME_HEIGHT
    });
    this.load.spritesheet(MONSTER_ATLAS_KEY, "/assets/sprites/monster-atlas.png", {
      frameWidth: MONSTER_ATLAS_FRAME_WIDTH,
      frameHeight: MONSTER_ATLAS_FRAME_HEIGHT
    });
    this.load.spritesheet(POOF_SHEET_KEY, "/assets/sprites/enemy-poof-sheet.png", {
      frameWidth: POOF_FRAME_WIDTH,
      frameHeight: POOF_FRAME_HEIGHT
    });
    this.load.spritesheet(TERRAIN_TILE_KEY, "/assets/sprites/terrain-tiles.png", {
      frameWidth: TERRAIN_TILE_SIZE,
      frameHeight: TERRAIN_TILE_SIZE,
      margin: 1,
      spacing: 2
    });
    for (const prop of allTerrainDecorProps) {
      this.load.image(terrainDecorPropTextureKey(prop), terrainDecorPropSrc(prop));
    }
    const background = this.startupBackground();
    if (background && !this.textures.exists(background.key)) {
      this.load.image(background.key, background.src);
    }
  }

  create(): void {
    this.finishLoadingScreen();
    const particle = this.add.graphics({ x: 0, y: 0 });
    particle.fillStyle(0x43f7ff, 1);
    particle.fillCircle(4, 4, 4);
    particle.generateTexture("particle-cyan", 8, 8);
    particle.clear();
    particle.fillStyle(0xffe35a, 1);
    particle.fillCircle(4, 4, 4);
    particle.generateTexture("particle-gold", 8, 8);
    particle.destroy();
    this.showAudioGate();
  }

  private showAudioGate(): void {
    this.menuNavigation?.destroy();
    this.menuNavigation = null;
    clearUi();
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="/assets/echo-shift-logo.webp" alt="Echo Shift" />
            <p class="tagline">Time-lab systems armed. Start the session when ready.</p>
          </section>
          <section class="panel menu-panel action-panel" aria-label="Echo Shift start">
            <div class="button-grid">
              <button class="ui-button primary" data-start-game>${icon("play")} Start</button>
            </div>
          </section>
        </div>
      </main>
    `;

    const startButton = root.querySelector<HTMLButtonElement>("[data-start-game]");
    let started = false;
    const cleanup = () => {
      window.removeEventListener("keydown", handleKeyDown);
      this.menuNavigation?.destroy();
      this.menuNavigation = null;
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      if (!started) clearUi();
    };
    const start = () => {
      if (started) return;
      started = true;
      cleanup();
      audio.unlock();
      const target = this.nextScene();
      void audio.preloadMusic(target.musicKey);
      audio.playMusic(target.musicKey);
      clearUi();
      this.scene.start(target.scene, target.data);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") start();
    };

    startButton?.addEventListener("click", start, { once: true });
    window.addEventListener("keydown", handleKeyDown);
    this.menuNavigation = bindMenuNavigation(root, { onNavigate: () => audio.play("select") });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    startButton?.focus();
  }

  private showLoadingScreen(): void {
    clearUi();
    const root = uiRoot();
    const screen = document.createElement("main");
    screen.className = "boot-loading";
    screen.dataset.bootLoading = "active";
    screen.innerHTML = `
      <section class="boot-loading-panel" aria-label="Echo Shift loading">
        <div class="boot-loading-brand" aria-hidden="true">
          <span class="boot-loading-mark">ES</span>
          <strong>Echo Shift</strong>
        </div>
        <div class="boot-loading-copy">
          <span class="boot-loading-kicker">Time-lab startup</span>
          <h1>Loading assets</h1>
          <p data-loading-status>Preparing preload queue</p>
        </div>
        <div class="boot-loading-progress" role="progressbar" aria-label="Asset loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span data-loading-bar></span>
        </div>
        <div class="boot-loading-meta">
          <span data-loading-percent>0%</span>
          <span data-loading-file>Queueing runtime textures</span>
        </div>
      </section>
    `;
    root.append(screen);
    this.loadingScreen = screen;
    this.loadingBar = screen.querySelector<HTMLElement>("[data-loading-bar]");
    this.loadingPercent = screen.querySelector<HTMLElement>("[data-loading-percent]");
    this.loadingStatus = screen.querySelector<HTMLElement>("[data-loading-status]");
    this.writeLoadingDiagnostics("visible", 0, "queue");
  }

  private bindLoadingProgress(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.on(Phaser.Loader.Events.FILE_PROGRESS, this.handleFileProgress, this);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupLoadingListeners, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupLoadingListeners, this);
  }

  private handleLoadProgress(progress: number): void {
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
    this.loadingBar?.style.setProperty("--load-progress", String(percent / 100));
    this.loadingPercent?.replaceChildren(`${percent}%`);
    this.loadingScreen?.querySelector<HTMLElement>(".boot-loading-progress")?.setAttribute("aria-valuenow", String(percent));
    this.writeLoadingDiagnostics("loading", percent, this.loadingStatus?.textContent || "loading");
  }

  private handleFileProgress(file: Phaser.Loader.File): void {
    const label = this.loadingLabelFor(file.key);
    this.loadingStatus?.replaceChildren(label);
    const fileNode = this.loadingScreen?.querySelector<HTMLElement>("[data-loading-file]");
    fileNode?.replaceChildren(`${file.type}: ${file.key}`);
    this.writeLoadingDiagnostics("loading", undefined, label);
  }

  private handleLoadComplete(): void {
    this.handleLoadProgress(1);
    this.loadingStatus?.replaceChildren("Preload complete");
    this.writeLoadingDiagnostics("complete", 100, "complete");
  }

  private cleanupLoadingListeners(): void {
    this.load.off(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.off(Phaser.Loader.Events.FILE_PROGRESS, this.handleFileProgress, this);
    this.load.off(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete, this);
  }

  private finishLoadingScreen(): void {
    this.cleanupLoadingListeners();
    this.loadingScreen?.remove();
    this.loadingScreen = null;
    this.loadingBar = null;
    this.loadingPercent = null;
    this.loadingStatus = null;
  }

  private loadingLabelFor(key: string): string {
    if (key.startsWith("terrain-decor-prop:")) return "Loading terrain decor";
    if (key.includes("background") || key.includes("lab") || key.includes("garden") || key.includes("relay") || key.includes("grove") || key.includes("archive")) {
      return "Loading room backdrop";
    }
    if (key.includes("boss") || key.includes("monster")) return "Loading enemy sprites";
    if (key.includes("time") || key.includes("runner")) return "Loading rewind sprites";
    return "Loading runtime textures";
  }

  private startupBackground(): ReturnType<typeof backgroundForLevel> | null {
    if (!isDraftPlaytestActive()) return null;
    const levelIndex = playtestLevelIndex();
    return backgroundForLevel(levels[levelIndex], levelIndex);
  }

  private writeLoadingDiagnostics(phase: string, percent?: number, current?: string): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.echoShiftBootLoading = phase;
    if (typeof percent === "number") document.documentElement.dataset.echoShiftBootLoadProgress = String(percent);
    if (current) document.documentElement.dataset.echoShiftBootLoadCurrent = current;
  }

  private nextScene(): { scene: "MenuScene"; data?: undefined; musicKey: "menu" } | { scene: "GameScene"; data: { levelIndex: number }; musicKey: ReturnType<typeof soundtrackForLevel>["key"] } {
    if (isDraftPlaytestActive()) {
      const levelIndex = playtestLevelIndex();
      return {
        scene: "GameScene",
        data: { levelIndex },
        musicKey: soundtrackForLevel(levels[levelIndex], levelIndex).key
      };
    }
    return { scene: "MenuScene", musicKey: "menu" };
  }
}
