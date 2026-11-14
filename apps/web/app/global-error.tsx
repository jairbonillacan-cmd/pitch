"use client";

import React, { useEffect } from "react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("[error global]", error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "rgb(11 13 20)",
          color: "rgb(245 247 252)",
        }}
      >
        <main
          style={{
            maxWidth: "460px",
            width: "100%",
            padding: "28px",
            borderRadius: "20px",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            background: "rgba(255, 255, 255, 0.05)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "13px",
              letterSpacing: "0.08em",
              opacity: 0.72,
            }}
          >
            PITCHLAB · ERROR INESPERADO
          </p>
          <h1 style={{ margin: "0 0 10px", fontSize: "22px", lineHeight: 1.25 }}>
            Ocurrió un problema inesperado
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: "14px", lineHeight: 1.5, opacity: 0.82 }}>
            Recarga esta vista o regresa al inicio de PitchLab.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                background: "rgb(95 215 160)",
                color: "rgb(9 14 18)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Intentar de nuevo
            </button>
            <a
              href="/"
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.22)",
                color: "rgb(245 247 252)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
