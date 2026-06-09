import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const FRAME = 32;
const COLUMNS = 12;
const PAD = 1;
const CELL = FRAME + PAD * 2;
const BYTES_PER_PIXEL = 4;
const VARIANTS = 3;
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
const ROLES = ["floorTop", "floorFace", "wallFace", "blockFace", "surfaceCap", "surfaceDecor"];
const TOTAL_FRAMES = MATERIALS.length * ROLES.length * VARIANTS;
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

const fillCircle = (frameIndex, cx, cy, radius, color) => {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(frameIndex, x, y, color);
    }
  }
};

const fillTriangle = (frameIndex, a, b, c, color) => {
  const minX = Math.floor(Math.min(a.x, b.x, c.x));
  const maxX = Math.ceil(Math.max(a.x, b.x, c.x));
  const minY = Math.floor(Math.min(a.y, b.y, c.y));
  const maxY = Math.ceil(Math.max(a.y, b.y, c.y));
  const area = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const total = area(a, b, c);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = { x, y };
      const w1 = area(point, b, c);
      const w2 = area(a, point, c);
      const w3 = area(a, b, point);
      if ((total >= 0 && w1 >= 0 && w2 >= 0 && w3 >= 0) || (total < 0 && w1 <= 0 && w2 <= 0 && w3 <= 0)) setPixel(frameIndex, x, y, color);
    }
  }
};

