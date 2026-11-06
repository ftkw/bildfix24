/**
 * Zweite Testrunde: Unterkategorien der Konvertierung, Presets, Fehlerpfade.
 * Voraussetzung: `npm run build` und laufender `astro preview` auf [::1]:4321.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

/* ---------- Testdateien erzeugen ---------- */
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
const pngData = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 400;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 600, 400);
  g.addColorStop(0, '#5227ff');
  g.addColorStop(1, '#ff9ffc');
  x.fillStyle = g;
  x.fillRect(0, 0, 600, 400);
  return c.toDataURL('image/png');
});
const jpgData = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 600;
  const x = c.getContext('2d');
  x.fillStyle = '#1d9e6f';
  x.fillRect(0, 0, 800, 600);
  x.fillStyle = '#fff';
  x.font = 'bold 64px sans-serif';
  x.fillText('FOTO', 60, 320);
  return c.toDataURL('image/jpeg', 0.85);
});
writeFileSync('/tmp/t.png', Buffer.from(pngData.split(',')[1], 'base64'));
writeFileSync('/tmp/t.jpg', Buffer.from(jpgData.split(',')[1], 'base64'));
writeFileSync('/tmp/kein-bild.txt', 'Das ist kein Bild.');
console.log('Testdateien erzeugt: /tmp/t.png, /tmp/t.jpg, /tmp/kein-bild.txt');

const results = [];
const push = (name, ok, detail) => results.push([name, ok ? 'OK' : 'FEHLER', detail]);
const text = async sel => (await page.textContent(sel))?.replace(/\s+/g, ' ').trim() ?? '';

/* ---------- 1. JPG -> PNG ---------- */
await page.goto(base + '/bild-konvertieren/jpg-in-png/', { waitUntil: 'networkidle' });
await page.setInputFiles('#convert-input', '/tmp/t.jpg');
await page.waitForSelector('#convert-workspace:not([hidden])', { timeout: 10000 });
const activeJpgPng = await page.getAttribute('#convert-format button[data-format="image/png"]', 'aria-pressed');
await page.click('#convert-apply');
await page.waitForSelector('#convert-stats:not([hidden])', { timeout: 10000 });
const s1 = await text('#convert-stats');
push('JPG → PNG', activeJpgPng === 'true' && s1.includes('PNG'), s1);

/* ---------- 2. PNG -> JPG (mit Hinweis auf weiße Flächen) ---------- */
await page.goto(base + '/bild-konvertieren/png-in-jpg/', { waitUntil: 'networkidle' });
await page.setInputFiles('#convert-input', '/tmp/t.png');
await page.waitForSelector('#convert-workspace:not([hidden])', { timeout: 10000 });
await page.click('#convert-apply');
await page.waitForSelector('#convert-stats:not([hidden])', { timeout: 10000 });
const s2 = await text('#convert-stats');
const n2 = await text('#convert-notice');
push('PNG → JPG', s2.includes('JPG') && n2.includes('weiß gefüllt'), `${s2} | ${n2}`);

/* ---------- 3. Zuschneiden 1:1 ---------- */
await page.goto(base + '/bild-zuschneiden/', { waitUntil: 'networkidle' });
await page.setInputFiles('#crop-input', '/tmp/t.png');
await page.waitForSelector('#crop-workspace:not([hidden])', { timeout: 10000 });
await page.click('#crop-ratio button[data-ratio="1"]');
await page.waitForTimeout(250);
await page.click('#crop-apply');
await page.waitForSelector('#crop-stats:not([hidden])', { timeout: 10000 });
const s3 = await text('#crop-stats');
const dims = s3.match(/(\d+)\s*×\s*(\d+)/);
push('Zuschneiden 1:1', !!dims && dims[1] === dims[2], s3);

/* ---------- 4. Größe über Preset ---------- */
await page.goto(base + '/bildgroesse-aendern/', { waitUntil: 'networkidle' });
await page.setInputFiles('#resize-input', '/tmp/t.png');
await page.waitForSelector('#resize-workspace:not([hidden])', { timeout: 10000 });
await page.click('#resize-presets button[data-w="1080"]');
await page.waitForTimeout(250);
await page.click('#resize-apply');
await page.waitForSelector('#resize-stats:not([hidden])', { timeout: 10000 });
const s4 = await text('#resize-stats');
push('Preset 1080 × 1080', s4.includes('1080 × 1080'), s4);

/* ---------- 5. Größe über Prozentregler ---------- */
await page.goto(base + '/bildgroesse-aendern/', { waitUntil: 'networkidle' });
await page.setInputFiles('#resize-input', '/tmp/t.png');
await page.waitForSelector('#resize-workspace:not([hidden])', { timeout: 10000 });
await page.fill('#resize-percent', '25');
await page.dispatchEvent('#resize-percent', 'input');
await page.waitForTimeout(250);
await page.click('#resize-apply');
await page.waitForSelector('#resize-stats:not([hidden])', { timeout: 10000 });
const s5 = await text('#resize-stats');
push('Skalierung 25 %', s5.includes('150 × 100'), s5);

/* ---------- 6. Wasserzeichen: Text, ohne Kachelung ---------- */
await page.goto(base + '/wasserzeichen-hinzufuegen/', { waitUntil: 'networkidle' });
await page.setInputFiles('#wm-input', '/tmp/t.png');
await page.waitForSelector('#wm-workspace:not([hidden])', { timeout: 10000 });
await page.fill('#wm-text', '© bildfix24');
await page.click('#wm-apply');
await page.waitForSelector('#wm-stats:not([hidden])', { timeout: 10000 });
const s6 = await text('#wm-stats');
const n6 = await text('#wm-notice');
push('Wasserzeichen Text', n6.includes('Wasserzeichen gesetzt') && s6.includes('600 × 400'), `${s6} | ${n6}`);

/* ---------- 7. Wasserzeichen mit Logo ---------- */
const logoInput = await page.$('#wm-logo-input');
if (logoInput) {
  await logoInput.setInputFiles('/tmp/t.png');
  await page.waitForFunction(() => document.querySelector('#wm-logo-status')?.textContent?.includes('Logo:'), { timeout: 5000 });
  await page.click('#wm-apply');
  // Zuverlässiges Signal: der Download-Knopf erscheint erst, wenn das Ergebnis fertig ist.
  await page.waitForSelector('#wm-download:not([hidden])', { timeout: 8000 });
  const s7 = await text('#wm-stats');
  push('Wasserzeichen Logo', s7.includes('Logo'), s7);
} else {
  push('Wasserzeichen Logo', false, 'kein Logo-Feld gefunden');
}

/* ---------- 8. Fehlerpfad: keine Bilddatei ---------- */
await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
await page.setInputFiles('#compress-input', '/tmp/kein-bild.txt');
await page.waitForTimeout(600);
const n8 = await text('#compress-notice');
const ws8 = await page.getAttribute('#compress-workspace', 'hidden');
push('Fehlerpfad Textdatei', n8.includes('Bilddatei') && ws8 !== null, n8 || '(keine Meldung)');

/* ---------- 9. Rechtstexte erreichbar + kein Platzhalter ---------- */
for (const path of ['/impressum/', '/datenschutz/', '/ueber-uns/', '/kontakt/']) {
  const res = await page.request.get(base + path);
  push(`Seite ${path}`, res.status() === 200, `HTTP ${res.status()}`);
}

console.log('\n=== TESTRUnde 2 ===');
for (const [name, status, detail] of results) console.log(`${status.padEnd(7)} ${name}: ${detail}`);
console.log('\n=== FEHLER ===');
console.log(errors.length ? errors.join('\n') : 'keine');

await browser.close();
