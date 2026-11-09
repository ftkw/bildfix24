import type { APIRoute } from 'astro';
import { SITE } from '../data/tools';

// Zur Build-Zeit erzeugt statt als statische Datei in public/ abgelegt:
// so kann die Sitemap-URL nicht von SITE.url abweichen, wenn der Host wechselt.
//
// Verwiesen wird auf die flache Variante /sitemap.xml (siehe scripts/flat-sitemap.mjs),
// nicht auf sitemap-index.xml: Die Index-plus-Shard-Struktur meldete in der Search
// Console dauerhaft "Konnte nicht abgerufen werden" – für 16 Seiten ist eine einzelne
// urlset-Datei ohne zusätzliche Namensräume die robustere Form.
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE.url}/sitemap.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
