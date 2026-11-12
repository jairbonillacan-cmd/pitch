import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créditos de datos · PitchLab",
  description:
    "Atribución de fuentes abiertas y licencias (nflverse, openfootball, football-data.org) usadas en PitchLab.",
};

export default async function CreditosPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <PublicSiteShell hasSession={hasSession}>
      <div className="pl-page-enter max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        <article className="glass-lens glass-ring rounded-2xl p-6 sm:p-8 legal-doc space-y-4">
          <div>
            <p className="eyebrow">Atribución de datos</p>
            <h1>Créditos de datos</h1>
          </div>
          <p>
            PitchLab agradece a los proyectos de datos deportivos abiertos que hacen posible la
            verificación reproducible de nuestros calendarios y marcadores históricos:
          </p>
          <h2>NFL — nflverse</h2>
          <p>
            Los datos de calendario y resultados históricos de la NFL provienen de{" "}
            <a
              href="https://github.com/nflverse/nflverse-data"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--pl-brand)", fontWeight: 600 }}
            >
              nflverse / nflverse-data
            </a>
            , distribuidos bajo licencia{" "}
            <strong>Creative Commons Attribution 4.0 International (CC-BY 4.0)</strong>.
          </p>
          <h2>Fútbol europeo — openfootball</h2>
          <p>
            Los calendarios de Premier League, LaLiga, Bundesliga, Serie A y Ligue 1 provienen de{" "}
            <a
              href="https://github.com/openfootball/football.json"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--pl-brand)", fontWeight: 600 }}
            >
              openfootball / football.json
            </a>
            , dedicados al dominio público bajo licencia{" "}
            <strong>Creative Commons CC0 1.0 Universal (Public Domain)</strong>.
          </p>
          <h2>Fútbol europeo — football-data.org</h2>
          <p>
            Los marcadores, estados y horarios actualizados de esas cinco ligas provienen de la API
            de{" "}
            <a
              href="https://www.football-data.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--pl-brand)", fontWeight: 600 }}
            >
              football-data.org
            </a>
            .
          </p>
          <h2>Emblemas y marcas</h2>
          <p>
            Los escudos y nombres de clubes y ligas se muestran con fines estrictamente editoriales
            e identificativos dentro del contexto estadístico de cada partido.
          </p>
        </article>
      </div>
    </PublicSiteShell>
  );
}
