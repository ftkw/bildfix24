#!/usr/bin/env node
// scripts/indexnow.mjs —— 把已发布的 URL 主动推给 Bing / Yandex / Seznam
//
// 为什么做这个：Google 不支持 IndexNow，但它对新站的价值在别处——
//   1. Bing 通常几小时到一天就抓，DuckDuckGo 用 Bing 索引，等于多一个入口；
//   2. 提交本身会在 Bing 侧留下"有人在维护这个站"的信号；
//   3. 换到自定义域名后，只要改 PUBLIC_SITE_URL 就能继续用。
//
// 用法：
//   node scripts/indexnow.mjs            # 提交 sitemap 里的全部 URL
//   node scripts/indexnow.mjs --dry      # 只打印 payload，不发请求
//   node scripts/indexnow.mjs --url /bild-zuschneiden/   # 只提交一条
//
// 前置：key 文件必须已经部署上线，且内容与文件名一致，否则 Bing 返回 403。
//       脚本会先自检 keyLocation，通过后才提交。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SITE = (process.env.PUBLIC_SITE_URL ?? 'https://bildfix24.pages.dev').replace(/\/+$/, '');
const HOST = new URL(SITE).host;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
// Mehrere --url sind erlaubt: bei kleinen Änderungen ist das der Normalfall,
// und ein Aufruf je Adresse würde nur das Ratenlimit treten.
const SINGLES = argv.reduce((acc, value, index) => {
  if (value === '--url' && argv[index + 1]) acc.push(argv[index + 1]);
  return acc;
}, []);

// key 从 public/ 下的 32 位 hex 文件名自动发现，避免换 key 时改脚本
function findKey() {
  const pub = path.join(ROOT, 'public');
  const hit = fs
    .readdirSync(pub)
    .find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!hit) throw new Error('public/ 下找不到 32 位 hex 的 IndexNow key 文件');
  const key = hit.replace(/\.txt$/, '');
  const content = fs.readFileSync(path.join(pub, hit), 'utf8').trim();
  if (content !== key) throw new Error(`key 文件内容与文件名不一致：${hit}`);
  return key;
}

// URL 来源：优先读构建产物里的 sitemap，保证推的就是线上真实存在的地址
function readUrls() {
  if (SINGLES.length) {
    return SINGLES.map((u) => SITE + (u.startsWith('/') ? u : `/${u}`));
  }
  // `flat-sitemap.mjs`  führt seit dem 11.11. alles in `sitemap.xml` zusammen
  // und löscht die Kacheln. Die alte Datei bleibt als Rückfall, falls das
  // Zusammenführen einmal abgeschaltet wird.
  const candidates = ['sitemap.xml', 'sitemap-0.xml'].map((name) =>
    path.join(ROOT, 'dist', name)
  );
  const sitemap = candidates.find((file) => fs.existsSync(file));
  if (!sitemap) throw new Error('dist/sitemap.xml 不存在，先 npm run build');
  const xml = fs.readFileSync(sitemap, 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!urls.length) throw new Error('sitemap 里没有解析到 URL');
  return urls;
}

async function checkKeyLive(keyUrl) {
  let res;
  try {
    res = await fetch(keyUrl, { method: 'GET' });
  } catch (e) {
    return { ok: false, reason: `无法访问：${e.message}` };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  const body = (await res.text()).trim();
  if (body !== path.basename(keyUrl, '.txt')) {
    return { ok: false, reason: `返回内容不是 key（得到 ${JSON.stringify(body.slice(0, 40))}）` };
  }
  return { ok: true };
}

(async () => {
  const key = findKey();
  const keyLocation = `${SITE}/${key}.txt`;
  const urlList = readUrls();

  const payload = { host: HOST, key, keyLocation, urlList };

  console.log(`host      : ${HOST}`);
  console.log(`keyLocation: ${keyLocation}`);
  console.log(`URL 数    : ${urlList.length}`);
  urlList.forEach((u) => console.log(`  ${u}`));

  if (DRY) {
    console.log('\n--- dry run，未发送 ---');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // key 文件必须先上线，否则提交会 403 且 Bing 会记住这次失败
  const chk = await checkKeyLive(keyLocation);
  if (!chk.ok) {
    console.error(`\n✗ key 文件尚未上线（${chk.reason}）`);
    console.error('  先部署站点，再跑这个脚本。');
    process.exit(1);
  }
  console.log('\n✓ key 文件已在线');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  // 200 = 已接受；202 = 已接受但 key 待验证（常见于刚部署）
  if (res.status === 200 || res.status === 202) {
    console.log(`✓ 提交成功（HTTP ${res.status}，${urlList.length} 条 URL）`);
    console.log('  Bing 一般数小时到 1 天抓取；Yandex / Seznam 会慢一些。');
  } else {
    const body = await res.text().catch(() => '');
    console.error(`✗ 提交失败（HTTP ${res.status}）`);
    if (res.status === 403) console.error('  403 = key 验证不通过，检查 key 文件是否可从公网访问。');
    if (res.status === 422) console.error('  422 = URL 与 host 不匹配，检查 PUBLIC_SITE_URL。');
    if (res.status === 429) console.error('  429 = 触发频率限制，隔一段时间再试。');
    if (body) console.error(`  响应：${body.slice(0, 300)}`);
    process.exit(1);
  }
})();
