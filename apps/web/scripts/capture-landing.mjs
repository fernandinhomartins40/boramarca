/* global document, window, getComputedStyle -- used inside page.evaluate (runs in the browser) */
// Landing screenshots at the plan's four widths + horizontal-scroll and image-ratio checks.
// Usage: next start on :3000, then `node scripts/capture-landing.mjs [baseUrl] [outDir]`.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3]) + '/')
  : new URL('../docs/capturas-c5/', import.meta.url);
// Uses the installed Chrome (no browser download needed).
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
for (const width of [390, 768, 1024, 1366]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const path of ['/', '/contato', '/privacidade', '/termos', '/excluir-conta']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    // Force lazy images to load before measuring.
    await page.evaluate(async () => {
      for (const img of document.images) img.loading = 'eager';
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    const r = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      // Rendered box ratio must match the file's ratio (height:auto, never stretched).
      distorted: [...document.images]
        .filter((i) => i.naturalWidth && i.clientWidth)
        .filter(
          (i) => Math.abs(i.clientWidth / i.clientHeight - i.naturalWidth / i.naturalHeight) > 0.02,
        )
        .map((i) => i.currentSrc),
      cover: [...document.images].filter((i) => getComputedStyle(i).objectFit === 'cover').length,
    }));
    const ok = r.scrollWidth <= r.innerWidth && r.distorted.length === 0 && r.cover === 0;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${width}px ${path} scrollWidth=${r.scrollWidth} innerWidth=${r.innerWidth} distorted=${r.distorted.length} cover=${r.cover}`,
    );
    if (path === '/')
      await page.screenshot({
        path: fileURLToPath(new URL(`landing-${width}.png`, out)),
        fullPage: true,
      });
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
