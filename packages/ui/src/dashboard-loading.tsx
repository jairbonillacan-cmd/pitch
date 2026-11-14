import React from "react";
import { LaunchScreen } from "./launch-screen";

/**
 * Entrada al panel (después del PIN o del enlace del correo).
 * Usa la pantalla de arranque de PitchLab a pantalla completa.
 */
export function DashboardLoading({ confirmed = false }: { confirmed?: boolean }): React.JSX.Element {
  return <LaunchScreen variant="full" confirmed={confirmed} />;
}
