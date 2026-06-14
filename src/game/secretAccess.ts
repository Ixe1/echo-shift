import { isDraftPlaytestActive } from "../data/levels";

const SECRET_SEQUENCE = ["up", "up", "down", "down", "left", "right", "left", "right", "r"] as const;

type SecretInput = (typeof SECRET_SEQUENCE)[number];

let unlocked = false;

const currentParams = (): URLSearchParams => {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
};

export const secretSequence = (): readonly SecretInput[] => SECRET_SEQUENCE;

export const isSecretAccessUrl = (): boolean => {
  const params = currentParams();
  return params.get("editor") === "1" || (params.get("playtestDraft") === "1" && isDraftPlaytestActive());
};

export const isSecretAccessUnlocked = (): boolean => unlocked || isSecretAccessUrl();

export const unlockSecretAccess = (): void => {
  unlocked = true;
};

export const secretInputFromKeyboardEvent = (event: KeyboardEvent): SecretInput | null => {
  switch (event.key) {
    case "ArrowUp":
    case "Up":
      return "up";
    case "ArrowDown":
    case "Down":
      return "down";
    case "ArrowLeft":
    case "Left":
      return "left";
    case "ArrowRight":
    case "Right":
      return "right";
    case "r":
    case "R":
      return "r";
    default:
      return null;
  }
};
