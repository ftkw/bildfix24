import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// `site` ist die Basis für canonical, og:url und die sitemap. Muss identisch mit
// SITE.url in src/data/tools.ts sein – bei einem Domainwechsel beide Stellen ändern.
export default defineConfig({
  site: 'https://bildfix24.ftkw117.workers.dev',
  integrations: [react(), sitemap()],
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
