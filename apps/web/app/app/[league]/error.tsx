"use client";

import React from "react";
import { ErrorBoundaryCard } from "../../../src/client/error-boundary-card";

export default function LeagueHubErrorPage({
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
      scopeLabel="Liga"
      title="No pudimos abrir esta competición"
      description="La tabla o los partidos de esta liga tuvieron un fallo temporal. Reintenta o regresa al resumen de hoy."
      homeHref="/app"
      homeLabel="Volver a Hoy"
      secondaryHref="/app/picks"
      secondaryLabel="Explorar picks"
      headingId="league-error-title"
    />
  );
}
