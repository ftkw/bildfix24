#!/usr/bin/env node
/**
 * scripts/make-pins.mjs —— erzeugt die Pinterest-Grafiken (1000 × 1500, 2:3).
 *
 * Warum HTML statt Bildmodell: die Pins bestehen zur Hälfte aus Zahlen. Ein
 * generatives Bildmodell schreibt Ziffernfolgen zuverlässig falsch, und eine
 * Grafik mit „1080 × 1340" ist schlimmer als gar keine. HTML + Chromium liefert
 * exakte Typografie, reproduzierbar bei jeder Änderung.
 *
 * Aufruf:  node scripts/make-pins.mjs [zielordner]
 * Ergebnis: 8 PNG à 2000 × 3000 (2× von 1000 × 1500 gerendert, damit Pinterest
 *           beim Herunterrechnen auf 1000 px scharf bleibt).
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXE =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const OUT = process.argv[2] ?? path.resolve(process.cwd(), '../docs/pinterest');
const URL_BASE = 'bildfix24.pages.dev';
const STAND = 'Stand: November 2026';

/** @typedef {{ k?: string, v: string, n?: string }} Row */

const pins = [
  {
    slug: '01-drei-formate',
    kicker: 'Bildgrößen 2026',
    title: 'Drei Formate reichen für fast alle Netzwerke',
    lead: 'Wer nicht für jede Plattform neu exportieren will, kommt mit diesen drei Dateien aus.',
    rows: [
      { k: '4:5', rw: 4, rh: 5, v: '1080 × 1350', n: 'Feed: Instagram, Facebook, LinkedIn' },
      { k: '9:16', rw: 9, rh: 16, v: '1080 × 1920', n: 'Story, Reel, TikTok' },
      { k: '1,91:1', rw: 1.91, rh: 1, v: '1200 × 628', n: 'Link-Vorschau in Beiträgen und Chats' }
    ],
    foot: 'Das hochkante 4:5-Format ist der beste Kompromiss – es füllt im Feed 25 % mehr Höhe als ein Quadrat.'
  },
  {
    slug: '02-instagram',
    kicker: 'Instagram',
    title: 'Welche Größe Instagram wirklich annimmt',
    lead: 'Instagram akzeptiert Breiten von 320 bis 1080 px und Verhältnisse zwischen 1,91:1 und 3:4. Alles andere wird beschnitten.',
    rows: [
      { k: '1:1', rw: 1, rh: 1, v: '1080 × 1080', n: 'Feed quadratisch' },
      { k: '4:5', rw: 4, rh: 5, v: '1080 × 1350', n: 'Feed hochkant – Standard für Fotos' },
      { k: '3:4', rw: 3, rh: 4, v: '1080 × 1440', n: 'Die höchste Form, die unbeschnitten durchkommt' },
      { k: '9:16', rw: 9, rh: 16, v: '1080 × 1920', n: 'Story und Reels' },
      { k: '1:1,55', rw: 1, rh: 1.55, v: '420 × 654', n: 'Reel-Cover' }
    ],
    foot: 'Text in Stories nicht in die oberen und unteren 250 px legen – dort liegen die Bedienelemente.'
  },
  {
    slug: '03-pinterest',
    kicker: 'Pinterest',
    title: 'Warum dein Pin 1000 × 1500 sein sollte',
    big: { value: '1000 × 1500', label: '2:3 – das Standard-Pin-Format' },
    rows: [
      { k: '2:3', rw: 2, rh: 3, v: '1000 × 1500', n: 'Standard-Pin' },
      { k: '9:16', rw: 9, rh: 16, v: '1080 × 1920', n: 'Idea Pin' },
      { k: '–', v: 'max. 20 MB', n: 'Dateigröße beim Upload im Web' }
    ],
    foot: 'Alles, was deutlich höher als 2:3 ist, wird im Feed abgeschnitten. Lieber exakt 2:3 exportieren als „möglichst hoch".'
  },
  {
    slug: '04-passfoto',
    kicker: 'Passfoto',
    title: '35 × 45 mm sind 413 × 531 Pixel',
    big: { value: '35 × 45 mm', label: 'biometrisches Passfoto, bei 300 dpi = 413 × 531 px' },
    rows: [
      { k: 'Kopf', v: '32 – 36 mm', n: 'von Kinn bis Scheitel' },
      { k: '300 dpi', v: '413 × 531 px', n: 'Fotostandard für den Druck' },
      { k: 'Hintergrund', v: 'einfarbig hell', n: 'keine Schatten, kein Muster' }
    ],
    foot: 'Die Maße allein reichen nicht: Gesichtshöhe, Ausleuchtung und Hintergrund sind ebenfalls vorgeschrieben.'
  },
  {
    slug: '05-warum-1080',
    kicker: 'Warum 1080 px?',
    title: '390 CSS-Pixel × Faktor 2,75 = 1080',
    lead: 'Smartphones melden dem Browser rund 390 bis 430 CSS-Pixel Breite und bilden mit Faktor 2,5 bis 3 ab. Deshalb zeigen fast alle Netzwerke Bilder in 1080 px Breite.',
    rows: [
      { k: 'breiter', v: 'wird heruntergerechnet', n: 'kostet nur Upload-Zeit' },
      { k: 'schmaler', v: 'bleibt unscharf', n: 'Hochrechnen erzeugt keine Details' }
    ],
    foot: 'Ein 600 px breites Foto bleibt auch nach dem Skalieren auf 1080 px weich. Das ist keine Einstellung, sondern Physik.'
  },
  {
    slug: '06-druck',
    kicker: 'Druck',
    title: 'So viele Pixel braucht jedes Format',
    lead: 'Im Druck zählt nicht die Pixelzahl, sondern die Auflösung: 300 dpi sind 118 Pixel pro Zentimeter.',
    rows: [
      { k: '9 × 13 cm', v: '1063 × 1535', n: 'kleiner Abzug' },
      { k: '10 × 15 cm', v: '1181 × 1772', n: 'Drogeriemarkt-Standard' },
      { k: '13 × 18 cm', v: '1535 × 2126', n: 'klassisches Fotopapier' },
      { k: 'DIN A4', v: '2480 × 3508', n: 'Bewerbungsmappe, Ausdruck' }
    ],
    foot: 'Für 150 dpi halbiert sich die Pixelzahl in jeder Richtung – das reicht, wenn man den Ausdruck mit Abstand betrachtet.'
  },
  {
    slug: '07-youtube',
    kicker: 'YouTube',
    title: 'Vorschaubild: 1280 × 720, maximal 2 MB',
    big: { value: '1280 × 720', label: '16:9 – mindestens 640 px breit, JPG oder PNG' },
    rows: [
      { k: '16:9', rw: 16, rh: 9, v: '1280 × 720', n: 'Vorschaubild' },
      { k: '16:9', rw: 16, rh: 9, v: '2560 × 1440', n: 'Kanalbanner' },
      { k: 'max.', v: '2 MB', n: 'Dateigröße des Vorschaubilds' }
    ],
    foot: 'Beim Kanalbanner ist nur die mittlere Fläche auf allen Geräten sichtbar – Text dort bündeln, nicht am Rand.'
  },
  {
    slug: '08-pixel-vs-kb',
    kicker: 'Dateigröße',
    title: 'Pixel und Kilobyte sind zwei verschiedene Grenzen',
    lead: 'Ein und dasselbe Bild kann 120 KB oder 4 MB groß sein. Die Pixelzahl entscheidet über Schärfe, die Dateigröße über Upload-Grenzen.',
    rows: [
      { k: '1080 × 1350', v: '≈ 120 KB', n: 'als JPG, Qualität 80 %' },
      { k: '1080 × 1350', v: '> 4 MB', n: 'als PNG mit voller Farbtiefe' }
    ],
    foot: 'Reihenfolge beim Verkleinern: erst die Pixel, dann das Format, dann die Kompression. Umgekehrt verliert man zweimal Qualität.'
  }
];

