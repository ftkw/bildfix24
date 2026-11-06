import {
  $,
  attachDownload,
  baseName,
  bindDrop,
  canvasOf,
  clamp,
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

const zone = must<HTMLElement>('#resize-zone');
const input = must<HTMLInputElement>('#resize-input');
const workspace = must<HTMLElement>('#resize-workspace');
const img = must<HTMLImageElement>('#resize-img');
const widthInput = must<HTMLInputElement>('#resize-width');
const heightInput = must<HTMLInputElement>('#resize-height');
const lock = must<HTMLInputElement>('#resize-lock');
const percentInput = must<HTMLInputElement>('#resize-percent');
const percentValue = must<HTMLElement>('#resize-percent-value');
const original = must<HTMLElement>('#resize-original');
const presetBar = must<HTMLElement>('#resize-presets');
const applyBtn = must<HTMLButtonElement>('#resize-apply');
const resetBtn = must<HTMLButtonElement>('#resize-reset');
const downloadLink = $<HTMLAnchorElement>('#resize-download');
const resultWrap = $('#resize-result');
const resultImg = $<HTMLImageElement>('#resize-result-img');
const resultSize = $('#resize-result-size');
const actionRow = must<HTMLElement>('#resize-actions');
const stats = $('#resize-stats');
const notice = $('#resize-notice');

const progress = createProgress(actionRow, {
  label: 'Neue Größe wird berechnet …',
  doneLabel: 'Fertig – Ergebnis bereit'
});

let image: LoadedImage | null = null;
let aspect = 1;
let syncing = false;
let previewUrl: string | null = null;

function setSize(width: number, height: number, from: 'width' | 'height' | 'percent' | 'preset'): void {
  if (!image || syncing) return;
  syncing = true;
  const w = clamp(Math.round(width), 1, 12000);
  const h = clamp(Math.round(height), 1, 12000);
  widthInput.value = String(w);
  heightInput.value = String(h);
  if (from !== 'percent') {
    percentInput.value = String(clamp(Math.round((w / image.width) * 100), 1, 400));
  }
  percentValue.textContent = `${percentInput.value} %`;
  syncing = false;
}

/** Ergebnis verwerfen, sobald sich die Maße ändern. */
function invalidate(): void {
  revokeDownload(downloadLink);
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  resultImg?.removeAttribute('src');
  if (resultWrap) resultWrap.hidden = true;
  if (stats) stats.hidden = true;
  progress.reset();
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    invalidate();
    const loaded = await loadImage(file);
    image = loaded;
    aspect = loaded.width / loaded.height;
    img.src = loaded.url;
    zone.hidden = true;
    workspace.hidden = false;
    original.textContent = `Original: ${loaded.width} × ${loaded.height} px · ${formatBytes(loaded.bytes)}`;
    percentInput.value = '100';
    percentValue.textContent = '100 %';
    setSize(loaded.width, loaded.height, 'percent');
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

bindDrop(zone, input, file => {
  void onFile(file);
});

widthInput.addEventListener('input', () => {
  if (!image) return;
  const width = Number(widthInput.value) || 1;
  setSize(width, lock.checked ? width / aspect : Number(heightInput.value) || image.height, 'width');
  invalidate();
});

heightInput.addEventListener('input', () => {
  if (!image) return;
  const height = Number(heightInput.value) || 1;
  setSize(lock.checked ? height * aspect : Number(widthInput.value) || image.width, height, 'height');
  invalidate();
});

percentInput.addEventListener('input', () => {
  if (!image) return;
  const percent = clamp(Number(percentInput.value) || 100, 1, 400);
  percentValue.textContent = `${percent} %`;
  setSize((image.width * percent) / 100, (image.height * percent) / 100, 'percent');
  invalidate();
});

presetBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || !image) return;
  const width = Number(button.dataset.w) || image.width;
  const height = Number(button.dataset.h) || image.height;
  setSize(width, height, 'preset');
  invalidate();
});

async function process(): Promise<void> {
  if (!image) return;
  const source = image;
  const width = clamp(Number(widthInput.value) || source.width, 1, 12000);
  const height = clamp(Number(heightInput.value) || source.height, 1, 12000);
  const type = ['image/jpeg', 'image/png', 'image/webp'].includes(source.type) ? source.type : 'image/png';

  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      () => {
        const canvas = canvasOf(width, height);
        const ctx = context2d(canvas);
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(source.bitmap, 0, 0, width, height);
        return toBlob(canvas, type, 0.92);
      },
      { minDuration: 720 }
    );

    attachDownload(downloadLink, blob, `${baseName(source.name)}-${width}x${height}.${extFor(type)}`);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    if (resultImg) resultImg.src = previewUrl;
    if (resultSize) resultSize.textContent = `Ergebnis · ${width} × ${height} px`;
    if (resultWrap) resultWrap.hidden = false;

    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Neue Größe</span><span class="stat__value">${width} × ${height} px</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
        <div class="stat ${width < source.width ? 'stat--good' : ''}"><span class="stat__label">Skalierung</span><span class="stat__value">${Math.round((width / source.width) * 100)} %</span></div>
      `;
    }
    showNotice(notice, `Ergebnis bereit – ${width} × ${height} px, ${formatBytes(blob.size)}. Jetzt herunterladen.`, 'ok');
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
}

applyBtn.addEventListener('click', () => {
  void process();
});

resetBtn.addEventListener('click', () => {
  image = null;
  img.removeAttribute('src');
  workspace.hidden = true;
  zone.hidden = false;
  invalidate();
  hideNotice(notice);
  revealNode(zone);
});
