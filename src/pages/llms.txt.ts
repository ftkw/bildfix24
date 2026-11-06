import type { APIRoute } from 'astro';
import { SITE, tools } from '../data/tools';

// llms.txt beschreibt die Seite für LLM-Crawler. Wie robots.txt zur Build-Zeit
// erzeugt, damit alle Links auf denselben Host zeigen wie canonical und Sitemap.

// Seiten, die zur Werkzeug-Familie gehören, aber nicht im tools[]-Array stehen.
const konvertierung = [
  ['JPG in PNG', '/bild-konvertieren/jpg-in-png/', 'verlustfreie Umwandlung von JPG zu PNG.'],
  ['PNG in JPG', '/bild-konvertieren/png-in-jpg/', 'PNG zu JPG mit einstellbarer Qualität.']
] as const;

const ratgeber = [
  ['Bildschutz', '/bildschutz/', 'Übersicht zu Wasserzeichen, Auflösung, Metadaten und Urheberrecht.'],
  ['Bilder vor Diebstahl schützen', '/bildschutz/bilder-vor-diebstahl-schuetzen/', 'praktische Maßnahmen und Checkliste.'],
  ['Urheberrecht bei Bildern', '/bildschutz/urheberrecht-bild/', 'Grundlagen nach deutschem Urheberrecht.']
] as const;

const link = (label: string, href: string, desc: string) =>
  `- [${label}](${SITE.url}${href}): ${desc}`;

export const GET: APIRoute = () => {
  const body = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.tagline}. Alle Werkzeuge laufen vollständig im Browser`,
    '> (Canvas-API). Bilder werden nicht hochgeladen und nicht gespeichert.',
    '',
    '## Werkzeuge',
    ...tools.map((tool) => link(tool.name, tool.href, tool.short)),
    '',
    '## Konvertierung',
    ...konvertierung.map(([label, href, desc]) => link(label, href, desc)),
    '',
    '## Ratgeber',
    ...ratgeber.map(([label, href, desc]) => link(label, href, desc)),
    '',
    '## Hinweise',
    '- Alle Werkzeuge sind kostenlos und ohne Anmeldung nutzbar.',
    '- Es werden keine eigenen Wasserzeichen in Nutzerbilder eingefügt.',
    '- Es wird keine Funktion zum Entfernen fremder Wasserzeichen angeboten.',
    '- Die Ratgeber sind allgemeine Informationen und keine Rechtsberatung.',
    ''
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
