import React from "react";
import { LaunchScreen } from "@pitchlab/ui/launch-screen";

/** Carga entre páginas del club: el encabezado y la barra lateral no se mueven; el arranque ocupa el contenido. */
export default function Loading(): React.JSX.Element {
  return <LaunchScreen variant="inline" />;
}
