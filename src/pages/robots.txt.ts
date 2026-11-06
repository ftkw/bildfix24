import type { APIRoute } from 'astro';
import { SITE } from '../data/tools';

// Zur Build-Zeit erzeugt statt als statische Datei in public/ abgelegt:
// so kann die Sitemap-URL nicht von SITE.url abweichen, wenn der Host wechselt.
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE.url}/sitemap-index.xml`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
