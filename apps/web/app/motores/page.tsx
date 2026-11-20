import React from "react";
import type { Metadata } from "next";
import { MotoresPageSurface } from "@pitchlab/ui/public-sections";
import { SPACETIME_ENGINES } from "@pitchlab/ui/spacetime-catalog";
import { JsonLd } from "../../src/server/json-ld";
import { getSiteUrl } from "../../src/server/site-url";

export const revalidate = 3600;

const TITLE = "Motores · PitchLab";
const DESCRIPTION =
  "Cinco motores propios probados fuera de muestra en +100,000 partidos históricos: Tachyon, Singularity, Minkowski, Geodesic y Cortex IA.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/motores" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/motores",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function MotoresPage(): React.JSX.Element {
  const siteUrl = getSiteUrl();
  const enginesJsonLd: ReadonlyArray<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Motores", item: `${siteUrl}/motores` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Motores Spacetime de PitchLab",
      url: `${siteUrl}/motores`,
      numberOfItems: SPACETIME_ENGINES.length,
      itemListElement: SPACETIME_ENGINES.map((engine, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: engine.shortName,
        description: `${engine.roleLabel}. ${engine.readsText}`,
      })),
    },
  ];

  return (
    <>
      <JsonLd data={enginesJsonLd} />
      <MotoresPageSurface />
    </>
  );
}
