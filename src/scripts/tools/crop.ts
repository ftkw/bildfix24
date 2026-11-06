import {
  $,
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
  saveBlob,
  showNotice,
  toBlob,
  type LoadedImage
} from './common';
import { createProgress, withProgress } from '../ui/progress';

const zone = must<HTMLElement>('#crop-zone');
const input = must<HTMLInputElement>('#crop-input');
const workspace = must<HTMLElement>('#crop-workspace');
const img = must<HTMLImageElement>('#crop-img');
const layer = must<HTMLElement>('#crop-layer');
const box = must<HTMLElement>('#crop-box');
const applyBtn = must<HTMLButtonElement>('#crop-apply');
const downloadLink = must<HTMLAnchorElement>('#crop-download');
const resetBtn = must<HTMLButtonElement>('#crop-reset');
const ratioBar = must<HTMLElement>('#crop-ratio');
const actionRow = must<HTMLElement>('#crop-actions');
const notice = $('#crop-notice');
const stats = $('#crop-stats');

const progress = createProgress(actionRow, {
  label: 'Ausschnitt wird zugeschnitten …',
  doneLabel: 'Fertig'
});

let image: LoadedImage | null = null;
let rect = { x: 0, y: 0, w: 0, h: 0 };
let ratio: number | null = null;
let mode: string | null = null;
let start = { px: 0, py: 0, rect: { x: 0, y: 0, w: 0, h: 0 } };
let resultUrl: string | null = null;

function paint(): void {
  box.style.left = `${rect.x}px`;
  box.style.top = `${rect.y}px`;
  box.style.width = `${rect.w}px`;
  box.style.height = `${rect.h}px`;
}

function stageSize(): { width: number; height: number } {
  return { width: img.clientWidth, height: img.clientHeight };
}

function resetBox(): void {
  const { width, height } = stageSize();
  let w = width * 0.82;
  let h = height * 0.82;
  if (ratio) {
    h = w / ratio;
    if (h > height * 0.9) {
      h = height * 0.9;
      w = h * ratio;
    }
  }
  rect = { x: (width - w) / 2, y: (height - h) / 2, w, h };
  paint();
}

function normalise(candidate: { x: number; y: number; w: number; h: number }, anchor: string): typeof rect {
  const { width, height } = stageSize();
  const next = { ...candidate };
  next.w = clamp(next.w, 24, width);
  next.h = clamp(next.h, 24, height);
  if (anchor.includes('w')) next.x = clamp(next.x, 0, width - next.w);
  else next.x = clamp(next.x, 0, width - next.w);
  next.y = clamp(next.y, 0, height - next.h);
  if (next.x + next.w > width) next.w = width - next.x;
  if (next.y + next.h > height) next.h = height - next.y;
  return next;
}

function fitRatio(candidate: { x: number; y: number; w: number; h: number }, anchor: string): typeof rect {
  if (!ratio) return candidate;
  const { height } = stageSize();
  const next = { ...candidate };
  let h = next.w / ratio;
  if (h > height) {
    h = height;
    next.w = h * ratio;
  }
  if (anchor.includes('n')) {
    next.y = next.y + next.h - h;
  }
  next.h = h;
  return normalise(next, anchor);
}

function updateButtons(): void {
  ratioBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    const value = button.dataset.ratio ?? 'free';
    const active = value === 'free' ? ratio === null : Math.abs(Number(value) - (ratio ?? 0)) < 0.001;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

async function onFile(file: File): Promise<void> {
  try {
    hideNotice(notice);
    const loaded = await loadImage(file);
    image = loaded;
    img.src = loaded.url;
    await img.decode().catch(() => undefined);
    zone.hidden = true;
    workspace.hidden = false;
    if (stats) stats.hidden = true;
    downloadLink.hidden = true;
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
    progress.reset();
    resetBox();
    updateButtons();
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  }
}

bindDrop(zone, input, file => {
  void onFile(file);
});

ratioBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  const value = button.dataset.ratio ?? 'free';
  ratio = value === 'free' ? null : Number(value);
  updateButtons();
  if (image) {
    if (ratio) {
      const { height } = stageSize();
      let w = rect.w;
      let h = w / ratio;
      if (h > height) {
        h = height;
        w = h * ratio;
      }
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      rect = normalise({ x: cx - w / 2, y: cy - h / 2, w, h }, 'move');
    }
    paint();
  }
});

