/**
 * Prüft die HEIC-Umwandlung gegen eine echte HEIC-Datei.
 *
 * Der Punkt, an dem solche Werkzeuge üblicherweise scheitern, ist nicht die
 * Oberfläche, sondern der Decoder: WebAssembly laden, Container parsen, HEVC
 * dekodieren, Pixel übernehmen. Deshalb wird hier nicht die Existenz von
 * Elementen geprüft, sondern das Ergebnis: eine Datei, die wirklich JPEG ist,
 * die richtigen Maße hat und sich öffnen lässt.
 *
 * Die Testdatei `test-fixtures/heic-beispiel.heic` ist ein echtes HEIC
 * (1000 × 525, mit Vorschaubild und geteilter Kachelung), erzeugt aus dem
 * eigenen Titelbild der Website. Kein fremdes Bild, keine Lizenzfrage.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const fixture = readFileSync('test-fixtures/heic-beispiel.heic');

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

const results = [];
const push = (name, ok, detail = '') => results.push([name, ok ? 'OK' : 'FEHLER', detail]);

const goto = async () => {
  await page.goto(base + '/heic-in-jpg/', { waitUntil: 'domcontentloaded' });
};

const waitForDownload = async () => {
  await page.waitForSelector('#heic-download:not([hidden])', { timeout: 30000 });
};

const waitForNotice = async () => {
  await page.waitForSelector('#heic-notice:not([hidden])', { timeout: 30000 });
};

/* ---------- 1. Seite und Werkzeug sind da ---------- */
await goto();
const setup = await page.evaluate(() => {
  const input = document.querySelector('#heic-input');
  return {
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    multiple: input?.multiple ?? false,
    accept: input?.getAttribute('accept') ?? '',
    noteVisible: !!document.querySelector('.heic-note'),
    noteText: document.querySelector('.heic-note')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  };
});
push('H1 nennt HEIC', /HEIC/i.test(setup.h1), setup.h1);
push('Dateiauswahl erlaubt mehrere Dateien', setup.multiple === true);
push('Endungen .heic und .heif erlaubt', setup.accept.includes('.heic') && setup.accept.includes('.heif'), setup.accept);
push('Hinweis auf fehlende EXIF-Daten sichtbar', setup.noteVisible && /EXIF|Aufnahmedatum/.test(setup.noteText));

/* ---------- 2. Eine Datei: Ergebnis muss echtes JPEG sein ---------- */
await page.setInputFiles('#heic-input', {
  name: 'IMG_4821.HEIC',
  mimeType: 'image/heic',
  buffer: fixture
});

const listed = await page.evaluate(() => ({
  rows: document.querySelectorAll('#heic-list .heic-item').length,
  name: document.querySelector('.heic-item__name')?.textContent ?? '',
  state: document.querySelector('.heic-item__state')?.textContent ?? '',
  applyEnabled: !document.querySelector('#heic-apply')?.disabled
}));
push('Datei landet in der Liste', listed.rows === 1, `${listed.rows} Zeile(n), ${listed.state}`);
push('Dateiname wird angezeigt', listed.name === 'IMG_4821.HEIC', listed.name);
push('Umwandeln ist auslösbar', listed.applyEnabled === true);

await page.click('#heic-apply');
await waitForDownload();

const single = await page.evaluate(async () => {
  const link = document.querySelector('#heic-download');
  const label = document.querySelector('#heic-download-label')?.textContent?.trim() ?? '';
  const blob = await (await fetch(link.href)).blob();
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  let size = null;
  try {
    const bitmap = await createImageBitmap(blob);
    size = { w: bitmap.width, h: bitmap.height };
  } catch {
    size = null;
  }
  return {
    label,
    download: link.getAttribute('download'),
    type: blob.type,
    bytes: blob.size,
    signature: [...head],
    size,
    state: document.querySelector('.heic-item__state')?.textContent ?? '',
    meta: document.querySelector('.heic-item__meta')?.textContent ?? ''
  };
});

