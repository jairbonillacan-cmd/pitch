import React from "react";
import type { Metadata } from "next";
import { hasPublicSessionCookie } from "../src/server/public-session";
import { LandingSurface } from "@pitchlab/ui/landing";
import { loadLandingViewProps } from "../src/server/public-site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PitchLab — Lo más probable de cada partido, con su momio justo",
  description:
    "Ves qué resultado es más probable según los datos, cuánto debería pagar y si el momio de tu casa paga más o menos que eso. Tú decides.",
};

export default async function HomePage(): Promise<React.JSX.Element> {
  const [props, hasSession] = await Promise.all([loadLandingViewProps(), hasPublicSessionCookie()]);
  return <LandingSurface {...props} hasSession={hasSession} />;
}
