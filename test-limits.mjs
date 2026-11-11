/**
 * Prüft die Grenzen, die seit dem 11.11.2026 gelten: 100 MB pro Datei und ein
 * Pixel-Budget je Geräteklasse.
 *
 * Der interessante Teil ist nicht die Zahl, sondern der Ort der Prüfung: Die
 * Pixelzahl muss **vor** dem Dekodieren aus dem Dateikopf gelesen werden. Ein
 * 100-MB-JPEG sind rund 100 Megapixel und beim Dekodieren über 400 MB – auf
 * einem Smartphone stirbt der Tab, bevor eine Prüfung danach greifen könnte.
 *
 * Getestet wird das ohne riesige Testdatei: Ein 200 × 200 großes JPEG wird im
 * SOF-Kopf auf 20000 × 20000 umgeschrieben. Die Datei bleibt 4 KB klein, der
 * Kopf behauptet 400 Megapixel. Wird sie abgelehnt, hat die Prüfung vor dem
 * Dekodieren gegriffen – würde sie erst danach greifen, wäre der Testfall
 * genau der, den man auf dem Telefon nicht mehr abfangen kann.
 */
import { chromium } from 'playwright-core';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

const results = [];
const push = (name, ok, detail) => results.push([name, ok ? 'OK' : 'FEHLER', detail]);

/* ---------- 1. Die zugesagte Grenze steht auch auf der Seite ---------- */
const pagesWithHint = [
  '/bild-komprimieren/',
  '/bild-zuschneiden/',
  '/bildgroesse-aendern/',
  '/wasserzeichen-hinzufuegen/',
  '/bild-in-pdf/',
  '/bild-auf-500-kb-verkleinern/',
  '/instagram-bild-zuschneiden/',
  '/passfoto-zuschneiden/',
  '/produktbild-komprimieren/',
  '/bild-in-graustufen/'
];

let stalePages = [];
let missingHint = [];
for (const path of pagesWithHint) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  if (/max\. 100 MB|bis 100 MB/.test(html) === false) missingHint.push(path);
  // 30 MB darf nirgends mehr stehen – sonst sagt die Seite weniger zu, als sie kann.
  if (html.includes('30 MB')) stalePages.push(path);
}
push('Alle Werkzeugseiten nennen 100 MB', missingHint.length === 0, missingHint.join(' ') || `${pagesWithHint.length} Seiten`);
push('Keine Seite nennt noch 30 MB', stalePages.length === 0, stalePages.join(' ') || 'keine Reste');

/* ---------- 2. Zwei Grenzen, ehrlich benannt ---------- */
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
// textContent statt innerText: die FAQ steckt in zugeklappten <details>,
// die innerText nicht mitliefert.
const faq = await page.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
push(
  'Startseite erklärt die zweite Grenze (Megapixel)',
  faq.includes('100 MB') && /Megapixel/.test(faq),
  faq.match(/[^.]*Megapixel[^.]*\./)?.[0]?.slice(0, 90) ?? 'kein Hinweis gefunden'
);

/* ---------- 3. Prüfung vor dem Dekodieren ---------- */
await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });

const b64 = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#3366ff';
  cx.fillRect(0, 0, 200, 200);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
});
const jpeg = Buffer.from(b64, 'base64');

/** Schreibt die Maße im SOF-Segment um: dort stehen Höhe und Breite als 16 Bit. */
function withFakeSize(buffer, width, height) {
  const copy = Buffer.from(buffer);
  for (let i = 2; i < copy.length - 9; i++) {
    if (copy[i] !== 0xff || copy[i + 1] !== 0xc0) continue;
    copy.writeUInt16BE(height, i + 5);
    copy.writeUInt16BE(width, i + 7);
    return copy;
  }
  throw new Error('Kein SOF0-Segment gefunden');
}

const fake = withFakeSize(jpeg, 20000, 20000);

await page.setInputFiles('#compress-input', { name: 'zu-gross.jpg', mimeType: 'image/jpeg', buffer: fake });
await page.waitForFunction(
  () => {
    const n = document.querySelector('#compress-notice');
    const ws = document.querySelector('#compress-workspace');
    return (n && !n.hidden) || (ws && !ws.hidden);
  },
  null,
  { timeout: 15000 }
);
const rejected = await page.evaluate(() => {
  const n = document.querySelector('#compress-notice');
  const ws = document.querySelector('#compress-workspace');
  return { notice: n && !n.hidden ? n.textContent.trim() : '', workspace: ws ? !ws.hidden : false };
});
push(
  '400 Megapixel werden abgelehnt',
  rejected.notice.includes('Megapixel') && !rejected.workspace,
  rejected.notice.slice(0, 80) || 'keine Meldung'
);
push(
  'Die Meldung nennt die echten Maße',
  rejected.notice.includes('20000 × 20000'),
  rejected.notice.match(/\(([^)]*)\)/)?.[1] ?? 'keine Maße in der Meldung'
);
push(
  'Die Meldung sagt, was zu tun ist',
  rejected.notice.includes('Bildgröße ändern'),
  rejected.notice.includes('Bildgröße ändern') ? 'verweist auf das Werkzeug' : 'fehlt'
);

/* ---------- 4. Gegenprobe: dieselbe Datei ohne gefälschte Maße ---------- */
await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
await page.setInputFiles('#compress-input', { name: 'echt.jpg', mimeType: 'image/jpeg', buffer: jpeg });
await page.waitForFunction(
  () => {
    const ws = document.querySelector('#compress-workspace');
    return ws && !ws.hidden;
  },
  null,
  { timeout: 15000 }
).catch(() => {});
const control = await page.evaluate(() => {
  const ws = document.querySelector('#compress-workspace');
  return ws ? !ws.hidden : false;
});
push('Dieselbe Datei mit echten Maßen wird geladen', control, control ? 'Arbeitsbereich sichtbar' : 'nicht geladen');

/* ---------- 5. Die Byte-Grenze selbst ---------- */
// Playwright nimmt keine Buffer über 50 MB an – also kurz eine Datei schreiben.
await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
const bigPath = join(tmpdir(), `bildfix-101mb-${process.pid}.jpg`);
const tooBig = Buffer.alloc(101 * 1024 * 1024, 0x20);
tooBig[0] = 0xff;
tooBig[1] = 0xd8;
writeFileSync(bigPath, tooBig);
await page.setInputFiles('#compress-input', bigPath);
await page.waitForFunction(
  () => {
    const n = document.querySelector('#compress-notice');
    return n && !n.hidden;
  },
  null,
  { timeout: 30000 }
).catch(() => {});
const sizeNotice = await page.evaluate(() => {
  const n = document.querySelector('#compress-notice');
  return n && !n.hidden ? n.textContent.trim() : '';
});
push('101 MB werden abgelehnt', sizeNotice.includes('100 MB'), sizeNotice.slice(0, 70) || 'keine Meldung');
rmSync(bigPath, { force: true });

push('Keine JS-Fehler in der Konsole', errors.length === 0, errors.join(' | '));

console.log('');
const width = Math.max(...results.map(r => r[0].length));
for (const [name, state, detail] of results) {
  console.log(`${state.padEnd(7)} ${name.padEnd(width)}  ${detail}`);
}
const failed = results.filter(r => r[1] !== 'OK').length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
