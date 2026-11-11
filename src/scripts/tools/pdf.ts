import {
  $,
  attachDownload,
  baseName,
  canvasOf,
  context2d,
  formatBytes,
  hideNotice,
  loadImage,
  MAX_TOTAL_BYTES,
  must,
  revokeDownload,
  showNotice,
  toBlob,
  type LoadedImage
} from './common';
import { createProgress, withProgress } from '../ui/progress';

const MAX_FILES = 30;

const zone = must<HTMLElement>('#pdf-zone');
const input = must<HTMLInputElement>('#pdf-input');
const addInput = must<HTMLInputElement>('#pdf-add-input');
const workspace = must<HTMLElement>('#pdf-workspace');
const list = must<HTMLElement>('#pdf-list');
const addBtn = must<HTMLButtonElement>('#pdf-add');
const pageBar = must<HTMLElement>('#pdf-page');
const qualityRow = $('#pdf-quality-row');
const qualityInput = must<HTMLInputElement>('#pdf-quality');
const qualityValue = must<HTMLElement>('#pdf-quality-value');
const applyBtn = must<HTMLButtonElement>('#pdf-apply');
const downloadLink = $<HTMLAnchorElement>('#pdf-download');
const clearBtn = must<HTMLButtonElement>('#pdf-clear');
const actionRow = must<HTMLElement>('#pdf-actions');
const stats = $('#pdf-stats');
const notice = $('#pdf-notice');

const progress = createProgress(actionRow, {
  label: 'PDF wird erzeugt …',
  doneLabel: 'Fertig'
});

interface Item {
  id: number;
  image: LoadedImage;
}

let items: Item[] = [];
let nextId = 1;
let pageFormat = pageBar.dataset.default ?? 'a4p';
let quality = 0.85;

const PAGE_NOTE: Record<string, string> = {
  a4p: 'A4 hochkant, Bild eingepasst, 18 pt Rand',
  a4l: 'A4 quer, Bild eingepasst, 18 pt Rand',
  original: 'Seite so groß wie das Bild (1 px = 1 pt)'
};

const A4 = { w: 595.28, h: 841.89 };

function syncQuality(): void {
  qualityValue.textContent = `${Math.round(quality * 100)} %`;
}

function syncPageButtons(): void {
  pageBar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.page === pageFormat ? 'true' : 'false');
  });
  const hint = $('#pdf-page-hint');
  if (hint) hint.textContent = PAGE_NOTE[pageFormat] ?? '';
}

function render(): void {
  list.innerHTML = '';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'pdf-item';
    li.innerHTML = `
      <span class="pdf-item__num">${index + 1}</span>
      <img class="pdf-item__thumb" src="${item.image.url}" alt="" />
      <span class="pdf-item__meta">
        <span class="pdf-item__name"></span>
        <span class="pdf-item__sub">${item.image.width} × ${item.image.height} px · ${formatBytes(item.image.bytes)}</span>
      </span>
      <button type="button" class="btn btn--ghost pdf-item__remove" data-remove="${item.id}">Entfernen</button>
    `;
    const name = li.querySelector('.pdf-item__name');
    if (name) name.textContent = item.image.name;
    list.append(li);
  });

  const empty = items.length === 0;
  zone.hidden = !empty;
  workspace.hidden = empty;
  addBtn.hidden = empty;
  if (stats) stats.hidden = true;
}

/** Summe der Dateigrößen aller bereits geladenen Seiten. */
function totalBytes(): number {
  return items.reduce((sum, item) => sum + item.image.bytes, 0);
}

async function addFiles(files: FileList | File[]): Promise<void> {
  const incoming = [...files];
  if (incoming.length === 0) return;

  hideNotice(notice);
  const room = MAX_FILES - items.length;
  const accepted = incoming.slice(0, Math.max(0, room));
  const skipped: string[] = [];

  for (const file of accepted) {
    if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
      skipped.push(`${file.name}: zusammen höchstens 200 MB – nicht übernommen.`);
      continue;
    }
    try {
      const image = await loadImage(file);
      items.push({ id: nextId++, image });
    } catch (error) {
      skipped.push(`${file.name}: ${(error as Error).message}`);
    }
  }

  if (incoming.length > accepted.length) {
    skipped.push(`Maximal ${MAX_FILES} Bilder pro PDF – ${incoming.length - accepted.length} Datei(en) nicht übernommen.`);
  }

  revokeDownload(downloadLink);
  render();

  if (skipped.length > 0) {
    showNotice(notice, skipped.join(' '), 'error');
  }
}

/* ---------------------------------------------------------------- PDF-Bau */

const encoder = new TextEncoder();

interface PdfPage {
  bytes: Uint8Array;
  pxW: number;
  pxH: number;
  pageW: number;
  pageH: number;
}

/**
 * Schreibt ein minimales, aber standardkonformes PDF 1.4.
 *
 * Jedes Bild wird als JPEG mit dem Filter /DCTDecode eingebettet – PDF kennt
 * dieses Verfahren nativ, deshalb ist keine zusätzliche Bibliothek nötig und
 * das Bild wird beim Verpacken kein zweites Mal umcodiert.
 */
