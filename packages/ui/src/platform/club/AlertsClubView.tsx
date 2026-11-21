"use client";

import React from "react";
import { SofascoreCard, SofascoreEmptyState } from "../../components/ui/sofascore-surface";

export interface AlertsClubViewProps {
  readonly title?: string;
  readonly className?: string;
}

export function AlertsClubView({
  title = "Alertas de mercado",
  className,
}: AlertsClubViewProps = {}): React.JSX.Element {
  return (
    <SofascoreCard title={title} className={className}>
      <SofascoreEmptyState
        title="Sin alertas activas"
        description="Configura reglas de movimiento de línea, apertura o valor esperado."
      />
    </SofascoreCard>
  );
}
