import {
  $,
  attachDownload,
  baseName,
  canvasOf,
  context2d,
  fillWhite,
  formatBytes,
  hideNotice,
  must,
  revealNode,
  revokeDownload,
  showNotice,
  MAX_BYTES,
  toBlob
} from './common';
import { decodeHeif, preloadDecoder } from './heic';
import { createZip } from '../lib/zip';
import { createProgress } from '../ui/progress';

const MAX_FILES = 40;

const zone = must<HTMLElement>('#heic-zone');
const input = must<HTMLInputElement>('#heic-input');
const addInput = must<HTMLInputElement>('#heic-add-input');
const workspace = must<HTMLElement>('#heic-workspace');
const list = must<HTMLElement>('#heic-list');
const addBtn = must<HTMLButtonElement>('#heic-add');
const qualityInput = must<HTMLInputElement>('#heic-quality');
const qualityValue = must<HTMLElement>('#heic-quality-value');
const applyBtn = must<HTMLButtonElement>('#heic-apply');
const downloadLink = $<HTMLAnchorElement>('#heic-download');
const downloadLabel = $('#heic-download-label');
const clearBtn = must<HTMLButtonElement>('#heic-clear');
const actionRow = must<HTMLElement>('#heic-actions');
const stats = $('#heic-stats');
const notice = $('#heic-notice');

const progress = createProgress(actionRow, {
  label: 'HEIC wird umgewandelt …',
  doneLabel: 'Fertig'
});

type Status = 'waiting' | 'working' | 'done' | 'error';

interface Item {
  id: number;
  file: File;
  status: Status;
  result?: { blob: Blob; width: number; height: number; url: string };
  message?: string;
}

let items: Item[] = [];
let nextId = 1;
let quality = Number(qualityInput.value) / 100;
let running = false;

const nextFrame = (): Promise<void> =>
  new Promise(resolve => requestAnimationFrame(() => resolve()));

function render(): void {
  list.replaceChildren();

  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'heic-item';
    row.dataset.status = item.status;

    const body = document.createElement('div');
    body.className = 'heic-item__body';

    const name = document.createElement('span');
    name.className = 'heic-item__name';
    name.textContent = item.file.name;
    name.title = item.file.name;

    const meta = document.createElement('span');
    meta.className = 'heic-item__meta';

    const state = document.createElement('span');
    state.className = 'heic-item__state';

    if (item.status === 'done' && item.result) {
      meta.textContent = `${formatBytes(item.file.size)} → ${formatBytes(item.result.blob.size)} · ${item.result.width} × ${item.result.height} px`;
      state.textContent = 'fertig';
    } else if (item.status === 'error') {
      meta.textContent = item.message ?? 'Unbekannter Fehler';
      meta.title = meta.textContent;
      state.textContent = 'Fehler';
    } else {
      meta.textContent = formatBytes(item.file.size);
      state.textContent = item.status === 'working' ? 'läuft …' : 'wartet';
    }

    body.append(name, meta);
    row.append(body, state);

    if (item.result) {
      const link = document.createElement('a');
      link.className = 'heic-item__get';
      link.href = item.result.url;
      link.download = `${baseName(item.file.name)}.jpg`;
      link.textContent = 'JPG';
      link.setAttribute('aria-label', `${baseName(item.file.name)} als JPG herunterladen`);
      row.append(link);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'heic-item__remove';
      remove.dataset.remove = String(item.id);
      remove.setAttribute('aria-label', `${item.file.name} aus der Liste entfernen`);
      remove.textContent = '×';
      row.append(remove);
    }

    list.append(row);
  }
}

function syncState(): void {
  const waiting = items.filter(item => item.status !== 'done').length;
  const done = items.filter(item => item.status === 'done').length;
  applyBtn.disabled = running || waiting === 0;
  // Ist alles erledigt, wäre ein ausgegrauter Hauptknopf nur Dekoration.
  applyBtn.hidden = !running && waiting === 0 && done > 0;
  addBtn.disabled = running;
  addBtn.hidden = items.length >= MAX_FILES;

  applyBtn.textContent = done > 0 && waiting > 0 ? 'Weitere umwandeln' : 'In JPG umwandeln';
}

function resetStats(): void {
  if (stats) {
    stats.hidden = true;
    stats.replaceChildren();
  }
  revokeDownload(downloadLink);
}

