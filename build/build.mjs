// Builds the HALO QRH (Adults) website into dist/ from the master booklet (Index.html).
// Index.html stays the single source of truth: every procedure page on the website
// reuses the booklet's own HTML, so the website, the app and the PDF never drift apart.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { sourceHash } from './hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const PDF_NAME = 'HALO-QRH-Adults.pdf';
const SITE_URL = 'https://wmebemhaloqrh.netlify.app';

const source = readFileSync(join(root, 'Index.html'), 'utf8');
const { document } = parseHTML(source);

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- read the booklet ----------
const pages = [...document.querySelectorAll('.page')];
const titlePage = document.querySelector('.title-page');
const version = text(titlePage.querySelector('.tp-version')); // e.g. "Version 2.9 (Sep 2026)"
const edition = text(titlePage.querySelector('.tp-edition'));
const reviewMatch = text(titlePage).match(/Review due ([A-Za-z]+ \d{4})/);
const reviewDue = reviewMatch ? reviewMatch[1] : '';
const bookletCss = [...document.querySelectorAll('head style')].map((s) => s.textContent).join('\n');

// Contents page drives the grouping, using its page numbers ("Pg 4-5") so names never need to match.
const groups = [...document.querySelectorAll('.toc-group')].map((g) => {
  const header = g.querySelector('.toc-header');
  const colour = (header.getAttribute('style') || '').match(/var\((--[a-z]+-bg)\)/);
  return {
    name: text(header),
    colour: colour ? `var(${colour[1]})` : 'var(--grey-header)',
    darkText: /color:\s*black/.test(header.getAttribute('style') || ''),
    items: [...g.querySelectorAll('.toc-item')].map((li) => {
      const [nameSpan, pgSpan] = [...li.children].filter((c) => c.tagName === 'SPAN');
      const trolley = !!li.querySelector('.toc-icon');
      const name = text(nameSpan).replace('🧰', '').trim();
      const m = text(pgSpan).match(/(\d+)\s*-\s*(\d+)/);
      if (!m) throw new Error(`No page numbers for contents item "${name}"`);
      return { name, trolley, pages: [Number(m[1]), Number(m[2])] };
    }),
  };
});

const procedures = [];
for (const g of groups) {
  for (const item of g.items) {
    const [a, b] = item.pages.map((n) => pages[n - 1]);
    if (!a || !b) throw new Error(`Contents points past the end of the booklet for "${item.name}"`);
    const h1 = text(a.querySelector('h1'));
    if (h1 !== text(b.querySelector('h1'))) throw new Error(`Pages ${item.pages} are not one procedure (${h1} / ${text(b.querySelector('h1'))})`);
    procedures.push({
      ...item,
      group: g.name,
      colour: g.colour,
      darkText: g.darkText,
      title: h1,
      slug: slugify(item.name),
      prepLabel: text(a.querySelector('h2')).replace(/^Page \d+:\s*/, ''),
      actionLabel: text(b.querySelector('h2')).replace(/^Page \d+:\s*/, ''),
      prepHtml: a.outerHTML,
      actionHtml: b.outerHTML,
      searchText: (text(a) + ' ' + text(b)).toLowerCase(),
    });
  }
}
const procPages = new Set(procedures.flatMap((p) => p.pages));
const otherProcPages = pages.filter((p, i) => p.querySelector('h1') && !p.classList.contains('debrief-page') && !procPages.has(i + 1));
if (otherProcPages.length) throw new Error(`Procedure pages missing from the contents: ${otherProcPages.map((p) => text(p.querySelector('h1'))).join(', ')}`);
const guideHtml = document.querySelector('.guide-page').outerHTML;
const debriefHtml = document.querySelector('.debrief-page').outerHTML;

// ---------- output ----------
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets', 'fonts'), { recursive: true });

