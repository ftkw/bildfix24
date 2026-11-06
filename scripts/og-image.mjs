/**
 * Erzeugt die Social-Vorschaukarte public/og.png (1200 × 630).
 *
 * Aufruf: node scripts/og-image.mjs
 *
 * Die Karte wird als HTML gerendert (2× Auflösung) und anschließend auf exakt
 * 1200 × 630 Pixel herunterskaliert – so bleiben Schriften scharf, ohne dass
 * eine 2400 px breite Datei ausgeliefert wird.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ziel = resolve(root, 'public/og.png');
const roh = resolve(root, 'public/.og-2x.png');

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #ffffff;
    color: #0b0b12;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    padding: 0 84px;
  }
  /* Zwei weiche Farbwolken als Hintergrund, identisch zur Markenfarbe der Seite. */
  .wolke {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.5;
  }
  .wolke--a { width: 620px; height: 620px; left: -180px; top: -260px; background: rgba(82, 39, 255, 0.28); }
  .wolke--b { width: 560px; height: 560px; right: -120px; bottom: -240px; background: rgba(255, 159, 252, 0.4); }

  .inhalt { position: relative; z-index: 1; display: flex; align-items: center; gap: 76px; width: 100%; }

  .text { flex: 1; }
  .marke { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
  .marke .tld { color: #6b6b7b; font-weight: 500; }
  .marke svg { border-radius: 11px; box-shadow: 0 10px 22px -12px rgba(82, 39, 255, 0.9); }

  h1 {
    margin-top: 30px;
    font-size: 62px;
    line-height: 1.06;
    letter-spacing: -0.035em;
    font-weight: 800;
    max-width: 660px;
  }
  /* Verlauf nur auf einer Zeile: über einen Zeilenumbruch hinweg würde
     background-clip:text den Verlauf pro Fragment neu starten. */
  h1 em {
    font-style: normal;
    display: inline-block;
    white-space: nowrap;
    background: linear-gradient(100deg, #5227ff 0%, #8b3ffb 55%, #d96bf5 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  p.unter {
    margin-top: 24px;
    font-size: 26px;
    line-height: 1.42;
    color: #34343f;
    max-width: 640px;
  }
  .pillen { display: flex; gap: 12px; margin-top: 34px; }
  .pille {
    font-size: 20px;
    font-weight: 600;
    color: #3d17d6;
    background: rgba(82, 39, 255, 0.08);
    border: 1px solid rgba(82, 39, 255, 0.16);
    border-radius: 999px;
    padding: 9px 20px;
  }

  /* Rechte Seite: angedeutete Bildkarte mit Verlauf */
  .karte {
    width: 330px;
    height: 400px;
    border-radius: 34px;
    background: linear-gradient(150deg, #5227ff 0%, #a855f7 52%, #ff9ffc 100%);
    box-shadow: 0 44px 80px -36px rgba(82, 39, 255, 0.72);
    position: relative;
    overflow: hidden;
    flex: none;
  }
  .karte::after {
    content: "";
    position: absolute;
    inset: 26px;
    border-radius: 22px;
    border: 2px dashed rgba(255, 255, 255, 0.55);
  }
  .karte .symbol { position: absolute; inset: 0; display: grid; place-items: center; }
</style></head>
<body>
  <div class="wolke wolke--a"></div>
  <div class="wolke wolke--b"></div>
  <div class="inhalt">
    <div class="text">
      <div class="marke">
        <svg width="42" height="42" viewBox="0 0 32 32" aria-hidden="true">
          <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#5227ff"/><stop offset="1" stop-color="#ff9ffc"/>
          </linearGradient></defs>
          <rect width="32" height="32" rx="9" fill="url(#g)"/>
          <path d="M7 22l5.2-6.4 3.9 4.1 3.1-3.2 5.8 5.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="21" cy="11" r="2" fill="#fff"/>
        </svg>
        <span>bildfix24</span>
      </div>
      <h1>Bilder bearbeiten<br /><em>ohne Upload</em></h1>
      <p class="unter">Zuschneiden, komprimieren, Größe ändern, konvertieren und Wasserzeichen setzen – direkt im Browser.</p>
      <div class="pillen">
        <span class="pille">Ohne Upload</span>
        <span class="pille">Ohne Anmeldung</span>
        <span class="pille">Kostenlos</span>
      </div>
    </div>
    <div class="karte">
      <div class="symbol">
        <svg width="120" height="120" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M4 24l8.4-10.4 6.2 6.6 4.8-5 5.2 8.8" fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="22" cy="9" r="2.6" fill="rgba(255,255,255,0.95)"/>
        </svg>
      </div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: roh });
await browser.close();

// Auf die von den Plattformen erwarteten Maße bringen.
execFileSync('sips', ['-z', '630', '1200', roh, '--out', ziel], { stdio: 'ignore' });
execFileSync('rm', ['-f', roh]);

const { statSync } = await import('node:fs');
console.log(`og.png geschrieben: ${(statSync(ziel).size / 1024).toFixed(0)} KB — ${ziel}`);
