// Generates apps/mobile/assets/icon.png (1024×1024, no transparency): BGSU orange field, brown band, white "FT".
// Dependency-free PNG encoder (zlib from Node). Run: node scripts/make-icon.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const N = 1024;
const ORANGE = [0xfe, 0x50, 0x00];
const BROWN = [0x4f, 0x2c, 0x1d];
const WHITE = [0xff, 0xff, 0xff];
const px = new Uint8Array(N * N * 3);
const fill = (x0, y0, x1, y1, c) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(c, (y * N + x) * 3);
};
fill(0, 0, N, N, ORANGE);
fill(0, 800, N, N, BROWN); // bottom band
fill(0, 780, N, 800, WHITE); // thin stripe
// "F"
fill(190, 220, 290, 680, WHITE);
fill(190, 220, 470, 310, WHITE);
fill(190, 410, 420, 495, WHITE);
// "T"
fill(540, 220, 860, 310, WHITE);
fill(650, 220, 750, 680, WHITE);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const raw = Buffer.alloc(N * (N * 3 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 3 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * N * 3, N * 3).copy(raw, y * (N * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'apps/mobile/assets/icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
