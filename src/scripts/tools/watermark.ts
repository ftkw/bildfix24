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

const zone = must<HTMLElement>('#wm-zone');
const input = must<HTMLInputElement>('#wm-input');
const workspace = must<HTMLElement>('#wm-workspace');
const canvas = must<HTMLCanvasElement>('#wm-canvas');
const textInput = must<HTMLInputElement>('#wm-text');
const sizeInput = must<HTMLInputElement>('#wm-size');
const sizeValue = must<HTMLElement>('#wm-size-value');
const opacityInput = must<HTMLInputElement>('#wm-opacity');
const opacityValue = must<HTMLElement>('#wm-opacity-value');
const colorInput = must<HTMLInputElement>('#wm-color');
const rotateInput = must<HTMLInputElement>('#wm-rotate');
const rotateValue = must<HTMLElement>('#wm-rotate-value');
const positionBar = must<HTMLElement>('#wm-position');
const tileInput = must<HTMLInputElement>('#wm-tile');
const logoInput = must<HTMLInputElement>('#wm-logo-input');
const logoStatus = must<HTMLElement>('#wm-logo-status');
const logoClear = must<HTMLButtonElement>('#wm-logo-clear');
const applyBtn = must<HTMLButtonElement>('#wm-apply');
const resetBtn = must<HTMLButtonElement>('#wm-reset');
const downloadLink = $<HTMLAnchorElement>('#wm-download');
const actionRow = must<HTMLElement>('#wm-actions');
const notice = $('#wm-notice');
const stats = $('#wm-stats');

const progress = createProgress(actionRow, {
  label: 'Wasserzeichen wird gesetzt …',
  doneLabel: 'Fertig'
});

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

let image: LoadedImage | null = null;
let logo: ImageBitmap | null = null;
let position = 'br';
let frame = 0;

function place(W: number, H: number, w: number, h: number, pad: number): { x: number; y: number } {
  const x = position.endsWith('l') ? pad : position.endsWith('r') ? W - pad - w : (W - w) / 2;
  const y = position.startsWith('t') ? pad : position.startsWith('b') ? H - pad - h : (H - h) / 2;
  return { x, y };
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, deg: number): void {
  if (!logo) return;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(logo, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const size = Number(sizeInput.value) / 100;
  const alpha = Number(opacityInput.value) / 100;
  const deg = Number(rotateInput.value);
  const pad = Math.max(6, Math.round(W * 0.03));

  ctx.save();
  ctx.globalAlpha = alpha;

  if (logo) {
    const targetW = Math.max(28, W * Math.max(0.06, size * 2.6));
    const scale = targetW / logo.width;
    const lw = logo.width * scale;
    const lh = logo.height * scale;

    if (tileInput.checked) {
      const stepX = lw * 2.1;
      const stepY = lh * 2.3;
      for (let y = -lh; y < H + lh; y += stepY) {
        for (let x = -lw; x < W + lw; x += stepX) {
          drawLogo(ctx, x, y, lw, lh, deg);
        }
      }
    } else {
      const spot = place(W, H, lw, lh, pad);
      drawLogo(ctx, spot.x, spot.y, lw, lh, deg);
    }
  } else {
    const text = textInput.value.trim() || '© bildfix24';
    const fontSize = Math.max(8, W * size);
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.fillStyle = colorInput.value;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Dezenter Schatten, damit das Wasserzeichen auch auf hellen Motiven lesbar bleibt.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = Math.max(2, fontSize * 0.18);
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);

    if (tileInput.checked) {
      const reach = Math.hypot(W, H);
      const stepX = Math.max(70, fontSize * 3.2);
      const stepY = fontSize * 4;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(((deg || 30) * Math.PI) / 180);
      for (let y = -reach / 2; y < reach / 2; y += stepY) {
        for (let x = -reach / 2; x < reach / 2; x += stepX) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      const width = ctx.measureText(text).width;
      const spot = place(W, H, width, fontSize, pad);
      ctx.save();
      ctx.translate(spot.x + width / 2, spot.y + fontSize / 2);
      if (deg) ctx.rotate((deg * Math.PI) / 180);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawPreview(): void {
  if (!image) return;
  const scale = Math.min(1, 900 / image.width);
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = context2d(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
  paint(ctx, canvas.width, canvas.height);
}

function schedule(): void {
  invalidate();
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    drawPreview();
  });
}

/** Gestaltung geändert: altes Ergebnis verwerfen. */
function invalidate(): void {
  revokeDownload(downloadLink);
  progress.reset();
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    invalidate();
    const loaded = await loadImage(file);
    image = loaded;
    zone.hidden = true;
    workspace.hidden = false;
    if (stats) stats.hidden = true;
    drawPreview();
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

bindDrop(zone, input, file => {
  void onFile(file);
});

[sizeInput, opacityInput, rotateInput, colorInput].forEach(control => {
  control.addEventListener('input', () => {
    sizeValue.textContent = `${sizeInput.value} %`;
    opacityValue.textContent = `${opacityInput.value} %`;
    rotateValue.textContent = `${rotateInput.value}°`;
    schedule();
  });
});

textInput.addEventListener('input', schedule);
tileInput.addEventListener('change', schedule);

positionBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.pos) return;
  position = button.dataset.pos;
  positionBar.querySelectorAll<HTMLButtonElement>('button').forEach(item => {
    item.setAttribute('aria-pressed', item.dataset.pos === position ? 'true' : 'false');
  });
  schedule();
});

logoInput.addEventListener('change', async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  try {
    const loaded = await loadImage(file);
    logo = loaded.bitmap;
    logoStatus.textContent = `Logo: ${loaded.name}`;
    logoClear.hidden = false;
    schedule();
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    logoInput.value = '';
  }
});

logoClear.addEventListener('click', () => {
  logo = null;
  logoStatus.textContent = 'Kein Logo gewählt – es wird Text verwendet.';
  logoClear.hidden = true;
  schedule();
});

applyBtn.addEventListener('click', async () => {
  if (!image) return;
  const source = image;
  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      () => {
        const target = canvasOf(source.width, source.height);
        const ctx = context2d(target);
        const type = ['image/jpeg', 'image/png', 'image/webp'].includes(source.type) ? source.type : 'image/png';
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, target.width, target.height);
        }
        ctx.drawImage(source.bitmap, 0, 0);
        paint(ctx, target.width, target.height);
        return toBlob(target, type, 0.92).then(async result => ({ blob: result, type }));
      },
      { minDuration: 720 }
    );

    attachDownload(downloadLink, blob.blob, `${baseName(source.name)}-wasserzeichen.${extFor(blob.type)}`);
    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Auflösung</span><span class="stat__value">${source.width} × ${source.height} px</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.blob.size)}</span></div>
        <div class="stat"><span class="stat__label">Motiv</span><span class="stat__value">${logo ? 'Logo' : 'Text'}</span></div>
      `;
    }
    showNotice(notice, `Wasserzeichen gesetzt – ${formatBytes(blob.blob.size)}. Du kannst das Bild jetzt herunterladen.`, 'ok');
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', () => {
  image = null;
  logo = null;
  workspace.hidden = true;
  zone.hidden = false;
  if (stats) stats.hidden = true;
  invalidate();
  logoStatus.textContent = 'Kein Logo gewählt – es wird Text verwendet.';
  logoClear.hidden = true;
  hideNotice(notice);
  revealNode(zone);
});

sizeValue.textContent = `${sizeInput.value} %`;
opacityValue.textContent = `${opacityInput.value} %`;
rotateValue.textContent = `${rotateInput.value}°`;
