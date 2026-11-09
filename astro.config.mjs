import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { execSync } from 'node:child_process';

// lastmod 只有在"内容真的改过"时才有参考价值，长期不变的假日期会被 Google 忽略。
// 这里取 src/pages 与 src/data 的最后一次提交日期；在无 git 的构建环境
// （例如 Dashboard 的 Upload assets）回退到内容定稿日，改正文时手动更新这里。
const CONTENT_FALLBACK_DATE = '2026-11-06';
function contentUpdated() {
  try {
    const d = execSync('git log -1 --format=%cs -- src/pages src/data', { encoding: 'utf8' }).trim();
    if (d) return d;
  } catch {
    /* 无 git，用回退值 */
  }
  return CONTENT_FALLBACK_DATE;
}

// https://astro.build/config
// `site` ist die Basis für canonical, og:url und die sitemap.
// Der Host steht in EINER Umgebungsvariable, damit ein Wechsel
// (workers.dev -> eigene Domain) kein Suchen-und-Ersetzen wird:
//   PUBLIC_SITE_URL=https://bildfix24.de npm run build
// Ohne gesetzte Variable gilt die aktuelle Auslieferungsadresse.
const SITE_URL = process.env.PUBLIC_SITE_URL ?? 'https://bildfix24.pages.dev';

export default defineConfig({
  site: SITE_URL,
  integrations: [
    react(),
    sitemap({
      serialize: (item) => {
        item.lastmod = contentUpdated();
        return item;
      }
    })
  ],
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
