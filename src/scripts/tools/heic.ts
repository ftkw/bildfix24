import { assertDecodedBudget, assertPixelBudget } from './budget';
import { inspect } from './dimensions';

/**
 * HEIC ist kein Bildformat im üblichen Sinn, sondern ein Container (HEIF) mit
 * HEVC-kodierten Bilddaten. HEVC zu dekodieren ist nicht in wenigen Zeilen
 * machbar – dafür braucht es einen echten Codec. Deshalb wird libheif als
 * WebAssembly nachgeladen, und zwar erst dann, wenn wirklich eine HEIC-Datei
 * ankommt: 356 KB (Brotli) haben auf den anderen Seiten nichts verloren.
 *
 * Warum nicht der eingebaute Decoder des Browsers: Safari kann HEIC über das
 * System anzeigen, Chrome und Firefox nicht. Zwei Wege mit unterschiedlichem
 * Verhalten – unterschiedliche Drehung, unterschiedliche Farbtiefe, keine
 * Kontrolle über Fehlerfälle – wären schlechter als ein Weg, der überall
 * dasselbe tut.
 */

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface HeifTarget extends DecodedImage {}

interface HeifImageHandle {
  get_width(): number;
  get_height(): number;
  is_primary?(): boolean;
  display(target: HeifTarget, callback: (result?: HeifTarget) => void): void;
}

interface HeifModule {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImageHandle[] };
}

type HeifFactory = (options: Record<string, unknown>) => HeifModule;

const BASE = '/heic/';

const LOAD_FAILED =
  'Der HEIF-Decoder konnte nicht geladen werden. Bitte prüfe deine Verbindung und lade die Seite neu.';
const TIMEOUT = 20000;

let pending: Promise<HeifModule> | null = null;
let wasmBytes: Uint8Array | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${BASE}libheif.js`;
    script.async = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error(LOAD_FAILED)));
    document.head.append(script);
  });
}

/**
 * Lädt die Wasm-Datei selbst, statt das dem Lader zu überlassen.
 *
 * Zwei Gründe. Erstens ist der Weg über `locateFile` in dieser Build-Variante
 * nicht verlässlich: der Lader versucht die Datei synchron per XHR zu holen und
 * bricht ab, wenn das nicht geht. Zweitens bekommt man so einen eigenen Pfad für
 * Fehler – eine abgebrochene Verbindung soll eine verständliche Meldung
 * ergeben und keinen Stacktrace aus dem Emscripten-Lader.
 */
async function loadWasm(): Promise<Uint8Array> {
  if (wasmBytes) return wasmBytes;
  let response: Response;
  try {
    response = await fetch(`${BASE}libheif.wasm`);
  } catch {
    throw new Error(LOAD_FAILED);
  }
  if (!response.ok) throw new Error(LOAD_FAILED);
  wasmBytes = new Uint8Array(await response.arrayBuffer());
  return wasmBytes;
}

function createModule(): Promise<HeifModule> {
  return Promise.all([injectScript(), loadWasm()]).then(
    ([, binary]) =>
      new Promise<HeifModule>((resolve, reject) => {
        const factory = (window as unknown as { libheif?: HeifFactory }).libheif;
        if (typeof factory !== 'function') {
          reject(new Error(LOAD_FAILED));
          return;
        }

        const timer = window.setTimeout(() => reject(new Error(LOAD_FAILED)), TIMEOUT);
        let instance: HeifModule | undefined;

        const settle = () => {
          window.clearTimeout(timer);
          // Der Rückruf kann noch im selben Aufruf feuern, in dem das Modul
          // entsteht. Als Microtask ist `instance` dann sicher zugewiesen.
          queueMicrotask(() => {
            if (instance) resolve(instance);
            else reject(new Error(LOAD_FAILED));
          });
        };

        instance = factory({ wasmBinary: binary, onRuntimeInitialized: settle });
      })
  );
}

/** Lädt den Decoder einmalig. Ein Fehlschlag wird nicht zwischengespeichert. */
function loadDecoder(): Promise<HeifModule> {
  if (!pending) {
    pending = createModule().catch(error => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

/** Startet den Download vorab, ohne auf das Ergebnis zu warten. */
export function preloadDecoder(): void {
  void loadDecoder().catch(() => undefined);
}

async function decodeImage(handle: HeifImageHandle): Promise<DecodedImage> {
  const width = handle.get_width();
  const height = handle.get_height();
  if (!width || !height) {
    throw new Error('Dieses HEIC enthält kein Bild mit gültigen Maßen.');
  }
  assertDecodedBudget(width, height, 'heif');

  return new Promise<DecodedImage>((resolve, reject) => {
    const target: HeifTarget = { data: new Uint8ClampedArray(width * height * 4), width, height };
    handle.display(target, result => {
      if (!result) {
        reject(new Error('Das HEIC konnte nicht dekodiert werden. Möglicherweise ist die Datei beschädigt.'));
        return;
      }
      resolve({ data: result.data, width: result.width, height: result.height });
    });
  });
}

async function looksLikeIsobmff(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12) return false;
  return String.fromCharCode(...head.subarray(4, 8)) === 'ftyp';
}

/**
 * Dekodiert eine HEIC-Datei zu rohen Pixeln.
 *
 * Bewusst `ImageData` statt `ImageBitmap`: der Aufrufer zeichnet die Pixel direkt
 * auf eine Leinwand und spart sich damit eine vollständige Kopie. Bei 48
 * Megapixeln sind das 192 MB, die sonst zusätzlich im Speicher lägen.
 */
export async function decodeHeif(file: File): Promise<DecodedImage> {
  const inspection = await inspect(file);

  if (inspection.kind !== 'heif' && !(await looksLikeIsobmff(file))) {
    throw new Error(
      'Das ist keine HEIC- oder HEIF-Datei. Für JPG, PNG und WebP gibt es „Bild konvertieren“.'
    );
  }

  // Vor dem Decoder-Download prüfen: bei zu großen Dateien wäre der Puffer
  // bereits belegt, bevor irgendetwas entschieden ist.
  assertPixelBudget(inspection.dimensions, 'heif');

  const module = await loadDecoder();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let images: HeifImageHandle[];
  try {
    images = new module.HeifDecoder().decode(bytes);
  } catch {
    throw new Error(
      'Diese HEIC-Datei konnte nicht gelesen werden. Möglicherweise ist sie beschädigt oder nutzt ein anderes HEIF-Profil.'
    );
  }

  if (!images.length) {
    throw new Error('In dieser Datei wurde kein Bild gefunden.');
  }

  const primary = images.find(image => image.is_primary?.()) ?? images[0];
  return decodeImage(primary);
}
