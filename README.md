# bildfix24

Kostenlose Bildwerkzeuge, die vollständig im Browser laufen. Kein Upload, kein
Konto, kein Server, der die Dateien zu sehen bekommt.

**Live:** <https://bildfix24.pages.dev>

## Was drin ist

Acht Werkzeuge:

| Werkzeug | Route |
| --- | --- |
| Bild zuschneiden | `/bild-zuschneiden/` |
| Bild komprimieren | `/bild-komprimieren/` |
| Bildgröße ändern | `/bildgroesse-aendern/` |
| Bild konvertieren (JPEG, PNG, WebP) | `/bild-konvertieren/` |
| Wasserzeichen hinzufügen | `/wasserzeichen-hinzufuegen/` |
| Bild in PDF umwandeln | `/bild-in-pdf/` |
| Bilder zusammenfügen | `/bilder-zusammenfuegen/` |
| Bild in Graustufen | `/bild-in-graustufen/` |

Dazu Ratgeberseiten zu konkreten Grenzfällen – 500 kB, Instagram-Zuschnitt,
Passfoto, Produktbilder – und die Bildgrößen-Tabelle als Referenz.

Der wichtigste Teil ist die Grenze: Dateien verlassen das Gerät nicht. Das ist
keine Marketingaussage, sondern eine Eigenschaft der Architektur – es gibt keinen
Upload-Endpunkt, an den man sie schicken könnte. Alles läuft über Canvas und
Web APIs im Browser.

## Stack

- [Astro](https://astro.build) als Static Site Generator (`output: static`)
- TypeScript für die Werkzeug-Logik
- [React](https://react.dev) über `@astrojs/react` für die interaktiven Inseln
- Deployment: Cloudflare Pages, Build direkt aus diesem Repository

Bewusst kein externes CDN, keine Analytics, keine Fremd-Fonts. Die Seite lädt
nichts, was nicht auf ihrem eigenen Host liegt.

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # statisches Ergebnis nach dist/
npm run preview
```

### Domain umstellen

`site`, Canonicals, `og:url` und die Sitemap hängen an einer einzigen Variable:

```bash
PUBLIC_SITE_URL=https://beispiel.de npm run build
```

Ohne gesetzte Variable gilt `https://bildfix24.pages.dev`. Auf Cloudflare Pages
genügt es, `PUBLIC_SITE_URL` als Umgebungsvariable zu setzen – im Code muss dafür
nichts geändert werden.

## Tests

Die Werkzeuge werden im echten Browser geprüft, nicht mit Mocks:

```bash
npm run test:e2e
```

Die Testdateien liegen unter `test-*.mjs` im Wurzelverzeichnis. Sie prüfen unter
anderem, dass die Größenprüfung **vor** dem Dekodieren greift – ein auf dem
Dateikopf als 20 000 × 20 000 Pixel ausgewiesenes JPEG wird abgelehnt, ohne dass
der Browser es in den Speicher lädt. Ebenso, dass die Summengrenze bei
Mehrfach-Uploads hält.

## Datensatz

`dataset/` enthält die Bildgrößen-Tabelle maschinenlesbar:

| Datei | Inhalt |
| --- | --- |
| `bildgroessen.csv` | 20 Formate, eine Zeile pro Format |
| `bildgroessen.json` | dieselben Daten, strukturiert |
| `README.md` | Feldbeschreibung und Hintergrund |

Gedacht zum Weiterverwenden – in eigenen Projekten, Tabellen, Dokumentationen.
Maßgebliche Fassung immer unter
<https://bildfix24.pages.dev/bildgroessen-tabelle/>.

## Lizenz

- **Code** in diesem Repository: MIT, siehe [LICENSE](LICENSE)
- **Datensatz** in `dataset/`: CC BY 4.0, siehe [dataset/LICENSE](dataset/LICENSE)

Für den Datensatz ist Namensnennung Bedingung. Die einfachste Form ist ein Link
auf die Quelle:

> bildfix24: Bildgrößen für Social Media, Druck und Behörden – eine Tabelle.
> <https://bildfix24.pages.dev/bildgroessen-tabelle/>

Einzelne Komponenten von Drittanbietern stehen unter eigenen Lizenzen, siehe
[CREDITS.md](CREDITS.md).
