import { formatFrames } from "../game/geometry";
import type { LevelScore, Medal } from "../game/types";
import { clearUi, icon, uiRoot } from "./dom";

type HudCallbacks = {
  onRewind: () => void;
  onRetry: () => void;
  onPause: () => void;
  onTitle: () => void;
  onNext: () => void;
  onReplay: () => void;
  onLevelSelect: () => void;
  onResume: () => void;
  onVirtualInput: (control: "left" | "right" | "jump", active: boolean) => void;
};

type HudState = {
  levelNumber: number;
  levelName: string;
  frames: number;
  echoes: number;
  medal: Medal;
  dead: boolean;
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
          <div class="hud-group">
            <span class="hud-label">Level</span>
            <span class="hud-value" data-level></span>
          </div>
          <div class="hud-group center">
            <span class="hud-label">Time</span>
            <span class="hud-value accent" data-time></span>
            <span class="hud-label">Echoes</span>
            <span class="hud-value" data-echoes></span>
          </div>
          <div class="hud-group right">
            <span class="hud-label">Medal</span>
            <span class="hud-value medal" data-medal></span>
          </div>
        </div>
        <div class="toast" data-toast></div>
        <div class="hud-bottom">
          <div class="command-row">
            <button class="icon-button" data-rewind title="Rewind">${icon("rewind")}</button>
            <button class="icon-button" data-retry title="Retry">${icon("restart")}</button>
            <button class="icon-button" data-menu title="Pause">${icon("pause")}</button>
            <span class="command-chip">A/D or arrows</span>
            <span class="command-chip">Space jump</span>
            <span class="command-chip">R rewind</span>
          </div>
          <div class="command-row">
            <span class="command-chip" data-status>Timeline stable</span>
          </div>
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
    this.set("[data-level]", `${state.levelNumber}. ${state.levelName}`);
    this.set("[data-time]", formatFrames(state.frames));
    this.set("[data-echoes]", `${state.echoes}`);
    this.set("[data-medal]", state.medal);
    this.set("[data-status]", state.dead ? "Signal lost" : "Timeline stable");
  }

  toast(message: string): void {
    const toast = this.root.querySelector<HTMLElement>("[data-toast]");
    if (!toast) return;
    window.clearTimeout(this.toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    this.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
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
        <h1>${levelName}</h1>
        <p>Timeline paused.</p>
        <div class="button-grid">
          <button class="ui-button primary" data-resume>Resume</button>
          <button class="ui-button" data-replay-level>${icon("restart")} Restart Level</button>
          <button class="ui-button" data-levels>${icon("levels")} Level Select</button>
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-resume]", this.callbacks.onResume);
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-exit-menu]", this.callbacks.onTitle);
  }

  hideModal(): void {
    const modal = this.modal();
    modal.classList.remove("show");
    modal.replaceChildren();
  }

  showComplete(score: LevelScore, isFinal: boolean): void {
    const modal = this.modal();
    modal.innerHTML = `
      <section class="panel complete-panel">
        <h1>${isFinal ? "Timeline Complete" : "Room Clear"}</h1>
        <p>${isFinal ? "Every shift is synchronized." : "Echoes folded cleanly into the exit."}</p>
        <div class="score-row">
          <div class="score-cell"><strong>Time</strong><span>${formatFrames(score.frames)}</span></div>
          <div class="score-cell"><strong>Echoes</strong><span>${score.echoes}</span></div>
          <div class="score-cell"><strong>Medal</strong><span class="medal">${score.medal}</span></div>
        </div>
        <div class="button-grid">
          ${
            isFinal
              ? `<button class="ui-button primary" data-levels>${icon("levels")} Level Select</button>`
              : `<button class="ui-button primary" data-next>${icon("next")} Next Room</button>`
          }
          <button class="ui-button" data-replay-level>${icon("restart")} Replay Room</button>
          <button class="ui-button" data-exit-menu>${icon("back")} Title</button>
        </div>
      </section>
    `;
    modal.classList.add("show");
    this.modalButton("[data-next]", this.callbacks.onNext);
    this.modalButton("[data-levels]", this.callbacks.onLevelSelect);
    this.modalButton("[data-replay-level]", this.callbacks.onReplay);
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
