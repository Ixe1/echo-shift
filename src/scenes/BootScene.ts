import Phaser from "phaser";
import { isDraftPlaytestActive, levels } from "../data/levels";
import { audio } from "../game/audio";
import { levelBackgrounds, type LevelBackground } from "../game/backgrounds";
import { soundtrackForLevel } from "../game/soundtracks";
import {
  bindImageFallbacks,
  clearUi,
  ECHO_SHIFT_LOGO_FALLBACK_SRC,
  ECHO_SHIFT_LOGO_SRC,
  icon,
  rememberEchoShiftLogoSrc,
  uiRoot
} from "../ui/dom";
import { bindMenuNavigation, type MenuNavigationBinding } from "../ui/menuNavigation";

const STARTUP_READY_PROGRESS = 92;

const playtestLevelIndex = (): number => {
  const raw = new URLSearchParams(window.location.search).get("level");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(levels.length - 1, Math.round(parsed)));
};

export class BootScene extends Phaser.Scene {
  private menuNavigation: MenuNavigationBinding | null = null;
  private loadingScreen: HTMLElement | null = null;
  private loadingBar: HTMLElement | null = null;
  private loadingPercent: HTMLElement | null = null;
  private loadingStatus: HTMLElement | null = null;
  private loadingProgress: HTMLElement | null = null;
  private loadingFailed = false;
  private startupLogoSrc = ECHO_SHIFT_LOGO_SRC;

  constructor() {
    super("BootScene");
  }

  preload(): void {
    this.loadingFailed = false;
    this.startupLogoSrc = ECHO_SHIFT_LOGO_SRC;
    this.showLoadingScreen();
    this.bindLoadingProgress();
    for (const background of this.startupBackgrounds()) {
      if (this.textures.exists(background.key)) continue;
      this.load.image(background.key, background.src);
    }
  }

  create(): void {
    const particle = this.add.graphics({ x: 0, y: 0 });
    particle.fillStyle(0x43f7ff, 1);
    particle.fillCircle(4, 4, 4);
    particle.generateTexture("particle-cyan", 8, 8);
    particle.clear();
    particle.fillStyle(0xffe35a, 1);
    particle.fillCircle(4, 4, 4);
    particle.generateTexture("particle-gold", 8, 8);
    particle.destroy();
    void this.showAudioGateWhenReady();
  }

  private async showAudioGateWhenReady(): Promise<void> {
    if (this.loadingFailed) {
      this.showStartupLoadFailure();
      return;
    }
    this.loadingStatus?.replaceChildren("Preparing start screen");
    this.loadingProgress?.setAttribute("aria-valuetext", "Preparing start screen");
    this.writeLoadingDiagnostics("loading", STARTUP_READY_PROGRESS, "Preparing start screen");
    const [logoSrc, artSrc] = await Promise.all([
      this.resolveDomImage(ECHO_SHIFT_LOGO_SRC, ECHO_SHIFT_LOGO_FALLBACK_SRC),
      this.resolveDomImage(levelBackgrounds["time-lab-prototype"].src, levelBackgrounds["time-lab-prototype"].fallbackSrc)
    ]);
    if (this.loadingFailed) {
      this.showStartupLoadFailure();
      return;
    }
    this.startupLogoSrc = logoSrc;
    rememberEchoShiftLogoSrc(logoSrc);
    this.setArtScreenImage(artSrc);
    this.loadingBar?.style.setProperty("--load-progress", "1");
    this.loadingPercent?.replaceChildren("100%");
    this.loadingProgress?.setAttribute("aria-valuenow", "100");
    this.loadingProgress?.setAttribute("aria-valuetext", "Startup ready");
    this.loadingStatus?.replaceChildren("Preload complete");
    this.writeLoadingDiagnostics("complete", 100, "complete");
    this.finishLoadingScreen();
    this.showAudioGate();
  }

