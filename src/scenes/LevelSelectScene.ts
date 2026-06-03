import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { formatFrames } from "../game/geometry";
import { getBestScores } from "../game/progress";
import { formatScore } from "../game/scoring";
import { clearUi, icon, uiRoot } from "../ui/dom";

export class LevelSelectScene extends Phaser.Scene {
  private uiCleanupRegistered = false;

  constructor() {
    super("LevelSelectScene");
  }

  create(): void {
    audio.playMusic("menu");
    clearUi();
    this.registerUiCleanup();
    const root = uiRoot();
    const draftPlaytest = isDraftPlaytestActive();
    const unlocked = levels.length;
    const scores = draftPlaytest ? {} : getBestScores();
    const buttons = levels
      .map((level, levelPosition) => {
        const locked = levelPosition + 1 > unlocked;
        const score = scores[level.id];
        const best = score
          ? score.legacy
            ? `Previous clear · ${formatFrames(score.frames)} · ${score.echoes}E`
            : `${formatScore(score.score)} · ${formatFrames(score.frames)} · ${score.deaths}D`
          : "No clear";
        return `
          <button class="level-button ${locked ? "locked" : ""}" data-level="${levelPosition}" ${locked ? "disabled" : ""}>
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
            <h1>${draftPlaytest ? "Draft Levels" : "Level Select"}</h1>
            <p class="credits-text">${
              draftPlaytest ? "Testing the browser-saved editor draft. Draft clears do not save scores." : "All rooms are available. Cleared runs save scores."
            }</p>
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

  private registerUiCleanup(): void {
    if (this.uiCleanupRegistered) return;
    this.uiCleanupRegistered = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupUi);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupUi);
  }

  private cleanupUi = (): void => {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.cleanupUi);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.cleanupUi);
    this.uiCleanupRegistered = false;
    clearUi();
  };
}
