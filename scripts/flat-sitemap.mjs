#!/usr/bin/env node
// scripts/flat-sitemap.mjs —— 额外产出一份极简扁平 sitemap：dist/sitemap.xml
//
// 为什么需要它：@astrojs/sitemap 默认输出 sitemap-index.xml + sitemap-0.xml
// （索引 + 分片）。这种结构对上千 URL 的站点是对的，但对 16 个页面来说是多余的
// 一跳，而且实测 GSC 对这两个文件都报「无法抓取」，即便 Googlebot 本身能抓到
// （用网址检查「测试实际网址」验证过是 200 可索引）。
//
// 所以这里再生成一份最保守的形式：单层 urlset，只保留 loc 与 lastmod，
// 去掉 news / image / video / xhtml 等额外命名空间——这是 Google 兼容性最好
// 的写法。提交这一个就够，index 与分片可以忽略。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(DIST, 'sitemap-0.xml');
const OUT = path.join(DIST, 'sitemap.xml');

if (!fs.existsSync(SRC)) {
  console.error('找不到 dist/sitemap-0.xml，先跑 astro build');
  process.exit(1);
}

const xml = fs.readFileSync(SRC, 'utf8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

if (!urls.length) {
  console.error('sitemap-0.xml 里没有解析到 URL');
  process.exit(1);
}

// lastmod 沿用源文件里唯一的值；源文件没有就不写这一项，不编造日期
const lastmod = (xml.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];

const body = urls
  .map((u) => {
    const parts = [`    <loc>${u}</loc>`];
    if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
    return `  <url>\n${parts.join('\n')}\n  </url>`;
  })
  .join('\n');

fs.writeFileSync(
  OUT,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  'utf8'
);

const size = fs.statSync(OUT).size;
console.log(`dist/sitemap.xml 已生成：${urls.length} 条 URL，${size} 字节${lastmod ? `，lastmod=${lastmod}` : ''}`);
