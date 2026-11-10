import {
  $,
  attachDownload,
  canvasOf,
  context2d,
  formatBytes,
  hideNotice,
  loadImage,
  must,
  revokeDownload,
  showNotice,
  toBlob,
  type LoadedImage
} from './common';
import { createProgress, withProgress } from '../ui/progress';

const MAX_FILES = 12;
const MAX_SIDE = 12000;

const zone = must<HTMLElement>('#merge-zone');
const input = must<HTMLInputElement>('#merge-input');
const addInput = must<HTMLInputElement>('#merge-add-input');
const workspace = must<HTMLElement>('#merge-workspace');
const list = must<HTMLElement>('#merge-list');
const addBtn = must<HTMLButtonElement>('#merge-add');
const directionBar = must<HTMLElement>('#merge-direction');
const fitBar = must<HTMLElement>('#merge-fit');
const gapInput = must<HTMLInputElement>('#merge-gap');
const gapValue = must<HTMLElement>('#merge-gap-value');
const bgBar = must<HTMLElement>('#merge-bg');
const formatBar = must<HTMLElement>('#merge-format');
const applyBtn = must<HTMLButtonElement>('#merge-apply');
const downloadLink = $<HTMLAnchorElement>('#merge-download');
const clearBtn = must<HTMLButtonElement>('#merge-clear');
const actionRow = must<HTMLElement>('#merge-actions');
const stats = $('#merge-stats');
const notice = $('#merge-notice');
const layoutHint = $('#merge-layout-hint');
const previewWrap = $<HTMLElement>('#merge-preview');
const previewImg = $<HTMLImageElement>('#merge-preview-img');

const progress = createProgress(actionRow, {
  label: 'Bilder werden zusammengefügt …',
  doneLabel: 'Fertig'
});

interface Item {
  id: number;
  image: LoadedImage;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

let items: Item[] = [];
let nextId = 1;
let direction: 'h' | 'v' = 'h';
/** `equal` skaliert alle Bilder auf dieselbe Höhe (bzw. Breite), `natural` lässt die Pixelmaße unangetastet. */
let fit: 'equal' | 'natural' = 'equal';
let gap = 0;
let background: 'white' | 'transparent' = 'white';
let format: 'image/png' | 'image/jpeg' = 'image/png';
let previewUrl: string | null = null;

function syncControls(): void {
  const press = (bar: HTMLElement, key: string, value: string): void => {
    bar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      button.setAttribute('aria-pressed', button.dataset[key] === value ? 'true' : 'false');
    });
  };

  press(directionBar, 'direction', direction);
  press(fitBar, 'fit', fit);
  press(bgBar, 'bg', background);
  press(formatBar, 'format', format);

  gapValue.textContent = gap === 0 ? 'ohne' : `${gap} px`;

  // Transparenz gibt es nur als PNG – bei JPG wird ohnehin weiß gefüllt.
  bgBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.disabled = format === 'image/jpeg' && button.dataset.bg === 'transparent';
  });

  if (layoutHint) {
    if (items.length < 2) {
      layoutHint.textContent = '';
    } else if (fit === 'equal') {
      layoutHint.textContent =
        direction === 'h'
          ? 'Alle Bilder werden auf die Höhe des größten skaliert und oben bündig gesetzt.'
          : 'Alle Bilder werden auf die Breite des breitesten skaliert und links bündig gesetzt.';
    } else {
      layoutHint.textContent =
        'Kein Skalieren: jedes Bild behält seine Pixelmaße. Bei unterschiedlichen Größen entstehen Ränder.';
    }
  }
}

function render(): void {
  list.innerHTML = '';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'merge-item';
    li.innerHTML = `
      <span class="merge-item__num">${index + 1}</span>
      <img class="merge-item__thumb" src="${item.image.url}" alt="" />
      <span class="merge-item__meta">
        <span class="merge-item__name"></span>
        <span class="merge-item__sub">${item.image.width} × ${item.image.height} px · ${formatBytes(item.image.bytes)}</span>
      </span>
      <span class="merge-item__move">
        <button type="button" data-move="up" data-id="${item.id}" aria-label="Nach vorne schieben"${index === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" data-move="down" data-id="${item.id}" aria-label="Nach hinten schieben"${index === items.length - 1 ? ' disabled' : ''}>↓</button>
      </span>
      <button type="button" class="btn btn--ghost merge-item__remove" data-remove="${item.id}">Entfernen</button>
    `;
    const name = li.querySelector('.merge-item__name');
    if (name) name.textContent = item.image.name;
    list.append(li);
  });

  const empty = items.length === 0;
  zone.hidden = !empty;
  workspace.hidden = empty;
  addBtn.hidden = empty;
  if (stats) stats.hidden = true;
}

function invalidate(): void {
  revokeDownload(downloadLink);
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  if (previewImg) previewImg.removeAttribute('src');
  if (previewWrap) previewWrap.hidden = true;
  if (stats) stats.hidden = true;
}

async function addFiles(files: FileList | File[]): Promise<void> {
  const incoming = [...files];
  if (incoming.length === 0) return;
  hideNotice(notice);
  const room = MAX_FILES - items.length;
  const accepted = incoming.slice(0, Math.max(0, room));
  const skipped: string[] = [];

  for (const file of accepted) {
    try {
      items.push({ id: nextId++, image: await loadImage(file) });
    } catch (error) {
      skipped.push(`${file.name}: ${(error as Error).message}`);
    }
  }
  if (incoming.length > accepted.length) {
    skipped.push(`Maximal ${MAX_FILES} Bilder – ${incoming.length - accepted.length} nicht übernommen.`);
  }

  invalidate();
  render();
  syncControls();
  if (skipped.length > 0) showNotice(notice, skipped.join(' '), 'error');
}

