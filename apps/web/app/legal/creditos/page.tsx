import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui/legal";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créditos de datos · PitchLab",
  description:
    "Atribución de fuentes abiertas y licencias (nflverse, openfootball, football-data.org) usadas en PitchLab.",
  alternates: { canonical: "/legal/creditos" },
};

export default async function CreditosPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <LegalDocumentSurface
      slug="creditos"
      eyebrow="Atribución de datos"
      title="Créditos de datos"
      lede="Atribución de las fuentes abiertas, licencias y alcance editorial de nombres y emblemas."
      lastUpdated="Última actualización: noviembre de 2026"
      hasSession={hasSession}
      intro={
        <p>
          PitchLab reconoce y atribuye los conjuntos de datos deportivos abiertos y servicios de
          calendario que respaldan la verificación reproducible de horarios y marcadores históricos:
        </p>
      }
      sections={[
        {
          id: "nflverse",
          title: "1. NFL — nflverse",
          body: (
            <p>
              Los datos de calendario y resultados históricos de la NFL provienen de{" "}
              <a
                href="https://github.com/nflverse/nflverse-data"
                target="_blank"
                rel="noopener noreferrer"
              >
                nflverse / nflverse-data
              </a>
              , distribuidos bajo licencia{" "}
              <strong>Creative Commons Attribution 4.0 International (CC-BY 4.0)</strong>.
            </p>
          ),
        },
        {
          id: "openfootball",
          title: "2. Fútbol europeo — openfootball",
          body: (
            <p>
              Los calendarios históricos de Premier League, LaLiga, Bundesliga, Serie A y Ligue 1
              provienen de{" "}
              <a
                href="https://github.com/openfootball/football.json"
                target="_blank"
                rel="noopener noreferrer"
              >
                openfootball / football.json
              </a>
              , dedicados al dominio público bajo licencia{" "}
              <strong>Creative Commons CC0 1.0 Universal (Public Domain)</strong>.
            </p>
          ),
        },
        {
          id: "football-data",
          title: "3. Marcadores y horarios actualizados — football-data.org y fuentes públicas",
          body: (
            <p>
              Los horarios, estados de partido y marcadores actualizados de las cinco ligas europeas
              provienen de la API de{" "}
              <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer">
                football-data.org
              </a>
              , complementados en Liga MX y ligas norteamericanas con carteleras públicas de
              resultados oficiales para liquidar picks cerrados de forma auditable.
            </p>
          ),
        },
        {
          id: "emblemas-y-marcas",
          title: "4. Emblemas, nombres de clubes y no afiliación",
          body: (
            <p>
              Los nombres de ligas, equipos y escudos pertenecen a sus respectivos titulares y se
              muestran en PitchLab con fines estrictamente informativos, estadísticos e
              identificativos de cada encuentro. PitchLab es un servicio independiente de análisis
              cuantitativo y no está patrocinado ni afiliado oficialmente con ninguna liga,
              federación o club deportivo.
            </p>
          ),
        },
      ]}
    />
  );
}
