import React from "react";
import type { Metadata } from "next";
import { LandingSurface } from "@pitchlab/ui/landing";
import { buildHomePageJsonLd, JsonLd } from "../src/server/json-ld";
import { loadLandingViewProps } from "../src/server/public-site-data";
import { getSiteUrl } from "../src/server/site-url";

export const revalidate = 300;

const TITLE = "PitchLab — Lo más probable de cada partido, con su momio justo";
const DESCRIPTION =
  "Ves qué resultado es más probable según los datos, cuánto debería pagar y si el momio de tu casa paga más o menos que eso. Tú decides.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function HomePage(): Promise<React.JSX.Element> {
  const props = await loadLandingViewProps();
  return (
    <>
      <JsonLd data={buildHomePageJsonLd(getSiteUrl())} />
      <LandingSurface {...props} />
    </>
  );
}