push('Ergebnis ist JPEG', single.type === 'image/jpeg' && single.signature[0] === 0xff && single.signature[1] === 0xd8, `${single.type} ${single.signature.join(' ')}`);
push('Ergebnis hat die Maße der Vorlage', single.size?.w === 1000 && single.size?.h === 525, single.size ? `${single.size.w} × ${single.size.h}` : 'nicht lesbar');
push('Download heißt wie die Quelle', single.download === 'IMG_4821.jpg', single.download);
push('Zeile steht auf „fertig"', single.state === 'fertig', single.state);
push('Zeile nennt beide Größen', /→/.test(single.meta), single.meta);

await waitForNotice();
const noticeText = await page.evaluate(
  () => document.querySelector('#heic-notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
);
push('Rückmeldung nennt den EXIF-Verlust', /EXIF/.test(noticeText), noticeText.slice(0, 90));

/* ---------- 3. Zweite Datei: Ergebnis muss ein lesbares ZIP sein ---------- */
await page.setInputFiles('#heic-add-input', {
  name: 'IMG_4822.HEIC',
  mimeType: 'image/heic',
  buffer: fixture
});
await page.click('#heic-apply');
await waitForDownload();

const archive = await page.evaluate(async () => {
  const link = document.querySelector('#heic-download');
  const label = document.querySelector('#heic-download-label')?.textContent?.trim() ?? '';
  const buffer = new Uint8Array(await (await fetch(link.href)).arrayBuffer());
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return { label, name: link.getAttribute('download'), base64: btoa(binary), bytes: buffer.length };
});

const zipPath = join(tmpdir(), `heic-test-${Date.now()}.zip`);
writeFileSync(zipPath, Buffer.from(archive.base64, 'base64'));
let zipEntries = [];
try {
  zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
} catch (error) {
  push('ZIP lässt sich öffnen', false, String(error.message).slice(0, 80));
}
push('ZIP lässt sich öffnen (unzip)', zipEntries.length === 2, zipEntries.join(', '));
push('ZIP enthält beide JPGs', zipEntries.every(name => name.endsWith('.jpg')), zipEntries.join(', '));
push('Knopf beschriftet die Sammlung', /ZIP/.test(archive.label) && /2/.test(archive.label), archive.label);
push('ZIP-Dateiname endet auf .zip', String(archive.name).endsWith('.zip'), String(archive.name));
rmSync(zipPath, { force: true });

/* ---------- 4. Kein HEIC: verständliche Meldung statt Absturz ---------- */
await goto();
const pngBytes = readFileSync('public/og.png');
await page.setInputFiles('#heic-input', {
  name: 'kein-heic.heic',
  mimeType: 'image/heic',
  buffer: pngBytes
});
await page.click('#heic-apply');
await page.waitForFunction(
  () => /keine HEIC|nicht lesen|beschädigt/i.test(document.querySelector('#heic-notice')?.textContent ?? ''),
  { timeout: 20000 }
).catch(() => undefined);

const rejection = await page.evaluate(() => ({
  notice: document.querySelector('#heic-notice')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  state: document.querySelector('.heic-item__state')?.textContent ?? '',
  applyEnabled: !document.querySelector('#heic-apply')?.disabled
}));
push('Fremdformat wird erklärt, nicht verschluckt', /keine HEIC|HEIF/i.test(rejection.notice), rejection.notice.slice(0, 90));
push('Fehlerzeile ist als Fehler markiert', rejection.state === 'Fehler', rejection.state);
push('Nach dem Fehler bleibt das Werkzeug bedienbar', rejection.applyEnabled === true);

/* ---------- 5. Keine Ausnahmen im Browser ---------- */
push('Keine JavaScript-Fehler', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

/* ---------- Ausgabe ---------- */
let failures = 0;
for (const [name, status, detail] of results) {
  if (status !== 'OK') failures++;
  console.log(`${status === 'OK' ? '  ok  ' : ' FEHL '} ${name}${detail ? ` – ${detail}` : ''}`);
}
console.log(`\nHEIC: ${results.length - failures}/${results.length} bestanden`);
process.exit(failures === 0 ? 0 : 1);
