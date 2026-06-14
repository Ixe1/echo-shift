import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { formatFrames } from "../game/geometry";
import { getBestScores } from "../game/progress";
import { formatScore } from "../game/scoring";
import { isSecretAccessUnlocked } from "../game/secretAccess";
import { resetCampaignVitals } from "../game/session";
import { soundtrackForLevel } from "../game/soundtracks";
import { clearUi, icon, uiRoot } from "../ui/dom";
import { bindMenuNavigation, type MenuNavigationBinding } from "../ui/menuNavigation";

export class LevelSelectScene extends Phaser.Scene {
  private uiCleanupRegistered = false;
  private menuNavigation: MenuNavigationBinding | null = null;

  constructor() {
    super("LevelSelectScene");
  }

  create(): void {
    audio.playMusic("menu");
    this.destroyMenuNavigation();
    clearUi();
    this.registerUiCleanup();
    const root = uiRoot();
    const draftPlaytest = isDraftPlaytestActive();
    if (!draftPlaytest && !isSecretAccessUnlocked()) {
      this.scene.start("MenuScene");
      return;
    }
    levels.forEach((level, levelPosition) => void audio.preloadMusic(soundtrackForLevel(level, levelPosition).key));
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
              draftPlaytest
                ? "Testing the browser-saved editor draft. Draft clears do not save scores."
                : "Practice access unlocked for this page. These clears do not save scores."
            }</p>
          </div>
          <div class="level-grid">${buttons}</div>
          <div class="button-grid">
            <button class="ui-button" data-back>${icon("back")} ${draftPlaytest ? "Draft Menu" : "Main Menu"}</button>
          </div>
        </section>
      </main>
    `;

    root.querySelector("[data-back]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("MenuScene");
    });

    root.querySelectorAll<HTMLButtonElement>("[data-level]").forEach((button) => {
      const warmButtonMusic = () => {
        const levelIndex = Number(button.dataset.level || 0);
        const level = levels[levelIndex];
        if (level) void audio.preloadMusic(soundtrackForLevel(level, levelIndex).key);
      };
      button.addEventListener("pointerenter", warmButtonMusic);
      button.addEventListener("focus", warmButtonMusic);
      button.addEventListener("click", () => {
        const levelIndex = Number(button.dataset.level || 0);
        audio.play("select");
        resetCampaignVitals();
        this.scene.start("GameScene", { levelIndex, scoreEligible: false });
      });
    });
    this.menuNavigation = bindMenuNavigation(root, {
      onBack: () => this.scene.start("MenuScene"),
      onNavigate: () => audio.play("select")
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
    this.destroyMenuNavigation();
    this.uiCleanupRegistered = false;
    clearUi();
  };

  private destroyMenuNavigation(): void {
    this.menuNavigation?.destroy();
    this.menuNavigation = null;
  }
}
