import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";

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
    if (isDraftPlaytestActive()) {
      this.scene.start("GameScene", { levelIndex: playtestLevelIndex() });
      return;
    }
    this.scene.start("MenuScene");
  }
}
