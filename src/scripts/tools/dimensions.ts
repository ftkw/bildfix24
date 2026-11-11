export interface Dimensions {
  width: number;
  height: number;
}

export type FileKind = 'jpeg' | 'png' | 'webp' | 'heif' | 'other';

export interface Inspection {
  kind: FileKind;
  /** Maße aus dem Dateikopf, `null` wenn das Format nicht erkannt wurde. */
  dimensions: Dimensions | null;
}

/** So viel Kopf lesen, dass auch ein großes EXIF-/ICC-Segment noch hineinpasst. */
const HEAD_BYTES = 512 * 1024;

/**
 * Marken im `ftyp`-Block, die auf HEIF/HEIC hindeuten.
 *
 * `mif1` und `msf1` sind neutrale HEIF-Marken, die auch AVIF-Dateien tragen.
 * Deshalb wird zusätzlich gegen die AVIF-Marken geprüft: AVIF können alle
 * relevanten Browser selbst dekodieren, dafür braucht es keinen Decoder.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const latin = (bytes: Uint8Array, from: number, to: number): string =>
  to <= bytes.length && from >= 0 ? String.fromCharCode(...bytes.subarray(from, to)) : '';

/**
 * Liest Format und Maße aus dem Dateikopf, **ohne** das Bild zu dekodieren.
 *
 * Warum das nötig ist: ein 100-MB-JPEG hat rund 100 Megapixel, das sind beim
 * Dekodieren über 400 MB Arbeitsspeicher. Bei HEIC kommt erschwerend hinzu, dass
 * der Decoder die Pixel zusätzlich in seinem eigenen Wasm-Speicher hält – ein
 * 48-Megapixel-Foto belegt dort 192 MB, bevor die Leinwand überhaupt beginnt.
 * Auf Smartphones ist das die Grenze, an der der Tab stirbt. Nach dem Dekodieren
 * zu prüfen wäre also zu spät.
 */
export async function inspect(file: File): Promise<Inspection> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    return { kind: 'other', dimensions: null };
  }
  if (head.length < 16) return { kind: 'other', dimensions: null };

  const kind = detectKind(head);
  if (kind === 'heif') return { kind, dimensions: readHeif(head) };

  return { kind, dimensions: readJpeg(head) ?? readPng(head) ?? readWebp(head) };
}

function detectKind(head: Uint8Array): FileKind {
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
  if (head[0] === 0x89 && latin(head, 1, 4) === 'PNG') return 'png';
  if (latin(head, 0, 4) === 'RIFF' && latin(head, 8, 12) === 'WEBP') return 'webp';

  const brands = ftypBrands(head);
  // AVIF zuerst: eine Datei kann `mif1` *und* `avif` tragen.
  if (brands.some(brand => AVIF_BRANDS.has(brand))) return 'other';
  if (brands.some(brand => HEIF_BRANDS.has(brand))) return 'heif';
  return 'other';
}

function ftypBrands(head: Uint8Array): string[] {
  if (latin(head, 4, 8) !== 'ftyp') return [];
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const boxSize = view.getUint32(0);
  // Manche Encoder schreiben eine zu kleine oder unsinnige Größe. Dann gilt der
  // gelesene Kopf als Grenze – mehr als ein paar Marken stehen dort ohnehin nicht.
  const end = boxSize >= 16 && boxSize <= head.length ? boxSize : head.length;
  const brands = [latin(head, 8, 12)];
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(latin(head, offset, offset + 4));
  }
  return brands;
}

