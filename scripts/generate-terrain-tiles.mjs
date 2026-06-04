import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const FRAME = 32;
const COLUMNS = 8;
const PAD = 1;
const CELL = FRAME + PAD * 2;
const BYTES_PER_PIXEL = 4;
const MATERIALS = [
  {
    key: "metal-lab",
    surface: "#5d8290",
    face: "#213c4b",
    dark: "#09151e",
    line: "#102431",
    accent: "#43f7ff",
    light: "#a8d7df"
  },
  {
    key: "glass-energy",
    surface: "#82d9ee",
    face: "#1a5266",
    dark: "#082033",
    line: "#0b3348",
    accent: "#43f7ff",
    light: "#dcfbff"
  },
  {
    key: "warning-industrial",
    surface: "#ffe35a",
    face: "#20262d",
    dark: "#070a0d",
    line: "#111820",
    accent: "#ff4f8b",
    light: "#fff6aa"
  },
  {
    key: "grass-organic",
    surface: "#6eca70",
    face: "#584029",
    dark: "#231709",
    line: "#3b2917",
    accent: "#b6f27d",
    light: "#d7ff9c"
  },
  {
    key: "sand-ruin",
    surface: "#d8bd76",
    face: "#8d7649",
    dark: "#3c3020",
    line: "#6f5b37",
    accent: "#ffe49a",
    light: "#fff1b5"
  },
  {
    key: "ice-cryo",
    surface: "#b8f2ff",
    face: "#68a9bd",
    dark: "#153449",
    line: "#3b8398",
    accent: "#f2fdff",
    light: "#ffffff"
  },
  {
    key: "wood-archive",
    surface: "#a16d3d",
    face: "#6a4125",
    dark: "#23140b",
    line: "#4c2d19",
    accent: "#e0af67",
    light: "#f1cf8a"
  },
  {
    key: "copper-corrode",
    surface: "#a76542",
    face: "#5b3b2d",
    dark: "#1f1512",
    line: "#36231c",
    accent: "#50ffc2",
    light: "#efb17c"
  }
];
const ROLES = ["floorTop", "floorFace", "wallFace", "blockFace"];
const TOTAL_FRAMES = MATERIALS.length * ROLES.length;
const ROWS = Math.ceil(TOTAL_FRAMES / COLUMNS);
const WIDTH = COLUMNS * CELL;
const HEIGHT = ROWS * CELL;
const out = new Uint8Array(WIDTH * HEIGHT * BYTES_PER_PIXEL);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const rgba = (hex, alpha = 255) => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha];
};

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
  Math.round(a[3] + (b[3] - a[3]) * t)
];

const shade = (color, amount) => {
  const target = amount >= 0 ? [255, 255, 255, color[3]] : [0, 0, 0, color[3]];
  return mix(color, target, Math.abs(amount));
};

const frameOrigin = (frameIndex) => ({
  x: (frameIndex % COLUMNS) * CELL + PAD,
  y: Math.floor(frameIndex / COLUMNS) * CELL + PAD
});

const setPixel = (frameIndex, x, y, color) => {
  if (x < 0 || x >= FRAME || y < 0 || y >= FRAME) return;
  const origin = frameOrigin(frameIndex);
  const index = ((origin.y + y) * WIDTH + origin.x + x) * BYTES_PER_PIXEL;
  out[index] = color[0];
  out[index + 1] = color[1];
  out[index + 2] = color[2];
  out[index + 3] = color[3];
};

const readGlobalPixel = (x, y) => {
  const index = (y * WIDTH + x) * BYTES_PER_PIXEL;
  return [out[index], out[index + 1], out[index + 2], out[index + 3]];
};

const setGlobalPixel = (x, y, color) => {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * BYTES_PER_PIXEL;
  out[index] = color[0];
  out[index + 1] = color[1];
  out[index + 2] = color[2];
  out[index + 3] = color[3];
};

const fillRect = (frameIndex, x, y, w, h, color) => {
  for (let yy = Math.max(0, y); yy < Math.min(FRAME, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(FRAME, x + w); xx += 1) setPixel(frameIndex, xx, yy, color);
  }
};

const drawLine = (frameIndex, x1, y1, x2, y2, color) => {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    setPixel(frameIndex, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), color);
  }
};

const strokeRect = (frameIndex, x, y, w, h, color) => {
  drawLine(frameIndex, x, y, x + w - 1, y, color);
  drawLine(frameIndex, x, y + h - 1, x + w - 1, y + h - 1, color);
  drawLine(frameIndex, x, y, x, y + h - 1, color);
  drawLine(frameIndex, x + w - 1, y, x + w - 1, y + h - 1, color);
};

