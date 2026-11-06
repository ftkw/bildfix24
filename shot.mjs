import { chromium } from 'playwright-core';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = 'http://[::1]:4321';
const out = '/tmp/bildfix-shots';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const errors = [];

async function shot(name, path, viewport, fullPage = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`);
  });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
  console.log(`${name} -> ${res?.status()} ${path}`);
  await ctx.close();
}

const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

await shot('home-desktop', '/', desktop);
await shot('home-full', '/', desktop, true);
await shot('crop-desktop', '/bild-zuschneiden/', desktop);
await shot('watermark-desktop', '/wasserzeichen-hinzufuegen/', desktop);
await shot('tools-desktop', '/werkzeuge/', desktop);
await shot('guide-desktop', '/bildschutz/bilder-vor-diebstahl-schuetzen/', desktop);
await shot('home-mobile', '/', mobile);

console.log('\n--- CONSOLE ERRORS ---');
console.log(errors.length ? errors.join('\n') : 'none');

await browser.close();