function addFiles(files: FileList | null): void {
  if (!files?.length) return;
  const rejected: string[] = [];

  for (const file of Array.from(files)) {
    if (items.length >= MAX_FILES) {
      rejected.push(`höchstens ${MAX_FILES} Dateien auf einmal`);
      break;
    }
    if (file.size > MAX_BYTES) {
      rejected.push(`${file.name}: größer als 100 MB`);
      continue;
    }
    const duplicate = items.some(
      item =>
        item.file.name === file.name &&
        item.file.size === file.size &&
        item.file.lastModified === file.lastModified
    );
    if (duplicate) continue;
    items.push({ id: nextId++, file, status: 'waiting' });
  }

  zone.hidden = items.length > 0;
  workspace.hidden = items.length === 0;
  resetStats();
  render();
  syncState();

  if (rejected.length) {
    showNotice(notice, `Nicht übernommen – ${rejected.join(', ')}.`, 'error');
  } else {
    hideNotice(notice);
  }
}

input.addEventListener('change', () => {
  addFiles(input.files);
  input.value = '';
});

// Drag-and-drop selbst verdrahtet statt über `bindDrop`: das reicht nur die
// erste Datei weiter, hier sollen alle auf einmal ankommen.
['dragenter', 'dragover'].forEach(name => {
  zone.addEventListener(name, event => {
    event.preventDefault();
    zone.classList.add('is-drag');
  });
});

['dragleave', 'drop'].forEach(name => {
  zone.addEventListener(name, event => {
    event.preventDefault();
    zone.classList.remove('is-drag');
  });
});

zone.addEventListener('drop', event => {
  addFiles((event as DragEvent).dataTransfer?.files ?? null);
});

addBtn.addEventListener('click', () => addInput.click());
addInput.addEventListener('change', () => {
  addFiles(addInput.files);
  addInput.value = '';
});

list.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove]');
  if (!button || running) return;
  const id = Number(button.dataset.remove);
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return;
  items.splice(index, 1);
  resetStats();
  render();
  syncState();
  if (items.length === 0) {
    workspace.hidden = true;
    zone.hidden = false;
    progress.reset();
    hideNotice(notice);
    revealNode(zone);
  }
});

qualityInput.addEventListener('input', () => {
  quality = Number(qualityInput.value) / 100;
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
  // Ein anderes Qualitätsniveau macht bereits erzeugte Dateien ungültig.
  if (items.some(item => item.status === 'done')) {
    for (const item of items) {
      if (item.result) {
        URL.revokeObjectURL(item.result.url);
        item.result = undefined;
        item.status = 'waiting';
        item.message = undefined;
      }
    }
    render();
    syncState();
    // Die alte Erfolgsmeldung darf nicht stehen bleiben, während das Ergebnis
    // gerade verworfen wurde.
    progress.reset();
    hideNotice(notice);
  }
  resetStats();
});

clearBtn.addEventListener('click', () => {
  if (running) return;
  for (const item of items) {
    if (item.result) URL.revokeObjectURL(item.result.url);
  }
  items = [];
  render();
  syncState();
  resetStats();
  progress.reset();
  hideNotice(notice);
  workspace.hidden = true;
  zone.hidden = false;
  revealNode(zone);
});

applyBtn.addEventListener('click', () => {
  void convert();
});

