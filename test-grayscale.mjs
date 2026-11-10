/**
 * Funktionstest für /bild-in-graustufen/.
 * Voraussetzung: npm run build && npm run serve (Port 8080).
 *
 * Der Kern ist die Rechnung selbst: Die Grauwerte reiner Farben werden aus der
 * Vorschau zurückgelesen und mit den Werten verglichen, die auf der Seite stehen.
 * Wenn dort 54 / 182 / 18 behauptet wird, muss das Werkzeug genau das liefern.
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

/* ---------- Testbilder ---------- */
const images = await page.evaluate(() => {
  // Vier Viertel: reines Rot, Grün, Blau, Mittelgrau – je 100 × 100 px.
  const quad = document.createElement('canvas');
  quad.width = 200;
  quad.height = 200;
  const q = quad.getContext('2d');
  const fill = (x, y, color) => {
    q.fillStyle = color;
    q.fillRect(x, y, 100, 100);
  };
  fill(0, 0, '#ff0000');
  fill(100, 0, '#00ff00');
  fill(0, 100, '#0000ff');
  fill(100, 100, '#808080');

  // Flau: Grauwerte 100–149 über die Breite, sonst nichts.
  const flat = document.createElement('canvas');
  flat.width = 50;
  flat.height = 10;
  const f = flat.getContext('2d');
  const frame = f.createImageData(50, 10);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 50; x += 1) {
      const v = 100 + x;
      const i = (y * 50 + x) * 4;
      frame.data[i] = v;
      frame.data[i + 1] = v;
      frame.data[i + 2] = v;
      frame.data[i + 3] = 255;
    }
  }
  f.putImageData(frame, 0, 0);

  // Halb transparent: linke Hälfte deckend rot, rechte Hälfte vollständig transparent.
  const alpha = document.createElement('canvas');
  alpha.width = 100;
  alpha.height = 50;
  const a = alpha.getContext('2d');
  a.fillStyle = '#ff0000';
  a.fillRect(0, 0, 50, 50);

  return {
    quad: quad.toDataURL('image/png'),
    flat: flat.toDataURL('image/png'),
    alpha: alpha.toDataURL('image/png')
  };
});

const asFile = (dataUrl, name) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(dataUrl.split(',')[1], 'base64')
});

/** Liest Pixel direkt aus dem Vorschau-Canvas im Dokument. */
const sample = points =>
  page.evaluate(pts => {
    const canvas = document.querySelector('#gray-out');
    if (!canvas || !canvas.width) return { error: 'keine Vorschau' };
    const x = canvas.getContext('2d');
    const out = { w: canvas.width, h: canvas.height };
    for (const [label, px, py] of pts) {
      out[label] = Array.from(x.getImageData(px, py, 1, 1).data);
    }
    return out;
  }, points);

const loadImage = async (dataUrl, name, width) => {
  await page.setInputFiles('#gray-input', asFile(dataUrl, name));
  await page.waitForSelector('#gray-workspace:not([hidden])', { timeout: 10000 });
  await page.waitForFunction(w => document.querySelector('#gray-out')?.width === w, width, {
    timeout: 10000
  });
  await page.waitForTimeout(350);
};