/** Zielmaße der Gesamtfläche, ohne zu zeichnen. */
function plan(): { width: number; height: number; boxes: Box[] } {
  const boxes: Box[] = [];

  if (direction === 'h') {
    const height = Math.max(...items.map(item => item.image.height));
    const widths = items.map(item =>
      fit === 'equal' ? Math.round((item.image.width / item.image.height) * height) : item.image.width
    );
    const width = widths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, items.length - 1);
    let x = 0;
    items.forEach((item, index) => {
      boxes.push({ x, y: 0, w: widths[index], h: fit === 'equal' ? height : item.image.height });
      x += widths[index] + gap;
    });
    return { width, height, boxes };
  }

  const width = Math.max(...items.map(item => item.image.width));
  const heights = items.map(item =>
    fit === 'equal' ? Math.round((item.image.height / item.image.width) * width) : item.image.height
  );
  const height = heights.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, items.length - 1);
  let y = 0;
  items.forEach((item, index) => {
    boxes.push({ x: 0, y, w: fit === 'equal' ? width : item.image.width, h: heights[index] });
    y += heights[index] + gap;
  });
  return { width, height, boxes };
}

function handleFiles(files: FileList | null): void {
  if (files && files.length > 0) void addFiles(files);
}

input.addEventListener('change', () => {
  handleFiles(input.files);
  input.value = '';
});

addInput.addEventListener('change', () => {
  handleFiles(addInput.files);
  addInput.value = '';
});

['dragenter', 'dragover'].forEach(eventName => {
  zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.add('is-drag');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.remove('is-drag');
  });
});

zone.addEventListener('drop', event => {
  handleFiles((event as DragEvent).dataTransfer?.files ?? null);
});

addBtn.addEventListener('click', () => addInput.click());

list.addEventListener('click', event => {
  const target = event.target as HTMLElement;

  const removeBtn = target.closest<HTMLButtonElement>('[data-remove]');
  if (removeBtn) {
    const id = Number(removeBtn.dataset.remove);
    const removed = items.find(item => item.id === id);
    items = items.filter(item => item.id !== id);
    if (removed) URL.revokeObjectURL(removed.image.url);
    invalidate();
    render();
    syncControls();
    return;
  }

  const moveBtn = target.closest<HTMLButtonElement>('[data-move]');
  if (moveBtn && !moveBtn.disabled) {
    const id = Number(moveBtn.dataset.id);
    const index = items.findIndex(item => item.id === id);
    const target2 = moveBtn.dataset.move === 'up' ? index - 1 : index + 1;
    if (index >= 0 && target2 >= 0 && target2 < items.length) {
      const [moved] = items.splice(index, 1);
      items.splice(target2, 0, moved);
      invalidate();
      render();
    }
  }
});

directionBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.direction) return;
  direction = button.dataset.direction as 'h' | 'v';
  syncControls();
  invalidate();
});

fitBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.fit) return;
  fit = button.dataset.fit as 'equal' | 'natural';
  syncControls();
  invalidate();
});

bgBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.bg || button.disabled) return;
  background = button.dataset.bg as 'white' | 'transparent';
  syncControls();
  invalidate();
});

formatBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.format) return;
  format = button.dataset.format as 'image/png' | 'image/jpeg';
  // JPG kennt keine Transparenz: in dem Fall auf weißen Hintergrund umschalten.
  if (format === 'image/jpeg' && background === 'transparent') background = 'white';
  syncControls();
  invalidate();
});

gapInput.addEventListener('input', () => {
  gap = Number(gapInput.value) || 0;
  syncControls();
  invalidate();
});

clearBtn.addEventListener('click', () => {
  items.forEach(item => URL.revokeObjectURL(item.image.url));
  items = [];
  invalidate();
  render();
  syncControls();
  hideNotice(notice);
});

applyBtn.addEventListener('click', async () => {
  if (items.length === 0) return;
  const current = [...items];
  const layout = plan();

  if (layout.width > MAX_SIDE || layout.height > MAX_SIDE) {
    showNotice(
      notice,
      `Das Ergebnis wäre ${layout.width} × ${layout.height} px. Mehr als ${MAX_SIDE} px pro Seite verarbeitet der Browser nicht zuverlässig – wähle „Originalgröße“, verkleinere die Bilder vorher oder füge weniger zusammen.`,
      'error'
    );
    return;
  }

  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      () => {
        const canvas = canvasOf(layout.width, layout.height);
        const ctx = context2d(canvas);
        if (background === 'white' || format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        layout.boxes.forEach((box, index) => {
          ctx.drawImage(current[index].image.bitmap, box.x, box.y, box.w, box.h);
        });
        return toBlob(canvas, format, format === 'image/jpeg' ? 0.92 : undefined);
      },
      { minDuration: 700 }
    );

    const base = direction === 'h' ? `bilder-nebeneinander-${current.length}` : `bilder-untereinander-${current.length}`;
    attachDownload(downloadLink, blob, format === 'image/jpeg' ? `${base}.jpg` : `${base}.png`);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    if (previewImg) previewImg.src = previewUrl;
    if (previewWrap) previewWrap.hidden = false;

    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Ergebnis</span><span class="stat__value">${layout.width} × ${layout.height} px</span></div>
        <div class="stat"><span class="stat__label">Bilder</span><span class="stat__value">${current.length}</span></div>
        <div class="stat"><span class="stat__label">Dateigröße</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
      `;
    }
    showNotice(
      notice,
      `Zusammengefügt: ${current.length} Bilder auf ${layout.width} × ${layout.height} px, ${formatBytes(blob.size)}.`,
      'ok'
    );
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
});

syncControls();
render();
