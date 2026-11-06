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

const zone = must<HTMLElement>('#convert-zone');
const input = must<HTMLInputElement>('#convert-input');
const workspace = must<HTMLElement>('#convert-workspace');
const img = must<HTMLImageElement>('#convert-img');
const formatBar = must<HTMLElement>('#convert-format');
const qualityRow = $('#convert-quality-row');
const qualityInput = must<HTMLInputElement>('#convert-quality');
const qualityValue = must<HTMLElement>('#convert-quality-value');
const applyBtn = must<HTMLButtonElement>('#convert-apply');
const resetBtn = must<HTMLButtonElement>('#convert-reset');
const downloadLink = $<HTMLAnchorElement>('#convert-download');
const actionRow = must<HTMLElement>('#convert-actions');
const stats = $('#convert-stats');
const notice = $('#convert-notice');

const progress = createProgress(actionRow, {
  label: 'Bild wird umgewandelt …',
  doneLabel: 'Fertig – Ergebnis bereit'
});

let image: LoadedImage | null = null;
let format = formatBar.dataset.default ?? 'image/png';
let quality = 0.92;

function syncButtons(): void {
  formatBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.format === format ? 'true' : 'false');
  });
  const lossless = format === 'image/png';
  qualityInput.disabled = lossless;
  qualityRow?.classList.toggle('hidden', lossless);
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    const loaded = await loadImage(file);
    image = loaded;
    img.src = loaded.url;
    zone.hidden = true;
    workspace.hidden = false;
    if (stats) stats.hidden = true;
    syncButtons();
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
  revokeDownload(downloadLink);
});

formatBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.format) return;
  format = button.dataset.format;
  syncButtons();
  revokeDownload(downloadLink);
});

applyBtn.addEventListener('click', async () => {
  if (!image) return;
  const source = image;
  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      () => {
        const canvas = canvasOf(source.width, source.height);
        const ctx = context2d(canvas);
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(source.bitmap, 0, 0);
        return toBlob(canvas, format, format === 'image/png' ? undefined : quality);
      },
      { minDuration: 700 }
    );

    attachDownload(downloadLink, blob, `${baseName(source.name)}.${extFor(format)}`);

    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Zielformat</span><span class="stat__value">${extFor(format).toUpperCase()}</span></div>
        <div class="stat"><span class="stat__label">Auflösung</span><span class="stat__value">${source.width} × ${source.height} px</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
      `;
    }
    const hint =
      format === 'image/jpeg' && source.type === 'image/png'
        ? ' Transparente Bereiche wurden weiß gefüllt.'
        : '';
    const same =
      format === source.type
        ? ' Das Bild lag bereits in diesem Format vor – die Datei wurde neu geschrieben.'
        : '';
    showNotice(
      notice,
      `Ergebnis bereit: ${extFor(format).toUpperCase()} – ${formatBytes(blob.size)}.${hint}${same} Jetzt herunterladen.`,
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
  img.removeAttribute('src');
  workspace.hidden = true;
  zone.hidden = false;
  if (stats) stats.hidden = true;
  revokeDownload(downloadLink);
  progress.reset();
  hideNotice(notice);
  revealNode(zone);
});

syncButtons();
