import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { MenuScene } from "./scenes/MenuScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: "game-root",
  backgroundColor: "#05070d",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540
  },
  render: {
    antialias: false,
    powerPreference: "high-performance"
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene]
};

new Phaser.Game(config);
