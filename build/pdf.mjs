// Prints the master booklet to pdf/HALO-QRH-Adults.pdf with headless Chromium.
// Run `npm run build` first: it prints dist/booklet.html so the PDF uses the resized images and local fonts.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceHash } from './hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booklet = join(root, 'dist', 'booklet.html');
if (!existsSync(booklet)) throw new Error('dist/booklet.html not found: run `npm run build` first.');
mkdirSync(join(root, 'pdf'), { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.goto(pathToFileURL(booklet).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const out = join(root, 'pdf', 'HALO-QRH-Adults.pdf');
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
writeFileSync(join(root, 'pdf', 'source.sha256'), sourceHash() + '\n');
console.log(`Wrote ${out}`);