const setSpread = async value => {
  await page.$eval(
    '#gray-spread',
    (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    String(value)
  );
  await page.waitForTimeout(400);
};

/* ---------- 1. Laden ---------- */
await page.goto(base + '/bild-in-graustufen/', { waitUntil: 'networkidle' });
await loadImage(images.quad, 'quadrate.png', 200);

const figures = await page.$$eval('.gray-compare figure', els => els.length);
push('Zwei Vorschauen (Original und Ergebnis)', figures === 2, String(figures));

/* ---------- 2. Helligkeit (Rec. 709) ---------- */
let s = await sample([
  ['rot', 50, 50],
  ['gruen', 150, 50],
  ['blau', 50, 150],
  ['grau', 150, 150]
]);
push(
  'Helligkeit: Rot 54, Grün 182, Blau 18, Grau 128',
  s.rot[0] === 54 && s.gruen[0] === 182 && s.blau[0] === 18 && s.grau[0] === 128,
  `${s.rot[0]} / ${s.gruen[0]} / ${s.blau[0]} / ${s.grau[0]}`
);
push(
  'Alle drei Kanäle sind gleich (echtes Graustufenbild)',
  s.rot[0] === s.rot[1] && s.rot[1] === s.rot[2],
  JSON.stringify(s.rot)
);

/* ---------- 3. Mittelwert ---------- */
await page.click('#gray-method button[data-method="mean"]');
await page.waitForTimeout(400);
s = await sample([
  ['rot', 50, 50],
  ['gruen', 150, 50],
  ['blau', 50, 150],
  ['grau', 150, 150]
]);
push(
  'Mittelwert: alle reinen Farben 85, Grau bleibt 128',
  s.rot[0] === 85 && s.gruen[0] === 85 && s.blau[0] === 85 && s.grau[0] === 128,
  `${s.rot[0]} / ${s.gruen[0]} / ${s.blau[0]} / ${s.grau[0]}`
);

/* ---------- 4. Zurück auf Helligkeit ---------- */
await page.click('#gray-method button[data-method="luma"]');
await page.waitForTimeout(400);
s = await sample([
  ['rot', 50, 50],
  ['gruen', 150, 50]
]);
push('Umschalten zurück auf Helligkeit wirkt sofort', s.rot[0] === 54 && s.gruen[0] === 182, `${s.rot[0]} / ${s.gruen[0]}`);

/* ---------- 5. Tonwertspreizung ---------- */
await loadImage(images.flat, 'flau.png', 50);
let flat = await sample([
  ['dunkel', 0, 5],
  ['mitte', 25, 5],
  ['hell', 49, 5]
]);
push(
  'Ohne Spreizung: Werte bleiben 100 / 125 / 149',
  flat.dunkel[0] === 100 && flat.mitte[0] === 125 && flat.hell[0] === 149,
  `${flat.dunkel[0]} / ${flat.mitte[0]} / ${flat.hell[0]}`
);

await setSpread(100);
push('Anzeige der Spreizung steht auf 100 %', (await text('#gray-spread-value')) === '100 %', await text('#gray-spread-value'));

flat = await sample([
  ['dunkel', 0, 5],
  ['mitte', 25, 5],
  ['hell', 49, 5]
]);
push(
  'Spreizung 100 %: 100→0, 125→130, 149→255',
  flat.dunkel[0] === 0 && flat.hell[0] === 255 && Math.abs(flat.mitte[0] - 130) <= 1,
  `${flat.dunkel[0]} / ${flat.mitte[0]} / ${flat.hell[0]}`
);

await setSpread(50);
flat = await sample([['dunkel', 0, 5], ['hell', 49, 5]]);
push(
  'Spreizung 50 % liegt zwischen beiden Extremen',
  flat.dunkel[0] > 0 && flat.dunkel[0] < 100 && flat.hell[0] > 149 && flat.hell[0] < 255,
  `${flat.dunkel[0]} / ${flat.hell[0]}`
);

/* ---------- 6. Herunterladen in voller Auflösung ---------- */
await setSpread(0);
await loadImage(images.quad, 'quadrate.png', 200);
await page.click('#gray-apply');
await page.waitForSelector('#gray-download:not([hidden])', { timeout: 20000 });
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.click('#gray-download')
]);
const path = '/tmp/gray-out.bin';
await dl.saveAs(path);
const b64 = readFileSync(path).toString('base64');
push('PNG-Dateiname endet auf -graustufen.png', dl.suggestedFilename() === 'quadrate-graustufen.png', dl.suggestedFilename());
push('Statistik zeigt 200 × 200 px', (await text('#gray-stats')).includes('200 × 200'), await text('#gray-stats'));

