/**
 * Minimaler ZIP-Schreiber – ohne Bibliothek.
 *
 * Warum ohne Kompression: der Inhalt sind JPEG-Dateien, die bereits
 * komprimiert sind. Deflate würde sie um Bruchteile verkleinern und dafür
 * Rechenzeit auf jedem einzelnen Bild kosten. „Store“ ist hier die richtige
 * Wahl, nicht die faule.
 *
 * Warum überhaupt selbst schreiben: eine Bibliothek für diesen einen Zweck
 * wäre eine weitere Abhängigkeit mit eigener Lizenz und eigenem Datenabfluss –
 * für 140 Zeilen Code, die man einmal richtig machen kann.
 *
 * Grenze: kein ZIP64. Mehr als 4 GB Gesamtgröße oder 65535 Dateien werden
 * abgelehnt, statt eine Datei zu erzeugen, die kein Entpacker öffnen kann.
 */

export interface ZipEntry {
  /** Dateiname im Archiv, inklusive Endung. */
  name: string;
  blob: Blob;
}

const MAX_ENTRIES = 65535;
const MAX_TOTAL = 4 * 1024 * 1024 * 1024 - 1;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    value = CRC_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** MS-DOS-Zeitstempel: Sekunden sind nur in Zweierschritten darstellbar. */
function dosStamp(date: Date): { time: number; date: number } {
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f),
    date: (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f)
  };
}

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error('Das Archiv wäre leer.');
  if (entries.length > MAX_ENTRIES) {
    throw new Error('Zu viele Dateien für ein Archiv.');
  }

  const encoder = new TextEncoder();
  const stamp = dosStamp(new Date());
  const chunks: BlobPart[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const name = encoder.encode(entry.name);
    const crc = crc32(data);

    // Lokaler Dateikopf: 30 Byte plus Name.
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // benötigte Version
    localView.setUint16(6, 0x0800, true); // Namen sind UTF-8
    localView.setUint16(8, 0, true); // Verfahren: store
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);

    // Verzeichniseintrag: 46 Byte plus Name.
    const record = new Uint8Array(46 + name.length);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true); // erzeugt von Version
    recordView.setUint16(6, 20, true); // benötigte Version
    recordView.setUint16(8, 0x0800, true);
    recordView.setUint16(10, 0, true);
    recordView.setUint16(12, stamp.time, true);
    recordView.setUint16(14, stamp.date, true);
    recordView.setUint32(16, crc, true);
    recordView.setUint32(20, data.length, true);
    recordView.setUint32(24, data.length, true);
    recordView.setUint16(28, name.length, true);
    recordView.setUint32(42, offset, true);
    record.set(name, 46);

    chunks.push(local, data);
    directory.push(record);
    offset += local.length + data.length;

    if (offset > MAX_TOTAL) {
      throw new Error('Das Archiv würde die 4-GB-Grenze überschreiten. Wähle weniger Dateien.');
    }
  }

  const directorySize = directory.reduce((sum, record) => sum + record.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
