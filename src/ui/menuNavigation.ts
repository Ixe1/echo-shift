type MenuNavigationOptions = {
  onBack?: () => void;
  onNavigate?: () => void;
  autoFocus?: boolean;
  trapFocus?: boolean;
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
const RANGE_GAMEPAD_STEP = 5;

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

const usesNativeDirectionalKeys = (element: HTMLElement | null): boolean => {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element.isContentEditable) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return [
    "date",
    "datetime-local",
    "email",
    "month",
    "number",
    "password",
    "range",
    "search",
    "tel",
    "text",
    "time",
    "url",
    "week"
  ].includes(element.type);
};

export const bindMenuNavigation = (root: HTMLElement, options: MenuNavigationOptions = {}): MenuNavigationBinding => {
  let destroyed = false;
  let raf = 0;
  let heldDirection: string | null = null;
  let heldButton: string | null = null;
  let nextMoveAt = 0;
  let gamepadPrimed = false;
  let waitingForNeutralDirection = false;

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
    if (usesNativeDirectionalKeys(active)) return;
    active.click();
  };

  const activeRangeInput = (): HTMLInputElement | null => {
    const active = activeElementIn(root);
    return active instanceof HTMLInputElement && active.type === "range" ? active : null;
  };

  const adjustRangeInput = (input: HTMLInputElement, delta: number): void => {
    const step = Number(input.step);
    const increment = Number.isFinite(step) && step > 0 ? step : RANGE_GAMEPAD_STEP;
    const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
    const max = Number.isFinite(Number(input.max)) ? Number(input.max) : 100;
    const next = Math.max(min, Math.min(max, Number(input.value) + delta * increment));
    input.value = `${next}`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const trapTab = (event: KeyboardEvent): void => {
    const controls = focusableControls(root);
    if (controls.length === 0) return;
    const active = activeElementIn(root);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!active) {
      event.preventDefault();
      first?.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const keydown = (event: KeyboardEvent): void => {
    if (destroyed || !root.isConnected || !visible(root)) return;
    const active = activeElementIn(root);
    if (event.key === "Tab" && options.trapFocus) {
      trapTab(event);
      return;
    }
    if (usesNativeDirectionalKeys(active) && event.key !== "Escape") return;
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
      const horizontalDirection =
        pressed(gamepad, 14) || axis < -AXIS_THRESHOLD ? "previous" : pressed(gamepad, 15) || axis > AXIS_THRESHOLD ? "next" : null;
      const verticalDirection =
        pressed(gamepad, 12) || vertical < -AXIS_THRESHOLD ? "previous" : pressed(gamepad, 13) || vertical > AXIS_THRESHOLD ? "next" : null;
      const rangeInput = activeRangeInput();
      const direction =
        rangeInput && horizontalDirection ? (horizontalDirection === "previous" ? "range-down" : "range-up") : verticalDirection || horizontalDirection;
      const button = pressed(gamepad, 0) || pressed(gamepad, 9) ? "confirm" : pressed(gamepad, 1) ? "back" : null;
      if (!gamepadPrimed) {
        heldDirection = direction;
        heldButton = button;
        waitingForNeutralDirection = direction !== null;
        nextMoveAt = now + INITIAL_REPEAT_MS;
        gamepadPrimed = true;
        raf = window.requestAnimationFrame(pollGamepad);
        return;
      }
      if (waitingForNeutralDirection) {
        if (!direction) {
          waitingForNeutralDirection = false;
          heldDirection = null;
        } else {
          heldDirection = direction;
          raf = window.requestAnimationFrame(pollGamepad);
          return;
        }
      }
      if (direction && (direction !== heldDirection || now >= nextMoveAt)) {
        if (rangeInput && (direction === "range-down" || direction === "range-up")) adjustRangeInput(rangeInput, direction === "range-down" ? -1 : 1);
        else navigate(direction === "previous" ? -1 : 1);
        nextMoveAt = now + (direction === heldDirection ? HELD_REPEAT_MS : INITIAL_REPEAT_MS);
      }
      heldDirection = direction;

      if (button && button !== heldButton) {
        if (button === "confirm") activate();
        else if (options.onBack) options.onBack();
      }
      heldButton = button;
    } else {
      heldDirection = null;
      heldButton = null;
      gamepadPrimed = false;
      waitingForNeutralDirection = false;
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
