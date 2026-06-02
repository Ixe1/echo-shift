import Phaser from "phaser";
import { levels } from "../data/levels";
import { audio } from "../game/audio";
import { formatFrames } from "../game/geometry";
import { getBestScores } from "../game/progress";
import { clearUi, icon, uiRoot } from "../ui/dom";

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super("LevelSelectScene");
  }

  create(): void {
    audio.playMusic("menu");
    clearUi();
    const root = uiRoot();
    const unlocked = levels.length;
    const scores = getBestScores();
    const buttons = levels
      .map((level) => {
        const locked = level.index + 1 > unlocked;
        const score = scores[level.id];
        const best = score ? `${score.medal} · ${formatFrames(score.frames)} · ${score.echoes}E` : "No clear";
        return `
          <button class="level-button ${locked ? "locked" : ""}" data-level="${level.index}" ${locked ? "disabled" : ""}>
            <span class="level-number">${level.index + 1}</span>
            <span class="level-name">${level.name}</span>
            <span class="level-best">${locked ? "Locked" : best}</span>
          </button>
        `;
      })
      .join("");

    root.innerHTML = `
      <main class="screen scroll-screen art-screen">
        <section class="panel level-select">
          <div>
            <h1>Level Select</h1>
            <p class="credits-text">All rooms are available. Cleared runs save medals.</p>
          </div>
          <div class="level-grid">${buttons}</div>
          <div class="button-grid">
            <button class="ui-button" data-back>${icon("back")} Title</button>
          </div>
        </section>
      </main>
    `;

    root.querySelector("[data-back]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("MenuScene");
    });

    root.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => {
      button.addEventListener("click", () => {
        const levelIndex = Number(button.dataset.level || 0);
        audio.play("select");
        this.scene.start("GameScene", { levelIndex });
      });
    });
  }
}
