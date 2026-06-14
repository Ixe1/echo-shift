export const uiRoot = (): HTMLElement => {
  const root = document.getElementById("ui-root");
  if (!root) throw new Error("Missing #ui-root");
  return root;
};

export const clearUi = (): void => {
  uiRoot().replaceChildren();
};

export const ECHO_SHIFT_LOGO_SRC = "/assets/echo-shift-logo.webp";
export const ECHO_SHIFT_LOGO_FALLBACK_SRC = "/assets/echo-shift-logo.png";

let activeEchoShiftLogoSrc = ECHO_SHIFT_LOGO_SRC;

export const currentEchoShiftLogoSrc = (): string => activeEchoShiftLogoSrc;

export const rememberEchoShiftLogoSrc = (src: string): void => {
  if (src === ECHO_SHIFT_LOGO_SRC || src === ECHO_SHIFT_LOGO_FALLBACK_SRC) activeEchoShiftLogoSrc = src;
};

export const bindImageFallbacks = (root: ParentNode = uiRoot()): void => {
  root.querySelectorAll<HTMLImageElement>("img[data-fallback-src]").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const fallbackSrc = image.dataset.fallbackSrc;
        if (!fallbackSrc) return;
        rememberEchoShiftLogoSrc(fallbackSrc);
        image.src = fallbackSrc;
      },
      { once: true }
    );
  });
};

export const bindButton = (selector: string, handler: () => void, root: ParentNode = uiRoot()): void => {
  const button = root.querySelector<HTMLButtonElement>(selector);
  if (!button) return;
  button.addEventListener("click", handler);
};

export const icon = (name: "play" | "levels" | "credits" | "back" | "restart" | "rewind" | "pause" | "next") => {
  switch (name) {
    case "play":
      return "▶";
    case "levels":
      return "▦";
    case "credits":
      return "◎";
    case "back":
      return "←";
    case "restart":
      return "↻";
    case "rewind":
      return "⟲";
    case "pause":
      return "Ⅱ";
    case "next":
      return "→";
  }
};
