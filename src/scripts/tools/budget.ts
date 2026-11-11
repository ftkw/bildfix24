import type { Dimensions, FileKind } from './dimensions';

/**
 * Pixel-Budget: die Dateigröße ist nicht die eigentliche Grenze, die Fläche ist es.
 *
 * Gemessen in Chromium (Desktop): ein 12000 × 9000 großes JPEG mit 68 MB braucht
 * 444 ms zum Dekodieren, 2 ms zum Zeichnen und lässt sich fehlerfrei wieder
 * ausgeben (108 Megapixel). Der Speicherbedarf auf der Leinwand ist aber
 * Breite × Höhe × 4 Byte – bei 108 MP sind das 432 MB.
 *
 * Auf Mobilgeräten ist die Leinwandfläche kleiner, und wenn sie überschritten
 * wird, schlägt das Zeichnen **still** fehl: kein Fehler, nur ein leeres Bild.
 * Deshalb hier eine konservative Obergrenze je Geräteklasse, statt sich auf den
 * Browser zu verlassen.
 */
function canvasBudget(): number {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return (coarse ? 40 : 110) * 1e6;
}

/**
 * Obergrenze für HEIC, unabhängig von der Geräteklasse.
 *
 * Der HEIF-Decoder ist WebAssembly und hält die Pixel in seinem eigenen Speicher:
 * ein 48-Megapixel-Foto belegt dort 192 MB als RGBA, bevor die Leinwand überhaupt
 * angelegt wird. Die größten real vorkommenden HEIC-Dateien stammen aus iPhones
 * und haben 48 Megapixel (8064 × 6048). 50 Megapixel decken also alles ab, was
 * tatsächlich auftritt, und schneiden nur absurde Eingaben ab.
 */
export const HEIC_MAX_PIXELS = 50 * 1e6;

export function budgetFor(kind: FileKind): number {
  return kind === 'heif' ? HEIC_MAX_PIXELS : canvasBudget();
}

/** Ganze Zahlen ohne Nachkommastelle: „40 Megapixel“ statt „40,0 Megapixel“. */
function describePixels(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(1).replace('.', ',');
}

/**
 * Wirft, wenn das Bild über dem Budget liegt.
 *
 * Bei HEIC ist „verkleinere es zuerst mit Bildgröße ändern“ keine Hilfe – das
 * Werkzeug kann die Datei ja gerade nicht lesen. Deshalb dort ein Ausweg, der
 * ohne diese Seite funktioniert.
 */
export function pixelBudgetError(width: number, height: number, kind: FileKind): Error {
  const megapixel = describePixels((width * height) / 1e6);
  if (kind === 'heif') {
    const limit = describePixels(HEIC_MAX_PIXELS / 1e6);
    return new Error(
      `Dieses HEIC hat ${megapixel} Megapixel (${width} × ${height}). ` +
        `Mehr als ${limit} Megapixel verarbeitet der HEIF-Decoder im Browser nicht in einem Schritt. ` +
        'Exportiere das Bild auf dem Gerät als JPG oder verkleinere es dort zuerst.'
    );
  }
  return new Error(
    `Dieses Bild hat ${megapixel} Megapixel (${width} × ${height}). ` +
      `Dein Browser verarbeitet hier bis ${describePixels(canvasBudget() / 1e6)} Megapixel in einem Schritt. ` +
      'Verkleinere es zuerst mit „Bildgröße ändern“ und lade die kleinere Datei erneut.'
  );
}

/** Prüft die aus dem Dateikopf gelesenen Maße. Ohne Maße passiert nichts. */
export function assertPixelBudget(dimensions: Dimensions | null, kind: FileKind): void {
  if (!dimensions) return;
  if (dimensions.width * dimensions.height > budgetFor(kind)) {
    throw pixelBudgetError(dimensions.width, dimensions.height, kind);
  }
}

/** Prüft die tatsächlich dekodierten Maße – fängt Fälle ab, die der Kopf nicht hergibt. */
export function assertDecodedBudget(width: number, height: number, kind: FileKind): void {
  if (width * height > budgetFor(kind)) {
    throw pixelBudgetError(width, height, kind);
  }
}
