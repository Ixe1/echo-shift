import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.load.svg("echo-logo", "/assets/echo-shift-mark.svg", { width: 640, height: 220 });
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