  private showAudioGate(): void {
    this.menuNavigation?.destroy();
    this.menuNavigation = null;
    clearUi();
    const root = uiRoot();
    root.innerHTML = `
      <main class="screen art-screen menu-screen">
        <div class="menu-shell">
          <section class="brand-block">
            <img class="brand-logo" src="${this.startupLogoSrc}" data-fallback-src="${ECHO_SHIFT_LOGO_FALLBACK_SRC}" alt="Echo Shift" />
            <p class="tagline">Time-lab systems armed. Start the session when ready.</p>
          </section>
          <section class="panel menu-panel action-panel" aria-label="Echo Shift start">
            <div class="button-grid">
              <button class="ui-button primary" data-start-game>${icon("play")} Start</button>
            </div>
          </section>
        </div>
      </main>
    `;
    bindImageFallbacks(root);

    const startButton = root.querySelector<HTMLButtonElement>("[data-start-game]");
    let started = false;
    const cleanup = () => {
      window.removeEventListener("keydown", handleKeyDown);
      this.menuNavigation?.destroy();
      this.menuNavigation = null;
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      if (!started) clearUi();
    };
    const start = () => {
      if (started) return;
      started = true;
      cleanup();
      audio.unlock();
      const target = this.nextScene();
      void audio.preloadMusic(target.musicKey);
      audio.playMusic(target.musicKey);
      clearUi();
      this.scene.start(target.scene, target.data);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") start();
    };

    startButton?.addEventListener("click", start, { once: true });
    window.addEventListener("keydown", handleKeyDown);
    this.menuNavigation = bindMenuNavigation(root, { onNavigate: () => audio.play("select") });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    startButton?.focus();
  }

  private showLoadingScreen(): void {
    clearUi();
    const root = uiRoot();
    const screen = document.createElement("main");
    screen.className = "boot-loading";
    screen.dataset.bootLoading = "active";
    screen.innerHTML = `
      <section class="boot-loading-panel" aria-label="Echo Shift loading">
        <div class="boot-loading-brand" aria-hidden="true">
          <span class="boot-loading-mark">ES</span>
          <strong>Echo Shift</strong>
        </div>
        <div class="boot-loading-copy">
          <span class="boot-loading-kicker">Time-lab startup</span>
          <h1>Loading assets</h1>
          <p id="echo-shift-startup-loading-status" data-loading-status role="status" aria-live="polite" aria-atomic="true">Preparing preload queue</p>
        </div>
        <div class="boot-loading-progress" role="progressbar" aria-label="Asset loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span data-loading-bar></span>
        </div>
        <div class="boot-loading-meta">
          <span data-loading-percent>0%</span>
          <span id="echo-shift-startup-loading-detail" data-loading-file>Queueing runtime textures</span>
        </div>
      </section>
    `;
    root.append(screen);
    this.loadingScreen = screen;
    this.loadingBar = screen.querySelector<HTMLElement>("[data-loading-bar]");
    this.loadingPercent = screen.querySelector<HTMLElement>("[data-loading-percent]");
    this.loadingStatus = screen.querySelector<HTMLElement>("[data-loading-status]");
    this.loadingProgress = screen.querySelector<HTMLElement>(".boot-loading-progress");
    this.writeLoadingDiagnostics("visible", 0, "queue");
  }

