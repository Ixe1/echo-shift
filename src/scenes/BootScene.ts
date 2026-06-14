import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { levelBackgrounds } from "../game/backgrounds";
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

  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.image("echo-logo", "/assets/echo-shift-logo.png");
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
    for (const background of Object.values(levelBackgrounds)) {
      this.load.image(background.key, background.src);
    }
  }

  create(): void {
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
            <img class="brand-logo" src="/assets/echo-shift-logo.png" alt="Echo Shift" />
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
