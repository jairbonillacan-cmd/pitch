import React from "react";
import type { Metadata } from "next";
import { MotoresPageSurface } from "@pitchlab/ui/public-sections";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Motores · PitchLab",
  description:
    "Cinco motores propios probados fuera de muestra: Tachyon, Singularity, Minkowski, Geodesic y Cortex IA.",
};

export default function MotoresPage(): React.JSX.Element {
  return <MotoresPageSurface />;
}
