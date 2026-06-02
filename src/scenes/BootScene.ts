import Phaser from "phaser";

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
    this.scene.start("MenuScene");
  }
}
