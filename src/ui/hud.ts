import { formatFrames } from "../game/geometry";
import type { LeaderboardEntry, LeaderboardSaveResult } from "../game/leaderboard";
import { formatScore } from "../game/scoring";
import type { CampaignRunSummary } from "../game/session";
import type { LevelScore } from "../game/types";
import { clearUi, icon, uiRoot } from "./dom";
import { audio } from "../game/audio";
import { bindOptionsPanel, optionsPanelHtml } from "./options";
import { bindMenuNavigation, type MenuNavigationBinding } from "./menuNavigation";

type HudCallbacks = {
  onRewind: () => void;
  onPause: () => void;
  onTitle: () => void;
  onNext: () => void;
  onLevelSelect: () => void;
  onEditor?: () => void;
  onResume: () => void;
  onVirtualInput: (control: "left" | "right" | "jump", active: boolean) => void;
  onSaveLeaderboard?: (nickname: string, summary: CampaignRunSummary) => LeaderboardSaveResult;
  allowLevelSelect?: boolean;
  draftPlaytest?: boolean;
};

type HudState = {
  levelNumber: number | null;
  levelName: string;
  frames: number;
  score: number;
  lives: number | null;
  coresCollected: number;
  coresTotal: number;
  rewindDisabled: boolean;
  gameOver: boolean;
};

type CompleteOptions = {
  scoreEligible: boolean;
  scoreRecorded?: boolean;
  scoreSaveMessage?: string;
  campaignSummary: CampaignRunSummary | null;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardMessage?: string;
};

