import { readDimensions } from './dimensions';

export interface LoadedImage {
  bitmap: ImageBitmap;
  file: File;
  name: string;
  type: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
}

export const MAX_BYTES = 100 * 1024 * 1024;

/** Obergrenze für die Summe aller Dateien bei Werkzeugen mit mehreren Bildern. */
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * Pixel-Budget: die Dateigröße ist nicht die eigentliche Grenze, die Fläche ist es.
 *
 * Gemessen in Chromium (Desktop): ein 12000 × 9000 großes JPEG mit 68 MB braucht
 * 444 ms zum Dekodieren, 2 ms zum Zeichnen und lässt sich fehlerfrei wieder
 * ausgeben (108 Megapixel). Der Speicherbedarf auf der Leinwand ist aber
 * Breite × Höhe × 4 Byte – bei 108 MP sind das 432 MB.
 *
 * Auf Mobilgeräten ist die Leinwandfläche kleiner, und wenn sie überschritten
 * wird, schlägt das Zeichnen **still** fehl: kein Fehler, nur ein leeres Bild.
 * Deshalb hier eine konservative Obergrenze je Geräteklasse, statt sich auf den
 * Browser zu verlassen.
 */
function pixelBudget(): number {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return (coarse ? 40 : 110) * 1e6;
}

function tooManyPixels(width: number, height: number): Error {
  const megapixel = (width * height) / 1e6;
  const budget = pixelBudget() / 1e6;
  // Ganze Zahlen ohne Nachkommastelle: „40 Megapixel“ statt „40,0 Megapixel“.
  const format = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
  return new Error(
    `Dieses Bild hat ${format(megapixel)} Megapixel (${width} × ${height}). ` +
      `Dein Browser verarbeitet hier bis ${format(budget)} Megapixel in einem Schritt. ` +
      'Verkleinere es zuerst mit „Bildgröße ändern“ und lade die kleinere Datei erneut.'
  );
}

