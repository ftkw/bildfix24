# Credits & Lizenzen

## React Bits (https://reactbits.dev)

Diese Website nutzt kostenlose Komponenten von React Bits:

- `GradientText` — https://reactbits.dev/text-animations/gradient-text
- `SpotlightCard` — https://reactbits.dev/components/spotlight-card
- `StarBorder` — https://reactbits.dev/animations/star-border
- `DotField` — https://reactbits.dev/backgrounds/dot-field

**Lizenz:** MIT + Commons Clause License Condition v1.0
**Copyright (c) 2026 David Haz**

Die Komponenten werden als Teil dieser Website verwendet (Quellcode in
`src/components/reactbits/`). Sie werden nicht als eigenständige
Komponentenbibliothek weiterverkauft, sublizenziert oder weiterverbreitet.
Es wurden ausschließlich kostenlose Komponenten verwendet – keine Inhalte
aus React Bits Pro.

Der vollständige Lizenztext ist unter
https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md einsehbar.

## libheif – HEIC-Decoder (https://github.com/strukturag/libheif)

Die Seite `/heic-in-jpg/` liest HEIC-Dateien, also HEIF-Container mit
HEVC-kodierten Bildern. Das lässt sich nicht in wenigen Zeilen nachbauen – dafür
braucht es einen echten Codec. Verwendet wird libheif über das npm-Paket
[libheif-js](https://github.com/catdad-experiments/libheif-js):

- `public/heic/libheif.js` – Lader (Emscripten-Glue)
- `public/heic/libheif.wasm` – Decoder, enthält libde265 für HEVC

**Lizenz:** GNU Lesser General Public License, Version 3 (LGPL-3.0).
Der vollständige Lizenztext liegt unter `/heic/LICENSE.txt`.

Die Dateien werden unverändert aus dem npm-Paket übernommen; die Version steht in
`package.json`. Sie werden nicht mit eigenem Code vermischt und erst dann geladen,
wenn auf der HEIC-Seite wirklich eine Datei umgewandelt wird – alle anderen Seiten
dieser Website kommen ohne den Decoder aus. Weil er als eigene Datei ausgeliefert
wird, lässt er sich durch eine andere Build-Variante ersetzen, ohne dass Code
dieser Website angepasst werden muss.

**Hinweis zu Patenten:** HEVC (H.265) ist patentrechtlich geschützt. libheif
enthält selbst keine Patentlizenz; die Nutzung erfolgt ohne gesonderte
Lizenzierung.

## Schriften

Es werden ausschließlich Systemschriften verwendet. Es werden keine
Schriften von Drittanbietern (z. B. Google Fonts) geladen. Das vermeidet
Datenübermittlungen an Dritte und ist DSGVO-freundlich.

## Bilder / Grafiken

Alle Icons sind eigene Inline-SVGs. Es werden keine fremden Bild- oder
Icon-Assets eingebunden.
