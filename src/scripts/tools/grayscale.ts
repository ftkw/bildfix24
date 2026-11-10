import {
  $,
  attachDownload,
  baseName,
  bindDrop,
  canvasOf,
  context2d,
  extFor,
  formatBytes,
  hideNotice,
  loadImage,
  must,
  revealNode,
  revokeDownload,
  showNotice,
  toBlob,
  type LoadedImage
} from './common';
import { createProgress, withProgress } from '../ui/progress';

/** Kantenlänge der Vorschau. Das Ergebnis entsteht immer in voller Auflösung. */
const PREVIEW_SIDE = 900;

const zone = must<HTMLElement>('#gray-zone');
const input = must<HTMLInputElement>('#gray-input');
const workspace = must<HTMLElement>('#gray-workspace');
const sourceImg = must<HTMLImageElement>('#gray-img');
const resultCanvas = must<HTMLCanvasElement>('#gray-out');
const methodBar = must<HTMLElement>('#gray-method');
const spreadInput = must<HTMLInputElement>('#gray-spread');
const spreadValue = must<HTMLElement>('#gray-spread-value');
const formatBar = must<HTMLElement>('#gray-format');
const qualityRow = $('#gray-quality-row');
const qualityInput = must<HTMLInputElement>('#gray-quality');
const qualityValue = must<HTMLElement>('#gray-quality-value');
const applyBtn = must<HTMLButtonElement>('#gray-apply');
const resetBtn = must<HTMLButtonElement>('#gray-reset');
const downloadLink = $<HTMLAnchorElement>('#gray-download');
const actionRow = must<HTMLElement>('#gray-actions');
const stats = $('#gray-stats');
const notice = $('#gray-notice');

const progress = createProgress(actionRow, {
  label: 'Bild wird in Graustufen umgewandelt …',
  doneLabel: 'Fertig'
});

type Method = 'luma' | 'mean';

let image: LoadedImage | null = null;
let method: Method = 'luma';
let spread = 0;
let format: 'image/png' | 'image/jpeg' = 'image/png';
let quality = 0.92;
let timer = 0;

/**
 * Rechnet ein Bild in Graustufen um.
 *
 * `luma` gewichtet die Kanäle so, wie das Auge sie wahrnimmt (Rec. 709):
 * Grün trägt 71,5 %, Rot 21,3 %, Blau 7,2 %. `mean` mittelt alle drei gleich.
 * Der Unterschied ist bei reinen Farben am größten – reines Rot ergibt 54
 * statt 85, reines Blau 18 statt 85.
 *
 * `spread` (0–100) spreizt anschließend den tatsächlich vorkommenden
 * Tonbereich auf 0–255. Das rettet flaue Scans, deren Grauwerte nur zwischen
 * etwa 100 und 160 liegen, ohne dass man von Hand nachregeln muss.
 */
function convert(data: Uint8ClampedArray, mode: Method, spreadPercent: number): void {
  const pixels = data.length / 4;
  const gray = new Uint8ClampedArray(pixels);
  let min = 255;
  let max = 0;

  for (let i = 0; i < pixels; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const value = mode === 'luma' ? 0.2126 * r + 0.7152 * g + 0.0722 * b : (r + g + b) / 3;
    // Uint8ClampedArray rundet und begrenzt beim Zuweisen.
    gray[i] = value;
    if (gray[i] < min) min = gray[i];
    if (gray[i] > max) max = gray[i];
  }

  const range = max - min;
  const amount = Math.max(0, Math.min(100, spreadPercent)) / 100;

  for (let i = 0; i < pixels; i += 1) {
    const p = i * 4;
    let value = gray[i];
    if (range > 0 && amount > 0) {
      const stretched = ((value - min) / range) * 255;
      value = value + (stretched - value) * amount;
    }
    data[p] = value;
    data[p + 1] = value;
    data[p + 2] = value;
    // Alphakanal bleibt unangetastet: transparente PNGs behalten ihre Transparenz.
  }
}