function buildPdf(pages: PdfPage[]): Blob {
  const chunks: Uint8Array[] = [];
  let cursor = 0;

  const put = (data: string | Uint8Array): void => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    cursor += bytes.length;
  };

  const offsets: number[] = [];
  const begin = (num: number): void => {
    offsets[num] = cursor;
    put(`${num} 0 obj\n`);
  };
  const end = (): void => put('endobj\n');

  // Binärer Kommentar in Zeile 2 signalisiert Werkzeugen, dass die Datei
  // nicht als Text behandelt werden darf.
  put(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const total = 2 + pages.length * 3;

  begin(1);
  put('<< /Type /Catalog /Pages 2 0 R >>\n');
  end();

  begin(2);
  put(`<< /Type /Pages /Kids [ ${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')} ] /Count ${pages.length} >>\n`);
  end();

  pages.forEach((page, index) => {
    const pageNum = 3 + index * 3;
    const imageNum = pageNum + 1;
    const contentNum = pageNum + 2;

    begin(pageNum);
    put(
      `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${page.pageW.toFixed(2)} ${page.pageH.toFixed(2)} ] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\n`
    );
    end();

    begin(imageNum);
    put(
      `<< /Type /XObject /Subtype /Image /Width ${page.pxW} /Height ${page.pxH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
    );
    put(page.bytes);
    put('\nendstream\n');
    end();

    const margin = pageFormat === 'original' ? 0 : 18;
    const availW = Math.max(1, page.pageW - margin * 2);
    const availH = Math.max(1, page.pageH - margin * 2);
    const scale = Math.min(availW / page.pxW, availH / page.pxH);
    const dw = page.pxW * scale;
    const dh = page.pxH * scale;
    const x = (page.pageW - dw) / 2;
    const y = (page.pageH - dh) / 2;
    const content = `q\n${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;

    begin(contentNum);
    put(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\n`);
    end();
  });

  const xrefStart = cursor;
  put(`xref\n0 ${total + 1}\n`);
  put('0000000000 65535 f \n');
  for (let num = 1; num <= total; num += 1) {
    put(`${String(offsets[num] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

async function toPage(image: LoadedImage): Promise<PdfPage> {
  const canvas = canvasOf(image.width, image.height);
  const ctx = context2d(canvas);
  // PDF kennt in DeviceRGB keine Transparenz: durchsichtige Flächen werden
  // weiß gefüllt, sonst entstehen schwarze Flächen im fertigen Dokument.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image.bitmap, 0, 0);

  const blob = await toBlob(canvas, 'image/jpeg', quality);

  let pageW: number;
  let pageH: number;
  if (pageFormat === 'a4l') {
    pageW = A4.h;
    pageH = A4.w;
  } else if (pageFormat === 'original') {
    // 1 px = 1 pt bei 72 dpi; PDF erlaubt Seiten bis 14400 pt Kantenlänge.
    pageW = Math.min(image.width, 14400);
    pageH = Math.min(image.height, 14400);
  } else {
    pageW = A4.w;
    pageH = A4.h;
  }

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    pxW: image.width,
    pxH: image.height,
    pageW,
    pageH
  };
}

/* ------------------------------------------------------------------ Events */

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
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');
  if (!button) return;
  const id = Number(button.dataset.remove);
  const removed = items.find(item => item.id === id);
  items = items.filter(item => item.id !== id);
  if (removed) URL.revokeObjectURL(removed.image.url);
  revokeDownload(downloadLink);
  render();
});

pageBar.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button?.dataset.page) return;
  pageFormat = button.dataset.page;
  syncPageButtons();
  revokeDownload(downloadLink);
});

qualityInput.addEventListener('input', () => {
  quality = Number(qualityInput.value) / 100;
  syncQuality();
  revokeDownload(downloadLink);
});

clearBtn.addEventListener('click', () => {
  items.forEach(item => URL.revokeObjectURL(item.image.url));
  items = [];
  revokeDownload(downloadLink);
  hideNotice(notice);
  render();
});

applyBtn.addEventListener('click', async () => {
  if (items.length === 0) return;
  const current = [...items];
  applyBtn.disabled = true;
  try {
    const blob = await withProgress(
      progress,
      async () => {
        const pages: PdfPage[] = [];
        for (const item of current) pages.push(await toPage(item.image));
        return buildPdf(pages);
      },
      { minDuration: 700 }
    );

    const first = current[0].image;
    const name = current.length === 1 ? `${baseName(first.name)}.pdf` : `bilder-${current.length}-seiten.pdf`;
    attachDownload(downloadLink, blob, name);

    if (stats) {
      stats.hidden = false;
      stats.innerHTML = `
        <div class="stat"><span class="stat__label">Seiten</span><span class="stat__value">${current.length}</span></div>
        <div class="stat"><span class="stat__label">PDF-Größe</span><span class="stat__value">${formatBytes(blob.size)}</span></div>
        <div class="stat"><span class="stat__label">Format</span><span class="stat__value">${pageFormat === 'a4l' ? 'A4 quer' : pageFormat === 'original' ? 'Original' : 'A4 hoch'}</span></div>
      `;
    }

    showNotice(
      notice,
      `PDF mit ${current.length} ${current.length === 1 ? 'Seite' : 'Seiten'} erstellt (${formatBytes(blob.size)}). Transparente Bereiche wurden weiß gefüllt.`,
      'ok'
    );
  } catch (error) {
    showNotice(notice, (error as Error).message, 'error');
  } finally {
    applyBtn.disabled = false;
  }
});

syncQuality();
syncPageButtons();
render();
