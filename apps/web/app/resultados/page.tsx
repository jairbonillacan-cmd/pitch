import "../record-v2.css";
import React from "react";
import type { Metadata } from "next";
import { ResultadosPageSurface } from "@pitchlab/ui/public-sections";
import { buildSportsEventListJsonLd, JsonLd } from "../../src/server/json-ld";
import { loadResultadosViewProps } from "../../src/server/public-site-data";
import { getSiteUrl } from "../../src/server/site-url";

export const revalidate = 300;

const TITLE = "Resultados · PitchLab";
const DESCRIPTION =
  "Historial íntegro de partidos terminados, publicado antes del inicio y sin editar después, con lo que se cumplió y lo que no.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/resultados" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/resultados",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function ResultadosPage(): Promise<React.JSX.Element> {
  const props = await loadResultadosViewProps();
  const siteUrl = getSiteUrl();

  const breadcrumbNode: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Resultados", item: `${siteUrl}/resultados` },
    ],
  };

  const recentCompletedEvents = props.results
    .flatMap((item) =>
      item.kickoffUtc
        ? [
            {
              leagueName: item.leagueLabel,
              kickoffUtc: item.kickoffUtc,
              status: "FT" as const,
              homeTeam: { name: item.home.name },
              awayTeam: { name: item.away.name },
              score: item.score ?? null,
            },
          ]
        : [],
    )
    .slice(0, 20);

  const jsonLdNodes: Array<Record<string, unknown>> = [breadcrumbNode];
  if (recentCompletedEvents.length > 0) {
    jsonLdNodes.push(
      buildSportsEventListJsonLd(
        recentCompletedEvents,
        siteUrl,
        "Historial de resultados publicados · PitchLab",
      ),
    );
  }

  return (
    <>
      <JsonLd data={jsonLdNodes} />
      <ResultadosPageSurface {...props} />
    </>
  );
}
