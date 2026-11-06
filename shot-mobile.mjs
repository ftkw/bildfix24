/** Mobile Prüfung: Werkzeug-Panels bei 390 px Breite. */
import { chromium } from 'playwright-core';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const base = 'http://[::1]:4321';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
await context.addInitScript(() => localStorage.setItem('bf-consent', 'essential'));
const page = await context.newPage();

const overflow = async label => {
  const bad = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > width + 1.5 || r.left < -1.5)) {
        const cls = el.className && typeof el.className === 'string' ? el.className : el.tagName;
        offenders.push(`${el.tagName}.${cls}`.slice(0, 70));
      }
    });
    return { width, offenders: [...new Set(offenders)].slice(0, 6) };
  });
  console.log(`${label}: viewport ${bad.width}px, Überläufe: ${bad.offenders.length ? bad.offenders.join(' | ') : 'keine'}`);
};

await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
await page.setInputFiles('#compress-input', '/tmp/t.jpg');
await page.waitForSelector('#compress-stats:not([hidden])', { timeout: 10000 });
await overflow('/bild-komprimieren/');
await page.evaluate(() => document.querySelector('#compress-stats')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/mobile-komprimieren.png' });

await page.goto(base + '/bildgroesse-aendern/', { waitUntil: 'networkidle' });
await page.setInputFiles('#resize-input', '/tmp/t.png');
await page.waitForSelector('#resize-workspace:not([hidden])', { timeout: 10000 });
await overflow('/bildgroesse-aendern/');
await page.evaluate(() => document.querySelector('#resize-presets')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/mobile-resize.png' });

await page.goto(base + '/', { waitUntil: 'networkidle' });
await overflow('/');

await browser.close();
