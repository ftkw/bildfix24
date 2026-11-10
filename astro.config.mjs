import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// lastmod 只有在"内容真的改过"时才有参考价值，长期不变或每次构建都刷新的假日期
// 会被 Google 直接忽略。这里刻意用固定常量而不是构建时间：
//   - 构建时间 → 每次部署都变，等于宣称"全站天天更新"，是负面信号；
//   - git log -- src/pages → Cloudflare 构建是浅克隆，拿不到真实历史，
//     会退化成 HEAD 日期（实测过，得到构建当天的日期）；
//   - 文件 mtime → CI checkout 时间，同样不准。
// 结论：手动维护。改动 src/pages 或 src/data 里的正文时，同步更新这个日期。
const CONTENT_UPDATED = '2026-11-11';

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
        item.lastmod = CONTENT_UPDATED;
        return item;
      }
    })
  ],
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