  private bindLoadingProgress(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.on(Phaser.Loader.Events.FILE_PROGRESS, this.handleFileProgress, this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError, this);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupLoadingListeners, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupLoadingListeners, this);
  }

  private handleLoadProgress(progress: number): void {
    const percent = Math.max(0, Math.min(STARTUP_READY_PROGRESS, Math.round(progress * STARTUP_READY_PROGRESS)));
    this.loadingBar?.style.setProperty("--load-progress", String(percent / 100));
    this.loadingPercent?.replaceChildren(`${percent}%`);
    this.loadingProgress?.setAttribute("aria-valuenow", String(percent));
    const status = this.loadingStatus?.textContent || "Loading assets";
    this.loadingProgress?.setAttribute("aria-valuetext", `${percent}% loaded, ${status}`);
    this.writeLoadingDiagnostics("loading", percent, status);
  }

  private handleFileProgress(file: Phaser.Loader.File): void {
    const key = String(file.key);
    const label = this.loadingLabelFor(key);
    const detail = this.loadingDetailFor(key);
    this.loadingStatus?.replaceChildren(label);
    const fileNode = this.loadingScreen?.querySelector<HTMLElement>("[data-loading-file]");
    fileNode?.replaceChildren(detail);
    this.loadingProgress?.setAttribute("aria-valuetext", `${this.currentLoadingPercent()} loaded, ${label}`);
    this.writeLoadingDiagnostics("loading", undefined, label);
  }

  private handleLoadError(file: Phaser.Loader.File): void {
    const key = String(file.key);
    if (this.startupBackgroundFallbackSrcFor(key)) {
      const label = "Loading fallback start art";
      this.loadingStatus?.replaceChildren("Loading fallback start art");
      this.loadingScreen?.querySelector<HTMLElement>("[data-loading-file]")?.replaceChildren("Fallback start screen artwork");
      this.loadingProgress?.setAttribute("aria-valuetext", label);
      this.writeLoadingDiagnostics("fallback", undefined, label);
      return;
    }
    this.loadingFailed = true;
    const label = "Startup asset could not load";
    this.loadingStatus?.replaceChildren(label);
    this.loadingScreen?.querySelector<HTMLElement>("[data-loading-file]")?.replaceChildren(`${this.loadingDetailFor(key)} unavailable`);
    this.loadingProgress?.setAttribute("aria-valuetext", label);
    this.writeLoadingDiagnostics("error", undefined, label);
  }

  private handleLoadComplete(): void {
    if (this.loadingFailed) {
      this.setStartupLoadingError("Some assets failed", "Choose Retry to reload");
      this.showStartupLoadFailureActions();
      return;
    }
    this.loadingBar?.style.setProperty("--load-progress", String(STARTUP_READY_PROGRESS / 100));
    this.loadingPercent?.replaceChildren(`${STARTUP_READY_PROGRESS}%`);
    this.loadingProgress?.setAttribute("aria-valuenow", String(STARTUP_READY_PROGRESS));
    this.loadingProgress?.setAttribute("aria-valuetext", "Preparing start screen");
    this.loadingStatus?.replaceChildren("Preparing start screen");
    this.writeLoadingDiagnostics("loading", STARTUP_READY_PROGRESS, "Preparing start screen");
  }

  private showStartupLoadFailure(): void {
    const label = "Startup assets unavailable";
    this.setStartupLoadingError(label, "Choose Retry to reload");
    this.showStartupLoadFailureActions();
  }

  private setStartupLoadingError(label: string, fileLabel: string): void {
    this.loadingScreen?.classList.add("is-error");
    this.loadingBar?.style.setProperty("--load-progress", "0");
    this.loadingPercent?.replaceChildren("Error");
    this.loadingProgress?.removeAttribute("aria-valuenow");
    this.loadingProgress?.setAttribute("aria-valuetext", label);
    this.loadingStatus?.replaceChildren(label);
    this.loadingScreen?.querySelector<HTMLElement>("[data-loading-file]")?.replaceChildren(fileLabel);
    this.writeLoadingDiagnostics("error", undefined, label);
    if (typeof document !== "undefined") delete document.documentElement.dataset.echoShiftBootLoadProgress;
  }

  private showStartupLoadFailureActions(): void {
    if (!this.loadingScreen || this.loadingScreen.querySelector("[data-loading-actions]")) return;
    const panel = this.loadingScreen.querySelector<HTMLElement>(".boot-loading-panel");
    if (!panel) return;
    const actions = document.createElement("div");
    actions.className = "boot-loading-actions";
    actions.dataset.loadingActions = "true";
    const editorButton = isDraftPlaytestActive() ? `<button class="ui-button" data-startup-editor>${icon("levels")} Editor</button>` : "";
    actions.innerHTML = `
      <button class="ui-button primary" data-startup-retry>${icon("restart")} Retry</button>
      ${editorButton}
    `;
    panel.append(actions);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "echo-shift-startup-loading-status");
    panel.setAttribute("aria-describedby", "echo-shift-startup-loading-detail");
    const retry = actions.querySelector<HTMLButtonElement>("[data-startup-retry]");
    const editor = actions.querySelector<HTMLButtonElement>("[data-startup-editor]");
    retry?.addEventListener("click", () => window.location.reload());
    editor?.addEventListener("click", () => this.openEditor());
    this.menuNavigation?.destroy();
    this.menuNavigation = bindMenuNavigation(this.loadingScreen, {
      onBack: () => (isDraftPlaytestActive() ? this.openEditor() : window.location.reload()),
      onNavigate: () => audio.play("select"),
      initialFocus: "[data-startup-retry]",
      trapFocus: true
    });
  }

  private cleanupLoadingListeners(): void {
    this.load.off(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.off(Phaser.Loader.Events.FILE_PROGRESS, this.handleFileProgress, this);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError, this);
    this.load.off(Phaser.Loader.Events.COMPLETE, this.handleLoadComplete, this);
  }

  private finishLoadingScreen(): void {
    this.cleanupLoadingListeners();
    this.loadingScreen?.remove();
    this.loadingScreen = null;
    this.loadingBar = null;
    this.loadingPercent = null;
    this.loadingStatus = null;
    this.loadingProgress = null;
    this.clearLoadingDiagnostics();
  }

  private loadingLabelFor(key: string): string {
    if (key.startsWith("terrain-decor-prop:")) return "Loading terrain decor";
    if (key.includes("background") || key.includes("lab") || key.includes("garden") || key.includes("relay") || key.includes("grove") || key.includes("archive")) {
      return "Loading room backdrop";
    }
    if (key.includes("boss") || key.includes("monster")) return "Loading enemy sprites";
    if (key.includes("time") || key.includes("runner")) return "Loading rewind sprites";
    return "Loading runtime textures";
  }

  private loadingDetailFor(key: string): string {
    if (key === levelBackgrounds["time-lab-prototype"].key) return "Start screen artwork";
    if (key.startsWith("terrain-decor-prop:")) return "Terrain decor";
    if (key.includes("boss") || key.includes("monster")) return "Enemy sprites";
    if (key.includes("time") || key.includes("runner")) return "Rewind sprites";
    return "Runtime textures";
  }

  private currentLoadingPercent(): string {
    return this.loadingPercent?.textContent || "0%";
  }

  private startupBackgrounds(): LevelBackground[] {
    return [levelBackgrounds["time-lab-prototype"]];
  }

  private startupBackgroundFallbackSrcFor(key: string): string | undefined {
    return this.startupBackgrounds().find((background) => background.key === key)?.fallbackSrc;
  }

  private writeLoadingDiagnostics(phase: string, percent?: number, current?: string): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.echoShiftBootLoading = phase;
    if (typeof percent === "number") document.documentElement.dataset.echoShiftBootLoadProgress = String(percent);
    if (current) document.documentElement.dataset.echoShiftBootLoadCurrent = current;
  }

  private clearLoadingDiagnostics(): void {
    if (typeof document === "undefined") return;
    delete document.documentElement.dataset.echoShiftBootLoading;
    delete document.documentElement.dataset.echoShiftBootLoadProgress;
    delete document.documentElement.dataset.echoShiftBootLoadCurrent;
  }

  private resolveDomImage(src: string, fallbackSrc?: string): Promise<string> {
    return this.imageIsReady(src).then((ready) => {
      if (ready) return src;
      if (!fallbackSrc) {
        this.loadingFailed = true;
        this.writeLoadingDiagnostics("error", 100, `Could not load ${src}`);
        return src;
      }
      return this.imageIsReady(fallbackSrc).then((fallbackReady) => {
        if (fallbackReady) return fallbackSrc;
        this.loadingFailed = true;
        this.writeLoadingDiagnostics("error", 100, `Could not load ${src}`);
        return src;
      });
    });
  }

  private imageIsReady(src: string): Promise<boolean> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = src;
      if (image.complete && image.naturalWidth > 0) resolve(true);
    });
  }

  private setArtScreenImage(src: string): void {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--art-screen-image", `url("${src}")`);
  }

  private openEditor(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("editor", "1");
    url.searchParams.delete("playtestDraft");
    url.searchParams.delete("level");
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  }

  private nextScene(): { scene: "MenuScene"; data?: undefined; musicKey: "menu" } | { scene: "GameScene"; data: { levelIndex: number }; musicKey: ReturnType<typeof soundtrackForLevel>["key"] } {
    if (isDraftPlaytestActive()) {
      const levelIndex = playtestLevelIndex();
      return {
        scene: "GameScene",
        data: { levelIndex },
        musicKey: soundtrackForLevel(levels[levelIndex], levelIndex).key
      };
    }
    return { scene: "MenuScene", musicKey: "menu" };
  }
}
