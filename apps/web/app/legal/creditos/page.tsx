import React from "react";
import { LegalShell } from "../../../src/client/legal-shell";

export default function CreditosPage(): React.JSX.Element {
  return (
    <LegalShell eyebrow="Atribución de datos" title="Créditos de datos">
      <p>
        PitchLab agradece a los proyectos de datos deportivos abiertos que hacen
        posible la verificación reproducible de nuestros calendarios y marcadores
        históricos:
      </p>
      <h2>NFL — nflverse</h2>
      <p>
        Los datos de calendario y resultados históricos de la NFL provienen de{" "}
        <a
          href="https://github.com/nflverse/nflverse-data"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--brand-primary)", fontWeight: 600 }}
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
          style={{ color: "var(--brand-primary)", fontWeight: 600 }}
        >
          openfootball / football.json
        </a>
        , dedicados al dominio público bajo licencia{" "}
        <strong>Creative Commons CC0 1.0 Universal (Public Domain)</strong>.
      </p>
      <h2>Fútbol europeo — football-data.org</h2>
      <p>
        Los marcadores, estados y horarios actualizados de esas cinco ligas provienen de la API de{" "}
        <a
          href="https://www.football-data.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--brand-primary)", fontWeight: 600 }}
        >
          football-data.org
        </a>
        .
      </p>
      <h2>Emblemas y marcas</h2>
      <p>
        Los escudos y nombres de clubes y ligas se muestran con fines
        estrictamente editoriales e identificativos dentro del contexto
        estadístico de cada partido.
      </p>
    </LegalShell>
  );
}