const dot = (frameIndex, x, y, color) => {
  setPixel(frameIndex, x, y, color);
  setPixel(frameIndex, x + 1, y, color);
  setPixel(frameIndex, x, y + 1, color);
  setPixel(frameIndex, x + 1, y + 1, color);
};

const noise = (x, y, seed) => {
  const value = Math.sin((x + 17) * 12.9898 + (y + 31) * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

const paintBase = (frameIndex, palette, role) => {
  const face = rgba(palette.face);
  const surface = rgba(palette.surface);
  const dark = rgba(palette.dark);
  const seed = MATERIALS.findIndex((item) => item.key === palette.key) + ROLES.indexOf(role) * 11;
  for (let y = 0; y < FRAME; y += 1) {
    for (let x = 0; x < FRAME; x += 1) {
      const isTop = role === "floorTop" && y < 10;
      const base = isTop ? surface : role === "wallFace" ? mix(face, dark, 0.08) : face;
      const grain = noise(x, y, seed) - 0.5;
      const verticalShade = y / FRAME;
      const grainStrength = role === "wallFace" ? 0.015 : 0.07;
      const verticalStrength = role === "wallFace" ? 0.02 : 0.05;
      const color = shade(base, clamp(grain * grainStrength - verticalShade * verticalStrength, -0.08, 0.08));
      setPixel(frameIndex, x, y, color);
    }
  }
};

const drawWarningStripes = (frameIndex, palette) => {
  const yellow = rgba(palette.surface);
  const black = rgba(palette.dark);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < FRAME; x += 1) {
      const stripe = Math.floor((x + y * 2) / 9) % 2 === 0;
      setPixel(frameIndex, x, y, stripe ? yellow : black);
    }
  }
  fillRect(frameIndex, 0, 10, FRAME, 2, rgba(palette.dark));
  fillRect(frameIndex, 0, 12, FRAME, 1, rgba(palette.accent));
};

const drawGrassTufts = (frameIndex, palette) => {
  const grass = rgba(palette.accent);
  const darkGrass = shade(rgba(palette.surface), -0.24);
  for (let x = 1; x < FRAME; x += 4) {
    drawLine(frameIndex, x, 8, x + 1, 2 + (x % 3), grass);
    drawLine(frameIndex, x + 2, 9, x + 1, 4 + (x % 4), darkGrass);
  }
  fillRect(frameIndex, 0, 10, FRAME, 2, shade(rgba(palette.face), -0.22));
};

const drawSandPebbles = (frameIndex, palette, role) => {
  const pebble = shade(rgba(palette.line), 0.1);
  for (let y = role === "floorTop" ? 2 : 4; y < FRAME; y += 7) {
    for (let x = (y * 3) % 7; x < FRAME; x += 11) setPixel(frameIndex, x, y, pebble);
  }
  if (role !== "wallFace") drawLine(frameIndex, 0, 9, FRAME - 1, 8, rgba(palette.light));
};

const drawGlassGlints = (frameIndex, palette, role) => {
  const light = rgba(palette.light);
  const accent = rgba(palette.accent);
  if (role === "floorTop") {
    drawLine(frameIndex, 5, 3, 17, 3, light);
    drawLine(frameIndex, 19, 11, 29, 1, shade(accent, 0.2));
    return;
  }
  if (role === "wallFace") return;
  const muted = shade(rgba(palette.face), 0.18);
  drawLine(frameIndex, 6, 6, 18, 6, muted);
  drawLine(frameIndex, 20, 21, 29, 13, shade(muted, 0.04));
};

const drawIceCracks = (frameIndex, palette) => {
  const crack = shade(rgba(palette.line), -0.08);
  drawLine(frameIndex, 3, 18, 12, 14, crack);
  drawLine(frameIndex, 12, 14, 19, 20, crack);
  drawLine(frameIndex, 19, 20, 29, 16, crack);
  drawLine(frameIndex, 13, 15, 9, 23, shade(crack, 0.1));
};

const drawWoodGrain = (frameIndex, palette, role) => {
  const line = rgba(palette.line);
  const light = shade(rgba(palette.light), -0.08);
  const plankY = role === "floorTop" ? 4 : 8;
  for (let y = plankY; y < FRAME; y += 8) drawLine(frameIndex, 0, y, FRAME - 1, y + (y % 2), line);
  for (let x = 4; x < FRAME; x += 12) drawLine(frameIndex, x, role === "floorTop" ? 1 : 0, x, FRAME - 1, shade(line, -0.1));
  drawLine(frameIndex, 2, 6, 13, 5, light);
  drawLine(frameIndex, 18, 20, 29, 19, light);
};

