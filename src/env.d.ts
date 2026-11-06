/// <reference types="astro/client" />

// Öffentliche Build-Variablen. PUBLIC_* landet im Client-Bundle (hier nur der Host,
// kein Geheimnis) und wird beim Build eingesetzt – nicht zur Laufzeit gelesen.
interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
