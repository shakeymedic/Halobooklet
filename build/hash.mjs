// Fingerprint of the booklet source, so the build can tell when the committed PDF is out of date.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function sourceHash() {
  const h = createHash('sha256');
  h.update(readFileSync(join(root, 'Index.html')));
  const walk = (d) => readdirSync(join(root, d)).sort().forEach((f) => {
    const p = `${d}/${f}`;
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else h.update(p).update(readFileSync(join(root, p)));
  });
  walk('images');
  return h.digest('hex');
}