// Images: same paths as the booklet, resized so phones are not downloading 5 MB diagrams.
async function copyImages(dir) {
  for (const f of readdirSync(join(root, dir))) {
    const src = join(root, dir, f);
    const out = join(dist, dir, f);
    if (statSync(src).isDirectory()) { await copyImages(join(dir, f)); continue; }
    const ext = extname(f).toLowerCase();
    mkdirSync(dirname(out), { recursive: true });
    if (dir.endsWith('qr') || !['.png', '.jpg', '.jpeg'].includes(ext)) { copyFileSync(src, out); continue; }
    const maxSide = f.startsWith('wmebem_logo') ? 384 : 1400;
    let img = sharp(src).resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
    img = ext === '.png' ? img.png({ compressionLevel: 9, effort: 10 }) : img.jpeg({ quality: 82, mozjpeg: true });
    await img.toFile(out);
  }
}
await copyImages('images');

// App icons from the logo.
const logo = join(root, 'images', 'wmebem_logo.png');
mkdirSync(join(dist, 'icons'), { recursive: true });
for (const s of [192, 512]) {
  await sharp(logo).resize(s, s).png().toFile(join(dist, 'icons', `icon-${s}.png`));
  const inner = Math.round(s * 0.72);
  await sharp({ create: { width: s, height: s, channels: 4, background: '#ffffff' } })
    .composite([{ input: await sharp(logo).resize(inner, inner).png().toBuffer(), gravity: 'centre' }])
    .png().toFile(join(dist, 'icons', `maskable-${s}.png`));
}
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
  .composite([{ input: await sharp(logo).resize(150, 150).png().toBuffer(), gravity: 'centre' }])
  .png().toFile(join(dist, 'icons', 'apple-touch-icon.png'));

// Self-hosted Inter so the app and website work with no signal.
const weights = [400, 500, 600, 700, 800, 900];
const fontDir = join(root, 'node_modules', '@fontsource', 'inter', 'files');
let fontCss = '';
for (const w of weights) {
  const f = `inter-latin-${w}-normal.woff2`;
  copyFileSync(join(fontDir, f), join(dist, 'assets', 'fonts', f));
  fontCss += `@font-face{font-family:'Inter';font-style:normal;font-display:swap;font-weight:${w};src:url(fonts/${f}) format('woff2');}\n`;
}
writeFileSync(join(dist, 'assets', 'fonts.css'), fontCss);
writeFileSync(join(dist, 'assets', 'booklet.css'), bookletCss);
copyFileSync(join(root, 'build', 'web.css'), join(dist, 'assets', 'web.css'));
copyFileSync(join(root, 'build', 'app.js'), join(dist, 'assets', 'app.js'));

// The PDF is generated by build/pdf.mjs (it needs a browser) and committed in pdf/.
const pdfSrc = join(root, 'pdf', PDF_NAME);
let pdfSize = '';
if (existsSync(pdfSrc)) {
  copyFileSync(pdfSrc, join(dist, PDF_NAME));
  pdfSize = `${(statSync(pdfSrc).size / 1048576).toFixed(1)} MB`;
  const stamp = join(root, 'pdf', 'source.sha256');
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== sourceHash()) {
    console.warn('WARNING: pdf/ is older than Index.html or images/. Run `npm run pdf` (CI does this on main).');
  }
} else {
  console.warn(`WARNING: pdf/${PDF_NAME} not found; the download button will be missing until \`npm run pdf\` is run.`);
}

// ---------- page templates ----------
const pdfButton = (cls = '') => pdfSize
  ? `<a class="pdf-btn ${cls}" href="${PDF_NAME}" download data-pdf>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Download the PDF<small>${esc(version)} · A4 · ${pdfSize}</small></span></a>`
  : '';

const layout = ({ title, description, body, path, bodyClass = '' }) => `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0d47a1">
<link rel="canonical" href="${SITE_URL}/${path}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="assets/fonts.css">
<link rel="stylesheet" href="assets/booklet.css">
<link rel="stylesheet" href="assets/web.css">
</head>
<body class="web ${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="appbar">
  <a class="brand" href="./"><img src="images/wmebem_logo.png" alt="" width="36" height="36"><span>HALO QRH <em>Adults</em></span></a>
  ${pdfSize ? `<a class="appbar-pdf" href="${PDF_NAME}" download data-pdf aria-label="Download the PDF">PDF</a>` : ''}
</header>
<div class="adult-strip" role="note">Adults only: patients aged 16 and over</div>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <p><strong>Clinical disclaimer.</strong> These guides are cognitive aids for trained medical professionals. They do not replace clinical judgement. Guidelines are subject to change.</p>
  <p>${esc(edition)}, ${esc(version)}${reviewDue ? `. Review due ${esc(reviewDue)}` : ''}. Based on DAS, RCEM, FPHC and Resuscitation Council UK guidance.</p>
  <p><a href="guide.html">How to use this guide</a> · <a href="booklet.html">Printable booklet</a> · <a href="https://emevidence.org" rel="noopener">EM Evidence</a> · Feedback: <a href="mailto:jake.turner@uhb.nhs.uk">jake.turner@uhb.nhs.uk</a></p>
</footer>
<script src="assets/app.js"></script>
</body>
</html>
`;