layer.addEventListener('pointerdown', event => {
  if (!image) return;
  // Rahmen verschoben → ein bereits erzeugtes Ergebnis passt nicht mehr.
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    downloadLink.hidden = true;
    if (stats) stats.hidden = true;
    progress.reset();
  }
  const target = event.target as HTMLElement;
  mode = target.dataset.corner ?? 'move';
  const bounds = img.getBoundingClientRect();
  start = {
    px: event.clientX - bounds.left,
    py: event.clientY - bounds.top,
    rect: { ...rect }
  };
  layer.setPointerCapture(event.pointerId);
  event.preventDefault();
});

layer.addEventListener('pointermove', event => {
  if (!mode || !image) return;
  const bounds = img.getBoundingClientRect();
  const dx = event.clientX - bounds.left - start.px;
  const dy = event.clientY - bounds.top - start.py;
  const origin = start.rect;
  let next = { ...origin };

  if (mode === 'move') {
    next.x = clamp(origin.x + dx, 0, bounds.width - origin.w);
    next.y = clamp(origin.y + dy, 0, bounds.height - origin.h);
  } else {
    let x1 = origin.x;
    let y1 = origin.y;
    let x2 = origin.x + origin.w;
    let y2 = origin.y + origin.h;
    if (mode.includes('w')) x1 = clamp(origin.x + dx, 0, x2 - 24);
    if (mode.includes('e')) x2 = clamp(origin.x + origin.w + dx, x1 + 24, bounds.width);
    if (mode.includes('n')) y1 = clamp(origin.y + dy, 0, y2 - 24);
    if (mode.includes('s')) y2 = clamp(origin.y + origin.h + dy, y1 + 24, bounds.height);
    next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  rect = ratio && mode !== 'move' ? fitRatio(next, mode) : normalise(next, mode);
  paint();
});

const stop = (event: PointerEvent) => {
  if (!mode) return;
  mode = null;
  if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
};

layer.addEventListener('pointerup', stop);
layer.addEventListener('pointercancel', stop);

applyBtn.addEventListener('click', async () => {
  if (!image) return;
  const source = image;
  applyBtn.disabled = true;
  try {
    const scale = source.width / img.clientWidth;
    const sx = Math.round(rect.x * scale);
    const sy = Math.round(rect.y * scale);
    const sw = Math.max(1, Math.round(rect.w * scale));
    const sh = Math.max(1, Math.round(rect.h * scale));
    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(source.type) ? source.type : 'image/png';

    const blob = await withProgress(
      progress,
      () => {
        const canvas = canvasOf(sw, sh);
        const ctx = context2d(canvas);
        ctx.drawImage(source.bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        return toBlob(canvas, type, 0.92);
      },
      { minDuration: 650 }
    );

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    downloadLink.href = resultUrl;
    downloadLink.download = `${baseName(source.name)}-zugeschnitten.${extFor(type)}`;
    downloadLink.hidden = false;

    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Ergebnis</span><span class="stat__value">${sw} × ${sh} px</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
        <div class="stat"><span class="stat__label">Format</span><span class="stat__value">${extFor(type).toUpperCase()}</span></div>
      `;
    }

    showNotice(notice, `Zuschnitt fertig: ${sw} × ${sh} Pixel. Du kannst das Bild jetzt herunterladen.`, 'ok');
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', () => {
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }
  image = null;
  img.removeAttribute('src');
  workspace.hidden = true;
  zone.hidden = false;
  downloadLink.hidden = true;
  if (stats) stats.hidden = true;
  progress.reset();
  hideNotice(notice);
  revealNode(zone);
});

// Tastatur: Auswahl mit Pfeiltasten verschieben (Barrierefreiheit)
box.tabIndex = 0;
box.addEventListener('keydown', event => {
  if (!image) return;
  const step = event.shiftKey ? 10 : 2;
  const { width, height } = stageSize();
  let moved = true;
  switch (event.key) {
    case 'ArrowLeft':
      rect.x = clamp(rect.x - step, 0, width - rect.w);
      break;
    case 'ArrowRight':
      rect.x = clamp(rect.x + step, 0, width - rect.w);
      break;
    case 'ArrowUp':
      rect.y = clamp(rect.y - step, 0, height - rect.h);
      break;
    case 'ArrowDown':
      rect.y = clamp(rect.y + step, 0, height - rect.h);
      break;
    default:
      moved = false;
  }
  if (moved) {
    event.preventDefault();
    paint();
  }
});

window.addEventListener('resize', () => {
  if (!image) return;
  const { width, height } = stageSize();
  rect.x = clamp(rect.x, 0, Math.max(0, width - rect.w));
  rect.y = clamp(rect.y, 0, Math.max(0, height - rect.h));
  rect.w = Math.min(rect.w, width);
  rect.h = Math.min(rect.h, height);
  paint();
});

export { saveBlob };
