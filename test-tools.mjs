/**
 * End-to-End-Test der fünf Werkzeuge.
 * Prüft den zweistufigen Ablauf: verarbeiten (mit Fortschritt) → herunterladen.
 * Voraussetzung: `npm run build` und ein Server auf 127.0.0.1:8080.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await ctx.addInitScript(() => localStorage.setItem('bf-consent', 'essential'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

/* ---------- Testbild ---------- */
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 400;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 600, 400);
  g.addColorStop(0, '#5227ff');
  g.addColorStop(1, '#ff9ffc');
  x.fillStyle = g;
  x.fillRect(0, 0, 600, 400);
  x.fillStyle = '#fff';
  x.font = 'bold 48px sans-serif';
  x.fillText('TEST', 40, 220);
  return c.toDataURL('image/png');
});
writeFileSync('/tmp/test-bild.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('Testbild erzeugt (600 × 400 PNG)');

const results = [];
const push = (name, ok, detail) => results.push([name, ok ? 'OK' : 'FEHLER', detail]);
const text = async sel => (await page.textContent(sel))?.replace(/\s+/g, ' ').trim() ?? '';

/**
 * Gemeinsamer Ablauf: Datei wählen, verarbeiten, Fortschritt beobachten,
 * Download-Knopf prüfen und den Download tatsächlich auslösen.
 */
async function runTool({ path, input, apply, download, stats }) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.setInputFiles(input, '/tmp/test-bild.png');
  await page.waitForSelector(path.includes('zuschneiden') ? '#crop-workspace:not([hidden])' : `${input.replace('-input', '-workspace')}:not([hidden])`, { timeout: 10000 });

  const beforeHidden = await page.getAttribute(download, 'hidden');
  await page.click(apply);

  // Fortschrittsleiste muss erscheinen, während verarbeitet wird
  let progressSeen = false;
  try {
    await page.waitForSelector('.progress:not([hidden])', { timeout: 2500 });
    progressSeen = true;
  } catch {
    progressSeen = false;
  }

  await page.waitForSelector(`${download}:not([hidden])`, { timeout: 6000 });
  const href = await page.getAttribute(download, 'href');
  const statsText = await text(stats);

  const [downloadEvent] = await Promise.all([
    page.waitForEvent('download', { timeout: 6000 }),
    page.click(download)
  ]);
  const filename = downloadEvent.suggestedFilename();
  await downloadEvent.cancel().catch(() => undefined);

  return {
    ok: beforeHidden !== null && progressSeen && href?.startsWith('blob:') && filename.length > 3,
    detail: `Fortschritt ${progressSeen ? 'ja' : 'NEIN'} · blob ${href?.startsWith('blob:') ? 'ja' : 'NEIN'} · Datei "${filename}" · ${statsText}`
  };
}

/* ---------- 1. Zuschneiden ---------- */
{
  const r = await runTool({
    path: '/bild-zuschneiden/',
    input: '#crop-input',
    apply: '#crop-apply',
    download: '#crop-download',
    stats: '#crop-stats'
  });
  push('Zuschneiden', r.ok, r.detail);
}

/* ---------- 2. Komprimieren ---------- */
{
  const r = await runTool({
    path: '/bild-komprimieren/',
    input: '#compress-input',
    apply: '#compress-apply',
    download: '#compress-download',
    stats: '#compress-stats'
  });
  push('Komprimieren', r.ok, r.detail);
}

/* ---------- 3. Größe ändern (inkl. Ergebnis-Vorschau) ---------- */
{
  await page.goto(base + '/bildgroesse-aendern/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#resize-input', '/tmp/test-bild.png');
  await page.waitForSelector('#resize-workspace:not([hidden])', { timeout: 10000 });
  await page.fill('#resize-width', '300');
  await page.dispatchEvent('#resize-width', 'input');
  await page.click('#resize-apply');
  await page.waitForSelector('#resize-download:not([hidden])', { timeout: 6000 });
  const previewShown = await page.isVisible('#resize-result');
  const previewSrc = await page.getAttribute('#resize-result-img', 'src');
  const badge = await text('#resize-result-size');
  const statsText = await text('#resize-stats');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }), page.click('#resize-download')]);
  const name = dl.suggestedFilename();
  await dl.cancel().catch(() => undefined);
  push(
    'Größe ändern',
    previewShown && previewSrc?.startsWith('blob:') && statsText.includes('300 × 200') && name.includes('300x200'),
    `Vorschau ${previewShown ? 'ja' : 'NEIN'} · Badge "${badge}" · Datei "${name}" · ${statsText}`
  );
}

/* ---------- 4. Konvertieren ---------- */
{
  const r = await runTool({
    path: '/bild-konvertieren/',
    input: '#convert-input',
    apply: '#convert-apply',
    download: '#convert-download',
    stats: '#convert-stats'
  });
  push('Konvertieren', r.ok, r.detail);
}