async function convert(): Promise<void> {
  const queue = items.filter(item => item.status !== 'done');
  if (!queue.length || running) return;

  running = true;
  applyBtn.disabled = true;
  addBtn.disabled = true;
  hideNotice(notice);
  revokeDownload(downloadLink);

  const total = queue.length;
  let done = 0;
  let failed = 0;

  try {
    progress.setValue(0, total === 1 ? 'HEIC wird umgewandelt …' : `0 von ${total} – Decoder wird geladen …`);

    for (const item of queue) {
      item.status = 'working';
      item.message = undefined;
      render();
      syncState();
      await nextFrame();

      try {
        const decoded = await decodeHeif(item.file);
        const canvas = canvasOf(decoded.width, decoded.height);
        const context = context2d(canvas);
        context.putImageData(
          new ImageData(decoded.data, decoded.width, decoded.height),
          0,
          0
        );
        // HEIC kann Transparenz tragen, JPEG nicht. Weiß hinterlegen, bevor
        // kodiert wird – sonst entscheidet der Browser über die Hintergrundfarbe.
        fillWhite(canvas);
        const blob = await toBlob(canvas, 'image/jpeg', quality);

        // Leinwand sofort freigeben: bei 40 Dateien hintereinander summiert sich
        // das sonst, bis der Browser den Tab einsammelt.
        canvas.width = 0;
        canvas.height = 0;

        item.result = {
          blob,
          width: decoded.width,
          height: decoded.height,
          url: URL.createObjectURL(blob)
        };
        item.status = 'done';
      } catch (error) {
        item.status = 'error';
        item.message = (error as Error).message;
        failed++;
      }

      done++;
      progress.setValue(done / total, `${done} von ${total} umgewandelt …`);
      render();
      syncState();
      await nextFrame();
    }

    await finishUp(failed, total);
  } catch (error) {
    progress.fail();
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    running = false;
    syncState();
  }
}

async function finishUp(failed: number, total: number): Promise<void> {
  const results = items.filter(item => item.status === 'done' && item.result);

  if (results.length === 0) {
    progress.fail();
    // Bei genau einer Datei gehört der Grund dorthin, wo man hinsieht – in die
    // Rückmeldung. „Die Meldungen stehen in der Liste“ ist bei einer Zeile eine
    // Ausrede.
    const failedItems = items.filter(item => item.status === 'error');
    const single = failedItems.length === 1 ? failedItems[0].message : null;
    showNotice(
      notice,
      single ??
        (failed > 0
          ? 'Keine Datei konnte umgewandelt werden. Die Meldungen stehen in der Liste.'
          : 'Es ist nichts zu tun.'),
      'error'
    );
    return;
  }

  if (results.length === 1) {
    const only = results[0];
    attachDownload(downloadLink, only.result!.blob, `${baseName(only.file.name)}.jpg`);
    if (downloadLabel) downloadLabel.textContent = 'JPG herunterladen';
  } else {
    const zip = await createZip(
      results.map(item => ({ name: `${baseName(item.file.name)}.jpg`, blob: item.result!.blob }))
    );
    attachDownload(downloadLink, zip, `heic-als-jpg-${new Date().toISOString().slice(0, 10)}.zip`);
    if (downloadLabel) downloadLabel.textContent = `ZIP mit ${results.length} Dateien`;
  }

  const before = results.reduce((sum, item) => sum + item.file.size, 0);
  const after = results.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);

  if (stats) {
    stats.replaceChildren(
      stat('Umgewandelt', `${results.length} von ${total}`),
      stat('HEIC gesamt', formatBytes(before)),
      stat('JPG gesamt', formatBytes(after)),
      stat('Größer um', `+${Math.max(0, Math.round(((after - before) / before) * 100))} %`)
    );
    stats.hidden = false;
  }

  progress.finish();

  const base =
    results.length === 1
      ? 'Fertig – die JPG-Datei steht bereit.'
      : `Fertig – ${results.length} JPG-Dateien, gebündelt als ZIP.`;
  const warning =
    failed > 0
      ? ` ${failed} ${failed === 1 ? 'Datei wurde' : 'Dateien wurden'} nicht umgewandelt; die Begründung steht jeweils in der Liste.`
      : '';
  showNotice(notice, `${base}${warning} EXIF-Daten wie Aufnahmedatum und GPS-Koordinaten werden nicht übernommen.`, failed > 0 ? 'info' : 'ok');
}

function stat(label: string, value: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'stat';
  const labelEl = document.createElement('span');
  labelEl.className = 'stat__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'stat__value';
  valueEl.textContent = value;
  box.append(labelEl, valueEl);
  return box;
}

/**
 * Der Download des Decoders (356 KB) beginnt beim ersten Kontakt mit der
 * Ablagefläche – nicht beim Seitenaufbau. Wer die Seite nur liest, lädt nichts.
 */
let preloaded = false;
const preload = (): void => {
  if (preloaded) return;
  preloaded = true;
  preloadDecoder();
};
zone.addEventListener('pointerenter', preload, { once: true });
zone.addEventListener('focusin', preload, { once: true });

qualityValue.textContent = `${Math.round(quality * 100)} %`;
syncState();
