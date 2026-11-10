/**
 * Funktionstest für /bilder-zusammenfuegen/.
 * Voraussetzung: npm run build && npm run serve (Port 8080).
 *
 * Geprüft wird nicht "es gibt eine Datei", sondern die tatsächlichen Pixelmaße
 * und die Transparenz im Zwischenraum – dazu wird das heruntergeladene Bild
 * zurück in den Browser geladen und ausgelesen.
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

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

const results = [];
const push = (name, ok, detail) => results.push([name, ok ? 'OK' : 'FEHLER', detail]);
const text = async sel => (await page.textContent(sel))?.replace(/\s+/g, ' ').trim() ?? '';

/* ---------- Testdateien: bewusst unterschiedliche Maße ---------- */
const files = await page.evaluate(() => {
  const make = (w, h, bg, label) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.font = `bold ${Math.round(h / 5)}px sans-serif`;
    x.fillText(label, 12, Math.round(h * 0.6));
    return c.toDataURL('image/png');
  };
  return {
    a: make(600, 400, '#c81e1e', 'A'),
    b: make(300, 200, '#1d9e6f', 'B'),
    c: make(200, 400, '#1d4ed8', 'C')
  };
});

/* ---------- 1. Laden und Befüllen ---------- */
await page.goto(base + '/bilder-zusammenfuegen/', { waitUntil: 'networkidle' });
await page.setInputFiles('#merge-input', [
  { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(files.a.split(',')[1], 'base64') },
  { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(files.b.split(',')[1], 'base64') },
  { name: 'c.png', mimeType: 'image/png', buffer: Buffer.from(files.c.split(',')[1], 'base64') }
]);
await page.waitForSelector('#merge-workspace:not([hidden])', { timeout: 10000 });

const names = await page.$$eval('#merge-list .merge-item__name', els => els.map(e => e.textContent));
push('Liste: 3 Einträge in Reihenfolge a,b,c', names.join(',') === 'a.png,b.png,c.png', names.join(','));

const thumbs = await page.$$eval('#merge-list .merge-item__thumb', els =>
  els.map(e => e.naturalWidth > 0 && e.naturalHeight > 0)
);
push('Vorschaubilder geladen (3/3)', thumbs.length === 3 && thumbs.every(Boolean), thumbs.join(','));

const hint = await text('#merge-layout-hint');
push('Hinweis zur Größenangleichung sichtbar', hint.includes('Höhe des größten'), hint);

/* ---------- 2. Nebeneinander + gleiche Höhe ---------- */
const download = async () => {
  await page.click('#merge-apply');
  await page.waitForSelector('#merge-download:not([hidden])', { timeout: 20000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#merge-download')
  ]);
  const path = '/tmp/merge-out-' + Date.now() + '.bin';
  await dl.saveAs(path);
  return { path, name: dl.suggestedFilename(), b64: readFileSync(path).toString('base64') };
};

const inspect = async b64 =>
  page.evaluate(async data => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const pick = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data);
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      left: pick(5, 200),
      midGap: pick(0, 0),
      alphaAt: (px, py) => null,
      corner: pick(0, 0)
    };
  }, b64);

let out = await download();
let info = await inspect(out.b64);
// A 600x400 -> 600x400, B 300x200 -> 600x400, C 200x400 -> 200x400  => 1400 x 400
push('Nebeneinander/gleiche Höhe: 1400 × 400 px', info.w === 1400 && info.h === 400, `${info.w} × ${info.h}`);
push('Dateiname bilder-nebeneinander-3.png', out.name === 'bilder-nebeneinander-3.png', out.name);
push('Statistik zeigt Maße', (await text('#merge-stats')).includes('1400 × 400'), await text('#merge-stats'));

/* ---------- 3. Originalgröße ---------- */
await page.click('#merge-fit button[data-fit="natural"]');
out = await download();
info = await inspect(out.b64);
// 600 + 300 + 200 = 1100, Höhe max 400
push('Nebeneinander/Originalgröße: 1100 × 400 px', info.w === 1100 && info.h === 400, `${info.w} × ${info.h}`);

/* ---------- 4. Untereinander + gleiche Breite ---------- */
await page.click('#merge-direction button[data-direction="v"]');
await page.click('#merge-fit button[data-fit="equal"]');
out = await download();
info = await inspect(out.b64);
// Breite 600; A 400, B 400, C 1200  => 600 x 2000
push('Untereinander/gleiche Breite: 600 × 2000 px', info.w === 600 && info.h === 2000, `${info.w} × ${info.h}`);
push('Dateiname bilder-untereinander-3.png', out.name === 'bilder-untereinander-3.png', out.name);

