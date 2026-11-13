import React from "react";
import type { Metadata } from "next";
import { LegalDocumentSurface } from "@pitchlab/ui";
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
      lede="Atribución de las fuentes abiertas y sus licencias."
      hasSession={hasSession}
      intro={
        <p>
          PitchLab agradece a los proyectos de datos deportivos abiertos que hacen posible la
          verificación reproducible de nuestros calendarios y marcadores históricos:
        </p>
      }
      sections={[
        {
          id: "nflverse",
          title: "NFL — nflverse",
          body: (
            <p>
              Los datos de calendario y resultados históricos de la NFL provienen de{" "}
              <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">
                nflverse / nflverse-data
              </a>
              , distribuidos bajo licencia{" "}
              <strong>Creative Commons Attribution 4.0 International (CC-BY 4.0)</strong>.
            </p>
          ),
        },
        {
          id: "openfootball",
          title: "Fútbol europeo — openfootball",
          body: (
            <p>
              Los calendarios de Premier League, LaLiga, Bundesliga, Serie A y Ligue 1 provienen de{" "}
              <a href="https://github.com/openfootball/football.json" target="_blank" rel="noopener noreferrer">
                openfootball / football.json
              </a>
              , dedicados al dominio público bajo licencia{" "}
              <strong>Creative Commons CC0 1.0 Universal (Public Domain)</strong>.
            </p>
          ),
        },
        {
          id: "football-data",
          title: "Fútbol europeo — football-data.org",
          body: (
            <p>
              Los marcadores, estados y horarios actualizados de esas cinco ligas provienen de la API
              de{" "}
              <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer">
                football-data.org
              </a>
              .
            </p>
          ),
        },
        {
          id: "emblemas-y-marcas",
          title: "Emblemas y marcas",
          body: (
            <p>
              Los escudos y nombres de clubes y ligas se muestran con fines estrictamente editoriales
              e identificativos dentro del contexto estadístico de cada partido.
            </p>
          ),
        },
      ]}
    />
  );
}