export class Hud {
  private root = uiRoot();
  private toastTimer = 0;
  private callbacks: HudCallbacks;
  private modalNavigation: MenuNavigationBinding | null = null;
  private inertHudControls: Array<{ element: HTMLElement; tabIndex: string | null }> = [];

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    clearUi();
    this.root.innerHTML = `
      <div class="hud">
        <div class="hud-top">
          <div class="hud-readout">
            <span class="hud-level" data-level></span>
            <div class="hud-stat-stack">
              <div class="hud-stat">
                <span class="hud-label">Time</span>
                <span class="hud-value" data-time></span>
              </div>
              <div class="hud-stat">
                <span class="hud-label">Score</span>
                <span class="hud-value accent" data-score></span>
              </div>
              <div class="hud-stat">
                <span class="hud-label">Cores</span>
                <span class="hud-value" data-cores></span>
              </div>
            </div>
          </div>
        </div>
        <div class="toast" data-toast role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="hud-actions">
          <div class="command-row">
            <button class="icon-button" data-rewind title="Rewind and create an echo" aria-label="Rewind and create an echo">${icon("rewind")}</button>
            <button class="icon-button" data-menu title="Pause">${icon("pause")}</button>
          </div>
        </div>
        <div class="tutorial-hint" data-tutorial-hint hidden></div>
        <div class="hud-lives" aria-label="Lives">
          <span class="hud-lives-label">Lives</span>
          <span class="hud-lives-value" data-lives></span>
        </div>
        <div class="touch-controls" aria-label="Touch controls">
          <div class="touch-cluster">
            <button class="touch-button" data-touch-control="left" aria-label="Move left">←</button>
            <button class="touch-button" data-touch-control="right" aria-label="Move right">→</button>
          </div>
          <button class="touch-button jump" data-touch-control="jump" aria-label="Jump">↑</button>
        </div>
        <div class="modal-layer" data-modal></div>
      </div>
      <div class="scanline" data-scanline></div>
    `;
    this.bind();
  }

  update(state: HudState): void {
    this.set("[data-level]", state.levelNumber === null ? state.levelName : `${state.levelNumber}. ${state.levelName}`);
    this.set("[data-time]", formatFrames(state.frames));
    this.set("[data-score]", formatScore(state.score));
    this.set("[data-cores]", `${state.coresCollected}/${state.coresTotal}`);
    this.set("[data-lives]", state.lives === null ? "∞" : `${state.lives}`);
    this.setCommandButton(
      "[data-rewind]",
      state.rewindDisabled || state.gameOver,
      state.rewindDisabled ? "Rewind disabled for this level" : "Rewind and create an echo",
      state.gameOver
    );
    this.setCommandButton("[data-menu]", state.gameOver, "Pause", state.gameOver);
    const touchControls = this.root.querySelector<HTMLElement>(".touch-controls");
    if (touchControls) touchControls.hidden = state.gameOver;
  }

  toast(message: string): void {
    const toast = this.root.querySelector<HTMLElement>("[data-toast]");
    if (!toast) return;
    window.clearTimeout(this.toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    this.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  hideToast(): void {
    const toast = this.root.querySelector<HTMLElement>("[data-toast]");
    window.clearTimeout(this.toastTimer);
    if (!toast) return;
    toast.classList.remove("show");
    toast.textContent = "";
  }

  setTutorialHint(message: string | null): void {
    const hint = this.root.querySelector<HTMLElement>("[data-tutorial-hint]");
    if (!hint) return;
    if (!message) {
      hint.hidden = true;
      hint.textContent = "";
      return;
    }
    hint.hidden = false;
    hint.textContent = message;
  }

  scan(): void {
    const scanline = this.root.querySelector<HTMLElement>("[data-scanline]");
    if (!scanline) return;
    scanline.classList.remove("run");
    void scanline.offsetHeight;
    scanline.classList.add("run");
  }

  showPause(levelName: string): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(true);
    const modal = this.modal();
    const levelSelectButton = this.callbacks.allowLevelSelect ? `<button class="ui-button" data-levels>${icon("levels")} Level Select</button>` : "";
    const menuLabel = this.menuLabel();
    const titleId = "hud-pause-title";
    modal.innerHTML = `
      <section class="panel complete-panel" ${this.dialogAttributes(titleId)}>
        <img class="modal-logo" src="/assets/echo-shift-logo.png" alt="Echo Shift" />
        <h1 id="${titleId}">Paused</h1>
        <p>${levelName}</p>
        <div class="button-grid">
          <button class="ui-button primary" data-resume data-default-focus>Resume</button>
          <button class="ui-button" data-options>Options</button>
          ${levelSelectButton}
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          <button class="ui-button" data-exit-menu>${icon("back")} ${menuLabel}</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-resume]", this.callbacks.onResume);
    this.modalButton("[data-options]", () => this.showOptions(levelName));
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
    this.bindModalNavigation(() => this.callbacks.onResume());
  }

  hideModal(): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(false);
    const modal = this.modal();
    modal.classList.remove("show");
    modal.replaceChildren();
  }

  showComplete(score: LevelScore, isFinal: boolean, totalCores: number, options: CompleteOptions): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(true);
    const modal = this.modal();
    const finalLeaderboard = isFinal ? this.finalLeaderboardHtml(options) : "";
    const menuLabel = this.menuLabel();
    const levelSelectButton = this.callbacks.allowLevelSelect
      ? `<button class="ui-button ${isFinal ? "primary" : ""}" data-levels ${isFinal ? "data-default-focus" : ""}>${icon("levels")} Level Select</button>`
      : "";
    const primaryAction = isFinal
      ? levelSelectButton || `<button class="ui-button primary" data-exit-menu data-default-focus>${icon("back")} ${menuLabel}</button>`
      : `<button class="ui-button primary" data-next data-default-focus>${icon("next")} Next Room</button>`;
    const titleId = isFinal ? "hud-final-complete-title" : "hud-room-complete-title";
    modal.innerHTML = `
      <section class="panel complete-panel" ${this.dialogAttributes(titleId)}>
        <h1 id="${titleId}">${isFinal ? "Timeline Complete" : "Room Clear"}</h1>
        <p>${this.completionMessage(isFinal, options)}</p>
        <div class="score-row">
          <div class="score-cell"><strong>Score</strong><span>${formatScore(score.score)}</span></div>
          <div class="score-cell"><strong>Time</strong><span>${formatFrames(score.frames)}</span></div>
          <div class="score-cell"><strong>Time Bonus</strong><span>${formatScore(score.timeBonus)}</span></div>
          <div class="score-cell"><strong>Cores</strong><span>${score.cores}/${totalCores}</span></div>
          <div class="score-cell"><strong>Deaths</strong><span>${score.deaths}</span></div>
          <div class="score-cell"><strong>Echoes</strong><span>${score.echoes}</span></div>
        </div>
        ${finalLeaderboard}
        <div class="button-grid">
          ${primaryAction}
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          ${isFinal && !levelSelectButton ? "" : `<button class="ui-button" data-exit-menu>${icon("back")} ${menuLabel}</button>`}
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-next]", this.callbacks.onNext);
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
    this.bindLeaderboardForm(options);
    this.bindModalNavigation(() => this.callbacks.onTitle());
  }

  showTutorialComplete(score: LevelScore, totalCores: number): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(true);
    const modal = this.modal();
    const menuLabel = this.menuLabel();
    const titleId = "hud-tutorial-complete-title";
    modal.innerHTML = `
      <section class="panel complete-panel" ${this.dialogAttributes(titleId)}>
        <h1 id="${titleId}">Tutorial Complete</h1>
        <p>Echo timing confirmed.</p>
        <div class="score-row">
          <div class="score-cell"><strong>Time</strong><span>${formatFrames(score.frames)}</span></div>
          <div class="score-cell"><strong>Cores</strong><span>${score.cores}/${totalCores}</span></div>
          <div class="score-cell"><strong>Echoes</strong><span>${score.echoes}</span></div>
          <div class="score-cell"><strong>Deaths</strong><span>${score.deaths}</span></div>
        </div>
        <div class="button-grid">
          <button class="ui-button primary" data-exit-menu data-default-focus>${icon("back")} ${menuLabel}</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
    this.bindModalNavigation(() => this.callbacks.onTitle());
  }

  showGameOver(levelName: string): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(true);
    const modal = this.modal();
    const menuLabel = this.menuLabel();
    const primaryAction = this.callbacks.allowLevelSelect
      ? `<button class="ui-button primary" data-levels data-default-focus>${icon("levels")} Level Select</button>`
      : `<button class="ui-button primary" data-exit-menu data-default-focus>${icon("back")} ${menuLabel}</button>`;
    const titleId = "hud-game-over-title";
    modal.innerHTML = `
      <section class="panel complete-panel" ${this.dialogAttributes(titleId)}>
        <h1 id="${titleId}">Game Over</h1>
        <p>${levelName} signal budget exhausted.</p>
        <div class="button-grid">
          ${primaryAction}
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          ${this.callbacks.allowLevelSelect ? `<button class="ui-button" data-exit-menu>${icon("back")} ${menuLabel}</button>` : ""}
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
    this.bindModalNavigation(() => this.callbacks.onTitle());
  }

  destroy(): void {
    window.clearTimeout(this.toastTimer);
    this.destroyModalNavigation();
    this.setHudControlsInert(false);
    clearUi();
  }

  private bind(): void {
    this.root.querySelector("[data-rewind]")?.addEventListener("click", this.callbacks.onRewind);
    this.root.querySelector("[data-menu]")?.addEventListener("click", this.callbacks.onPause);
    this.bindTouchControls();
  }

  private menuLabel(): string {
    return this.callbacks.draftPlaytest ? "Draft Menu" : "Main Menu";
  }

  private showOptions(levelName: string): void {
    this.destroyModalNavigation();
    this.setHudControlsInert(true);
    const modal = this.modal();
    modal.innerHTML = optionsPanelHtml("root", { dialog: true });
    modal.classList.add("show");
    bindOptionsPanel(modal, {
      onBack: () => this.showPause(levelName),
      onNavigate: () => audio.play("select")
    });
    this.bindModalNavigation(() => this.optionsBack(() => this.showPause(levelName)));
  }

  private completionMessage(isFinal: boolean, options: CompleteOptions): string {
    if (options.scoreEligible && options.scoreRecorded === false) return options.scoreSaveMessage || "Score could not be saved locally.";
    if (!options.scoreEligible) return "Practice clear. Scores are not written to normal progress.";
    return isFinal ? "Every shift is synchronized." : "Score locked for this run.";
  }

  private finalLeaderboardHtml(options: CompleteOptions): string {
    const summary = options.campaignSummary;
    if (options.scoreEligible && options.scoreRecorded === false) {
      return `<p class="credits-text">${this.escapeHtml(options.scoreSaveMessage || "Score could not be saved locally.")}</p>`;
    }
    if (!options.scoreEligible || !summary) {
      return `<p class="credits-text">Practice runs do not update the campaign leaderboard.</p>`;
    }
    return `
      <div class="campaign-summary">
        <div class="score-cell campaign-total"><strong>Campaign Score</strong><span>${formatScore(summary.score)}</span></div>
        <div class="score-cell"><strong>Total Time</strong><span>${formatFrames(summary.frames)}</span></div>
        <div class="score-cell"><strong>Total Deaths</strong><span>${summary.deaths}</span></div>
        <div class="score-cell"><strong>Total Cores</strong><span>${summary.cores}</span></div>
      </div>
      <form class="leaderboard-form" data-leaderboard-form>
        <label>
          <span>Nickname</span>
          <input type="text" maxlength="16" autocomplete="off" spellcheck="false" data-leaderboard-name value="Runner" />
        </label>
        <button class="ui-button primary" type="submit" data-default-focus>Save Score</button>
      </form>
      <div class="leaderboard-list" data-leaderboard-list>
        ${this.leaderboardListHtml(options.leaderboardEntries, options.leaderboardMessage)}
      </div>
    `;
  }

  private leaderboardListHtml(entries: LeaderboardEntry[], message?: string): string {
    if (message) return `<p class="credits-text">${this.escapeHtml(message)}</p>`;
    if (entries.length === 0) return `<p class="credits-text">No local campaign scores yet.</p>`;
    return entries
      .map(
        (entry, index) => `
          <div class="leaderboard-entry">
            <strong>${index + 1}. ${this.escapeHtml(entry.nickname)}</strong>
            <span>${formatScore(entry.score)}</span>
            <small>${formatFrames(entry.frames)} · ${entry.deaths}D · ${entry.cores}C</small>
          </div>
        `
      )
      .join("");
  }

  private bindLeaderboardForm(options: CompleteOptions): void {
    const summary = options.campaignSummary;
    const form = this.modal().querySelector<HTMLFormElement>("[data-leaderboard-form]");
    if (!summary || !form || !this.callbacks.onSaveLeaderboard) return;
    let saved = false;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (saved) return;
      saved = true;
      const input = form.querySelector<HTMLInputElement>("[data-leaderboard-name]");
      const result = this.callbacks.onSaveLeaderboard?.(input?.value || "Runner", summary);
      const entries = result?.entries || [];
      const list = this.modal().querySelector<HTMLElement>("[data-leaderboard-list]");
      if (list) list.innerHTML = this.leaderboardListHtml(entries, result?.ok ? undefined : result?.message);
      const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
      if (!result?.ok) {
        saved = false;
        if (button) button.textContent = "Try Again";
        this.toast(result?.message || "Could not save score locally.");
        return;
      }
      if (input) input.disabled = true;
      if (button) {
        button.textContent = "Saved";
        button.disabled = true;
      }
    });
  }

  private bindModalNavigation(onBack: () => void): void {
    this.destroyModalNavigation();
    this.modalNavigation = bindMenuNavigation(this.modal(), {
      onBack,
      onNavigate: () => audio.play("select"),
      initialFocus: "[data-default-focus]",
      trapFocus: true
    });
  }

  private destroyModalNavigation(): void {
    this.modalNavigation?.destroy();
    this.modalNavigation = null;
  }

  private dialogAttributes(titleId: string): string {
    return `role="dialog" aria-modal="true" aria-labelledby="${titleId}"`;
  }

  private optionsBack(fallback: () => void): void {
    const rootButton = this.modal().querySelector<HTMLButtonElement>("[data-options-root]");
    if (!rootButton) {
      fallback();
      return;
    }
    rootButton.click();
    window.setTimeout(() => this.modalNavigation?.focusFirst(), 0);
  }

  private setHudControlsInert(inert: boolean): void {
    const controls = Array.from(this.root.querySelectorAll<HTMLElement>(".hud-actions button, .touch-controls button"));
    if (inert) {
      if (this.inertHudControls.length > 0) return;
      this.inertHudControls = controls.map((element) => ({
        element,
        tabIndex: element.getAttribute("tabindex")
      }));
      for (const { element } of this.inertHudControls) element.setAttribute("tabindex", "-1");
      return;
    }
    for (const { element, tabIndex } of this.inertHudControls) {
      if (tabIndex === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", tabIndex);
    }
    this.inertHudControls = [];
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  private bindTouchControls(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-touch-control]").forEach((button) => {
      const control = button.dataset.touchControl as "left" | "right" | "jump";
      const setActive = (event: Event, active: boolean) => {
        event.preventDefault();
        this.callbacks.onVirtualInput(control, active);
      };
      button.addEventListener("pointerdown", (event) => {
        button.setPointerCapture(event.pointerId);
        setActive(event, true);
      });
      button.addEventListener("pointerup", (event) => setActive(event, false));
      button.addEventListener("pointercancel", (event) => setActive(event, false));
      button.addEventListener("lostpointercapture", (event) => setActive(event, false));
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  private set(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  private setCommandButton(selector: string, disabled: boolean, title: string, hidden = false): void {
    const button = this.root.querySelector<HTMLButtonElement>(selector);
    if (!button) return;
    button.disabled = disabled;
    button.hidden = hidden;
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  private modal(): HTMLElement {
    const modal = this.root.querySelector<HTMLElement>("[data-modal]");
    if (!modal) throw new Error("Missing HUD modal");
    return modal;
  }

  private modalButton(selector: string, handler: () => void): void {
    this.modal().querySelector(selector)?.addEventListener("click", handler);
  }
}
