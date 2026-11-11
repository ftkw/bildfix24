/**
 * Stellt den HEIF-Decoder als statische Datei unter `public/heic/` bereit.
 *
 * Warum kopieren statt importieren: `libheif.wasm` ist 1,4 MB. Über den Bundler
 * eingebunden läge sie entweder als Base64 im JS (2,0 MB, schlechter komprimierbar)
 * oder als Chunk ohne eigene Cache-Regel. Als Datei unter einem festen Pfad lässt
 * sie sich getrennt cachen und über `_headers` mit einer eigenen Frist versehen.
 *
 * Die Dateien werden unverändert übernommen. Das ist für die LGPL wichtig: der
 * Decoder bleibt als eigenständige, austauschbare Datei erkennbar, und die
 * Herkunft ist über `README.txt` und `LICENSE.txt` im selben Verzeichnis
 * nachvollziehbar.
 */
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('libheif-js/package.json'));
const sourceDir = join(packageDir, 'libheif-wasm');
const targetDir = join(root, 'public', 'heic');

const sameSize = async (a, b) => {
  try {
    return (await stat(a)).size === (await stat(b)).size;
  } catch {
    return false;
  }
};

await mkdir(targetDir, { recursive: true });

for (const name of ['libheif.js', 'libheif.wasm']) {
  const from = join(sourceDir, name);
  const to = join(targetDir, name);
  if (await sameSize(from, to)) continue;
  await copyFile(from, to);
}

await copyFile(join(sourceDir, 'LICENSE'), join(targetDir, 'LICENSE.txt'));

const { version } = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
const notice = `libheif, als WebAssembly-Modul für den Browser
==============================================

Version:  libheif-js ${version}
Paket:    https://www.npmjs.com/package/libheif-js
Quelle:   https://github.com/catdad-experiments/libheif-js
Bibliothek: https://github.com/strukturag/libheif

Diese Dateien sind unverändert aus dem npm-Paket übernommen:
  libheif.js     Lader (Emscripten-Glue)
  libheif.wasm   Decoder, enthält libde265 für HEVC

Lizenz: GNU Lesser General Public License, Version 3.
Der vollständige Text liegt in LICENSE.txt daneben.

Der Decoder wird ausschließlich im Browser ausgeführt. Er läuft als separate
Datei und lässt sich durch eine andere Build-Variante ersetzen, ohne dass
anderer Code dieser Website angepasst werden muss.

Hinweis zu Patenten: HEVC (H.265) ist patentrechtlich geschützt. libheif selbst
enthält keine Patentlizenz; die Nutzung erfolgt ohne gesonderte Lizenzierung.
`;
await writeFile(join(targetDir, 'README.txt'), notice, 'utf8');

console.log(`heic: libheif-js ${version} → public/heic/`);
