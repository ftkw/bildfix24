/**
 * Ein Aufruf für die komplette Prüfung: bauen → Server starten → beide E2E-Läufe → Server beenden.
 *
 * Aufruf: npm run test:e2e
 *
 * Der Server läuft auf einem eigenen Port (Standard 8123), damit eine bereits laufende
 * Vorschau auf 8080 nicht gestört wird. Der tatsächlich belegte Port wird aus der
 * Serverausgabe gelesen und über BASE_URL an die Testskripte weitergegeben.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.E2E_PORT || 8123);

const run = (cmd, args, options = {}) =>
  new Promise(resolveRun => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', ...options });
    child.on('exit', code => resolveRun(code ?? 1));
  });

const build = await run('npm', ['run', 'build']);
if (build !== 0) {
  console.error('\nAbbruch: der Build ist fehlgeschlagen.');
  process.exit(build);
}

const server = spawn(process.execPath, [resolve(root, 'scripts/serve.mjs'), String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit']
});

const baseUrl = await new Promise((resolveUrl, rejectUrl) => {
  const timer = setTimeout(() => rejectUrl(new Error('Der Server meldet keinen Port.')), 8000);
  let buffer = '';
  server.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const match = buffer.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) {
      clearTimeout(timer);
      resolveUrl(`http://127.0.0.1:${match[1]}`);
    }
  });
  server.on('exit', code => {
    clearTimeout(timer);
    rejectUrl(new Error(`Der Server wurde beendet (Code ${code}).`));
  });
});

console.log(`\nPrüfung gegen ${baseUrl}\n`);

let failed = 0;
for (const file of ['test-tools.mjs', 'test-tools2.mjs', 'test-merge.mjs', 'test-grayscale.mjs', 'test-limits.mjs', 'test-heic.mjs', 'test-pages.mjs']) {
  console.log(`\n──────── ${file} ────────`);
  const code = await run(process.execPath, [resolve(root, file)], {
    env: { ...process.env, BASE_URL: baseUrl }
  });
  if (code !== 0) failed++;
}

server.kill('SIGTERM');
console.log(failed === 0 ? '\nAlle Läufe bestanden.' : `\n${failed} Lauf/Läufe fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