const downloaded = await page.evaluate(async data => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const at = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data)[0];
  return { w: img.naturalWidth, h: img.naturalHeight, rot: at(50, 50), gruen: at(150, 50) };
}, b64);
push(
  'Heruntergeladene Datei ist 200 × 200 px und hält die Werte',
  downloaded.w === 200 && downloaded.h === 200 && downloaded.rot === 54 && downloaded.gruen === 182,
  `${downloaded.w} × ${downloaded.h}, Rot ${downloaded.rot}, Grün ${downloaded.gruen}`
);

/* ---------- 7. JPG-Ausgabe ---------- */
await page.click('#gray-format button[data-format="image/jpeg"]');
push(
  'JPG blendet die Qualitätsstufe ein',
  await page.$eval('#gray-quality-row', el => !el.classList.contains('hidden')),
  'sichtbar'
);
await page.click('#gray-apply');
await page.waitForSelector('#gray-download:not([hidden])', { timeout: 20000 });
const [dl2] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.click('#gray-download')
]);
const path2 = '/tmp/gray-out.jpg';
await dl2.saveAs(path2);
const jpg = readFileSync(path2);
push('JPG-Dateiname endet auf .jpg', dl2.suggestedFilename().endsWith('.jpg'), dl2.suggestedFilename());
push('Datei beginnt mit JPEG-Signatur', jpg.subarray(0, 3).toString('hex') === 'ffd8ff', jpg.subarray(0, 3).toString('hex'));
const jpgPixel = await page.evaluate(async data => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  return Array.from(x.getImageData(50, 50, 1, 1).data);
}, path2 && readFileSync(path2).toString('base64'));
push(
  'JPG-Inhalt ist grau (Rot ≈ 54, Kanäle gleich)',
  Math.abs(jpgPixel[0] - 54) <= 3 && Math.abs(jpgPixel[0] - jpgPixel[1]) <= 2,
  JSON.stringify(jpgPixel)
);

/* ---------- 8. Transparenz bleibt bei PNG ---------- */
await page.click('#gray-format button[data-format="image/png"]');
await loadImage(images.alpha, 'transparent.png', 100);
const alpha = await sample([
  ['deckend', 20, 25],
  ['durchsichtig', 80, 25]
]);
push('PNG: deckender Pixel bleibt deckend', alpha.deckend[3] === 255, JSON.stringify(alpha.deckend));
push('PNG: durchsichtiger Pixel bleibt durchsichtig', alpha.durchsichtig[3] === 0, JSON.stringify(alpha.durchsichtig));
push('PNG: Rot wurde zu Grau 54 umgerechnet', alpha.deckend[0] === 54, String(alpha.deckend[0]));

/* ---------- 9. Zurücksetzen ---------- */
await page.click('#gray-reset');
push('Zurücksetzen zeigt die Ablagefläche', await page.$eval('#gray-zone', el => !el.hidden), 'sichtbar');
push('Zurücksetzen blendet den Arbeitsbereich aus', await page.$eval('#gray-workspace', el => el.hidden), 'hidden');

/* ---------- 10. Responsive ---------- */
await loadImage(images.quad, 'quadrate.png', 200);
for (const width of [320, 375, 390, 768, 1024]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(180);
  const res = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  push(
    `Kein horizontales Überlaufen bei ${width} px`,
    res.scrollWidth <= res.clientWidth + 1,
    `scroll ${res.scrollWidth} / client ${res.clientWidth}`
  );
}

/* ---------- 11. Tote Links ---------- */
await page.setViewportSize({ width: 1440, height: 1000 });
const hrefs = await page.$$eval('a[href^="/"]', els => [...new Set(els.map(e => e.getAttribute('href')))]);
const broken = [];
for (const href of hrefs) {
  const res = await page.request.get(base + href);
  if (res.status() !== 200) broken.push(`${href} → ${res.status()}`);
}
push(`Alle ${hrefs.length} internen Links erreichbar`, broken.length === 0, broken.join(', '));

/* ---------- 12. Zahlen auf der Seite stimmen mit der Rechnung ---------- */
const pageText = await text('.prose');
push(
  'Seitentabelle nennt 54 / 182 / 18 / 237',
  ['54', '182', '18', '237'].every(v => pageText.includes(v)),
  'Werte im Text gefunden'
);

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
