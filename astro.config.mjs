import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// `site` ist die Basis für canonical, og:url und die sitemap.
// Der Host steht in EINER Umgebungsvariable, damit ein Wechsel
// (workers.dev -> eigene Domain) kein Suchen-und-Ersetzen wird:
//   PUBLIC_SITE_URL=https://bildfix24.de npm run build
// Ohne gesetzte Variable gilt die aktuelle Auslieferungsadresse.
const SITE_URL = process.env.PUBLIC_SITE_URL ?? 'https://bildfix24.pages.dev';

export default defineConfig({
  site: SITE_URL,
  integrations: [react(), sitemap()],
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
