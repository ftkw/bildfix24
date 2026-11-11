export interface Dimensions {
  width: number;
  height: number;
}

/** So viel Kopf lesen, dass auch ein großes EXIF-/ICC-Segment noch hineinpasst. */
const HEAD_BYTES = 512 * 1024;

/**
 * Liest Breite und Höhe aus dem Dateikopf, **ohne** das Bild zu dekodieren.
 *
 * Warum das nötig ist: ein 100-MB-JPEG hat rund 100 Megapixel, das sind beim
 * Dekodieren über 400 MB Arbeitsspeicher. Auf Smartphones ist das die Grenze,
 * an der der Tab stirbt. Nach dem Dekodieren zu prüfen wäre also zu spät –
 * die Prüfung muss vorher passieren. Deshalb wird hier nur der Kopf gelesen.
 *
 * Gibt `null` zurück, wenn das Format nicht erkannt wird; dann entscheidet
 * wie bisher die Prüfung nach dem Dekodieren.
 */
export async function readDimensions(file: File): Promise<Dimensions | null> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    return null;
  }
  if (head.length < 30) return null;

  const jpeg = readJpeg(head);
  if (jpeg) return jpeg;
  const png = readPng(head);
  if (png) return png;
  return readWebp(head);
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
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;

  const chunk = ascii(12, 16);
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
