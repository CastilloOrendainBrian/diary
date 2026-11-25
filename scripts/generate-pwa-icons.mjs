// Generates the PWA icons as PNG files without external image tools.
// Design: a stone-800 square with three light "lines" (a diary page). Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "client", "public", "icons");
const BACKGROUND = [41, 37, 36]; // stone-800
const INK = [250, 250, 249]; // stone-50

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `inset` is the fraction of the size kept free on each side (maskable icons need a safe zone). */
function png(size, inset) {
  const rows = [];
  const left = Math.round(size * inset);
  const right = size - left;
  const lineHeight = Math.max(2, Math.round(size * 0.07));
  const lines = [0.32, 0.5, 0.68].map((ratio) => Math.round(size * ratio));

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const onLine =
        x >= left + Math.round(size * 0.12) &&
        x < right - Math.round(size * 0.12) &&
        lines.some((lineY) => y >= lineY && y < lineY + lineHeight);
      const color = onLine ? INK : BACKGROUND;
      row[1 + x * 3] = color[0];
      row[2 + x * 3] = color[1];
      row[3 + x * 3] = color[2];
    }
    rows.push(row);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  // Maskable: content stays inside the central 80% safe zone.
  ["icon-maskable-512.png", 512, 0.1],
  ["apple-touch-icon.png", 180, 0],
];
for (const [name, size, inset] of icons) {
  writeFileSync(join(OUT, name), png(size, inset));
  console.log(`wrote icons/${name}`);
}
