"use client";

import React from "react";
import { SofascoreCard, SofascoreEmptyState } from "../../components/ui/sofascore-surface";

export interface RefereesClubViewProps {
  readonly league?: string;
  readonly title?: string;
  readonly className?: string;
}

export function RefereesClubView({
  title = "Árbitros",
  className,
}: RefereesClubViewProps = {}): React.JSX.Element {
  return (
    <SofascoreCard title={title} className={className}>
      <SofascoreEmptyState
        title="Directorio arbitral disponible próximamente"
        description="Consulta promedios de tarjetas, faltas y rigor por liga."
      />
    </SofascoreCard>
  );
}
