"use client";

import React from "react";
import { BrandLogo } from "@pitchlab/ui/brand-logo";
import { useSafeEffect } from "@pitchlab/ui/hooks";

export interface ErrorBoundaryCardProps {
  error: (Error & { digest?: string }) | null | undefined;
  reset: () => void;
  scopeLabel: string;
  title: string;
  description: string;
  homeHref: string;
  homeLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  asMain?: boolean;
  headingId: string;
  onReload?: () => void;
}

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;

export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = typeof error.message === "string" ? error.message : "";
  if (CHUNK_ERROR_PATTERN.test(message)) return true;
  if ("cause" in error && error.cause instanceof Error) {
    return isChunkLoadError(error.cause);
  }
  return false;
}

export function sanitizeDevPreview(
  error: Error | null | undefined,
  envMode = process.env.NODE_ENV,
): string | null {
  if (envMode === "production" || !error) return null;
  const raw = `${error.name || "Error"}: ${error.message || ""}`.trim();
  const redacted = raw
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[db-url]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|whsec|re)_[A-Za-z0-9_-]{8,}\b/g, "[secret]")
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[ruta]")
    .replace(/\/(?:Users|home|var|srv|app)\/[^\s"']+/g, "[ruta]");
  return redacted.slice(0, 240);
}

export function ErrorBoundaryCard({
  error,
  reset,
  scopeLabel,
  title,
  description,
  homeHref,
  homeLabel,
  secondaryHref,
  secondaryLabel,
  asMain = false,
  headingId,
  onReload,
}: ErrorBoundaryCardProps): React.JSX.Element {
  const chunkError = isChunkLoadError(error);
  const devPreview = sanitizeDevPreview(error);

  useSafeEffect(() => {
    if (process.env.NODE_ENV !== "production" && error) {
      console.error("[pitchlab-boundary]", error.digest ?? error.name);
    }
  }, [error]);

  const handleReload = (): void => {
    if (onReload) {
      onReload();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const Wrapper = asMain ? "main" : "section";
  const resolvedTitle = chunkError ? "Actualizamos PitchLab mientras navegabas" : title;
  const resolvedCopy = chunkError
    ? "Recarga la vista para cargar los archivos más recientes sin perder tu sesión."
    : description;

  return (
    <Wrapper className="pl-notfound" aria-labelledby={headingId}>
      <div className="pl-notfound-card pl-error-card" role="alert">
        <a href={homeHref} aria-label={`PitchLab, ${homeLabel}`} className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">
          {chunkError ? "Actualización" : scopeLabel}
        </p>
        <h1 id={headingId} className="pl-notfound-title">
          {resolvedTitle}
        </h1>
        <p className="pl-notfound-copy">{resolvedCopy}</p>
        {error?.digest ? (
          <p className="pl-error-digest num">Ref. {error.digest}</p>
        ) : null}
        {devPreview ? (
          <pre className="pl-error-debug" tabIndex={0}>
            {devPreview}
          </pre>
        ) : null}
        <div className="pl-notfound-actions">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary"
            onClick={chunkError ? handleReload : reset}
          >
            {chunkError ? "Recargar página" : "Reintentar"}
          </button>
          <a href={homeHref} className="pl-prof-btn pl-prof-btn--ghost">
            {homeLabel}
          </a>
          {secondaryHref && secondaryLabel ? (
            <a href={secondaryHref} className="pl-prof-btn pl-prof-btn--ghost">
              {secondaryLabel}
            </a>
          ) : null}
        </div>
      </div>
    </Wrapper>
  );
}
