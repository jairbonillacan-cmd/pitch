"use client";

import React from "react";
import { ErrorBoundaryCard } from "../../src/client/error-boundary-card";

export default function ClubErrorPage({
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
      scopeLabel="PitchLab"
      title="No pudimos cargar esta pantalla"
      description="Tuvimos un problema temporal al consultar la información. Tus selecciones y tu récord no se perdieron."
      homeHref="/app"
      homeLabel="Volver a Hoy"
      secondaryHref="/app/picks"
      secondaryLabel="Explorar picks"
      headingId="club-error-title"
    />
  );
}
