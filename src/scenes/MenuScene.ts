import Phaser from "phaser";
import { readEditorDraftCurrentIndex } from "../data/editorDraft";
import { getLevel, isDraftPlaytestActive, levels } from "../data/levels";
import { tutorialLevel } from "../data/tutorialLevel";
import { audio } from "../game/audio";
import { soundtrackForLevel } from "../game/soundtracks";
import { clearUi, icon, uiRoot } from "../ui/dom";
import { bindOptionsPanel, optionsPanelHtml } from "../ui/options";

export class MenuScene extends Phaser.Scene {
  private uiCleanupRegistered = false;

  constructor() {
    super("MenuScene");
  }

  create(): void {
    audio.playMusic("menu");
    clearUi();
    this.registerUiCleanup();
    const root = uiRoot();
    const draftPlaytest = isDraftPlaytestActive();
    this.preloadLikelyMusic(draftPlaytest);
    const editorButton = import.meta.env.DEV
      ? `<button class="ui-button" data-editor>${icon("levels")} Level Editor</button>`
      : "";
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="/assets/echo-shift-logo.png" alt="Echo Shift" />
            <p class="tagline">Rewind to leave reliable echoes in place, then cooperate with your anchored selves through five compact time-shift rooms.</p>
          </section>
          <section class="panel menu-panel">
            <h1>${draftPlaytest ? "Draft Playtest" : "Main Menu"}</h1>
            <p>${
              draftPlaytest
                ? "Testing the browser-saved editor draft. Clears and scores are not written to normal progress."
                : "Community Dev Challenge build. Codex-assisted design, code, and QA."
            }</p>
            <div class="button-grid">
              <button class="ui-button primary" data-play>${icon("play")} ${draftPlaytest ? "Play Draft" : "Play"}</button>
              ${draftPlaytest ? "" : `<button class="ui-button" data-tutorial>${icon("play")} Tutorial</button>`}
              <button class="ui-button" data-levels>${icon("levels")} Level Select</button>
              ${editorButton}
              <button class="ui-button" data-options>Options</button>
              <button class="ui-button" data-credits>${icon("credits")} Credits</button>
            </div>
          </section>
        </div>
      </main>
    `;

    root.querySelector("[data-play]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("GameScene", { levelIndex: draftPlaytest ? this.currentDraftLevelIndex() : 0 });
    });
    root.querySelector("[data-levels]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("LevelSelectScene");
    });
    root.querySelector("[data-tutorial]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("GameScene", { tutorial: true });
    });
    root.querySelector("[data-editor]")?.addEventListener("click", () => {
      audio.play("select");
      const url = new URL(window.location.href);
      url.searchParams.set("editor", "1");
      url.searchParams.delete("playtestDraft");
      url.searchParams.delete("level");
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    });
    root.querySelector("[data-credits]")?.addEventListener("click", () => this.showCredits());
    root.querySelector("[data-options]")?.addEventListener("click", () => this.showOptions());
  }

  private currentDraftLevelIndex(): number {
    const parsed = Number(new URLSearchParams(window.location.search).get("level"));
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
    return readEditorDraftCurrentIndex();
  }

  private preloadLikelyMusic(draftPlaytest: boolean): void {
    const levelIndex = draftPlaytest ? this.currentDraftLevelIndex() : 0;
    const level = draftPlaytest ? getLevel(levelIndex) : levels[0];
    void audio.preloadMusic(soundtrackForLevel(level, levelIndex).key);
    if (!draftPlaytest) void audio.preloadMusic(soundtrackForLevel(tutorialLevel, 0).key);
  }

  private showCredits(): void {
    audio.play("select");
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <section class="panel menu-panel">
          <h1>Credits</h1>
          <p class="credits-text">Designed and built with Codex-assisted development for the Community Dev Challenge.</p>
          <p class="credits-text">Game design, TypeScript implementation, procedural visual direction, and QA loop produced in this workspace.</p>
          <div class="button-grid">
            <button class="ui-button primary" data-back>${icon("back")} Back</button>
          </div>
        </section>
      </main>
    `;
    root.querySelector("[data-back]")?.addEventListener("click", () => this.create());
  }

  private showOptions(): void {
    audio.play("select");
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        ${optionsPanelHtml()}
      </main>
    `;
    bindOptionsPanel(root.querySelector<HTMLElement>(".screen") || root, {
      onBack: () => this.create(),
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
    this.uiCleanupRegistered = false;
    clearUi();
  };
}
