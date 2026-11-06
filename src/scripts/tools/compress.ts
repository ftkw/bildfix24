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

const zone = must<HTMLElement>('#compress-zone');
const input = must<HTMLInputElement>('#compress-input');
const workspace = must<HTMLElement>('#compress-workspace');
const img = must<HTMLImageElement>('#compress-img');
const qualityInput = must<HTMLInputElement>('#compress-quality');
const qualityValue = must<HTMLElement>('#compress-quality-value');
const formatBar = must<HTMLElement>('#compress-format');
const applyBtn = must<HTMLButtonElement>('#compress-apply');
const resetBtn = must<HTMLButtonElement>('#compress-reset');
const downloadLink = $<HTMLAnchorElement>('#compress-download');
const actionRow = must<HTMLElement>('#compress-actions');
const stats = $('#compress-stats');
const notice = $('#compress-notice');
const qualityRow = $('#compress-quality-row');

const progress = createProgress(actionRow, {
  label: 'Bild wird komprimiert …',
  doneLabel: 'Fertig'
});

let image: LoadedImage | null = null;
let format = 'image/jpeg';
let quality = 0.8;
let timer = 0;
let busy = false;

async function encode(): Promise<Blob> {
  if (!image) throw new Error('Kein Bild geladen.');
  const canvas = canvasOf(image.width, image.height);
  const ctx = context2d(canvas);
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image.bitmap, 0, 0);
  return toBlob(canvas, format, format === 'image/png' ? undefined : quality);
}

function updateStats(blob: Blob): void {
  if (!image || !stats) return;
  // Negative Werte bedeuten: die Datei ist größer geworden (z. B. WebP -> PNG).
  const saved = image.bytes - blob.size;
  const percent = image.bytes > 0 ? Math.round((Math.abs(saved) / image.bytes) * 100) : 0;
  const label = saved >= 0 ? 'Ersparnis' : 'Größer';
  const value = saved === 0 ? '0 %' : `${saved > 0 ? '' : '+'}${percent} %`;
  stats.hidden = false;
  stats.innerHTML = `
    <div class="stat"><span class="stat__label">Original</span><span class="stat__value">${formatBytes(image.bytes)}</span></div>
    <div class="stat"><span class="stat__label">Komprimiert</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
    <div class="stat ${saved > 0 ? 'stat--good' : ''}">
      <span class="stat__label">${label}</span>
      <span class="stat__value">${value}</span>
    </div>
  `;
}

async function render(_download = false): Promise<void> {
  if (!image || busy) return;
  busy = true;
  try {
    const blob = await encode();
    updateStats(blob);
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    busy = false;
  }
}

/** Erzeugt das Ergebnis, ohne es automatisch zu speichern. */
async function process(): Promise<void> {
  if (!image || busy) return;
  busy = true;
  applyBtn.disabled = true;
  try {
    const blob = await withProgress(progress, () => encode(), { minDuration: 720 });
    updateStats(blob);
    attachDownload(downloadLink, blob, `${baseName(image.name)}-komprimiert.${extFor(format)}`);
    showNotice(
      notice,
      `Ergebnis bereit – ${formatBytes(blob.size)} (${extFor(format).toUpperCase()}). Du kannst das Bild jetzt herunterladen.`,
      'ok'
    );
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    busy = false;
    applyBtn.disabled = false;
  }
}

/** Einstellungen geändert: altes Ergebnis ist nicht mehr gültig. */
function invalidate(): void {
  revokeDownload(downloadLink);
}

function syncQualityRow(): void {
  const isPng = format === 'image/png';
  qualityInput.disabled = isPng;
  qualityRow?.classList.toggle('hidden', isPng);
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
}

function syncFormatButtons(): void {
  formatBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.format === format ? 'true' : 'false');
  });
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    invalidate();
    const loaded = await loadImage(file);
    image = loaded;
    img.src = loaded.url;
    zone.hidden = true;
    workspace.hidden = false;
    if (stats) stats.hidden = true;
    syncQualityRow();
    syncFormatButtons();
    await render(false);
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

bindDrop(zone, input, file => {
  void onFile(file);
});

qualityInput.addEventListener('input', () => {
  quality = Number(qualityInput.value) / 100;
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
  invalidate();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void render(false), 260);
});

formatBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.format) return;
  format = button.dataset.format;
  syncFormatButtons();
  syncQualityRow();
  invalidate();
  void render(false);
});

applyBtn.addEventListener('click', () => {
  void process();
});

resetBtn.addEventListener('click', () => {
  image = null;
  img.removeAttribute('src');
  workspace.hidden = true;
  zone.hidden = false;
  if (stats) stats.hidden = true;
  invalidate();
  progress.reset();
  hideNotice(notice);
  revealNode(zone);
});

syncQualityRow();
syncFormatButtons();
