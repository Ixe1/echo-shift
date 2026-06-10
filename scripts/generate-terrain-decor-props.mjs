import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const PRIMARY_SOURCE = "docs/concepts/garden-decor-props-reference-20260610.png";
const FILLER_SOURCE = "docs/concepts/garden-decor-fillers-reference-20260610.png";
const RAINHOUSE_SOURCE = "docs/concepts/rainhouse-decor-props-reference-20260610.png";
const CRYO_SOURCE = "docs/concepts/cryo-decor-props-reference-20260610.png";
const TIMBER_SOURCE = "docs/concepts/timber-archive-decor-props-reference-20260610.png";
const OUT_DIR = "public/assets/sprites/terrain-decor-props";
const CONTACT_SHEET = "public/assets/sprites/terrain-decor-props.png";
const CONTACT_FRAME = 192;
const CONTACT_COLUMNS = 6;
const BYTES_PER_PIXEL = 4;

const crops = [
  { id: "grass-tufts", x: 32, y: 176, w: 107, h: 85, anchor: "bottom" },
  { id: "wildflower-cluster", x: 37, y: 52, w: 107, h: 83, anchor: "bottom" },
  { id: "mushroom-pair", x: 675, y: 175, w: 135, h: 96, anchor: "bottom" },
  { id: "sprout-leaves", x: 411, y: 185, w: 99, h: 79, anchor: "bottom" },
  { id: "moss-stone", x: 1060, y: 209, w: 123, h: 56, anchor: "bottom" },
  { id: "root-curl", x: 31, y: 305, w: 94, h: 76, anchor: "bottom" },
  { id: "fern-cluster", x: 30, y: 435, w: 118, h: 108, anchor: "bottom" },
  { id: "flowering-shrub", x: 441, y: 430, w: 124, h: 113, anchor: "bottom" },
  { id: "leaf-bush", x: 732, y: 436, w: 119, h: 107, anchor: "bottom" },
  { id: "root-mound", x: 587, y: 298, w: 120, h: 83, anchor: "bottom" },
  { id: "slim-tree", x: 827, y: 398, w: 241, h: 319, anchor: "bottom", keep: "largest" },
  { id: "broad-tree", x: 1295, y: 430, w: 213, h: 287, anchor: "bottom" },
  { id: "root-arch", x: 570, y: 567, w: 236, h: 147, anchor: "bottom" },
  { id: "hanging-vines", x: 24, y: 769, w: 150, h: 199, anchor: "top" },
  { id: "dangling-roots", x: 470, y: 773, w: 125, h: 191, anchor: "top" },
  { id: "moss-strip", x: 24, y: 769, w: 150, h: 62, anchor: "top" },
  { id: "wall-vine", x: 986, y: 774, w: 42, h: 194, anchor: "top" },
  { id: "root-creeper", x: 1385, y: 747, w: 76, h: 221, anchor: "top" },
  { id: "tiny-flower-tuft", source: "filler", x: 70, y: 150, w: 210, h: 190, anchor: "bottom" },
  { id: "glow-moss-clump", source: "filler", x: 340, y: 145, w: 260, h: 185, anchor: "bottom" },
  { id: "seedling-sprout", source: "filler", x: 675, y: 110, w: 235, h: 235, anchor: "bottom" },
  { id: "edge-leaf-clump", source: "filler", x: 980, y: 145, w: 230, h: 190, anchor: "bottom" },
  { id: "thin-fern-spray", source: "filler", x: 75, y: 470, w: 225, h: 230, anchor: "bottom" },
  { id: "curled-root-hook", source: "filler", x: 385, y: 470, w: 205, h: 230, anchor: "bottom" },
  { id: "pink-flower-tuft", source: "filler", x: 700, y: 480, w: 215, h: 220, anchor: "bottom" },
  { id: "small-mushroom-pair", source: "filler", x: 1010, y: 475, w: 190, h: 220, anchor: "bottom" },
  { id: "meadow-flower-clump", source: "filler", x: 70, y: 880, w: 245, h: 210, anchor: "bottom" },
  { id: "curled-vine-sprout", source: "filler", x: 385, y: 870, w: 205, h: 235, anchor: "bottom" },
  { id: "broken-root-nub", source: "filler", x: 695, y: 875, w: 205, h: 230, anchor: "bottom" },
  { id: "broad-leaf-tuft", source: "filler", x: 990, y: 880, w: 220, h: 215, anchor: "bottom" },
  { id: "rain-copper-coil", source: "rainhouse", x: 60, y: 65, w: 145, h: 195, anchor: "bottom" },
  { id: "rain-patina-relay-box", source: "rainhouse", x: 320, y: 50, w: 245, h: 215, anchor: "bottom" },
  { id: "rain-wet-cable-loop", source: "rainhouse", x: 650, y: 45, w: 225, h: 235, anchor: "bottom" },
  { id: "rain-insulator-cluster", source: "rainhouse", x: 975, y: 40, w: 230, h: 245, anchor: "bottom" },
  { id: "rain-gutter-cap", source: "rainhouse", x: 50, y: 365, w: 240, h: 185, anchor: "bottom" },
  { id: "rain-dripping-pipes", source: "rainhouse", x: 355, y: 350, w: 200, h: 225, anchor: "top" },
  { id: "rain-warning-plate", source: "rainhouse", x: 650, y: 395, w: 240, h: 145, anchor: "bottom" },
  { id: "rain-glass-energy-node", source: "rainhouse", x: 965, y: 360, w: 200, h: 210, anchor: "bottom" },
  { id: "rain-cable-bank", source: "rainhouse", x: 70, y: 625, w: 170, h: 250, anchor: "top" },
  { id: "rain-wall-conduit-panel", source: "rainhouse", x: 345, y: 645, w: 245, h: 225, anchor: "top" },
  { id: "rain-copper-column-fragment", source: "rainhouse", x: 690, y: 620, w: 175, h: 245, anchor: "bottom" },
  { id: "rain-cracked-relay-cabinet", source: "rainhouse", x: 965, y: 610, w: 240, h: 260, anchor: "bottom" },
  { id: "rain-puddle-conduit", source: "rainhouse", x: 40, y: 1000, w: 260, h: 160, anchor: "bottom" },
  { id: "rain-small-terminal", source: "rainhouse", x: 370, y: 960, w: 185, h: 225, anchor: "bottom" },
  { id: "rain-hanging-chain-cable", source: "rainhouse", x: 675, y: 925, w: 205, h: 255, anchor: "top" },
  { id: "rain-relay-mast", source: "rainhouse", x: 940, y: 895, w: 275, h: 310, anchor: "bottom" },
  { id: "cryo-frost-clump", source: "cryo", x: 45, y: 65, w: 210, h: 180, anchor: "bottom" },
  { id: "cryo-ice-shard-cluster", source: "cryo", x: 350, y: 25, w: 230, h: 230, anchor: "bottom" },
  { id: "cryo-frozen-cable-stub", source: "cryo", x: 690, y: 35, w: 185, h: 230, anchor: "bottom" },
  { id: "cryo-small-canister", source: "cryo", x: 1000, y: 25, w: 165, h: 255, anchor: "bottom" },
  { id: "cryo-snow-crystal-mound", source: "cryo", x: 70, y: 395, w: 220, h: 165, anchor: "bottom" },
  { id: "cryo-frosted-vent", source: "cryo", x: 345, y: 365, w: 245, h: 210, anchor: "bottom" },
  { id: "cryo-cold-warning-plate", source: "cryo", x: 660, y: 400, w: 230, h: 165, anchor: "bottom" },
  { id: "cryo-glow-core-node", source: "cryo", x: 1000, y: 365, w: 205, h: 215, anchor: "bottom" },
  { id: "cryo-hanging-icicles", source: "cryo", x: 40, y: 650, w: 230, h: 225, anchor: "top" },
  { id: "cryo-frozen-cable-bundle", source: "cryo", x: 355, y: 645, w: 190, h: 235, anchor: "top" },
  { id: "cryo-wall-frost-crack", source: "cryo", x: 650, y: 650, w: 245, h: 230, anchor: "top" },
  { id: "cryo-frozen-glass-panel", source: "cryo", x: 965, y: 635, w: 230, h: 240, anchor: "top" },
  { id: "cryo-tall-tank", source: "cryo", x: 60, y: 900, w: 190, h: 280, anchor: "bottom" },
  { id: "cryo-ice-column-fragment", source: "cryo", x: 360, y: 910, w: 200, h: 270, anchor: "bottom" },
  { id: "cryo-background-pod", source: "cryo", x: 615, y: 965, w: 315, h: 220, anchor: "bottom" },
  { id: "cryo-hanging-frost-cables", source: "cryo", x: 980, y: 900, w: 230, h: 305, anchor: "top" },
  { id: "timber-loose-papers", source: "timber", x: 0, y: 0, w: 314, h: 314, anchor: "bottom" },
  { id: "timber-tiny-book-stack", source: "timber", x: 314, y: 0, w: 313, h: 314, anchor: "bottom" },
  { id: "timber-glow-moss-log", source: "timber", x: 627, y: 0, w: 313, h: 314, anchor: "bottom" },
  { id: "timber-brass-data-tags", source: "timber", x: 940, y: 0, w: 314, h: 314, anchor: "bottom" },
  { id: "timber-book-pile", source: "timber", x: 0, y: 314, w: 314, h: 313, anchor: "bottom" },
  { id: "timber-broken-shelf-chunk", source: "timber", x: 314, y: 314, w: 313, h: 313, anchor: "bottom" },
  { id: "timber-archive-crate", source: "timber", x: 627, y: 314, w: 313, h: 313, anchor: "bottom" },
  { id: "timber-root-data-box", source: "timber", x: 940, y: 314, w: 314, h: 313, anchor: "bottom" },
  { id: "timber-old-bookcase", source: "timber", x: 0, y: 627, w: 314, h: 313, anchor: "bottom" },
  { id: "timber-timber-column", source: "timber", x: 314, y: 627, w: 313, h: 313, anchor: "bottom" },
  { id: "timber-root-archive-trunk", source: "timber", x: 627, y: 627, w: 313, h: 313, anchor: "bottom" },
  { id: "timber-archive-terminal", source: "timber", x: 940, y: 627, w: 314, h: 313, anchor: "bottom" },
  { id: "timber-dangling-roots", source: "timber", x: 0, y: 940, w: 314, h: 314, anchor: "top" },
  { id: "timber-hanging-tags-cables", source: "timber", x: 314, y: 940, w: 313, h: 314, anchor: "top" },
  { id: "timber-hanging-lamps", source: "timber", x: 627, y: 940, w: 313, h: 314, anchor: "top" },
  { id: "timber-carved-panel", source: "timber", x: 940, y: 940, w: 314, h: 314, anchor: "top" }
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
};

