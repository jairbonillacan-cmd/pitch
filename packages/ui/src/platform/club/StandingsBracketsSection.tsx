"use client";

import React from "react";
import { SofascoreCard, SofascoreEmptyState } from "../../components/ui/sofascore-surface";

export interface StandingsBracketsSectionProps {
  readonly league?: string;
  readonly title?: string;
  readonly className?: string;
}

export function StandingsBracketsSection({
  title = "Tabla y llaves",
  className,
}: StandingsBracketsSectionProps = {}): React.JSX.Element {
  return (
    <SofascoreCard title={title} className={className}>
      <SofascoreEmptyState
        title="Sin tabla o llave disponible"
        description="Selecciona una competición activa para consultar clasificación y cruces."
      />
    </SofascoreCard>
  );
}
