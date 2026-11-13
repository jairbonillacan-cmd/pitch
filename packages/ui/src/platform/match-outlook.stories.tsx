import React from "react";
import { MatchOutlookStrip } from "./components/MatchOutlookStrip";
import type { MatchOutlookSummary } from "./types";

/* Panoramas de ejemplo para la story (cifras ilustrativas, no son datos de la jornada). */
const FUTBOL_PARCIAL: MatchOutlookSummary = {
  generatedAtUtc: "2026-11-12T16:10:42Z",
  mostLikely: { label: "Gana 1. FC Union Berlin", p: 0.444, fairDecimal: 2.25 },
  scorelines: [
    { home: 1, away: 1, p: 0.106, fairDecimal: 9.43 },
    { home: 2, away: 1, p: 0.088, fairDecimal: 11.33 },
    { home: 1, away: 2, p: 0.073, fairDecimal: 13.72 },
  ],
  quality: { flag: "low_coverage", coveragePct: 34 },
  hasRecentQuote: false,
};

const FUTBOL_COMPLETO: MatchOutlookSummary = {
  ...FUTBOL_PARCIAL,
  mostLikely: { label: "Gana Liverpool", p: 0.612, fairDecimal: 1.63 },
  quality: { flag: "ok", coveragePct: 92 },
  hasRecentQuote: true,
};

const NFL_BASE: MatchOutlookSummary = {
  generatedAtUtc: "2026-11-12T16:10:42Z",
  mostLikely: { label: "Gana Buffalo Bills", p: 0.596, fairDecimal: 1.68 },
  scorelines: [],
  quality: { flag: "fallback_base_rate", coveragePct: 0 },
  hasRecentQuote: false,
};

function Frame({ outlook }: { outlook: MatchOutlookSummary }): React.JSX.Element {
  return (
    <div className="glass-card glass-ring rounded-2xl p-5 space-y-4" style={{ maxWidth: 1100 }}>
      <h2 className="m-0 text-lg font-extrabold">Mercados del partido</h2>
      <MatchOutlookStrip outlook={outlook} oddsFormat="decimal" />
    </div>
  );
}

export default {
  title: "Platform v4 / Panorama del partido",
};

export const DatosParciales = { render: () => <Frame outlook={FUTBOL_PARCIAL} /> };
export const DatosParcialesClaro = { ...DatosParciales, globals: { theme: "light" } };

export const DatosCompletosConCuota = { render: () => <Frame outlook={FUTBOL_COMPLETO} /> };
export const DatosCompletosConCuotaClaro = { ...DatosCompletosConCuota, globals: { theme: "light" } };

export const NflBaseHistorica = { render: () => <Frame outlook={NFL_BASE} /> };
export const NflBaseHistoricaClaro = { ...NflBaseHistorica, globals: { theme: "light" } };

export const Movil = {
  render: () => <Frame outlook={FUTBOL_PARCIAL} />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const MovilClaro = { ...Movil, globals: { theme: "light" } };
