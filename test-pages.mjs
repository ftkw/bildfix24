/**
 * Seitenweite Prüfung aller URLs aus der sitemap.
 *
 * Warum eigener Lauf: test-tools.mjs prüft die Werkzeuge an festen Seiten.
 * Wächst die Seite um neue Ratgeber- oder Longtail-Seiten, wird dort nichts
 * davon erfasst – genau dort passieren aber die typischen Fehler: fehlende
 * oder doppelte H1, abweichender canonical, leeres JSON-LD, horizontaler
 * Überlauf bei 390 px, Tippfehler in internen Links.
 *
 * Aufruf über `npm run test:e2e` (BASE_URL wird gesetzt) oder direkt:
 *   BASE_URL=http://127.0.0.1:8080 node test-pages.mjs
 */
import { chromium } from 'playwright-core';

const exe =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1247/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';

const results = [];
const push = (name, ok, detail) => results.push([name, ok ? 'OK' : 'FEHLER', detail]);

const sitemapXml = await (await fetch(base + '/sitemap.xml')).text();
// Die sitemap enthält absolute URLs mit der Produktionsdomain. Für den Test
// wird nur der Pfad übernommen und gegen BASE_URL gesetzt – sonst prüft der
// Lauf die bereits ausgelieferte Seite statt des lokalen Builds und meldet
// jede neue Seite als 404.
const paths = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
push('sitemap lesbar', paths.length > 0, `${paths.length} URLs`);

const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
const page = await ctx.newPage();

const jsErrors = [];
page.on('pageerror', e => jsErrors.push(e.message));

const internalTargets = new Set();
const seenPaths = new Map();
const problems = [];

for (const path of paths) {
  jsErrors.length = 0;
  const res = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 30000 });

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const h1 = [...document.querySelectorAll('h1')];
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    const desc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const title = document.title || '';
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')];
    let ldTypes = [];
    for (const s of ld) {
      try {
        const d = JSON.parse(s.textContent || '');
        for (const x of Array.isArray(d) ? d : [d]) {
          if (x && x['@type']) ldTypes.push(String(x['@type']));
          if (x && Array.isArray(x['@graph'])) {
            for (const g of x['@graph']) if (g && g['@type']) ldTypes.push(String(g['@type']));
          }
        }
      } catch {
        ldTypes.push('UNPARSEBAR');
      }
    }
    const overflow = [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > de.clientWidth + 1)
      .map(el => el.tagName.toLowerCase())
      .slice(0, 3);
    // Nur Links im Inhaltsbereich zählen: Header/Footer sind auf jeder Seite gleich.
    const links = [...document.querySelectorAll('main a[href^="/"], .prose a[href^="/"]')]
      .map(a => a.getAttribute('href') || '');
    return {
      title,
      desc,
      canonical,
      h1Count: h1.length,
      h1Text: (h1[0]?.innerText || '').trim().slice(0, 70),
      ldTypes,
      overflow,
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      links,
      faqEscaped: document.querySelectorAll('.faq__body').length
        ? [...document.querySelectorAll('.faq__body')].some(n => n.innerText.includes('<a href'))
        : false
    };
  });

  const here = [];
  if (!res || res.status() !== 200) here.push(`Status ${res ? res.status() : 'kein Response'}`);
  if (info.h1Count !== 1) here.push(`H1-Anzahl ${info.h1Count}`);
  if (!info.canonical) here.push('canonical fehlt');
  else {
    const expected = new URL(info.canonical).pathname;
    if (expected !== path) here.push(`canonical zeigt auf ${expected}`);
  }
  if (!info.desc || info.desc.length < 60) here.push(`description zu kurz (${info.desc.length})`);
  if (!info.title || info.title.length < 15) here.push(`title zu kurz (${info.title.length})`);
  if (info.title.length > 75) here.push(`title zu lang (${info.title.length})`);
  if (info.ldTypes.includes('UNPARSEBAR')) here.push('JSON-LD nicht parsebar');
  if (info.scrollW > info.clientW) here.push(`Überlauf ${info.scrollW}>${info.clientW} (${info.overflow.join(',')})`);
  if (info.faqEscaped) here.push('FAQ zeigt rohes <a href');
  if (jsErrors.length) here.push(`JS-Fehler: ${jsErrors[0].slice(0, 60)}`);

  if (here.length) {
    problems.push([path, here]);
    push(`${path}`, false, here.join(' | '));
  }

  seenPaths.set(path, info.h1Text);
  for (const l of info.links) internalTargets.add(l);
}

push('Alle Seiten ohne Befund', problems.length === 0, `${paths.length - problems.length}/${paths.length} sauber`);

/* ---------- Interne Links: jeder Inhalt-Link muss auf eine existierende Seite zeigen ---------- */
const missing = [];
for (const target of internalTargets) {
  const cleanPath = target.split('#')[0].split('?')[0];
  if (!cleanPath.startsWith('/')) continue;
  if (/\.(png|jpe?g|svg|ico|webp|css|js|xml|txt)$/i.test(cleanPath)) continue;
  const known = seenPaths.has(cleanPath) || seenPaths.has(cleanPath.replace(/\/$/, '') + '/');
  if (!known) {
    // Gegenprobe über HTTP, damit Nicht-HTML-Ressourcen nicht fälschlich auffallen.
    const r = await fetch(base + cleanPath, { redirect: 'manual' });
    if (r.status >= 400) missing.push(`${cleanPath} → ${r.status}`);
  }
}
push('Interne Links erreichbar', missing.length === 0, missing.length ? missing.slice(0, 5).join(', ') : `${internalTargets.size} Ziele`);

await browser.close();

/* ---------- Ausgabe ---------- */
const width = Math.max(...results.map(r => r[0].length)) + 2;
for (const [name, status, detail] of results) {
  console.log(`${status.padEnd(7)} ${name.padEnd(width)} ${detail}`);
}
const failed = results.filter(r => r[1] === 'FEHLER').length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);
process.exit(failed === 0 ? 0 : 1);