const CSS = `
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --brand: #5227ff;
    --brand-ink: #3d17d6;
    --ink: #0b0b12;
    --soft: #34343f;
    --muted: #6b6b7b;
    --bg-soft: #f7f7fb;
    --line: rgba(11, 11, 18, 0.10);
  }
  html, body { width: 1000px; height: 1500px; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
  }
  .pin {
    position: relative;
    width: 1000px;
    height: 1500px;
    padding: 80px 84px 76px;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    position: absolute;
    inset: 0 0 auto 0;
    height: 14px;
    background: linear-gradient(100deg, #5227ff 0%, #a855f7 45%, #ff9ffc 100%);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .dot {
    width: 34px; height: 34px; border-radius: 11px;
    background: linear-gradient(135deg, #5227ff, #a855f7 60%, #ff9ffc);
  }
  .kicker {
    margin-top: 62px;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--brand);
  }
  h1 {
    margin-top: 22px;
    font-size: 74px;
    line-height: 1.04;
    letter-spacing: -0.035em;
    font-weight: 800;
    text-wrap: balance;
  }
  .lead {
    margin-top: 28px;
    font-size: 27px;
    line-height: 1.42;
    color: var(--soft);
    max-width: 800px;
    text-wrap: pretty;
  }
  .big {
    margin-top: 54px;
    padding: 40px 44px;
    border-radius: 26px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
  }
  .big .value {
    font-variant-numeric: tabular-nums;
    font-size: 92px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: -0.055em;
    color: var(--brand-ink);
  }
  .big .label {
    margin-top: 16px;
    font-size: 25px;
    line-height: 1.35;
    color: var(--muted);
  }
  .rows {
    margin-top: 40px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  /* Jede Zeile bekommt denselben Anteil der Resthöhe. Dadurch füllt die Tabelle
     die 2:3-Fläche, statt unten ein Loch zu lassen – und bleibt bei 3 wie bei 5
     Zeilen im selben Raster. */
  .row {
    flex: 1;
    display: grid;
    grid-template-columns: 166px 1fr;
    gap: 30px;
    align-items: center;
    padding: 16px 4px;
    border-top: 1px solid var(--line);
  }
  .row:last-child { border-bottom: 1px solid var(--line); }
  .shape { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .box {
    border: 2.5px solid var(--brand);
    border-radius: 9px;
    background: rgba(82, 39, 255, 0.08);
  }
  .shape--plain { justify-content: center; }
  .k {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 22px;
    font-weight: 600;
    color: var(--brand);
    white-space: nowrap;
  }
  .shape--plain .k { color: var(--muted); }
  .v {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    white-space: nowrap;
  }
  .row .v.words { font-size: 33px; white-space: normal; }
  .n {
    display: block;
    margin-top: 8px;
    font-size: 23px;
    font-weight: 400;
    color: var(--muted);
    letter-spacing: 0;
    white-space: normal;
  }
  .pin--dense .kicker { margin-top: 46px; }
  .pin--dense h1 { font-size: 62px; }
  .pin--dense .lead { font-size: 24px; margin-top: 20px; }
  .pin--dense .row { padding: 10px 4px; }
  .pin--dense .v { font-size: 33px; }
  .pin--dense .n { font-size: 21px; margin-top: 6px; }
  .pin--dense .foot { margin-top: 30px; padding-top: 22px; font-size: 23px; }
  .spacer { flex: 1; }
  .foot {
    margin-top: 44px;
    padding-top: 26px;
    border-top: 2px solid var(--ink);
    font-size: 25px;
    line-height: 1.42;
    color: var(--soft);
  }
  .bottom {
    margin-top: 26px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 22px;
    color: var(--muted);
  }
  .bottom b { color: var(--ink); font-weight: 600; }
`;

