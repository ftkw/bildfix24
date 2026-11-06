/** Screenshots der bearbeiteten Zustände (Ergebnis-Ansichten). */
import { chromium } from 'playwright-core';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const base = 'http://[::1]:4321';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('bf-consent', 'essential'));
const page = await context.newPage();

const shotStats = async (selector, file, docTitle) => {
  await page.waitForTimeout(500);
  await page.evaluate(sel => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), selector);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file });
  console.log('->', file, docTitle);
};

// Kompressions-Ergebnis
await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
await page.setInputFiles('#compress-input', '/tmp/t.jpg');
await page.waitForSelector('#compress-stats:not([hidden])', { timeout: 10000 });
await shotStats('#compress-stats', 'shots/compress-result.png', 'Komprimieren');

// Konvertierung mit WebP als Standard
await page.goto(base + '/bild-konvertieren/', { waitUntil: 'networkidle' });
await page.setInputFiles('#convert-input', '/tmp/t.png');
await page.waitForSelector('#convert-workspace:not([hidden])', { timeout: 10000 });
await page.click('#convert-apply');
await page.waitForSelector('#convert-stats:not([hidden])', { timeout: 10000 });
await shotStats('#convert-stats', 'shots/convert-result.png', 'Konvertieren');

// Wasserzeichen mit Kachelung
await page.goto(base + '/wasserzeichen-hinzufuegen/', { waitUntil: 'networkidle' });
await page.setInputFiles('#wm-input', '/tmp/t.jpg');
await page.waitForSelector('#wm-workspace:not([hidden])', { timeout: 10000 });
await page.check('#wm-tile');
await shotStats('#wm-canvas', 'shots/watermark-result.png', 'Wasserzeichen');

console.log('Screenshots gespeichert.');
await browser.close();
