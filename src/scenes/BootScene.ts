import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { levelBackgrounds } from "../game/backgrounds";
import { soundtrackForLevel } from "../game/soundtracks";
import { clearUi, icon, uiRoot } from "../ui/dom";

const playtestLevelIndex = (): number => {
  const raw = new URLSearchParams(window.location.search).get("level");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(levels.length - 1, Math.round(parsed)));
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.svg("echo-logo", "/assets/echo-shift-mark.svg", { width: 640, height: 220 });
    this.load.spritesheet("time-runner", "/assets/sprites/time-runner-sheet.png", {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.spritesheet("time-effects", "/assets/sprites/time-effects-sheet.png", {
      frameWidth: 96,
      frameHeight: 96
    });
    this.load.spritesheet("object-atlas", "/assets/sprites/object-atlas.png", {
      frameWidth: 256,
      frameHeight: 256
    });
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
    clearUi();
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="/assets/echo-shift-mark.svg" alt="Echo Shift" />
            <p class="tagline">Time-lab systems armed. Start the session when ready.</p>
          </section>
          <section class="panel menu-panel">
            <h1>Echo Shift</h1>
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
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    const start = () => {
      if (started) return;
      started = true;
      cleanup();
      audio.unlock();
      const target = this.nextScene();
      audio.playMusic(target.musicKey);
      clearUi();
      this.scene.start(target.scene, target.data);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") start();
    };

    startButton?.addEventListener("click", start, { once: true });
    window.addEventListener("keydown", handleKeyDown);
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