/* ---------- 5. Abstand ---------- */
await page.click('#merge-direction button[data-direction="h"]');
await page.$eval('#merge-gap', el => {
  el.value = '40';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
push('Abstandsanzeige 40 px', (await text('#merge-gap-value')) === '40 px', await text('#merge-gap-value'));

out = await download();
info = await inspect(out.b64);
// 1400 + 2*40 = 1480
push('Abstand 40 px: 1480 × 400 px', info.w === 1480 && info.h === 400, `${info.w} × ${info.h}`);

/* ---------- 6. Transparenz im Zwischenraum ---------- */
const gapAlpha = await page.evaluate(async data => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const at = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data);
  // A endet bei 600, dann 40 px Lücke (600..639), B beginnt bei 640.
  return { gap: at(620, 200), inside: at(300, 200) };
}, out.b64);
push(
  'Weißer Hintergrund: Lücke ist weiß',
  gapAlpha.gap[3] === 255 && gapAlpha.gap[0] === 255,
  JSON.stringify(gapAlpha.gap)
);

await page.click('#merge-bg button[data-bg="transparent"]');
out = await download();
const transparent = await page.evaluate(async data => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const at = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data);
  return { gap: at(620, 200), inside: at(300, 200) };
}, out.b64);
push(
  'Transparenter Hintergrund: Lücke hat Alpha 0',
  transparent.gap[3] === 0,
  JSON.stringify(transparent.gap)
);
push(
  'Transparenter Hintergrund: Bildinhalt bleibt deckend',
  transparent.inside[3] === 255,
  JSON.stringify(transparent.inside)
);

/* ---------- 7. JPG-Ausgabe ---------- */
await page.click('#merge-format button[data-format="image/jpeg"]');
const bgStates = await page.$$eval('#merge-bg button', els =>
  els.map(e => ({ bg: e.dataset.bg, pressed: e.getAttribute('aria-pressed'), disabled: e.disabled }))
);
push(
  'JPG: Transparent-Knopf deaktiviert, Weiß aktiv',
  bgStates.find(b => b.bg === 'transparent').disabled === true &&
    bgStates.find(b => b.bg === 'white').pressed === 'true',
  JSON.stringify(bgStates)
);
out = await download();
push('JPG: Dateiname .jpg', out.name.endsWith('.jpg'), out.name);
push('JPG: Datei beginnt mit JPEG-Signatur', out.b64.startsWith('/9j/'), out.b64.slice(0, 8));

/* ---------- 8. Reihenfolge ändern ---------- */
await page.click('#merge-list .merge-item:first-child [data-move="down"]');
const afterMove = await page.$$eval('#merge-list .merge-item__name', els => els.map(e => e.textContent));
push('Pfeil nach unten verschiebt a hinter b', afterMove.join(',') === 'b.png,a.png,c.png', afterMove.join(','));
push(
  'Erste Zeile kann nicht weiter nach vorne',
  await page.$eval('#merge-list .merge-item:first-child [data-move="up"]', el => el.disabled),
  'disabled geprüft'
);
push(
  'Letzte Zeile kann nicht weiter nach hinten',
  await page.$eval('#merge-list .merge-item:last-child [data-move="down"]', el => el.disabled),
  'disabled geprüft'
);
// a steht jetzt an zweiter Stelle – mit "nach vorne" zurück an die Spitze.
await page.click('#merge-list .merge-item:nth-child(2) [data-move="up"]');
const restored = await page.$$eval('#merge-list .merge-item__name', els => els.map(e => e.textContent));
push('Pfeil nach oben stellt die alte Reihenfolge wieder her', restored.join(',') === 'a.png,b.png,c.png', restored.join(','));

/* ---------- 9. Entfernen ---------- */
await page.click('#merge-list .merge-item:last-child [data-remove]');
const afterRemove = await page.$$eval('#merge-list .merge-item__name', els => els.map(e => e.textContent));
push('Entfernen reduziert die Liste auf 2', afterRemove.length === 2, afterRemove.join(','));
push('Nach Entfernen ist Download wieder verborgen', await page.$eval('#merge-download', el => el.hidden), 'hidden');

