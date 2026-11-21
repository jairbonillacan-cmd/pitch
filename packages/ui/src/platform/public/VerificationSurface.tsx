"use client";

import React from "react";
import { SofascoreCard, SofascoreEmptyState } from "../../components/ui/sofascore-surface";

export interface VerificationSurfaceProps {
  readonly title?: string;
  readonly className?: string;
}

export function VerificationSurface({
  title = "Verificación Spacetime",
  className,
}: VerificationSurfaceProps = {}): React.JSX.Element {
  return (
    <SofascoreCard title={title} className={className}>
      <SofascoreEmptyState
        title="Auditoría pública en preparación"
        description="Aquí se publicarán los reportes de calibración verificada."
      />
    </SofascoreCard>
  );
}
