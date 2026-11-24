import "../record-v2.css";
import "../editorial-verificacion.css";
import React from "react";
import type { Metadata } from "next";
import {
  ResultadosPageSurface,
  selectProjectedResultadosBoard,
} from "@pitchlab/ui/public-sections";
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

async function ResultadosStreamContent(): Promise<React.JSX.Element> {
  const props = await loadResultadosViewProps();
  const siteUrl = getSiteUrl();
  const boardResults = selectProjectedResultadosBoard(props.results);

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
      <ResultadosPageSurface results={props.results} boardResults={boardResults} />
    </>
  );
}

export default function ResultadosPage(): React.JSX.Element {
  return (
    <React.Suspense
      fallback={
        <main className="pl-v4-main container mx-auto px-4 py-10">
          <div className="pl-route-skel space-y-5" role="status" aria-busy="true">
            <span className="sr-only">Cargando historial de resultados</span>
            <div className="pl-skel-card rounded-3xl p-6 space-y-3">
              <div className="pl-skel-bar h-7 w-72 max-w-full rounded-lg" />
              <div className="pl-skel-bar h-4 w-96 max-w-full rounded" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((idx) => (
                <div key={`rs-k-${idx}`} className="pl-skel-card rounded-2xl p-4 space-y-2">
                  <div className="pl-skel-bar h-3 w-24 rounded" />
                  <div className="pl-skel-bar h-7 w-20 rounded" />
                </div>
              ))}
            </div>
            <div className="pl-skel-card rounded-2xl p-5 space-y-3">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div key={`rs-r-${idx}`} className="pl-skel-bar h-12 rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <ResultadosStreamContent />
    </React.Suspense>
  );
}
