import React from "react";
import type { Metadata } from "next";
import { MotoresPageSurface } from "@pitchlab/ui";

export const metadata: Metadata = {
  title: "Motores · PitchLab",
  description:
    "Cinco motores propios probados fuera de muestra: Tachyon, Singularity, Minkowski, Geodesic y Cortex IA.",
};

export default function MotoresPage(): React.JSX.Element {
  return <MotoresPageSurface />;
}
