import React from "react";
import { BrandLogo } from "./primitives";

export function DashboardLoading({ confirmed = false }: { confirmed?: boolean }): React.JSX.Element {
  return (
    <div
      className="dashboard-loading"
      data-confirmed={confirmed || undefined}
      role="status"
      aria-label={confirmed ? "Código correcto. Cargando el panel" : "Cargando el panel"}
    >
      <div className="dashboard-loading-mark" aria-hidden="true">
        <span className="dashboard-loading-symbol">
          <BrandLogo variant="isotype" width={52} height={52} />
        </span>
        {confirmed && (
          <span className="dashboard-loading-check">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="m11 24 9 9 17-18"
                pathLength={1}
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