/* ---------- 5. Wasserzeichen ---------- */
{
  await page.goto(base + '/wasserzeichen-hinzufuegen/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#wm-input', '/tmp/test-bild.png');
  await page.waitForSelector('#wm-workspace:not([hidden])', { timeout: 10000 });
  await page.fill('#wm-text', '© test.de');
  await page.click('#wm-apply');
  await page.waitForSelector('#wm-download:not([hidden])', { timeout: 6000 });
  const statsText = await text('#wm-stats');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }), page.click('#wm-download')]);
  const name = dl.suggestedFilename();
  await dl.cancel().catch(() => undefined);
  push('Wasserzeichen', name.includes('wasserzeichen') && statsText.includes('600 × 400'), `Datei "${name}" · ${statsText}`);
}

/* ---------- 6. Ergebnis wird bei Parameteränderung ungültig ---------- */
{
  await page.goto(base + '/bild-komprimieren/', { waitUntil: 'networkidle' });
  await page.setInputFiles('#compress-input', '/tmp/test-bild.png');
  await page.waitForSelector('#compress-workspace:not([hidden])', { timeout: 10000 });
  await page.click('#compress-apply');
  await page.waitForSelector('#compress-download:not([hidden])', { timeout: 6000 });
  await page.fill('#compress-quality', '20');
  await page.dispatchEvent('#compress-quality', 'input');
  await page.waitForTimeout(400);
  const stillVisible = await page.isVisible('#compress-download');
  push('Ergebnis invalidiert', !stillVisible, stillVisible ? 'Download blieb sichtbar' : 'Download korrekt ausgeblendet');
}

/* ---------- 7. „Anderes Bild“ bringt die Ablagefläche zurück in den Blick ---------- */
{
  const seiten = [
    ['/bild-komprimieren/', '#compress-input', '#compress-apply', '#compress-download', '#compress-reset', '#compress-zone'],
    ['/bild-zuschneiden/', '#crop-input', '#crop-apply', '#crop-download', '#crop-reset', '#crop-zone'],
    ['/bildgroesse-aendern/', '#resize-input', '#resize-apply', '#resize-download', '#resize-reset', '#resize-zone'],
    ['/bild-konvertieren/', '#convert-input', '#convert-apply', '#convert-download', '#convert-reset', '#convert-zone'],
    ['/wasserzeichen-hinzufuegen/', '#wm-input', '#wm-apply', '#wm-download', '#wm-reset', '#wm-zone']
  ];
  const schief = [];
  for (const [pfad, input, apply, dl, reset, zone] of seiten) {
    await page.goto(base + pfad, { waitUntil: 'networkidle' });
    await page.setInputFiles(input, '/tmp/test-bild.png');
    await page.waitForSelector(apply, { state: 'visible', timeout: 10000 });
    await page.click(apply);
    await page.waitForSelector(`${dl}:not([hidden])`, { timeout: 8000 });
    await page.locator(reset).scrollIntoViewIfNeeded();
    const startY = await page.evaluate(() => Math.round(window.scrollY));
    await page.click(reset);

    // Sanftes Scrollen braucht einen Moment – bis zu 2 s auf das Ergebnis warten.
    let lage = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100);
      lage = await page.evaluate(sel => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        if (!r) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
      }, zone);
      if (lage && lage.top >= 0 && lage.bottom <= lage.vh) break;
    }

    const imBlick = !!lage && lage.top >= 0 && lage.bottom <= lage.vh;
    const urlGleich = page.url().endsWith(pfad);
    if (!imBlick || !urlGleich) {
      schief.push(`${pfad}: top=${lage?.top} bottom=${lage?.bottom} vh=${lage?.vh} (scrollY ${startY})${urlGleich ? '' : ' · URL geändert'}`);
    }
  }
  push(
    'Anderes Bild',
    schief.length === 0,
    schief.length === 0 ? 'Ablagefläche in allen 5 Werkzeugen wieder vollständig sichtbar' : schief.join(' | ')
  );
}

/* ---------- 8. Interne Links ---------- */
{
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/"]')).map(a => a.getAttribute('href'))
  );
  const broken = [];
  for (const href of [...new Set(links)]) {
    const res = await page.request.get(base + href);
    if (res.status() !== 200) broken.push(`${href} -> ${res.status()}`);
  }
  push('Interne Links', broken.length === 0, broken.length ? broken.join(', ') : `${new Set(links).size} Ziele erreichbar`);
}

console.log('\n=== FUNKTIONSTEST ===');
for (const [name, status, detail] of results) console.log(`${status.padEnd(7)} ${name}: ${detail}`);
console.log('\n=== KONSOLENFEHLER ===');
console.log(errors.length ? [...new Set(errors)].join('\n') : 'keine');

await browser.close();
if (results.some(r => r[1] !== 'OK')) process.exitCode = 1;