export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function must<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element nicht gefunden: ${selector}`);
  return element;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  const digits = index === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'bild';
}

export function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

function decodeFallback(file: File): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      createImageBitmap(image)
        .then(bitmap => {
          URL.revokeObjectURL(url);
          resolve(bitmap);
        })
        .catch(error => {
          URL.revokeObjectURL(url);
          reject(error);
        });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden. Unterstützt werden JPG, PNG und WebP.'));
    };
    image.src = url;
  });
}

export async function loadImage(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Bitte wähle eine Bilddatei (JPG, PNG oder WebP).');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      'Die Datei ist zu groß. Maximal 100 MB werden unterstützt.'
    );
  }

  // Vor dem Dekodieren prüfen: ein 100-MB-JPEG belegt beim Dekodieren über
  // 400 MB. Danach zu prüfen wäre auf Smartphones zu spät – dort stirbt der Tab.
  const known = await readDimensions(file);
  if (known && known.width * known.height > pixelBudget()) {
    throw tooManyPixels(known.width, known.height);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await decodeFallback(file);
  }

  if (bitmap.width * bitmap.height > pixelBudget()) {
    // close() setzt Breite und Höhe auf 0 – die Meldung muss vorher entstehen.
    const error = tooManyPixels(bitmap.width, bitmap.height);
    bitmap.close();
    throw error;
  }

  return {
    bitmap,
    file,
    name: file.name,
    type: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
    width: bitmap.width,
    height: bitmap.height,
    bytes: file.size,
    url: URL.createObjectURL(file)
  };
}

export function toBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Das Bild konnte nicht erzeugt werden. Bitte versuche es erneut.'));
      },
      type,
      quality
    );
  });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Hinterlegt ein fertiges Ergebnis am Download-Knopf und blendet ihn ein.
 * Vorherige Objekt-URLs werden freigegeben, damit nichts im Speicher bleibt.
 */
export function attachDownload(link: HTMLAnchorElement | null, blob: Blob, filename: string): void {
  if (!link) return;
  revokeDownload(link);
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.hidden = false;
}

/** Entwertet das Ergebnis: Download-Knopf verschwindet, Objekt-URL wird freigegeben. */
export function revokeDownload(link: HTMLAnchorElement | null): void {
  if (!link) return;
  const href = link.getAttribute('href');
  if (href?.startsWith('blob:')) URL.revokeObjectURL(href);
  link.removeAttribute('href');
  link.hidden = true;
}

export type NoticeKind = 'info' | 'error' | 'ok';

export function showNotice(element: HTMLElement | null, message: string, kind: NoticeKind = 'info'): void {
  if (!element) return;
  element.textContent = message;
  element.className = kind === 'info' ? 'notice' : `notice notice--${kind}`;
  element.hidden = false;
}

export function hideNotice(element: HTMLElement | null): void {
  if (!element) return;
  element.hidden = true;
  element.textContent = '';
}

/**
 * Holt ein Element zurück in den Sichtbereich, ohne zu springen, wenn es schon sichtbar ist.
 *
 * Hintergrund: Beim Zurücksetzen („Anderes Bild“) verschwindet der Arbeitsbereich, die Seite
 * wird dadurch mehrere hundert Pixel kürzer. Die Scrollposition des Browsers bleibt erhalten –
 * die Ablagefläche rutscht dadurch über den oberen Rand hinaus und man blickt auf die leere
 * Fläche darunter. Deshalb wird das Element nach dem Zurücksetzen mittig ausgerichtet.
 */
export function revealNode(element: HTMLElement | null): void {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const height = window.innerHeight || document.documentElement.clientHeight;
  const visible = rect.top >= 0 && rect.bottom <= height;
  if (visible) return;

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

export function bindDrop(
  zone: HTMLElement,
  input: HTMLInputElement,
  onFile: (file: File) => void
): void {
  const handle = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  input.addEventListener('change', () => {
    handle(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, event => {
      event.preventDefault();
      zone.classList.add('is-drag');
    });
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    zone.addEventListener(eventName, () => zone.classList.remove('is-drag'));
  });

  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('is-drag');
    handle((event as DragEvent).dataTransfer?.files ?? null);
  });
}

/** Erzeugt eine Leinwand in Originalgröße des Bildes. */
export function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  assertDrawable(canvas);
  return canvas;
}

/**
 * Prüft, ob die Leinwand wirklich Pixel annimmt.
 *
 * Hintergrund: überschreitet eine Leinwand die Flächengrenze des Browsers –
 * auf Mobilgeräten deutlich früher als auf dem Desktop –, dann wirft das
 * Zeichnen keinen Fehler. Man bekommt stillschweigend ein leeres Bild und der
 * Nutzer lädt eine weiße Datei herunter. Deshalb wird hier ein einzelnes Pixel
 * gesetzt und zurückgelesen; erst danach wird das Bild gezeichnet und
 * überdeckt die Prüfmarke wieder.
 */
function assertDrawable(canvas: HTMLCanvasElement): void {
  let pixel: Uint8ClampedArray | null = null;
  try {
    const probe = canvas.getContext('2d');
    if (probe) {
      probe.fillStyle = '#010203';
      probe.fillRect(0, 0, 1, 1);
      pixel = probe.getImageData(0, 0, 1, 1).data;
      probe.clearRect(0, 0, 1, 1);
    }
  } catch {
    pixel = null;
  }

  const works = pixel !== null && pixel[0] === 1 && pixel[1] === 2 && pixel[2] === 3;
  if (works) return;

  canvas.width = 0;
  canvas.height = 0;
  throw new Error(
    'Für dieses Bild reicht der Arbeitsspeicher deines Browsers nicht. ' +
      'Verkleinere es zuerst mit „Bildgröße ändern“ und lade die kleinere Datei erneut.'
  );
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Dein Browser unterstützt Canvas nicht.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/** Für JPG-Ausgabe: transparente Bereiche weiß füllen. */
export function fillWhite(canvas: HTMLCanvasElement): void {
  const context = context2d(canvas);
  context.save();
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
