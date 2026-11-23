"use client";

import React from "react";
import { ErrorBoundaryCard } from "../../src/client/error-boundary-card";

export default function BlogErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <ErrorBoundaryCard
      error={error}
      reset={reset}
      scopeLabel="Blog"
      title="No pudimos cargar este artículo"
      description="Intenta recargar la lectura o regresa al índice editorial de PitchLab."
      homeHref="/blog"
      homeLabel="Ver artículos"
      secondaryHref="/"
      secondaryLabel="Ir al inicio"
      headingId="blog-error-title"
      asMain
    />
  );
}
