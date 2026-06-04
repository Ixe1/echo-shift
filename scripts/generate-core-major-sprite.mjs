import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const WIDTH = 256;
const HEIGHT = 128;
const FRAME = 128;
const BYTES_PER_PIXEL = 4;
const out = new Uint8Array(WIDTH * HEIGHT * BYTES_PER_PIXEL);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const rgba = (hex, alpha = 255) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha];
};

const blendPixel = (x, y, color) => {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (Math.round(y) * WIDTH + Math.round(x)) * BYTES_PER_PIXEL;
  const sourceAlpha = color[3] / 255;
  const destAlpha = out[index + 3] / 255;
  const nextAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (nextAlpha <= 0) return;
  out[index] = Math.round((color[0] * sourceAlpha + out[index] * destAlpha * (1 - sourceAlpha)) / nextAlpha);
  out[index + 1] = Math.round((color[1] * sourceAlpha + out[index + 1] * destAlpha * (1 - sourceAlpha)) / nextAlpha);
  out[index + 2] = Math.round((color[2] * sourceAlpha + out[index + 2] * destAlpha * (1 - sourceAlpha)) / nextAlpha);
  out[index + 3] = Math.round(nextAlpha * 255);
};

const fillCircle = (cx, cy, radius, color) => {
  const left = Math.floor(cx - radius);
  const right = Math.ceil(cx + radius);
  const top = Math.floor(cy - radius);
  const bottom = Math.ceil(cy + radius);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= radius) blendPixel(x, y, color);
    }
  }
};

const strokeCircle = (cx, cy, radius, thickness, color) => {
  const left = Math.floor(cx - radius - thickness);
  const right = Math.ceil(cx + radius + thickness);
  const top = Math.floor(cy - radius - thickness);
  const bottom = Math.ceil(cy + radius + thickness);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (Math.abs(distance - radius) <= thickness / 2) blendPixel(x, y, color);
    }
  }
};

const fillDiamond = (cx, cy, radiusX, radiusY, color) => {
  const left = Math.floor(cx - radiusX);
  const right = Math.ceil(cx + radiusX);
  const top = Math.floor(cy - radiusY);
  const bottom = Math.ceil(cy + radiusY);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const distance = Math.abs((x - cx) / radiusX) + Math.abs((y - cy) / radiusY);
      if (distance <= 1) blendPixel(x, y, color);
    }
  }
};

const drawLine = (x1, y1, x2, y2, color) => {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    blendPixel(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), color);
  }
};

const strokeDiamond = (cx, cy, radiusX, radiusY, color) => {
  drawLine(cx, cy - radiusY, cx + radiusX, cy, color);
  drawLine(cx + radiusX, cy, cx, cy + radiusY, color);
  drawLine(cx, cy + radiusY, cx - radiusX, cy, color);
  drawLine(cx - radiusX, cy, cx, cy - radiusY, color);
};

const drawRay = (cx, cy, angle, length, color) => {
  const start = length * 0.42;
  drawLine(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start, cx + Math.cos(angle) * length, cy + Math.sin(angle) * length, color);
};

const drawFrame = (frameIndex, pulse) => {
  const ox = frameIndex * FRAME;
  const cx = ox + FRAME / 2;
  const cy = FRAME / 2;
  const gold = rgba("#ffe35a", 215);
  const hotGold = rgba("#fff4a0", 230);
  const cyan = rgba("#43f7ff", 230);
  const blue = rgba("#2564ff", 230);
  const violet = rgba("#bd5cff", 205);
  const white = rgba("#ffffff", 240);

  for (let radius = 52; radius >= 20; radius -= 8) {
    fillCircle(cx, cy, radius + pulse, rgba(radius > 34 ? "#43f7ff" : "#ffe35a", clamp(12 + (52 - radius) * 2, 18, 52)));
  }

  for (let index = 0; index < 16; index += 1) {
    const angle = (Math.PI * 2 * index) / 16 + pulse * 0.035;
    drawRay(cx, cy, angle, 48 + (index % 2) * 10 + pulse * 0.8, rgba(index % 2 === 0 ? "#43f7ff" : "#ffe35a", index % 2 === 0 ? 170 : 150));
  }

  strokeCircle(cx, cy, 42 + pulse, 3, cyan);
  strokeCircle(cx, cy, 34 - pulse * 0.35, 2, violet);
  strokeCircle(cx, cy, 24 + pulse * 0.25, 2, hotGold);

  fillDiamond(cx, cy, 22, 31, rgba("#061640", 245));
  fillDiamond(cx, cy - 2, 17, 24, blue);
  fillDiamond(cx, cy - 4, 11, 17, cyan);
  fillDiamond(cx, cy - 7, 5, 8, white);

  strokeDiamond(cx, cy, 24, 33, hotGold);
  strokeDiamond(cx, cy - 1, 18, 25, white);
  drawLine(cx, cy - 31, cx, cy + 31, rgba("#ffffff", 145));
  drawLine(cx - 22, cy, cx + 22, cy, rgba("#43f7ff", 170));

  fillCircle(cx - 19, cy - 23, 3 + pulse * 0.2, white);
  fillCircle(cx + 24, cy + 17, 3, hotGold);
  fillCircle(cx + 30, cy - 26, 2, cyan);
  fillCircle(cx - 32, cy + 22, 2, violet);

  fillDiamond(cx - 22, cy + 38, 12, 7, rgba("#ffe35a", 120));
  fillDiamond(cx + 22, cy + 38, 12, 7, rgba("#43f7ff", 105));
};

drawFrame(0, -1);
drawFrame(1, 2);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

const crc32 = (buffers) => {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32([typeBuffer, data]), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8;
header[9] = 6;
header[10] = 0;
header[11] = 0;
header[12] = 0;

const scanlines = Buffer.alloc((WIDTH * BYTES_PER_PIXEL + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const scanlineOffset = y * (WIDTH * BYTES_PER_PIXEL + 1);
  scanlines[scanlineOffset] = 0;
  scanlines.set(out.subarray(y * WIDTH * BYTES_PER_PIXEL, (y + 1) * WIDTH * BYTES_PER_PIXEL), scanlineOffset + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

writeFileSync("public/assets/sprites/core-major-sheet.png", png);
