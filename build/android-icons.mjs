// Generates the Android launcher icons from the logo. Run once when the logo changes: node build/android-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logo = join(root, 'images', 'wmebem_logo.png');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [name, scale] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  // Legacy icon (Android 7 and earlier): the round badge on its own
  const legacy = Math.round(48 * scale);
  await sharp(logo).resize(legacy, legacy).png().toFile(join(dir, 'ic_launcher.png'));
  // Adaptive icon foreground: 108dp canvas, badge inside the 66dp safe zone
  const canvas = Math.round(108 * scale);
  const badge = Math.round(68 * scale);
  await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(logo).resize(badge, badge).png().toBuffer(), gravity: 'centre' }])
    .png().toFile(join(dir, 'ic_launcher_foreground.png'));
}
console.log('Android icons written');