/* ---------- 10. Zurücksetzen ---------- */
await page.click('#merge-clear');
push('Liste leeren zeigt Ablagefläche wieder', await page.$eval('#merge-zone', el => !el.hidden), 'zone sichtbar');
push('Liste leeren blendet Arbeitsbereich aus', await page.$eval('#merge-workspace', el => el.hidden), 'workspace hidden');

/* ---------- 11. Grenze 12 Dateien ---------- */
const many = Array.from({ length: 14 }, (_, i) => ({
  name: `x${i}.png`,
  mimeType: 'image/png',
  buffer: Buffer.from(files.b.split(',')[1], 'base64')
}));
await page.setInputFiles('#merge-input', many);
await page.waitForSelector('#merge-workspace:not([hidden])', { timeout: 15000 });
const count = await page.$$eval('#merge-list .merge-item', els => els.length);
push('14 Dateien -> max. 12 übernommen', count === 12, String(count));
const notice = await text('#merge-notice');
push('Hinweis nennt die Grenze', notice.includes('Maximal 12'), notice);

/* ---------- 12. Fehlerpfad: zu großes Ergebnis ---------- */
await page.click('#merge-clear');
const big = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 4000;
  c.height = 3000;
  c.getContext('2d').fillRect(0, 0, 4000, 3000);
  return c.toDataURL('image/png');
});
await page.setInputFiles('#merge-input', [
  { name: 'big1.png', mimeType: 'image/png', buffer: Buffer.from(big.split(',')[1], 'base64') },
  { name: 'big2.png', mimeType: 'image/png', buffer: Buffer.from(big.split(',')[1], 'base64') },
  { name: 'big3.png', mimeType: 'image/png', buffer: Buffer.from(big.split(',')[1], 'base64') },
  { name: 'big4.png', mimeType: 'image/png', buffer: Buffer.from(big.split(',')[1], 'base64') },
  { name: 'big5.png', mimeType: 'image/png', buffer: Buffer.from(big.split(',')[1], 'base64') }
]);
await page.waitForSelector('#merge-workspace:not([hidden])');
await page.waitForTimeout(400);
await page.click('#merge-apply');
await page.waitForTimeout(600);
const guard = await text('#merge-notice');
// 5 × 4000 px Breite + 4 × 40 px Abstand = 20160 px, also über der Grenze von 12000.
push('5 × 4000 px wird abgefangen (20160 px)', guard.includes('20160'), guard);
push('Download bleibt in dem Fall verborgen', await page.$eval('#merge-download', el => el.hidden), 'hidden');

/* ---------- 13. Responsive: horizontales Überlaufen ---------- */
await page.click('#merge-clear');
await page.setInputFiles('#merge-input', [
  { name: 'ein-sehr-langer-dateiname-zum-testen-der-umbrechung.png', mimeType: 'image/png', buffer: Buffer.from(files.a.split(',')[1], 'base64') },
  { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(files.b.split(',')[1], 'base64') },
  { name: 'c.png', mimeType: 'image/png', buffer: Buffer.from(files.c.split(',')[1], 'base64') }
]);
await page.waitForSelector('#merge-workspace:not([hidden])');

const overflow = [];
for (const width of [320, 375, 390, 768, 1024]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const res = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > doc.clientWidth + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        offenders.push(`${el.tagName.toLowerCase()}.${cls.split(' ')[0]}@${Math.round(r.right)}`);
      }
    });
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 6) };
  });
  overflow.push([width, res]);
  push(
    `Kein horizontales Überlaufen bei ${width} px`,
    res.scrollWidth <= res.clientWidth + 1,
    `scroll ${res.scrollWidth} / client ${res.clientWidth} ${res.offenders.join(' ') || ''}`
  );
}

/* ---------- 14. Tote Links auf der Seite ---------- */
await page.setViewportSize({ width: 1440, height: 1000 });
const hrefs = await page.$$eval('a[href^="/"]', els => [...new Set(els.map(e => e.getAttribute('href')))]);
const broken = [];
for (const href of hrefs) {
  const res = await page.request.get(base + href);
  if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
}
push(`Alle ${hrefs.length} internen Links erreichbar`, broken.length === 0, broken.join(', '));

/* ---------- 15. Konsolenfehler ---------- */
push('Keine JS-Fehler in der Konsole', errors.length === 0, errors.join(' | '));

/* ---------- Ausgabe ---------- */
console.log('');
const width = Math.max(...results.map(r => r[0].length));
for (const [name, state, detail] of results) {
  console.log(`${state.padEnd(7)} ${name.padEnd(width)}  ${detail}`);
}
const failed = results.filter(r => r[1] !== 'OK').length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
