#!/usr/bin/env node
/**
 * Writes a minimal 16x16 favicon.ico to public/favicon.ico so browsers
 * that request /favicon.ico get a valid file (avoids 404).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "favicon.ico");

// Minimal 16x16 ICO: dark circle on transparent (matches favicon.svg theme)
// ICO header (6) + directory entry (16) + BMP header (40) + 16x16 ARGB (1024) = 1086
const size = 16;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type ICO
header.writeUInt16LE(1, 4);  // 1 image

const entry = Buffer.alloc(16);
entry[0] = size;
entry[1] = size;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);   // planes
entry.writeUInt16LE(32, 6);  // 32 bpp
const bmpSize = 40 + size * size * 4;
entry.writeUInt32LE(bmpSize, 8);
entry.writeUInt32LE(22, 12); // offset to image (6+16)

// BMP in ICO: 40-byte DIB header then (height * width * 4), bottom-up
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0);           // header size
dib.writeInt32LE(size, 4);         // width
dib.writeInt32LE(size * 2, 8);     // height (image + mask; we use 32bpp so mask omitted)
dib.writeUInt16LE(1, 12);          // planes
dib.writeUInt16LE(32, 14);         // bpp
dib.writeUInt32LE(0, 16);          // compression none
dib.writeUInt32LE(size * size * 4, 20);
for (let i = 24; i < 40; i++) dib[i] = 0;

// BMP in ICO: pixel data is bottom-up, BGRA
const pixels = Buffer.alloc(size * size * 4);
const cx = 8;
const cy = 8;
const r = 6;
const B = 0x2e;
const G = 0x1a;
const R = 0x1a;

for (let y = size - 1; y >= 0; y--) {
  for (let x = 0; x < size; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const inCircle = dx * dx + dy * dy <= r * r;
    const i = ((size - 1 - y) * size + x) * 4;
    pixels[i] = inCircle ? B : 0;
    pixels[i + 1] = inCircle ? G : 0;
    pixels[i + 2] = inCircle ? R : 0;
    pixels[i + 3] = inCircle ? 0xff : 0;
  }
}

const ico = Buffer.concat([header, entry, dib, pixels]);
fs.writeFileSync(outPath, ico);
console.log("Wrote", outPath);
