// Generates every PWA icon from web/public/logo.svg.  Run: npm run icons
// Output is committed, so production builds never need sharp.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = fileURLToPath(new URL('../web/public/', import.meta.url));
const svg = readFileSync(`${pub}logo.svg`);
const VERD = { r: 15, g: 42, b: 31, alpha: 1 };
mkdirSync(`${pub}icons`, { recursive: true });

async function plain(size, out) {
  await sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
}

/** Shield centred on a full-bleed verd-green square; `scale` keeps it inside the maskable safe zone. */
async function onBackground(size, scale, out) {
  const inner = Math.round(size * scale);
  const logo = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: VERD } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out);
}

await plain(192, `${pub}icons/icon-192.png`);
await plain(512, `${pub}icons/icon-512.png`);
await onBackground(192, 0.62, `${pub}icons/maskable-192.png`);
await onBackground(512, 0.62, `${pub}icons/maskable-512.png`);
await onBackground(180, 0.8, `${pub}apple-touch-icon.png`);
await plain(32, `${pub}favicon-32.png`);
copyFileSync(`${pub}logo.svg`, `${pub}favicon.svg`);
console.log('Icons generated in web/public');