const drawCopperPatina = (frameIndex, palette, role) => {
  const accent = rgba(palette.accent);
  if (role === "floorTop") {
    fillRect(frameIndex, 0, 9, FRAME, 2, accent);
    dot(frameIndex, 6, 3, shade(accent, 0.2));
    dot(frameIndex, 24, 6, shade(accent, -0.1));
    return;
  }
  drawLine(frameIndex, 0, 19, 10, 22, shade(accent, -0.2));
  drawLine(frameIndex, 11, 22, 20, 18, shade(accent, 0.1));
  drawLine(frameIndex, 21, 18, 31, 21, shade(accent, -0.16));
};

const drawSharedPanelLines = (frameIndex, palette, role) => {
  const line = rgba(palette.line);
  const dark = rgba(palette.dark);
  const light = rgba(palette.light);
  if (role === "floorTop") {
    fillRect(frameIndex, 0, 0, FRAME, 2, shade(light, -0.02));
    fillRect(frameIndex, 0, 9, FRAME, 2, dark);
    for (let x = 0; x < FRAME; x += 16) drawLine(frameIndex, x, 2, x + 8, 9, shade(line, -0.05));
    return;
  }
  if (role === "wallFace") {
    for (let x = 0; x < FRAME; x += 16) drawLine(frameIndex, x, 0, x, FRAME - 1, line);
    for (let y = 0; y < FRAME; y += 16) drawLine(frameIndex, 0, y, FRAME - 1, y, shade(line, -0.1));
  } else {
    for (let y = 0; y < FRAME; y += 16) drawLine(frameIndex, 0, y, FRAME - 1, y, line);
    if (role === "blockFace") strokeRect(frameIndex, 5, 5, 22, 22, shade(line, -0.05));
  }
  dot(frameIndex, 6, 6, shade(light, -0.15));
  dot(frameIndex, 24, 24, shade(dark, 0.12));
};

const drawTile = (material, role, frameIndex) => {
  paintBase(frameIndex, material, role);
  if (material.key === "warning-industrial" && role === "floorTop") drawWarningStripes(frameIndex, material);
  else if (material.key === "grass-organic" && role === "floorTop") drawGrassTufts(frameIndex, material);
  else if (material.key === "glass-energy" && role === "wallFace") {
    fillRect(frameIndex, 0, 0, FRAME, FRAME, rgba(material.face));
    fillRect(frameIndex, 0, 0, FRAME, 1, shade(rgba(material.face), 0.08));
    fillRect(frameIndex, 0, FRAME - 1, FRAME, 1, shade(rgba(material.face), -0.08));
  }
  else drawSharedPanelLines(frameIndex, material, role);

  if (material.key === "glass-energy") drawGlassGlints(frameIndex, material, role);
  if (material.key === "sand-ruin") drawSandPebbles(frameIndex, material, role);
  if (material.key === "ice-cryo") drawIceCracks(frameIndex, material);
  if (material.key === "wood-archive") drawWoodGrain(frameIndex, material, role);
  if (material.key === "copper-corrode") drawCopperPatina(frameIndex, material, role);

  if (role === "floorFace" || role === "blockFace") fillRect(frameIndex, 0, 0, FRAME, 1, shade(rgba(material.dark), 0.06));
  if (role === "wallFace") fillRect(frameIndex, 0, 0, 1, FRAME, shade(rgba(material.dark), 0.03));
};

for (let materialIndex = 0; materialIndex < MATERIALS.length; materialIndex += 1) {
  for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
    drawTile(MATERIALS[materialIndex], ROLES[roleIndex], materialIndex * ROLES.length + roleIndex);
  }
}

for (let frameIndex = 0; frameIndex < TOTAL_FRAMES; frameIndex += 1) {
  const origin = frameOrigin(frameIndex);
  for (let x = 0; x < FRAME; x += 1) {
    setGlobalPixel(origin.x + x, origin.y - 1, readGlobalPixel(origin.x + x, origin.y));
    setGlobalPixel(origin.x + x, origin.y + FRAME, readGlobalPixel(origin.x + x, origin.y + FRAME - 1));
  }
  for (let y = 0; y < FRAME; y += 1) {
    setGlobalPixel(origin.x - 1, origin.y + y, readGlobalPixel(origin.x, origin.y + y));
    setGlobalPixel(origin.x + FRAME, origin.y + y, readGlobalPixel(origin.x + FRAME - 1, origin.y + y));
  }
  setGlobalPixel(origin.x - 1, origin.y - 1, readGlobalPixel(origin.x, origin.y));
  setGlobalPixel(origin.x + FRAME, origin.y - 1, readGlobalPixel(origin.x + FRAME - 1, origin.y));
  setGlobalPixel(origin.x - 1, origin.y + FRAME, readGlobalPixel(origin.x, origin.y + FRAME - 1));
  setGlobalPixel(origin.x + FRAME, origin.y + FRAME, readGlobalPixel(origin.x + FRAME - 1, origin.y + FRAME - 1));
}

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

writeFileSync("public/assets/sprites/terrain-tiles.png", png);