// Home
const cards = groups.map((g) => `
  <section class="group">
    <h2 class="group-title" style="background:${g.colour};${g.darkText ? 'color:#000' : ''}">${esc(g.name)}</h2>
    <ul class="proc-list">
      ${procedures.filter((p) => p.group === g.name).map((p) => `
      <li data-search="${esc(p.name.toLowerCase() + ' ' + p.searchText)}">
        <a class="proc-card" href="${p.slug}.html" style="--accent:${p.colour}">
          <span class="proc-name">${esc(p.name)}</span>
          ${p.trolley ? '<span class="trolley" title="Kit in the HALO trolley">🧰 HALO trolley</span>' : ''}
          <span class="proc-sub">${esc(p.actionLabel)}</span>
        </a>
      </li>`).join('')}
    </ul>
  </section>`).join('');

writeFileSync(join(dist, 'index.html'), layout({
  title: 'HALO QRH (Adults) | High Acuity Low Occurrence procedures',
  description: 'Quick Reference Handbook for High Acuity, Low Occurrence emergency procedures in adults: preparation walkthrough and action card for each procedure, plus the printable PDF.',
  path: '',
  bodyClass: 'home',
  body: `
<section class="hero">
  <h1>HALO Quick Reference Handbook</h1>
  <p class="lede">High Acuity, Low Occurrence emergency procedures for adults. Each procedure has a <strong>Prepare</strong> walkthrough for the kit dump and an <strong>Action</strong> card to read aloud during the procedure.</p>
  <div class="hero-actions">
    ${pdfButton('big')}
    <a class="ghost-btn" href="guide.html">How to use this guide</a>
  </div>
  <p class="meta">${esc(version)}${reviewDue ? ` · Review due ${esc(reviewDue)}` : ''}</p>
</section>
<div class="search">
  <label for="q" class="sr-only">Search procedures</label>
  <input id="q" type="search" placeholder="Search procedures, drugs or kit" autocomplete="off">
  <p id="no-results" hidden>No procedure matches that search.</p>
</div>
<p class="key">🧰 = kit located in the HALO trolley</p>
${cards}
<section class="group extras">
  <ul class="proc-list">
    <li><a class="proc-card" href="debrief.html" style="--accent:#2e7d32"><span class="proc-name">STOP 5 Hot Debrief</span><span class="proc-sub">After the event, before the team disperses</span></a></li>
    <li><a class="proc-card" href="booklet.html" style="--accent:#333"><span class="proc-name">Full printable booklet</span><span class="proc-sub">All ${pages.length} A4 pages, as printed</span></a></li>
  </ul>
</section>`,
}));

