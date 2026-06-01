export const uiRoot = (): HTMLElement => {
  const root = document.getElementById("ui-root");
  if (!root) throw new Error("Missing #ui-root");
  return root;
};

export const clearUi = (): void => {
  uiRoot().replaceChildren();
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
