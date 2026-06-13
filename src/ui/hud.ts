import { formatFrames } from "../game/geometry";
import { formatScore } from "../game/scoring";
import type { LevelScore } from "../game/types";
import { clearUi, icon, uiRoot } from "./dom";
import { audio } from "../game/audio";
import { bindOptionsPanel, optionsPanelHtml } from "./options";

type HudCallbacks = {
  onRewind: () => void;
  onRetry: () => void;
  onPause: () => void;
  onTitle: () => void;
  onNext: () => void;
  onReplay: () => void;
  onLevelSelect: () => void;
  onEditor?: () => void;
  onResume: () => void;
  onVirtualInput: (control: "left" | "right" | "jump", active: boolean) => void;
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
};

export class Hud {
  private root = uiRoot();
  private toastTimer = 0;
  private callbacks: HudCallbacks;

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
        <div class="toast" data-toast></div>
        <div class="hud-actions">
          <div class="command-row">
            <button class="icon-button" data-rewind title="Rewind and create an echo">${icon("rewind")}</button>
            <button class="icon-button" data-retry title="Retry">${icon("restart")}</button>
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
    const modal = this.modal();
    modal.innerHTML = `
      <section class="panel complete-panel">
        <img class="modal-logo" src="/assets/echo-shift-logo.png" alt="Echo Shift" />
        <h1>Paused</h1>
        <p>${levelName}</p>
        <div class="button-grid">
          <button class="ui-button primary" data-resume>Resume</button>
          <button class="ui-button" data-replay-level>${icon("restart")} Restart Level</button>
          <button class="ui-button" data-options>Options</button>
          <button class="ui-button" data-levels>${icon("levels")} Level Select</button>
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-resume]", this.callbacks.onResume);
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
    this.modalButton("[data-options]", () => this.showOptions(levelName));
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
  }

  hideModal(): void {
    const modal = this.modal();
    modal.classList.remove("show");
    modal.replaceChildren();
  }

  showComplete(score: LevelScore, isFinal: boolean, totalCores: number): void {
    const modal = this.modal();
    modal.innerHTML = `
      <section class="panel complete-panel">
        <h1>${isFinal ? "Timeline Complete" : "Room Clear"}</h1>
        <p>${isFinal ? "Every shift is synchronized." : "Score locked for this run."}</p>
        <div class="score-row">
          <div class="score-cell"><strong>Score</strong><span>${formatScore(score.score)}</span></div>
          <div class="score-cell"><strong>Time</strong><span>${formatFrames(score.frames)}</span></div>
          <div class="score-cell"><strong>Time Bonus</strong><span>${formatScore(score.timeBonus)}</span></div>
          <div class="score-cell"><strong>Cores</strong><span>${score.cores}/${totalCores}</span></div>
          <div class="score-cell"><strong>Deaths</strong><span>${score.deaths}</span></div>
          <div class="score-cell"><strong>Echoes</strong><span>${score.echoes}</span></div>
        </div>
        <div class="button-grid">
          ${
            isFinal
              ? `<button class="ui-button primary" data-levels>${icon("levels")} Level Select</button>`
              : `<button class="ui-button primary" data-next>${icon("next")} Next Room</button>`
          }
          <button class="ui-button" data-replay-level>${icon("restart")} Replay Room</button>
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-next]", this.callbacks.onNext);
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
  }

  showTutorialComplete(score: LevelScore, totalCores: number): void {
    const modal = this.modal();
    modal.innerHTML = `
      <section class="panel complete-panel">
        <h1>Tutorial Complete</h1>
        <p>Echo timing confirmed.</p>
        <div class="score-row">
          <div class="score-cell"><strong>Time</strong><span>${formatFrames(score.frames)}</span></div>
          <div class="score-cell"><strong>Cores</strong><span>${score.cores}/${totalCores}</span></div>
          <div class="score-cell"><strong>Echoes</strong><span>${score.echoes}</span></div>
          <div class="score-cell"><strong>Deaths</strong><span>${score.deaths}</span></div>
        </div>
        <div class="button-grid">
          <button class="ui-button primary" data-replay-level>${icon("restart")} Replay Tutorial</button>
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
  }

  showRetryRequired(levelName: string): void {
    const modal = this.modal();
    modal.innerHTML = `
      <section class="panel complete-panel">
        <h1>Retry Required</h1>
        <p>${levelName} signal budget exhausted.</p>
        <div class="button-grid">
          <button class="ui-button primary" data-replay-level>${icon("restart")} Retry Room</button>
          <button class="ui-button" data-levels>${icon("levels")} Level Select</button>
          ${this.callbacks.draftPlaytest ? `<button class="ui-button" data-editor>${icon("levels")} Editor</button>` : ""}
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-editor]", () => this.callbacks.onEditor?.());
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
  }

  destroy(): void {
    window.clearTimeout(this.toastTimer);
    clearUi();
  }

  private bind(): void {
    this.root.querySelector("[data-rewind]")?.addEventListener("click", this.callbacks.onRewind);
    this.root.querySelector("[data-retry]")?.addEventListener("click", this.callbacks.onRetry);
    this.root.querySelector("[data-menu]")?.addEventListener("click", this.callbacks.onPause);
    this.bindTouchControls();
  }

  private showOptions(levelName: string): void {
    const modal = this.modal();
    modal.innerHTML = optionsPanelHtml();
    modal.classList.add("show");
    bindOptionsPanel(modal, {
      onBack: () => this.showPause(levelName),
      onNavigate: () => audio.play("select")
    });
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

  private modal(): HTMLElement {
    const modal = this.root.querySelector<HTMLElement>("[data-modal]");
    if (!modal) throw new Error("Missing HUD modal");
    return modal;
  }

  private modalButton(selector: string, handler: () => void): void {
    this.modal().querySelector(selector)?.addEventListener("click", handler);
  }
}
