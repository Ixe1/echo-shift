import Phaser from "phaser";
import { audio } from "../game/audio";
import { clearUi, icon, uiRoot } from "../ui/dom";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create(): void {
    clearUi();
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="/assets/echo-shift-mark.svg" alt="Echo Shift" />
            <p class="tagline">Rewind failed runs into reliable echoes, then cooperate with your past selves through ten compact time-lab rooms.</p>
          </section>
          <section class="panel menu-panel">
            <h1>Echo Shift</h1>
            <p>Community Dev Challenge build. Codex-assisted design, code, and QA.</p>
            <div class="button-grid">
              <button class="ui-button primary" data-play>${icon("play")} Play</button>
              <button class="ui-button" data-levels>${icon("levels")} Level Select</button>
              <button class="ui-button" data-credits>${icon("credits")} Credits</button>
            </div>
          </section>
        </div>
      </main>
    `;

    root.querySelector("[data-play]")?.addEventListener("click", () => {
      audio.play("select");
      audio.startMusic();
      this.scene.start("GameScene", { levelIndex: 0 });
    });
    root.querySelector("[data-levels]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("LevelSelectScene");
    });
    root.querySelector("[data-credits]")?.addEventListener("click", () => this.showCredits());
  }

  private showCredits(): void {
    audio.play("select");
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen">
        <section class="panel menu-panel">
          <h1>Credits</h1>
          <p class="credits-text">Echo Shift was designed and built with Codex-assisted development for the Community Dev Challenge.</p>
          <p class="credits-text">Game design, TypeScript implementation, procedural visual direction, and QA loop produced in this workspace.</p>
          <div class="button-grid">
            <button class="ui-button primary" data-back>${icon("back")} Back</button>
          </div>
        </section>
      </main>
    `;
    root.querySelector("[data-back]")?.addEventListener("click", () => this.create());
  }
}