// Procedures
procedures.forEach((p, i) => {
  const prev = procedures[i - 1];
  const next = procedures[i + 1];
  writeFileSync(join(dist, `${p.slug}.html`), layout({
    title: `${p.name} | HALO QRH (Adults)`,
    description: `${p.name}: preparation walkthrough and action card from the HALO Quick Reference Handbook (adults).`,
    path: `${p.slug}.html`,
    bodyClass: 'procedure',
    body: `
<nav class="crumbs"><a href="./">All procedures</a> <span aria-hidden="true">›</span> ${esc(p.group)}</nav>
<div class="tabs" role="tablist" aria-label="${esc(p.name)}">
  <button role="tab" id="tab-prepare" aria-controls="prepare" aria-selected="true" data-tab="prepare"><b>1</b> Prepare<small>${esc(p.prepLabel)}</small></button>
  <button role="tab" id="tab-action" aria-controls="action" aria-selected="false" data-tab="action"><b>2</b> Action<small>${esc(p.actionLabel)}</small></button>
</div>
<section class="sheet" id="prepare" role="tabpanel" aria-labelledby="tab-prepare">${p.prepHtml}</section>
<section class="sheet" id="action" role="tabpanel" aria-labelledby="tab-action" hidden>${p.actionHtml}</section>
<nav class="pager">
  ${prev ? `<a href="${prev.slug}.html" rel="prev"><small>Previous</small>${esc(prev.name)}</a>` : '<span></span>'}
  ${next ? `<a href="${next.slug}.html" rel="next"><small>Next</small>${esc(next.name)}</a>` : '<a href="debrief.html" rel="next"><small>Next</small>STOP 5 Hot Debrief</a>'}
</nav>`,
  }));
});

writeFileSync(join(dist, 'guide.html'), layout({
  title: 'How to use this guide | HALO QRH (Adults)',
  description: 'How to use the HALO Quick Reference Handbook: the two-page system, design principles, human factors and abbreviations.',
  path: 'guide.html',
  bodyClass: 'procedure single',
  body: `<nav class="crumbs"><a href="./">All procedures</a></nav><section class="sheet">${guideHtml}</section>`,
}));
writeFileSync(join(dist, 'debrief.html'), layout({
  title: 'STOP 5 Hot Debrief | HALO QRH (Adults)',
  description: 'STOP 5 hot debrief, to perform immediately after the event before the team disperses.',
  path: 'debrief.html',
  bodyClass: 'procedure single',
  body: `<nav class="crumbs"><a href="./">All procedures</a></nav><section class="sheet">${debriefHtml}</section>`,
}));

// Printable booklet: the master file, with local fonts and a way back to the website.
const booklet = source
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="assets/fonts.css">')
  .replace('<button class="print-btn"', `<a class="print-btn back-btn" href="./" style="right:auto;left:20px;text-decoration:none">← HALO QRH home</a>\n    <button class="print-btn"`)
  .replace('</head>', '<link rel="icon" type="image/png" href="icons/icon-192.png">\n<style>@media print{.back-btn{display:none!important}}</style>\n</head>');
writeFileSync(join(dist, 'booklet.html'), booklet);

// PWA manifest and offline service worker.
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'HALO QRH (Adults)',
  short_name: 'HALO QRH',
  description: 'High Acuity, Low Occurrence emergency procedures for adults.',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#0d47a1',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

const precache = [];
const walkDist = (d) => readdirSync(join(dist, d)).forEach((f) => {
  const p = d ? `${d}/${f}` : f;
  if (statSync(join(dist, p)).isDirectory()) return walkDist(p);
  if (p === PDF_NAME || p === 'sw.js' || p.startsWith('icons/maskable') || p === 'icons/icon-512.png') return;
  precache.push(p);
});
walkDist('');
const cacheId = createHash('sha256');
precache.sort().forEach((p) => cacheId.update(p).update(readFileSync(join(dist, p))));
const sw = readFileSync(join(root, 'build', 'sw.template.js'), 'utf8')
  .replace('__CACHE__', `haloqrh-${cacheId.digest('hex').slice(0, 12)}`)
  .replace('__PRECACHE__', JSON.stringify(['./', ...precache.filter((p) => p !== 'index.html')], null, 1))
  .replace('__PDF__', PDF_NAME);
writeFileSync(join(dist, 'sw.js'), sw);

// Read by the Android build for the app's version name and number.
const vm = version.match(/(\d+)\.(\d+)/);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version, major: vm ? Number(vm[1]) : 0, minor: vm ? Number(vm[2]) : 0, reviewDue, pdf: pdfSize ? PDF_NAME : null }, null, 2));

writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...procedures.map((p) => `${p.slug}.html`), 'guide.html', 'debrief.html', 'booklet.html'].map((u) => `  <url><loc>${SITE_URL}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);

console.log(`Built ${procedures.length} procedures from ${pages.length} booklet pages (${version}) into dist/. PDF: ${pdfSize || 'missing'}`);
