export type ToolKey = 'crop' | 'compress' | 'resize' | 'convert' | 'watermark';

export interface Tool {
  key: ToolKey;
  href: string;
  name: string;
  short: string;
  icon: 'crop' | 'compress' | 'resize' | 'convert' | 'watermark';
  keywords: string;
}

/**
 * Eine Quelle der Wahrheit für Marke und Host.
 *
 * `name`  = reine Wortmarke, so wie sie im Logo, im Fließtext und im <title> steht.
 * `url`   = die aktuell tatsächlich ausgelieferte Basis (canonical, og:url, sitemap).
 * `domain`= erst setzen, wenn die Domain wirklich auf den Host zeigt. Dann erscheint
 *           sie automatisch als gedämpfte Endung im Logo, und ein Domainwechsel
 *           bleibt eine Einzeiler-Änderung statt einer Suche-Ersetzen-Aktion.
 */
export const SITE = {
  name: 'bildfix24',
  domain: null as string | null,
  url: 'https://bildfix24.ftkw117.workers.dev',
  email: 'kontakt@bildfix24.de',
  tagline: 'Bildwerkzeuge direkt im Browser',
  description:
    'Kostenlose Bildwerkzeuge für Deutschland: Bilder zuschneiden, komprimieren, Größe ändern, konvertieren und Wasserzeichen hinzufügen. Ohne Upload, ohne Anmeldung.'
} as const;

export const tools: Tool[] = [
  {
    key: 'crop',
    href: '/bild-zuschneiden/',
    name: 'Bild zuschneiden',
    short: 'Zuschneiden mit frei wählbarem Seitenverhältnis – direkt im Browser.',
    icon: 'crop',
    keywords: 'bild zuschneiden, foto zuschneiden, bild online zuschneiden'
  },
  {
    key: 'compress',
    href: '/bild-komprimieren/',
    name: 'Bild komprimieren',
    short: 'Dateigröße deutlich reduzieren, Qualität sichtbar vergleichen.',
    icon: 'compress',
    keywords: 'bild komprimieren, foto komprimieren, bild online komprimieren'
  },
  {
    key: 'resize',
    href: '/bildgroesse-aendern/',
    name: 'Bildgröße ändern',
    short: 'Breite und Höhe exakt anpassen, Seitenverhältnis optional sperren.',
    icon: 'resize',
    keywords: 'bildgröße ändern, bild verkleinern, bild vergrößern'
  },
  {
    key: 'convert',
    href: '/bild-konvertieren/',
    name: 'Bild konvertieren',
    short: 'JPG, PNG und WebP ineinander umwandeln – verlustfrei oder komprimiert.',
    icon: 'convert',
    keywords: 'bild konvertieren, jpg in png, png in jpg'
  },
  {
    key: 'watermark',
    href: '/wasserzeichen-hinzufuegen/',
    name: 'Wasserzeichen hinzufügen',
    short: 'Text oder Logo als Wasserzeichen setzen – auch als Kachelmuster.',
    icon: 'watermark',
    keywords: 'wasserzeichen bild, wasserzeichen hinzufügen, bild schützen'
  }
];

export const guides = [
  {
    href: '/bildschutz/bilder-vor-diebstahl-schuetzen/',
    title: 'Bilder vor Diebstahl schützen',
    desc: 'Warum Bilder kopiert werden, welche Schutzmaßnahmen wirklich helfen und welche ein Mythos sind.'
  },
  {
    href: '/bildschutz/urheberrecht-bild/',
    title: 'Urheberrecht bei Bildern',
    desc: 'Die wichtigsten Grundlagen zum deutschen Urheberrecht – verständlich für Creator und Unternehmen.'
  }
];

export function getTool(key: ToolKey): Tool {
  const tool = tools.find(item => item.key === key);
  if (!tool) throw new Error(`Unbekanntes Werkzeug: ${key}`);
  return tool;
}