const noise = (x, y, seed) => {
  const value = Math.sin((x + 17) * 12.9898 + (y + 31) * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

const paintBase = (frameIndex, palette, role, variant) => {
  const face = rgba(palette.face);
  const surface = rgba(palette.surface);
  const dark = rgba(palette.dark);
  const seed = MATERIALS.findIndex((item) => item.key === palette.key) + ROLES.indexOf(role) * 11 + variant * 29;
  for (let y = 0; y < FRAME; y += 1) {
    for (let x = 0; x < FRAME; x += 1) {
      const isTop = role === "floorTop" && y < 10;
      const base = isTop ? surface : role === "wallFace" ? mix(face, dark, 0.08) : face;
      const grain = noise(x, y, seed) - 0.5;
      const verticalShade = y / FRAME;
      const grainStrength = role === "wallFace" ? 0.015 : 0.06 + variant * 0.012;
      const verticalStrength = role === "wallFace" ? 0.02 : 0.045 + variant * 0.005;
      const color = shade(base, clamp(grain * grainStrength - verticalShade * verticalStrength, -0.09, 0.09));
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

const drawGrassTufts = (frameIndex, palette, variant) => {
  const grass = rgba(palette.accent);
  const darkGrass = shade(rgba(palette.surface), -0.24);
  for (let x = 0; x < FRAME; x += 3) {
    const lift = 2 + ((x + variant * 5) % 5);
    drawLine(frameIndex, x, 9, x + 1, lift, (x + variant) % 2 === 0 ? grass : darkGrass);
    drawLine(frameIndex, x + 2, 9, x + 1, 4 + ((x + variant * 3) % 4), darkGrass);
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

const drawChip = (frameIndex, x, y, color) => {
  setPixel(frameIndex, x, y, color);
  setPixel(frameIndex, x + 1, y, shade(color, -0.08));
  setPixel(frameIndex, x, y + 1, shade(color, 0.08));
};

const drawInteriorMaterialTexture = (frameIndex, palette, role, variant) => {
  if (role !== "floorFace" && role !== "wallFace" && role !== "blockFace") return;

  const face = rgba(palette.face);
  const surface = rgba(palette.surface);
  const line = rgba(palette.line);
  const dark = rgba(palette.dark);
  const accent = rgba(palette.accent);
  const light = rgba(palette.light);
  const seam = shade(line, -0.08);
  const shadow = shade(dark, 0.12);

  if (palette.key === "metal-lab") {
    fillRect(frameIndex, 0, 6 + variant * 2, FRAME, 1, shade(seam, -0.06));
    fillRect(frameIndex, 0, 18 - variant, FRAME, 1, shade(seam, -0.04));
    strokeRect(frameIndex, 4 + variant * 2, 4, 10, 9, shade(line, -0.03));
    strokeRect(frameIndex, 19 - variant, 18, 9, 8, shade(line, -0.02));
    fillRect(frameIndex, 6, 24, 10, 2, shade(accent, -0.18));
    fillRect(frameIndex, 21, 8 + variant, 6, 2, shade(light, -0.18));
    for (let x = 3 + variant; x < FRAME; x += 10) setPixel(frameIndex, x, 14 + ((x + variant) % 5), shade(light, -0.22));
    for (let x = 2; x < FRAME; x += 9) setPixel(frameIndex, x, 28 - ((x + variant) % 6), shadow);
    return;
  }

  if (palette.key === "glass-energy") {
    strokeRect(frameIndex, 3 + variant, 3, 13, 11, shade(accent, -0.22));
    strokeRect(frameIndex, 15, 17 - variant, 13, 10, shade(accent, -0.26));
    drawLine(frameIndex, 5, 25, 17, 5, shade(light, -0.12));
    drawLine(frameIndex, 19, 29, 29, 15, shade(accent, 0.12));
    fillRect(frameIndex, 0, 15, FRAME, 1, shade(face, 0.14));
    fillRect(frameIndex, 16, 0, 1, FRAME, shade(face, -0.1));
    for (let y = 5 + variant; y < FRAME; y += 9) setPixel(frameIndex, 9 + ((y + variant) % 11), y, shade(light, -0.08));
    return;
  }

  if (palette.key === "warning-industrial") {
    fillRect(frameIndex, 2, 4, 12, 8, shade(face, 0.08));
    fillRect(frameIndex, 17, 17, 12, 9, shade(face, 0.06));
    strokeRect(frameIndex, 2, 4, 12, 8, shade(line, 0.04));
    strokeRect(frameIndex, 17, 17, 12, 9, shade(line, 0.04));
    for (let x = -6 + variant * 3; x < FRAME; x += 11) {
      drawLine(frameIndex, x, 13, x + 8, 21, shade(surface, -0.2));
      drawLine(frameIndex, x + 1, 13, x + 9, 21, shade(surface, -0.2));
    }
    fillRect(frameIndex, 21, 7, 6, 2, shade(accent, 0.04));
    fillRect(frameIndex, 6, 27, 8, 1, shade(surface, -0.08));
    return;
  }

  if (palette.key === "grass-organic") {
    drawLine(frameIndex, 0, 7 + variant, FRAME - 1, 5 + variant, shade(line, -0.04));
    drawLine(frameIndex, 0, 17, FRAME - 1, 18 + variant, shade(line, 0.03));
    drawLine(frameIndex, 0, 25 - variant, FRAME - 1, 24, shade(dark, 0.1));
    drawLine(frameIndex, 7, 0, 9, 12, shade(surface, -0.22));
    drawLine(frameIndex, 9, 12, 5, 22, shade(surface, -0.28));
    drawLine(frameIndex, 23, 3, 20, 17, shade(surface, -0.24));
    drawLine(frameIndex, 20, 17, 26, 28, shade(surface, -0.3));
    drawChip(frameIndex, 13, 11, shade(light, -0.34));
    drawChip(frameIndex, 28, 21, shade(surface, -0.32));
    return;
  }

  if (palette.key === "sand-ruin") {
    fillRect(frameIndex, 0, 9 + variant, FRAME, 1, shade(line, -0.02));
    fillRect(frameIndex, 0, 21 - variant, FRAME, 1, shade(line, -0.06));
    for (let x = 8 - variant; x < FRAME; x += 13) drawLine(frameIndex, x, 0, x, 9 + variant, shade(line, -0.02));
    for (let x = 4 + variant; x < FRAME; x += 14) drawLine(frameIndex, x, 21 - variant, x, FRAME - 1, shade(line, -0.04));
    drawLine(frameIndex, 5, 15, 13, 12, shade(dark, 0.05));
    drawLine(frameIndex, 13, 12, 18, 17, shade(dark, 0.04));
    drawChip(frameIndex, 24, 6, shade(light, -0.24));
    drawChip(frameIndex, 10, 26, shade(surface, 0.08));
    return;
  }

  if (palette.key === "ice-cryo") {
    fillRect(frameIndex, 0, 8, FRAME, 1, shade(light, -0.18));
    fillRect(frameIndex, 13 + variant, 0, 1, FRAME, shade(accent, -0.14));
    drawLine(frameIndex, 4, 26, 12, 12, shade(light, -0.05));
    drawLine(frameIndex, 12, 12, 18, 19, shade(line, 0.04));
    drawLine(frameIndex, 21, 4, 28, 15, shade(line, 0.02));
    drawLine(frameIndex, 28, 15, 24, 30, shade(light, -0.12));
    drawChip(frameIndex, 6 + variant * 4, 6, shade(accent, 0.04));
    return;
  }

  if (palette.key === "wood-archive") {
    for (let y = 6 + variant; y < FRAME; y += 9) fillRect(frameIndex, 0, y, FRAME, 1, shade(line, -0.06));
    for (let x = 7 + variant * 2; x < FRAME; x += 12) drawLine(frameIndex, x, 0, x + (x % 2), FRAME - 1, shade(line, -0.02));
    fillCircle(frameIndex, 11, 18 - variant, 3, shade(surface, -0.18));
    fillCircle(frameIndex, 11, 18 - variant, 1, shade(dark, 0.08));
    drawLine(frameIndex, 3, 11, 18, 10, shade(light, -0.24));
    drawLine(frameIndex, 16, 25, 29, 24, shade(light, -0.26));
    for (let x = 5; x < FRAME; x += 13) setPixel(frameIndex, x, 4 + ((x + variant) % 20), shade(dark, 0.08));
    return;
  }

  if (palette.key === "copper-corrode") {
    strokeRect(frameIndex, 3, 3, 13, 11, shade(line, -0.02));
    strokeRect(frameIndex, 16, 16, 13, 11, shade(line, -0.02));
    fillRect(frameIndex, 0, 10 + variant, FRAME, 3, shade(light, -0.2));
    fillRect(frameIndex, 2, 11 + variant, FRAME - 4, 1, shade(surface, -0.05));
    fillRect(frameIndex, 22, 4, 4, 22, shade(light, -0.18));
    fillRect(frameIndex, 23, 5, 2, 20, shade(surface, -0.08));
    drawLine(frameIndex, 6, 25, 15, 21, shade(accent, -0.18));
    drawLine(frameIndex, 15, 21, 21, 24, shade(accent, -0.12));
    drawChip(frameIndex, 8 + variant * 5, 6, shade(accent, -0.08));
  }
};

const drawRigidSurfaceCap = (frameIndex, palette, variant) => {
  const surface = rgba(palette.surface);
  const face = rgba(palette.face);
  const line = rgba(palette.line);
  const dark = rgba(palette.dark);
  const light = rgba(palette.light);
  const accent = rgba(palette.accent);
  fillRect(frameIndex, 0, 15, FRAME, 6, shade(surface, 0.08));
  fillRect(frameIndex, 0, 21, FRAME, 3, shade(face, -0.12));
  fillRect(frameIndex, 0, 24, FRAME, 6, shade(face, -0.02));
  fillRect(frameIndex, 0, 30, FRAME, 2, shade(dark, 0.06));
  drawLine(frameIndex, 0, 14, FRAME - 1, 14, shade(light, -0.08));
  drawLine(frameIndex, 0, 20, FRAME - 1, 20, shade(line, -0.04));
  fillTriangle(frameIndex, { x: 0, y: 15 }, { x: 5, y: 15 }, { x: 0, y: 20 }, shade(dark, 0.16));
  fillTriangle(frameIndex, { x: 31, y: 15 }, { x: 26, y: 15 }, { x: 31, y: 20 }, shade(light, -0.14));
  for (let x = 6 + variant; x < FRAME; x += 12) dot(frameIndex, x, 17, shade(light, -0.12));
  if (variant === 1) fillRect(frameIndex, 12, 17, 8, 2, shade(accent, -0.08));
};

const drawSurfaceCap = (frameIndex, palette, variant) => {
  if (palette.key === "grass-organic") {
    const grass = rgba(palette.accent);
    const midGrass = rgba(palette.surface);
    const darkGrass = shade(rgba(palette.surface), -0.28);
    const soil = rgba(palette.face);
    const root = rgba(palette.dark);
    fillRect(frameIndex, 0, 22, FRAME, 6, shade(soil, -0.05));
    fillRect(frameIndex, 0, 28, FRAME, 4, shade(root, 0.12));
    for (let x = 0; x < FRAME; x += 2) {
      const height = 7 + ((x * 5 + variant * 9) % 11);
      const top = 22 - height;
      const color = (x + variant) % 3 === 0 ? grass : (x + variant) % 3 === 1 ? midGrass : darkGrass;
      drawLine(frameIndex, x, 24, Math.min(FRAME - 1, x + 1), top, color);
      if ((x + variant) % 4 === 0) drawLine(frameIndex, Math.min(FRAME - 1, x + 1), 25, Math.max(0, x - 1), top + 4, darkGrass);
    }
    for (let x = 1 + variant; x < FRAME; x += 8) drawLine(frameIndex, x, 28, x + 2, 31, shade(root, 0.18));
    for (let x = 4 + variant; x < FRAME; x += 13) dot(frameIndex, x, 25 + (x % 3), shade(soil, 0.28));
    return;
  }

  drawRigidSurfaceCap(frameIndex, palette, variant);
  if (palette.key === "warning-industrial") {
    for (let x = -8 + variant * 3; x < FRAME + 8; x += 10) {
      drawLine(frameIndex, x, 15, x + 8, 23, rgba(palette.dark));
      drawLine(frameIndex, x + 1, 15, x + 9, 23, rgba(palette.dark));
    }
    fillRect(frameIndex, 0, 23, FRAME, 2, rgba(palette.accent));
    return;
  }
  if (palette.key === "glass-energy") {
    fillRect(frameIndex, 0, 14, FRAME, 2, shade(rgba(palette.light), -0.12));
    drawLine(frameIndex, 2, 18, 14, 18, rgba(palette.light));
    drawLine(frameIndex, 18, 25, 30, 17, shade(rgba(palette.accent), 0.2));
    drawLine(frameIndex, 4 + variant * 3, 28, 18 + variant * 2, 18, shade(rgba(palette.light), -0.18));
    return;
  }
  if (palette.key === "sand-ruin") {
    for (let x = variant; x < FRAME; x += 9) fillRect(frameIndex, x, 13 + (x % 3), 4, 2, shade(rgba(palette.light), -0.05));
    fillRect(frameIndex, 0, 22, FRAME, 2, shade(rgba(palette.line), -0.04));
    drawLine(frameIndex, 5, 27, 14, 24, rgba(palette.dark));
    drawLine(frameIndex, 20, 17, 28, 20, shade(rgba(palette.line), -0.1));
    return;
  }
  if (palette.key === "ice-cryo") {
    fillTriangle(frameIndex, { x: 5 + variant, y: 14 }, { x: 10 + variant, y: 6 }, { x: 15 + variant, y: 14 }, shade(rgba(palette.light), -0.04));
    fillTriangle(frameIndex, { x: 2 + variant * 3, y: 21 }, { x: 7 + variant * 3, y: 31 }, { x: 11 + variant * 3, y: 21 }, shade(rgba(palette.light), -0.08));
    fillTriangle(frameIndex, { x: 19, y: 21 }, { x: 23, y: 30 }, { x: 27, y: 21 }, shade(rgba(palette.accent), 0.1));
    drawLine(frameIndex, 5, 25, 19, 20, rgba(palette.line));
    return;
  }
  if (palette.key === "wood-archive") {
    for (let x = 5 + variant * 2; x < FRAME; x += 10) drawLine(frameIndex, x, 15, x, 31, shade(rgba(palette.line), -0.08));
    drawLine(frameIndex, 2, 18, 14, 17, shade(rgba(palette.light), -0.12));
    return;
  }
  if (palette.key === "copper-corrode") {
    fillRect(frameIndex, 0, 22, FRAME, 2, rgba(palette.accent));
    fillRect(frameIndex, 4, 16, 24, 4, shade(rgba(palette.light), -0.18));
    fillRect(frameIndex, 6, 17, 20, 2, rgba(palette.surface));
    for (let x = 4 + variant; x < FRAME; x += 13) dot(frameIndex, x, 16 + (x % 3), shade(rgba(palette.accent), 0.12));
  }
};

const drawSurfaceDecor = (frameIndex, palette, variant) => {
  if (palette.key === "grass-organic") {
    const stem = shade(rgba(palette.surface), -0.18);
    const leaf = rgba(palette.accent);
    const petal = variant === 0 ? [255, 227, 90, 255] : variant === 1 ? [255, 112, 169, 255] : [184, 242, 255, 255];
    const cx = 12 + variant * 4;
    drawLine(frameIndex, cx, 29, cx + 1, 16, stem);
    drawLine(frameIndex, cx, 24, cx - 5, 20, leaf);
    drawLine(frameIndex, cx + 1, 25, cx + 6, 21, shade(leaf, -0.16));
    fillCircle(frameIndex, cx, 13, 2, petal);
    fillCircle(frameIndex, cx - 3, 15, 2, petal);
    fillCircle(frameIndex, cx + 3, 15, 2, petal);
    fillCircle(frameIndex, cx, 16, 2, [255, 248, 191, 255]);
    return;
  }
  if (palette.key === "metal-lab") {
    if (variant === 0) {
      fillRect(frameIndex, 8, 16, 16, 12, shade(rgba(palette.face), 0.1));
      strokeRect(frameIndex, 8, 16, 16, 12, rgba(palette.line));
      fillRect(frameIndex, 11, 19, 10, 4, rgba(palette.accent));
      dot(frameIndex, 12, 25, rgba(palette.light));
      return;
    }
    if (variant === 1) {
      fillRect(frameIndex, 5, 22, 22, 6, shade(rgba(palette.line), -0.1));
      for (let x = 7; x < 26; x += 4) drawLine(frameIndex, x, 23, x, 27, rgba(palette.light));
      return;
    }
    fillRect(frameIndex, 4, 24, 24, 3, shade(rgba(palette.line), -0.1));
    drawLine(frameIndex, 5, 25, 14, 22, rgba(palette.accent));
    drawLine(frameIndex, 14, 22, 26, 24, shade(rgba(palette.accent), -0.14));
    dot(frameIndex, 20, 20, rgba(palette.light));
    return;
  }
  if (palette.key === "glass-energy") {
    fillTriangle(frameIndex, { x: 8, y: 28 }, { x: 14 + variant, y: 7 }, { x: 20, y: 28 }, shade(rgba(palette.accent), 0.16));
    fillTriangle(frameIndex, { x: 18, y: 28 }, { x: 23 + variant, y: 15 }, { x: 28, y: 28 }, shade(rgba(palette.light), -0.12));
    drawLine(frameIndex, 14 + variant, 7, 15, 26, rgba(palette.light));
    return;
  }
  if (palette.key === "warning-industrial") {
    if (variant === 0) {
      fillRect(frameIndex, 11, 18, 10, 10, rgba(palette.dark));
      fillRect(frameIndex, 13, 14, 6, 5, rgba(palette.accent));
      fillCircle(frameIndex, 16, 13, 3, shade(rgba(palette.accent), 0.12));
      drawLine(frameIndex, 10, 28, 22, 28, rgba(palette.surface));
      return;
    }
    fillRect(frameIndex, 12 + variant, 13, 7, 16, rgba(palette.surface));
    drawLine(frameIndex, 11 + variant, 16, 20 + variant, 25, rgba(palette.dark));
    drawLine(frameIndex, 11 + variant, 20, 19 + variant, 28, rgba(palette.dark));
    fillRect(frameIndex, 9, 28, 16, 2, rgba(palette.dark));
    return;
  }
  if (palette.key === "sand-ruin") {
    if (variant === 0) {
      fillRect(frameIndex, 8, 22, 16, 6, shade(rgba(palette.face), -0.08));
      fillRect(frameIndex, 10, 18, 12, 4, rgba(palette.surface));
      drawLine(frameIndex, 7, 28, 25, 28, rgba(palette.dark));
      return;
    }
    fillRect(frameIndex, 12, 12, 8, 16, rgba(palette.surface));
    fillRect(frameIndex, 9, 26, 14, 3, shade(rgba(palette.face), -0.08));
    drawLine(frameIndex, 12, 17, 19, 14, rgba(palette.line));
    return;
  }
  if (palette.key === "ice-cryo") {
    fillTriangle(frameIndex, { x: 8, y: 28 }, { x: 13, y: 8 }, { x: 18, y: 28 }, shade(rgba(palette.light), -0.02));
    fillTriangle(frameIndex, { x: 16, y: 28 }, { x: 22 + variant, y: 13 }, { x: 27, y: 28 }, rgba(palette.accent));
    drawLine(frameIndex, 13, 8, 16, 27, rgba(palette.line));
    return;
  }
  if (palette.key === "wood-archive") {
    if (variant === 0) {
      fillRect(frameIndex, 8, 18, 15, 10, shade(rgba(palette.surface), 0.05));
      drawLine(frameIndex, 8, 18, 23, 28, rgba(palette.line));
      drawLine(frameIndex, 8, 28, 23, 18, rgba(palette.line));
      fillRect(frameIndex, 11, 14, 9, 4, shade(rgba(palette.light), -0.05));
      return;
    }
    fillRect(frameIndex, 9, 23, 15, 5, shade(rgba(palette.light), -0.1));
    fillRect(frameIndex, 11, 18, 10, 5, rgba(palette.surface));
    drawLine(frameIndex, 12, 18, 21, 23, rgba(palette.line));
    drawLine(frameIndex, 20, 12, 23, 20, rgba(palette.accent));
    return;
  }
  if (palette.key === "copper-corrode") {
    const pipe = shade(rgba(palette.light), -0.08);
    fillRect(frameIndex, 5, 22, 22, 5, pipe);
    fillRect(frameIndex, 8, 14, 6, 13, pipe);
    fillRect(frameIndex, 14, 14, 13, 5, pipe);
    fillRect(frameIndex, 6, 23, 20, 2, rgba(palette.surface));
    fillRect(frameIndex, 15, 15, 10, 2, rgba(palette.surface));
    dot(frameIndex, 10 + variant * 5, 20, rgba(palette.accent));
  }
};

const drawTile = (material, role, variant, frameIndex) => {
  if (role === "surfaceCap") {
    drawSurfaceCap(frameIndex, material, variant);
    return;
  }
  if (role === "surfaceDecor") {
    drawSurfaceDecor(frameIndex, material, variant);
    return;
  }

  paintBase(frameIndex, material, role, variant);
  if (material.key === "warning-industrial" && role === "floorTop") drawWarningStripes(frameIndex, material);
  else if (material.key === "grass-organic" && role === "floorTop") drawGrassTufts(frameIndex, material, variant);
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
  drawInteriorMaterialTexture(frameIndex, material, role, variant);

  if (role !== "wallFace" && variant === 1) drawLine(frameIndex, 2, 27, 18, 27, shade(rgba(material.line), 0.06));
  if (role !== "floorTop" && variant === 2) strokeRect(frameIndex, 8, 7, 16, 16, shade(rgba(material.line), -0.14));

  if (role === "floorFace" || role === "blockFace") fillRect(frameIndex, 0, 0, FRAME, 1, shade(rgba(material.dark), 0.06));
  if (role === "wallFace") fillRect(frameIndex, 0, 0, 1, FRAME, shade(rgba(material.dark), 0.03));
};

for (let materialIndex = 0; materialIndex < MATERIALS.length; materialIndex += 1) {
  for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex += 1) {
    for (let variant = 0; variant < VARIANTS; variant += 1) {
      drawTile(MATERIALS[materialIndex], ROLES[roleIndex], variant, materialIndex * ROLES.length * VARIANTS + roleIndex * VARIANTS + variant);
    }
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
