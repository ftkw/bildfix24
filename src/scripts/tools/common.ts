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

export const MAX_BYTES = 30 * 1024 * 1024;

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
    throw new Error('Die Datei ist zu groß. Maximal 30 MB werden unterstützt.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await decodeFallback(file);
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
  return canvas;
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
