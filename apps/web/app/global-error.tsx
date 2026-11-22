"use client";

import React from "react";
import { isChunkLoadError, sanitizeDevPreview } from "../src/client/error-boundary-card";

const GLOBAL_ERROR_CSS = `
:root {
  --pl-ge-bg: rgb(11 11 16);
  --pl-ge-card: rgb(18 18 24);
  --pl-ge-border: rgb(255 255 255 / 0.14);
  --pl-ge-text: rgb(245 245 248);
  --pl-ge-muted: rgb(163 166 184);
  --pl-ge-accent: rgb(155 138 255);
  --pl-ge-accent-fg: rgb(11 11 16);
  --pl-ge-ghost: rgb(255 255 255 / 0.06);
}
@media (prefers-color-scheme: light) {
  :root {
    --pl-ge-bg: rgb(246 247 251);
    --pl-ge-card: rgb(255 255 255);
    --pl-ge-border: rgb(18 19 30 / 0.14);
    --pl-ge-text: rgb(18 19 30);
    --pl-ge-muted: rgb(88 92 114);
    --pl-ge-accent: rgb(91 63 224);
    --pl-ge-accent-fg: rgb(255 255 255);
    --pl-ge-ghost: rgb(18 19 30 / 0.05);
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100dvh;
  background: var(--pl-ge-bg);
  color: var(--pl-ge-text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.pl-ge-shell {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px;
}
.pl-ge-card {
  width: 100%;
  max-width: 440px;
  background: var(--pl-ge-card);
  border: 1px solid var(--pl-ge-border);
  border-radius: 24px;
  padding: 32px 26px;
  text-align: center;
}
.pl-ge-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  color: var(--pl-ge-text);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-decoration: none;
}
.pl-ge-code {
  margin: 14px 0 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pl-ge-muted);
}
.pl-ge-title {
  margin: 8px 0 0;
  font-size: 26px;
  line-height: 1.18;
  letter-spacing: -0.025em;
  font-weight: 700;
}
.pl-ge-copy {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--pl-ge-muted);
}
.pl-ge-digest {
  display: inline-block;
  margin: 14px 0 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--pl-ge-border);
  font-size: 12px;
  color: var(--pl-ge-muted);
}
.pl-ge-debug {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--pl-ge-border);
  font-size: 12px;
  line-height: 1.4;
  text-align: start;
  color: var(--pl-ge-muted);
  overflow-x: auto;
}
.pl-ge-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.pl-ge-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1px solid var(--pl-ge-border);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.pl-ge-btn--primary {
  background: var(--pl-ge-accent);
  border-color: var(--pl-ge-accent);
  color: var(--pl-ge-accent-fg);
}
.pl-ge-btn--ghost {
  background: var(--pl-ge-ghost);
  color: var(--pl-ge-text);
}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const chunkError = isChunkLoadError(error);
  const devPreview = sanitizeDevPreview(error);

  const handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <html lang="es-MX">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PitchLab · Error temporal</title>
        <style>{GLOBAL_ERROR_CSS}</style>
      </head>
      <body>
        <main className="pl-ge-shell" aria-labelledby="global-error-title">
          <div className="pl-ge-card" role="alert">
            <a href="/" className="pl-ge-brand">
              PitchLab
            </a>
            <p className="pl-ge-code">{chunkError ? "Actualización" : "Error crítico"}</p>
            <h1 id="global-error-title" className="pl-ge-title">
              {chunkError
                ? "Hay una actualización disponible"
                : "No pudimos completar la carga"}
            </h1>
            <p className="pl-ge-copy">
              {chunkError
                ? "Recarga la página para continuar con la versión más reciente de PitchLab."
                : "Ocurrió un error inesperado al iniciar la vista. Reintenta o vuelve a la portada."}
            </p>
            {error?.digest ? <p className="pl-ge-digest">Ref. {error.digest}</p> : null}
            {devPreview ? <pre className="pl-ge-debug">{devPreview}</pre> : null}
            <div className="pl-ge-actions">
              <button
                type="button"
                className="pl-ge-btn pl-ge-btn--primary"
                onClick={chunkError ? handleReload : reset}
              >
                {chunkError ? "Recargar página" : "Reintentar"}
              </button>
              <a href="/" className="pl-ge-btn pl-ge-btn--ghost">
                Ir al inicio
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
