type MenuNavigationOptions = {
  onBack?: () => void;
  onNavigate?: () => void;
  autoFocus?: boolean;
};

export type MenuNavigationBinding = {
  destroy: () => void;
  focusFirst: () => void;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");
const AXIS_THRESHOLD = 0.55;
const INITIAL_REPEAT_MS = 280;
const HELD_REPEAT_MS = 150;

const visible = (element: HTMLElement): boolean => {
  if (element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
};

const focusableControls = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(visible);

export const focusFirstMenuControl = (root: HTMLElement): void => {
  const first = focusableControls(root)[0];
  first?.focus();
};

const activeElementIn = (root: HTMLElement): HTMLElement | null => {
  const active = document.activeElement;
  return active instanceof HTMLElement && root.contains(active) ? active : null;
};

const isTextInput = (element: HTMLElement | null): boolean => {
  if (!(element instanceof HTMLInputElement)) return false;
  return ["email", "number", "password", "search", "tel", "text", "url"].includes(element.type);
};

export const bindMenuNavigation = (root: HTMLElement, options: MenuNavigationOptions = {}): MenuNavigationBinding => {
  let destroyed = false;
  let raf = 0;
  let heldDirection: string | null = null;
  let heldButton: string | null = null;
  let nextMoveAt = 0;

  const navigate = (delta: number): void => {
    const controls = focusableControls(root);
    if (controls.length === 0) return;
    const active = activeElementIn(root);
    const current = active ? controls.indexOf(active) : -1;
    const next = current < 0 ? 0 : (current + delta + controls.length) % controls.length;
    controls[next]?.focus();
    options.onNavigate?.();
  };

  const activate = (): void => {
    const active = activeElementIn(root);
    if (!active) {
      focusFirstMenuControl(root);
      return;
    }
    if (isTextInput(active)) return;
    active.click();
  };

  const keydown = (event: KeyboardEvent): void => {
    if (destroyed || !root.isConnected || !visible(root)) return;
    const active = activeElementIn(root);
    if (isTextInput(active) && event.key !== "Escape") return;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key.toLowerCase() === "w" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      navigate(-1);
    } else if (
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      event.key.toLowerCase() === "s" ||
      event.key.toLowerCase() === "d"
    ) {
      event.preventDefault();
      navigate(1);
    } else if ((event.key === "Escape" || event.key === "Backspace") && options.onBack) {
      event.preventDefault();
      options.onBack();
    }
  };

  const pressed = (gamepad: Gamepad, index: number): boolean => gamepad.buttons[index]?.pressed === true;

  const pollGamepad = (now: number): void => {
    if (destroyed) return;
    const gamepad = Array.from(navigator.getGamepads?.() || []).find((pad): pad is Gamepad => Boolean(pad));
    if (gamepad && root.isConnected && visible(root)) {
      const axis = gamepad.axes[0] || 0;
      const vertical = gamepad.axes[1] || 0;
      const direction =
        pressed(gamepad, 14) || axis < -AXIS_THRESHOLD || pressed(gamepad, 12) || vertical < -AXIS_THRESHOLD
          ? "previous"
          : pressed(gamepad, 15) || axis > AXIS_THRESHOLD || pressed(gamepad, 13) || vertical > AXIS_THRESHOLD
            ? "next"
            : null;
      if (direction && (direction !== heldDirection || now >= nextMoveAt)) {
        navigate(direction === "previous" ? -1 : 1);
        nextMoveAt = now + (direction === heldDirection ? HELD_REPEAT_MS : INITIAL_REPEAT_MS);
      }
      heldDirection = direction;

      const button = pressed(gamepad, 0) || pressed(gamepad, 9) ? "confirm" : pressed(gamepad, 1) ? "back" : null;
      if (button && button !== heldButton) {
        if (button === "confirm") activate();
        else if (options.onBack) options.onBack();
      }
      heldButton = button;
    } else {
      heldDirection = null;
      heldButton = null;
    }
    raf = window.requestAnimationFrame(pollGamepad);
  };

  window.addEventListener("keydown", keydown);
  raf = window.requestAnimationFrame(pollGamepad);
  if (options.autoFocus !== false) window.setTimeout(() => focusFirstMenuControl(root), 0);

  return {
    destroy: () => {
      destroyed = true;
      window.removeEventListener("keydown", keydown);
      window.cancelAnimationFrame(raf);
    },
    focusFirst: () => focusFirstMenuControl(root)
  };
};
