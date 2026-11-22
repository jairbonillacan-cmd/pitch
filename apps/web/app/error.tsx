"use client";

import React from "react";
import { ErrorBoundaryCard } from "../src/client/error-boundary-card";

export default function PublicErrorPage({
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
      scopeLabel="500"
      title="Algo salió mal al cargar esta vista"
      description="El resto del sitio sigue funcionando con normalidad. Puedes reintentar o volver al inicio."
      homeHref="/"
      homeLabel="Ir al inicio"
      secondaryHref="/resultados"
      secondaryLabel="Ver resultados"
      headingId="public-error-title"
      asMain
    />
  );
}
