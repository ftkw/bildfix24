# Bildgrößen – offene Tabelle für Social Media, Druck und Behörden

Pixelmaße und Seitenverhältnisse für **20 Formate**: 16 Social-Media-Formate
und 4 Druckformate bei 300 dpi. Maschinenlesbar als CSV und JSON, gedacht zum
Weiterverwenden – in eigenen Projekten, in Tabellen, in Dokumentationen.

**Stand: 2026-11. Lizenz: [CC BY 4.0](LICENSE) – Nutzung frei, Namensnennung erforderlich.**

Quelle und laufend geprüfte Fassung: <https://bildfix24.de/bildgroessen-tabelle/>

## Warum es diese Tabelle gibt

Die meisten Anleitungen zu Bildgrößen mischen zwei Dinge, die nichts miteinander zu tun haben:
**Pixelmaße** und **Dateigröße**. Ein Portal, das „max. 500 KB" verlangt, prüft nur die Bytes –
ein Foto mit 4000 px Breite kann darunter liegen und wird trotzdem auf 1080 px heruntergerechnet,
weil die Plattform es so anzeigt. Deshalb stehen hier beide Größen getrennt: Pixel und Verhältnis
in der Tabelle, Dateigrenzen in der Spalte „Hinweis", wo sie hingehören.

Zweite Eigenheit: die Spalte „Hinweis" beschreibt, **was die Plattform tut, wenn das Bild nicht
passt** – nicht, was man tun soll. Instagram nimmt 320–1080 px Breite und Verhältnisse von
1.91:1 bis 3:4; alles darüber wird beschnitten. Pinterest schneidet alles über 2:3 im Feed ab.
Das ist die Information, die man beim Debuggen eines abgeschnittenen Bildes braucht.

## Formate für Social Media

| Plattform | Format | Pixel | Verhältnis | Hinweis |
| --- | --- | --- | --- | --- |
| Instagram | Feed, quadratisch | 1080 × 1080 | 1:1 | Sicherste Form für Zitate, Produkte und Raster. |
| Instagram | Feed, hochkant | 1080 × 1350 | 4:5 | Standard für Fotos: füllt im Feed 25 % mehr Höhe als ein Quadrat. |
| Instagram | Feed, maximal hoch | 1080 × 1440 | 3:4 | Die höchste Form, die Instagram im Feed unbeschnitten annimmt. |
| Instagram | Story und Reels | 1080 × 1920 | 9:16 | Text nicht in die oberen und unteren 250 Pixel legen – dort liegen Bedienelemente. |
| Instagram | Reel-Cover | 420 × 654 | etwa 1:1,55 | Wird im Profilraster beschnitten; Motiv mittig halten. |
| TikTok | Foto- und Videobeitrag | 1080 × 1920 | 9:16 | Sehr starke Neukomprimierung. JPG oder WebP, keine PNG-Screenshots. |
| Pinterest | Standard-Pin | 1000 × 1500 | 2:3 | Höher als 2:3 wird im Feed abgeschnitten. Datei max. 20 MB. |
| Pinterest | Idea Pin | 1080 × 1920 | 9:16 | Vollbild-Format, wie Story. |
| Facebook | Feed-Beitrag | 1080 × 1350 | 4:5 | Nimmt dieselbe Datei an wie Instagram – kein zweiter Export nötig. |
| Facebook | Seiten-Titelbild | 851 × 315 | etwa 2,7:1 | Wird auf dem Smartphone seitlich beschnitten; Inhalt mittig platzieren. |
| LinkedIn | Beitragsbild und Link-Vorschau | 1200 × 627 | 1,91:1 | Für die Link-Vorschau zählt das og:image der Zielseite, nicht der Upload. |
| LinkedIn | Profil-Hintergrund | 1584 × 396 | 4:1 | Sehr flach – Kontaktinformationen ins untere Drittel. |
| X | Beitragsbild | 1600 × 900 | 16:9 | Ohne Premium-Abo starke Neukomprimierung; Flächen mit Text als PNG hochladen. |
| X | Header | 1500 × 500 | 3:1 | Oben und unten wird je nach Gerät beschnitten. |
| YouTube | Vorschaubild | 1280 × 720 | 16:9 | Mindestens 640 Pixel breit, JPG oder PNG, Datei max. 2 MB. |
| YouTube | Kanalbanner | 2560 × 1440 | 16:9 | Nur die mittlere Fläche ist auf allen Geräten sichtbar – Text dort bündeln. |

## Druckformate bei 300 dpi

| Verwendung | Maße | Pixel | Hinweis |
| --- | --- | --- | --- |
| Passfoto | biometrisch) (35 × 45 mm | 413 × 531 | Zusätzlich gelten Vorgaben an Kopfhöhe und Hintergrund. |
| Bewerbungsfoto | 45 × 60 mm | 531 × 709 | Kein amtliches Format, aber der übliche Bewerbungsstandard. |
| Fotoabzug klein | 10 × 15 cm | 1181 × 1772 | Das klassische Drogeriemarkt-Format. |
| DIN A4 | 21 × 29,7 cm | 2480 × 3508 | Volle Seite randlos, etwa für Anschreiben oder Portfolio. |

## Dateien

| Datei | Inhalt |
| --- | --- |
| `bildgroessen.csv` | 20 Zeilen, flach, Semikolon-frei, UTF-8 |
| `bildgroessen.json` | gleiche Daten, mit `source`, `updated`, `license`, `attribution` |
| `README.md` | diese Datei |

### Schema

```
category      "social" | "print_300dpi"
platform      Instagram, TikTok, Pinterest, Facebook, LinkedIn, X, YouTube, Druck
format        Bezeichnung des Formats, z. B. "Feed, hochkant"
width_px      ganze Zahl
height_px     ganze Zahl
aspect_ratio  "4:5", "9:16", "1,91:1" – deutsche Schreibweise mit Komma; null bei Druckformaten
note          Verhalten der Plattform bei abweichendem Format
```

## Zitieren

```
bildfix24: Bildgrößen für Social Media, Druck und Behörden – eine Tabelle.
Stand 2026-11. https://bildfix24.de/bildgroessen-tabelle/
```

Bei Verwendung in einem Artikel, einer App oder einem Datensatz genügt ein sichtbarer Link auf
die Quelle. Genau das verlangt CC BY 4.0, und genau dafür ist die Datei da.

## Wie die Zahlen geprüft werden

Alle Werte stammen aus den Hilfeseiten der jeweiligen Anbieter (Instagram, TikTok, Pinterest,
Meta, LinkedIn, X, YouTube) sowie bei Druckformaten aus der Umrechnung von Millimetern bei
300 dpi. Die Tabelle wird bei Änderungen an der Quelle neu erzeugt, nicht von Hand gepflegt:

```bash
node build-dataset.mjs
```

Wenn dir ein Wert veraltet vorkommt: Issue aufmachen oder die Quelle prüfen – Plattformen ändern
Maße ohne Ankündigung, und eine falsche Zahl ist schlimmer als keine.
