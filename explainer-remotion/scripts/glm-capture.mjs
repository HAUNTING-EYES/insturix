// LIVE-URL CAPTURE (multi-section). Puppeteer opens a URL and captures SEVERAL viewport screenshots down the
// page (hero, then scrolled sections) so scenes have varied REAL product/site imagery — not one shot reused.
// Usage: node scripts/glm-capture.mjs <url> <baseName> [sections]
import puppeteer from 'puppeteer';
import {mkdirSync} from 'node:fs';

const URL = process.argv[2] || 'https://insturix.com';
const BASE = (process.argv[3] || 'insturix').replace(/\.png$/, '');
const SECTIONS = parseInt(process.argv[4] || '3', 10);
mkdirSync('public/product', {recursive: true});

const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox']});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1600, height: 1000, deviceScaleFactor: 2});
  await page.goto(URL, {waitUntil: 'networkidle2', timeout: 60000});
  await new Promise((r) => setTimeout(r, 2800));
  const pageH = await page.evaluate(() => document.body.scrollHeight);
  for (let i = 0; i < SECTIONS; i++) {
    const y = Math.min(i * 950, Math.max(0, pageH - 1000));
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 900));
    const out = `public/product/${BASE}-${i}.png`;
    await page.screenshot({path: out});
    console.log(`captured ${URL} @scroll ${y} -> ${out}`);
    if (y >= pageH - 1000) break;
  }
} finally {
  await browser.close();
}
