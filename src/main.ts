import Phaser from "phaser";
import "./styles.css";
import { readEditorDraftSnapshot } from "./data/editorDraft";
import { setRuntimeLevels } from "./data/levels";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { LevelSelectScene } from "./scenes/LevelSelectScene";
import { MenuScene } from "./scenes/MenuScene";
import { audio } from "./game/audio";

const params = new URLSearchParams(window.location.search);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-root",
  backgroundColor: "#05070d",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: 960,
    height: 540
  },
  render: {
    antialias: false,
    powerPreference: "high-performance"
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene]
};

let game: Phaser.Game | null = null;

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
  game = new Phaser.Game(config);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.destroy(true);
    game = null;
    audio.dispose();
  });
}
