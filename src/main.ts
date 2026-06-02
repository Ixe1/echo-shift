import Phaser from "phaser";
import "./styles.css";
import { readEditorDraftSnapshot } from "./data/editorDraft";
import { setRuntimeLevels } from "./data/levels";
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

const params = new URLSearchParams(window.location.search);

if (params.get("editor") === "1") {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app");
  void import("./editor/levelEditor").then(({ mountLevelEditor }) => {
    mountLevelEditor(app);
  });
} else {
  if (params.get("playtestDraft") === "1") {
    const draft = readEditorDraftSnapshot();
    if (draft) setRuntimeLevels(draft.levels, { draftPlaytest: true });
  }
  new Phaser.Game(config);
}
