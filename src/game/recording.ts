import type { InputFrame } from "./types";

const INPUT_LEFT = 1;
const INPUT_RIGHT = 2;
const INPUT_JUMP = 4;

export type PackedInputFrames = Uint8Array;
export type EchoInputFrames = PackedInputFrames | readonly InputFrame[];

export type EchoRecording = {
  id: string;
  frames: EchoInputFrames;
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

export const encodeInputFrame = (frame: InputFrame): number =>
  (frame.left ? INPUT_LEFT : 0) |
  (frame.right ? INPUT_RIGHT : 0) |
  (frame.jump ? INPUT_JUMP : 0);

export const decodeInputFrame = (value: number): InputFrame => ({
  left: (value & INPUT_LEFT) !== 0,
  right: (value & INPUT_RIGHT) !== 0,
  jump: (value & INPUT_JUMP) !== 0
});

export const inputFrameAt = (frames: EchoInputFrames, index: number): InputFrame => {
  if (frames instanceof Uint8Array) return decodeInputFrame(frames[index] || 0);
  const frame = frames[index];
  return frame ? cloneInputFrame(frame) : blankInputFrame();
};

export const recordInputFrame = (frames: number[], frame: InputFrame): void => {
  frames.push(encodeInputFrame(frame));
};

export const trimRecording = (frames: readonly number[]): PackedInputFrames => {
  let end = frames.length;
  while (end > 0) {
    if (frames[end - 1] !== 0) break;
    end -= 1;
  }
  return Uint8Array.from(frames.slice(0, Math.max(end, 1)));
};