/**
 * Rechnet das Bild in die Zielzeichenfläche.
 *
 * Die Vorschau wird direkt in ein Canvas im Dokument gezeichnet, nicht über
 * eine Blob-URL in ein <img>. Grund: `canvas.toBlob` arbeitet asynchron, und
 * nach einem `getImageData` (also einer GPU-Rücklesung) kann der Encoder so
 * lange warten, dass die Vorschau gegenüber den Reglern eine Änderung
 * hinterherläuft. Synchron gezeichnet gibt es diesen Versatz nicht.
 */
function render(target: HTMLCanvasElement, scale: number): void {
  if (!image) throw new Error('Kein Bild geladen.');
  target.width = Math.max(1, Math.round(image.width * scale));
  target.height = Math.max(1, Math.round(image.height * scale));
  const ctx = context2d(target);
  if (format === 'image/jpeg') {
    // JPG kennt keine Transparenz – ohne weiße Fläche würden transparente
    // Bereiche schwarz, und im Graustufenbild wären sie ein schwarzer Kasten.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.drawImage(image.bitmap, 0, 0, target.width, target.height);
  const frame = ctx.getImageData(0, 0, target.width, target.height);
  convert(frame.data, method, spread);
  ctx.putImageData(frame, 0, 0);
}

function syncControls(): void {
  methodBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.method === method ? 'true' : 'false');
  });
  formatBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.format === format ? 'true' : 'false');
  });
  spreadValue.textContent = spread === 0 ? 'aus' : `${spread} %`;
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
  const isPng = format === 'image/png';
  qualityInput.disabled = isPng;
  qualityRow?.classList.toggle('hidden', isPng);
}

function invalidate(): void {
  revokeDownload(downloadLink);
  if (stats) stats.hidden = true;
}

function updatePreview(): void {
  if (!image) return;
  try {
    render(resultCanvas, Math.min(1, PREVIEW_SIDE / Math.max(image.width, image.height)));
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

function schedulePreview(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => updatePreview(), 220);
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    invalidate();
    const loaded = await loadImage(file);
    image = loaded;
    sourceImg.src = loaded.url;
    zone.hidden = true;
    workspace.hidden = false;
    syncControls();
    updatePreview();
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

bindDrop(zone, input, file => {
  void onFile(file);
});

methodBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.method) return;
  method = button.dataset.method as Method;
  syncControls();
  invalidate();
  schedulePreview();
});

formatBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.format) return;
  format = button.dataset.format as 'image/png' | 'image/jpeg';
  syncControls();
  invalidate();
  schedulePreview();
});

spreadInput.addEventListener('input', () => {
  spread = Number(spreadInput.value) || 0;
  syncControls();
  invalidate();
  schedulePreview();
});

qualityInput.addEventListener('input', () => {
  quality = Number(qualityInput.value) / 100;
  syncControls();
  invalidate();
  schedulePreview();
});

applyBtn.addEventListener('click', async () => {
  if (!image) return;
  const current = image;
  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      () => {
        const canvas = canvasOf(current.width, current.height);
        render(canvas, 1);
        return toBlob(canvas, format, format === 'image/jpeg' ? quality : undefined);
      },
      { minDuration: 720 }
    );

    attachDownload(downloadLink, blob, `${baseName(current.name)}-graustufen.${extFor(format)}`);
    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Auflösung</span><span class="stat__value">${current.width} × ${current.height} px</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
        <div class="stat"><span class="stat__label">Format</span><span class="stat__value">${extFor(format).toUpperCase()}</span></div>
      `;
    }
    showNotice(
      notice,
      `Fertig – ${extFor(format).toUpperCase()}, ${formatBytes(blob.size)}. Du kannst das Bild jetzt herunterladen.`,
      'ok'
    );
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', () => {
  image = null;
  sourceImg.removeAttribute('src');
  workspace.hidden = true;
  zone.hidden = false;
  if (stats) stats.hidden = true;
  invalidate();
  progress.reset();
  hideNotice(notice);
  revealNode(zone);
});

syncControls();
