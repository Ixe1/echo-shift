import type { InputFrame } from "./types";

export type EchoRecording = {
  id: string;
  frames: InputFrame[];
  createdAtFrame: number;
};

export const cloneInputFrame = (frame: InputFrame): InputFrame => ({
  left: frame.left,
  right: frame.right,
  jump: frame.jump
});

export const blankInputFrame = (): InputFrame => ({
  left: false,
  right: false,
  jump: false
});

export const trimRecording = (frames: InputFrame[]): InputFrame[] => {
  let end = frames.length;
  while (end > 0) {
    const frame = frames[end - 1];
    if (frame.left || frame.right || frame.jump) break;
    end -= 1;
  }
  return frames.slice(0, Math.max(end, 1));
};
