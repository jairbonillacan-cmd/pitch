"use client";

import React from "react";
import { BrandLogo } from "@pitchlab/ui/brand-logo";
import { useSafeEffect } from "@pitchlab/ui/hooks";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function ClubErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useSafeEffect(() => {
    console.error("[error club]", error);
  }, [error]);

  const devStackPreview = IS_DEV && typeof error?.stack === "string"
    ? error.stack.split("\n").slice(0, 8).join("\n")
    : null;

  return (
    <section className="pl-notfound" aria-labelledby="club-error-title">
      <div className="pl-notfound-card glass-lens glass-ring">
        <a href="/app" aria-label="PitchLab, partidos de hoy" className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">Error</p>
        <h1 id="club-error-title" className="pl-notfound-title">No pudimos cargar esta pantalla</h1>
        <p className="pl-notfound-copy">
          Vuelve a intentarlo o regresa a los partidos de hoy.
        </p>
        <div className="pl-notfound-actions">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary"
            onClick={() => reset()}
          >
            Intentar de nuevo
          </button>
          <a href="/app" className="pl-prof-btn pl-prof-btn--ghost">
            Partidos de hoy
          </a>
        </div>
        {IS_DEV ? (
          <details
            className="mt-5 text-left rounded-xl p-3 text-xs"
            style={{
              background: "var(--pl-surface)",
              border: "1px solid var(--pl-border)",
              color: "var(--pl-text-secondary)",
            }}
          >
            <summary className="cursor-pointer font-semibold select-none">
              Detalle técnico (solo desarrollo): {error?.name || "Error"}
              {error?.message ? ` — ${error.message}` : ""}
            </summary>
            {error?.digest ? (
              <p className="mt-2 mb-0 font-mono text-[11px] opacity-80">digest: {error.digest}</p>
            ) : null}
            {devStackPreview ? (
              <pre className="mt-2 mb-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug opacity-80">
                {devStackPreview}
              </pre>
            ) : null}
          </details>
        ) : null}
      </div>
    </section>
  );
}