const decodePng = (buffer) => {
  assert(buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "Source is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert(data[10] === 0 && data[11] === 0 && data[12] === 0, "Unsupported PNG compression/filter/interlace mode");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert(width > 0 && height > 0 && bitDepth === 8 && (colorType === 2 || colorType === 6), `Unsupported PNG format ${width}x${height} depth ${bitDepth} type ${colorType}`);

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const raw = new Uint8Array(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = rowOffset - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[previousRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[previousRowOffset + x - bytesPerPixel] : 0;
      if (filter === 0) raw[rowOffset + x] = value;
      else if (filter === 1) raw[rowOffset + x] = (value + left) & 0xff;
      else if (filter === 2) raw[rowOffset + x] = (value + up) & 0xff;
      else if (filter === 3) raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) raw[rowOffset + x] = (value + paethPredictor(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    sourceOffset += stride;
  }

  const data = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let source = 0, target = 0; source < raw.length; source += bytesPerPixel, target += BYTES_PER_PIXEL) {
    data[target] = raw[source];
    data[target + 1] = raw[source + 1];
    data[target + 2] = raw[source + 2];
    data[target + 3] = colorType === 6 ? raw[source + 3] : 255;
  }
  return { width, height, data };
};

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

const encodePng = (width, height, data) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc((width * BYTES_PER_PIXEL + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (width * BYTES_PER_PIXEL + 1);
    scanlines[scanlineOffset] = 0;
    scanlines.set(data.subarray(y * width * BYTES_PER_PIXEL, (y + 1) * width * BYTES_PER_PIXEL), scanlineOffset + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const sources = {
  primary: decodePng(readFileSync(PRIMARY_SOURCE)),
  filler: decodePng(readFileSync(FILLER_SOURCE)),
  rainhouse: decodePng(readFileSync(RAINHOUSE_SOURCE)),
  cryo: decodePng(readFileSync(CRYO_SOURCE)),
  timber: decodePng(readFileSync(TIMBER_SOURCE))
};

const isChroma = (r, g, b) => r > 115 && b > 120 && g < 115 && r - g > 45 && b - g > 45 && Math.abs(r - b) < 95;

const sourceForCrop = (crop) => sources[crop.source || "primary"];

const sourcePixel = (crop, x, y) => {
  const source = sourceForCrop(crop);
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return [0, 0, 0, 0];
  const index = (y * source.width + x) * BYTES_PER_PIXEL;
  const r = source.data[index];
  const g = source.data[index + 1];
  const b = source.data[index + 2];
  const alpha = source.data[index + 3];
  if (alpha === 0 || isChroma(r, g, b)) return [0, 0, 0, 0];
  return [r, g, b, alpha];
};

const trimCrop = (crop) => {
  let minX = crop.x + crop.w;
  let minY = crop.y + crop.h;
  let maxX = crop.x;
  let maxY = crop.y;
  for (let y = crop.y; y < crop.y + crop.h; y += 1) {
    for (let x = crop.x; x < crop.x + crop.w; x += 1) {
      if (sourcePixel(crop, x, y)[3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  assert(maxX > minX && maxY > minY, `Crop ${crop.id} has no visible pixels`);
  const x = Math.max(crop.x, minX - 1);
  const y = Math.max(crop.y, minY - 1);
  return {
    ...crop,
    x,
    y,
    w: Math.min(crop.x + crop.w, maxX + 1) - x,
    h: Math.min(crop.y + crop.h, maxY + 1) - y
  };
};

const cropToImage = (crop) => {
  const data = new Uint8Array(crop.w * crop.h * BYTES_PER_PIXEL);
  for (let y = 0; y < crop.h; y += 1) {
    for (let x = 0; x < crop.w; x += 1) {
      data.set(sourcePixel(crop, crop.x + x, crop.y + y), (y * crop.w + x) * BYTES_PER_PIXEL);
    }
  }
  return { width: crop.w, height: crop.h, data };
};

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * BYTES_PER_PIXEL + 3];

const visibleComponents = (image) => {
  const seen = new Uint8Array(image.width * image.height);
  const components = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const startIndex = y * image.width + x;
      if (seen[startIndex] || alphaAt(image, x, y) === 0) continue;
      const queue = [{ x, y }];
      const pixels = [];
      seen[startIndex] = 1;
      let minX = x;
      let minY = y;
      let maxX = x + 1;
      let maxY = y + 1;
      for (let index = 0; index < queue.length; index += 1) {
        const point = queue[index];
        pixels.push(point);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x + 1);
        maxY = Math.max(maxY, point.y + 1);
        for (let ny = point.y - 1; ny <= point.y + 1; ny += 1) {
          for (let nx = point.x - 1; nx <= point.x + 1; nx += 1) {
            if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
            const neighborIndex = ny * image.width + nx;
            if (seen[neighborIndex] || alphaAt(image, nx, ny) === 0) continue;
            seen[neighborIndex] = 1;
            queue.push({ x: nx, y: ny });
          }
        }
      }
      components.push({ pixels, area: pixels.length, minX, minY, maxX, maxY });
    }
  }
  return components.sort((a, b) => b.area - a.area);
};

const keepLargestComponent = (image) => {
  const [largest] = visibleComponents(image);
  assert(largest, "Expected visible sprite component");
  const data = new Uint8Array(image.data.length);
  for (const pixel of largest.pixels) {
    const offset = (pixel.y * image.width + pixel.x) * BYTES_PER_PIXEL;
    data.set(image.data.subarray(offset, offset + BYTES_PER_PIXEL), offset);
  }
  return { ...image, data };
};

const trimImage = (image, id) => {
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  assert(maxX > minX && maxY > minY, `Image ${id} has no visible pixels after component filtering`);
  const width = maxX - minX;
  const height = maxY - minY;
  const data = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = ((minY + y) * image.width + minX + x) * BYTES_PER_PIXEL;
      data.set(image.data.subarray(sourceOffset, sourceOffset + BYTES_PER_PIXEL), (y * width + x) * BYTES_PER_PIXEL);
    }
  }
  return { width, height, data };
};

const contactRows = Math.ceil(crops.length / CONTACT_COLUMNS);
const contactWidth = CONTACT_COLUMNS * CONTACT_FRAME;
const contactHeight = contactRows * CONTACT_FRAME;
const contact = new Uint8Array(contactWidth * contactHeight * BYTES_PER_PIXEL);

const setContactPixel = (x, y, color) => {
  if (x < 0 || y < 0 || x >= contactWidth || y >= contactHeight) return;
  contact.set(color, (y * contactWidth + x) * BYTES_PER_PIXEL);
};

mkdirSync(OUT_DIR, { recursive: true });

for (let index = 0; index < crops.length; index += 1) {
  const crop = trimCrop(crops[index]);
  const image = trimImage(crop.keep === "largest" ? keepLargestComponent(cropToImage(crop)) : cropToImage(crop), crop.id);
  writeFileSync(`${OUT_DIR}/${crop.id}.png`, encodePng(image.width, image.height, image.data));

  const scale = Math.min((CONTACT_FRAME - 12) / image.width, (CONTACT_FRAME - 12) / image.height);
  const drawW = Math.max(1, Math.round(image.width * scale));
  const drawH = Math.max(1, Math.round(image.height * scale));
  const frameX = (index % CONTACT_COLUMNS) * CONTACT_FRAME;
  const frameY = Math.floor(index / CONTACT_COLUMNS) * CONTACT_FRAME;
  const left = frameX + Math.floor((CONTACT_FRAME - drawW) / 2);
  const top = crop.anchor === "top" ? frameY + 6 : frameY + CONTACT_FRAME - drawH - 6;
  for (let y = 0; y < drawH; y += 1) {
    for (let x = 0; x < drawW; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor((x / drawW) * image.width));
      const sy = Math.min(image.height - 1, Math.floor((y / drawH) * image.height));
      const sourceIndex = (sy * image.width + sx) * BYTES_PER_PIXEL;
      setContactPixel(left + x, top + y, image.data.subarray(sourceIndex, sourceIndex + BYTES_PER_PIXEL));
    }
  }
}

writeFileSync(CONTACT_SHEET, encodePng(contactWidth, contactHeight, contact));
console.log(`Wrote ${crops.length} image-gen sprite PNGs to ${OUT_DIR} and contact sheet ${CONTACT_SHEET}`);
