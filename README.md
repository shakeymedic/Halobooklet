# HALO QRH (Adults)

Quick Reference Handbook for High Acuity, Low Occurrence emergency procedures in patients aged 16 and over.

**`Index.html` is the master booklet and the only file to edit for content.** Everything else is built from it:

| Output | Where | How it is made |
|---|---|---|
| Website (phone-first, works offline) | https://wmebemhaloqrh.netlify.app | Netlify runs `npm run build` → `dist/` |
| Downloadable PDF | `pdf/HALO-QRH-Adults.pdf`, linked from every page | GitHub Action **Update PDF** prints the booklet when `Index.html` or `images/` change on `main` |
| Printable booklet | `/booklet.html` on the website | Copy of `Index.html` with local fonts |
| Android app | `android/` | GitHub Action **Android app**; see [android/README.md](android/README.md) |

The build reads procedures from the Contents page, using its page numbers (`Pg 4-5`), so a new procedure needs
a Contents entry and its two pages (Walkthrough then Action). The build stops with an error if the Contents and
the pages disagree.

## Working locally

```sh
npm ci
npm run build                      # dist/
npx playwright install chromium    # once
npm run pdf && npm run build       # refresh the PDF too
npm run serve                      # preview dist/
```