const MAXW = 128;

/** Rechnet das Seitenverhältnis in eine Box fester Maximalgröße um. */
function shape(rw, rh, maxH) {
  const r = rw / rh;
  const w = r > MAXW / maxH ? MAXW : maxH * r;
  const h = r > MAXW / maxH ? MAXW / r : maxH;
  return `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`;
}

function rowsHtml(rows, maxH) {
  return rows
    .map((r) => {
      const hasRatio = typeof r.rw === 'number' && typeof r.rh === 'number';
      const box = hasRatio ? `<div class="box" style="${shape(r.rw, r.rh, maxH)}"></div>` : '';
      return `<div class="row">
        <div class="shape${hasRatio ? '' : ' shape--plain'}">${box}<span class="k">${r.k ?? ''}</span></div>
        <div class="v${/[a-zäöü]/i.test(r.v) ? ' words' : ''}">${r.v}${r.n ? `<span class="n">${r.n}</span>` : ''}</div>
      </div>`;
    })
    .join('');
}

function pinHtml(pin) {
  // Ab fünf Zeilen wird es eng: kleinere Schrift, kleinere Verhältnis-Boxen.
  // Sonst schiebt die Tabelle den Fuß aus der 1500-px-Fläche heraus.
  const dense = pin.rows.length >= 5;
  const maxH = dense ? 74 : 112;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="pin${dense ? ' pin--dense' : ''}">
  <div class="topbar"></div>
  <div class="brand"><span class="dot"></span><span>bildfix24</span></div>
  <div class="kicker">${pin.kicker}</div>
  <h1>${pin.title}</h1>
  ${pin.lead ? `<p class="lead">${pin.lead}</p>` : ''}
  ${pin.big ? `<div class="big"><div class="value">${pin.big.value}</div><div class="label">${pin.big.label}</div></div>` : ''}
  <div class="rows">${rowsHtml(pin.rows, maxH)}</div>
  ${pin.foot ? `<div class="foot">${pin.foot}</div>` : ''}
  <div class="bottom"><span><b>${URL_BASE}</b></span><span>${STAND}</span></div>
</div></body></html>`;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const pin of pins) {
  const file = path.join(OUT, `${pin.slug}.html`);
  await writeFile(file, pinHtml(pin), 'utf8');
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const target = path.join(OUT, `${pin.slug}.png`);
  await page.screenshot({ path: target });
  const over = await page.evaluate(() => {
    const el = document.querySelector('.pin');
    return { h: el.scrollHeight, w: el.scrollWidth };
  });
  console.log(`${pin.slug}.png  ${over.w}×${over.h}${over.h > 1500 ? '  ⚠ ÜBERLAUF' : ''}`);
}

await ctx.close();
await browser.close();
console.log(`\n${pins.length} Pins in ${OUT}`);
