import Phaser from "phaser";
import { readEditorDraftCurrentIndex } from "../data/editorDraft";
import { getLevel, isDraftPlaytestActive, levels } from "../data/levels";
import { tutorialLevel } from "../data/tutorialLevel";
import { audio } from "../game/audio";
import { isSecretAccessUnlocked, secretInputFromKeyboardEvent, secretSequence, unlockSecretAccess } from "../game/secretAccess";
import { resetCampaignVitals } from "../game/session";
import { soundtrackForLevel } from "../game/soundtracks";
import { clearUi, icon, uiRoot } from "../ui/dom";
import { bindMenuNavigation, type MenuNavigationBinding } from "../ui/menuNavigation";
import { bindOptionsPanel, optionsPanelHtml } from "../ui/options";

export class MenuScene extends Phaser.Scene {
  private uiCleanupRegistered = false;
  private menuNavigation: MenuNavigationBinding | null = null;
  private secretProgress = 0;
  private secretCodeEnabled = false;
  private readonly handleSecretKeyDown = (event: KeyboardEvent): void => {
    if (!this.secretCodeEnabled || isSecretAccessUnlocked() || event.repeat) return;
    const input = secretInputFromKeyboardEvent(event);
    if (!input) return;
    const sequence = secretSequence();
    if (input === sequence[this.secretProgress]) this.secretProgress += 1;
    else this.secretProgress = input === sequence[0] ? 1 : 0;
    if (this.secretProgress < sequence.length) return;
    event.preventDefault();
    this.secretProgress = 0;
    unlockSecretAccess();
    audio.play("extraLife");
    this.create();
  };

  constructor() {
    super("MenuScene");
  }

  create(): void {
    audio.playMusic("menu");
    this.destroyMenuNavigation();
    clearUi();
    this.registerUiCleanup();
    this.secretCodeEnabled = true;
    const root = uiRoot();
    const draftPlaytest = isDraftPlaytestActive();
    const secretUnlocked = isSecretAccessUnlocked();
    this.preloadLikelyMusic(draftPlaytest);
    const editorButton = secretUnlocked ? `<button class="ui-button" data-editor>${icon("levels")} Level Editor</button>` : "";
    const levelSelectButton = secretUnlocked ? `<button class="ui-button" data-levels>${icon("levels")} Level Select</button>` : "";
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="/assets/echo-shift-logo.png" alt="Echo Shift" />
            <p class="tagline">Rewind to leave reliable echoes in place, then cooperate with your anchored selves through ${levels.length} compact time-shift rooms.</p>
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
              ${levelSelectButton}
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
      resetCampaignVitals();
      this.scene.start("GameScene", { levelIndex: draftPlaytest ? this.currentDraftLevelIndex() : 0, scoreEligible: !draftPlaytest });
    });
    root.querySelector("[data-levels]")?.addEventListener("click", () => {
      audio.play("select");
      this.scene.start("LevelSelectScene");
    });
    root.querySelector("[data-tutorial]")?.addEventListener("click", () => {
      audio.play("select");
      resetCampaignVitals();
      this.scene.start("GameScene", { tutorial: true, scoreEligible: false });
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
    this.bindMenuNavigation();
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
    this.secretCodeEnabled = false;
    this.destroyMenuNavigation();
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
    this.bindMenuNavigation(() => this.create());
  }

  private showOptions(): void {
    audio.play("select");
    this.secretCodeEnabled = false;
    this.destroyMenuNavigation();
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
    this.bindMenuNavigation(() => this.optionsBack(() => this.create()));
  }

  private registerUiCleanup(): void {
    if (this.uiCleanupRegistered) return;
    this.uiCleanupRegistered = true;
    window.addEventListener("keydown", this.handleSecretKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupUi);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupUi);
  }

  private cleanupUi = (): void => {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.cleanupUi);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.cleanupUi);
    window.removeEventListener("keydown", this.handleSecretKeyDown);
    this.destroyMenuNavigation();
    this.uiCleanupRegistered = false;
    this.secretCodeEnabled = false;
    this.secretProgress = 0;
    clearUi();
  };

  private bindMenuNavigation(onBack?: () => void): void {
    this.destroyMenuNavigation();
    this.menuNavigation = bindMenuNavigation(uiRoot(), {
      onBack,
      onNavigate: () => audio.play("select")
    });
  }

  private destroyMenuNavigation(): void {
    this.menuNavigation?.destroy();
    this.menuNavigation = null;
  }

  private optionsBack(fallback: () => void): void {
    const rootButton = uiRoot().querySelector<HTMLButtonElement>("[data-options-root]");
    if (!rootButton) {
      fallback();
      return;
    }
    rootButton.click();
    window.setTimeout(() => this.menuNavigation?.focusFirst(), 0);
  }
}
