import { audio, type AudioMixSettings } from "../game/audio";

type OptionsView = "root" | "audio" | "controls";

type OptionsCallbacks = {
  onBack: () => void;
  onNavigate?: () => void;
};

type AudioSettingDefinition = {
  key: keyof AudioMixSettings;
  label: string;
};

export const controlBindings: Array<{ action: string; binding: string }> = [
  { action: "Move", binding: "A / D or Left / Right" },
  { action: "Jump", binding: "W, Up, or Space" },
  { action: "Rewind / Echo", binding: "R creates an echo from your previous run" },
  { action: "Pause", binding: "Esc" },
  { action: "Gamepad", binding: "D-pad or left stick, A/Cross to jump or confirm, B/Circle to go back, X/Square or left shoulder to rewind" }
];

const audioSettings: AudioSettingDefinition[] = [
  { key: "masterVolume", label: "Master Volume" },
  { key: "fxVolume", label: "FX Volume" },
  { key: "musicVolume", label: "Music Volume" }
];

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const audioSettingRows = (): string => {
  const settings = audio.getSettings();
  return audioSettings
    .map(({ key, label }) => {
      const value = settings[key];
      return `
        <label class="setting-row">
          <span>${label}</span>
          <input type="range" min="0" max="100" step="1" value="${Math.round(value * 100)}" data-audio-setting="${key}" />
          <output data-audio-output="${key}">${pct(value)}</output>
        </label>
      `;
    })
    .join("");
};

const controlsRows = (): string =>
  controlBindings
    .map(
      ({ action, binding }) => `
        <div class="control-row">
          <span>${action}</span>
          <strong>${binding}</strong>
        </div>
      `
    )
    .join("");

export const optionsPanelHtml = (view: OptionsView = "root"): string => {
  if (view === "audio") {
    return `
      <section class="panel menu-panel options-panel">
        <h1>Audio</h1>
        <div class="settings-list">${audioSettingRows()}</div>
        <div class="button-grid">
          <button class="ui-button primary" data-options-root>Back</button>
        </div>
      </section>
    `;
  }

  if (view === "controls") {
    return `
      <section class="panel menu-panel options-panel">
        <h1>Controls</h1>
        <div class="controls-list">${controlsRows()}</div>
        <div class="button-grid">
          <button class="ui-button primary" data-options-root>Back</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel menu-panel options-panel">
      <h1>Options</h1>
      <div class="button-grid">
        <button class="ui-button primary" data-options-audio>Audio</button>
        <button class="ui-button" data-options-controls>Controls</button>
        <button class="ui-button" data-options-back>Back</button>
      </div>
    </section>
  `;
};

export const bindOptionsPanel = (root: HTMLElement, callbacks: OptionsCallbacks): void => {
  const navigate = () => callbacks.onNavigate?.();
  const show = (view: OptionsView) => {
    root.innerHTML = optionsPanelHtml(view);
    bindOptionsPanel(root, callbacks);
  };

  root.querySelector("[data-options-audio]")?.addEventListener("click", () => {
    navigate();
    show("audio");
  });
  root.querySelector("[data-options-controls]")?.addEventListener("click", () => {
    navigate();
    show("controls");
  });
  root.querySelector("[data-options-root]")?.addEventListener("click", () => {
    navigate();
    show("root");
  });
  root.querySelector("[data-options-back]")?.addEventListener("click", () => {
    navigate();
    callbacks.onBack();
  });

  root.querySelectorAll<HTMLInputElement>("[data-audio-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.audioSetting as keyof AudioMixSettings;
      const value = Math.max(0, Math.min(1, Number(input.value) / 100));
      audio.setSettings({ [key]: value } as Partial<AudioMixSettings>);
      const output = root.querySelector<HTMLOutputElement>(`[data-audio-output="${key}"]`);
      if (output) output.value = pct(value);
    });
  });
};