function readJpeg(head: Uint8Array): Dimensions | null {
  if (head[0] !== 0xff || head[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < head.length) {
    if (head[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = head[offset + 1];
    // Füllbytes (0xFF 0xFF) und markerlose Bereiche überspringen.
    if (marker === 0xff || marker === 0x00) {
      offset += 1;
      continue;
    }
    // SOF0–SOF15 außer DHT (0xC4), JPG (0xC8) und DAC (0xCC) tragen die Maße.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    const length = (head[offset + 2] << 8) | head[offset + 3];
    if (isSof) {
      const height = (head[offset + 5] << 8) | head[offset + 6];
      const width = (head[offset + 7] << 8) | head[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readPng(head: Uint8Array): Dimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => head[index] === byte)) return null;
  // IHDR steht immer direkt nach dem Signatur-Block: Länge(4) Typ(4) Breite(4) Höhe(4)
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readWebp(head: Uint8Array): Dimensions | null {
  if (latin(head, 0, 4) !== 'RIFF' || latin(head, 8, 12) !== 'WEBP') return null;

  const chunk = latin(head, 12, 16);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);

  if (chunk === 'VP8X') {
    // Erweiterter Kopf: 1 Byte Flags, 3 Byte reserviert, dann je 3 Byte Maße − 1.
    const width = (head[24] | (head[25] << 8) | (head[26] << 16)) + 1;
    const height = (head[27] | (head[28] << 8) | (head[29] << 16)) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8 ') {
    // Verlustbehaftet: 3 Byte Frame-Tag, 3 Byte Startcode 9D 01 2A, dann Maße.
    if (head[23] !== 0x9d || head[24] !== 0x01 || head[25] !== 0x2a) return null;
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8L') {
    // Verlustfrei: Signatur 2F, danach 14 Bit Breite und 14 Bit Höhe (−1).
    if (head[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}

/**
 * Liest die Maße aus dem `ispe`-Block einer HEIF-Datei.
 *
 * `ispe` steht im Eigenschaftsblock `meta > iprp > ipco`. Dort liegen mehrere:
 * eines für das Hauptbild, eines für jedes Vorschaubild, bei geteilten Bildern
 * zusätzlich eines je Kachel. Gesucht ist das größte – das ist in der Praxis
 * immer das Hauptbild.
 *
 * Zwei Einschränkungen, die bewusst in Kauf genommen werden:
 *
 * 1. `ispe` speichert die Maße **vor** einer eventuell vorhandenen Drehung
 *    (`irot`/`imir`). Ein Hochformatfoto steht dort also quer. Für die
 *    Speicherprüfung ist das ohne Belang, weil die Fläche sich nicht ändert.
 *    Für die Anzeige wird dieser Wert deshalb nie verwendet – die kommen aus
 *    den tatsächlich dekodierten Pixeln.
 * 2. Steht `meta` hinter den Bilddaten oder ist der Kopf zu kurz, wird nichts
 *    gefunden. Dann entscheidet wie bisher die Prüfung nach dem Dekodieren.
 */
function readHeif(head: Uint8Array): Dimensions | null {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let bestWidth = 0;
  let bestHeight = 0;
  let bestArea = 0;

  const walk = (start: number, end: number, depth: number): void => {
    let offset = start;
    while (offset + 8 <= end && depth <= 3) {
      let size = view.getUint32(offset);
      const type = latin(head, offset + 4, offset + 8);
      let header = 8;

      if (size === 1) {
        if (offset + 16 > end) return;
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return;

      if (type === 'meta') {
        // FullBox: nach dem Kopf folgen 4 Byte Version und Flags.
        walk(offset + header + 4, offset + size, depth + 1);
      } else if (type === 'iprp' || type === 'ipco') {
        walk(offset + header, offset + size, depth + 1);
      } else if (type === 'ispe' && offset + header + 12 <= end) {
        // Ebenfalls FullBox: 4 Byte Version/Flags, dann Breite und Höhe.
        const width = view.getUint32(offset + header + 4);
        const height = view.getUint32(offset + header + 8);
        const area = width * height;
        if (width > 0 && height > 0 && area > bestArea) {
          bestWidth = width;
          bestHeight = height;
          bestArea = area;
        }
      }
      offset += size;
    }
  };

  walk(0, head.length, 0);
  return bestWidth > 0 ? { width: bestWidth, height: bestHeight } : null;
}
