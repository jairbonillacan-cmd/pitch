import React from "react";
import { asLeagueId, type MatchAnalysis } from "@pitchlab/contracts";
import {
  Button,
  Tag,
  Panel,
  Notice,
  Field,
  Mascot,
  BrandLogo,
  Skeleton,
  EmptyState,
  ErrorState,
} from "./primitives.js";
import {
  TeamBadge,
  LeagueBadge,
  PBar,
  ProbBar,
  ProbSplit,
  Freshness,
  MatchCard,
  MarketTable,
  OddsCompare,
  CalcTrace,
  FactorsList,
} from "./sports.js";
import {
  FloatingNav,
  PublicFooter,
  PinPad,
  AnalysisDialog,
} from "./shells.js";

export default {
  title: "PitchLab/D1 Design System",
};

const sampleMatch: MatchAnalysis = {
  id: "epl-ars-che",
  league: asLeagueId("premier-league"),
  leagueLabel: "Premier League",
  sport: "football",
  round: "Jornada 11",
  day: "2026-11-08",
  dayLabel: "domingo, 8 de noviembre",
  kickoffUtc: "2026-11-08T16:30:00Z",
  kickoffLocal: "16:30",
  venue: "Emirates Stadium",
  status: "NS",
  home: {
    code: "ars",
    slug: "arsenal",
    name: "Arsenal",
    shortName: "ARS",
    record: "Ataque 1.54 · Defensa 0.90",
  },
  away: {
    code: "che",
    slug: "chelsea",
    name: "Chelsea",
    shortName: "CHE",
    record: "Ataque 1.24 · Defensa 1.12",
  },
  outcomes: [
    {
      key: "home",
      label: "Arsenal",
      probability: 0.453,
      fairOdds: { decimal: 2.21, american: 121 },
    },
    {
      key: "draw",
      label: "Empate",
      probability: 0.258,
      fairOdds: { decimal: 3.88, american: 288 },
    },
    {
      key: "away",
      label: "Chelsea",
      probability: 0.289,
      fairOdds: { decimal: 3.46, american: 246 },
    },
  ],
  projection: {
    home: 1.72,
    away: 1.38,
    total: 3.1,
    margin: 0.34,
  },
  x12: [0.453, 0.258, 0.289],
  marketGroups: [
    {
      g: "Resultado",
      rows: [
        ["Arsenal", 0.453],
        ["Empate", 0.258],
        ["Chelsea", 0.289],
      ],
    },
    {
      g: "Doble oportunidad",
      rows: [
        ["Arsenal o empate", 0.711],
        ["Chelsea o empate", 0.547],
        ["Arsenal o Chelsea", 0.742],
      ],
    },
    {
      g: "Goles totales",
      rows: [
        ["Más de 2.5 goles", 0.592],
        ["Menos de 2.5 goles", 0.408],
      ],
    },
    {
      g: "Ambos anotan",
      rows: [
        ["Sí", 0.574],
        ["No", 0.426],
      ],
    },
  ],
  mostLikelyScore: { home: 1, away: 1, p: 0.118 },
  factors: [
    {
      label: "Goles esperados",
      impact: "1.72 vs 1.38",
      detail: "Emirates Stadium",
    },
    {
      label: "Ataque local vs defensa",
      impact: "1.54 × 1.12",
      detail: "Media de liga 1.42 goles",
    },
    {
      label: "Ataque visita vs defensa",
      impact: "1.24 × 0.90",
      detail: "Ajuste por localía +10 %",
    },
    {
      label: "Marcador más probable",
      impact: "1–1 (11.8 %)",
      detail: "64 marcadores evaluados",
    },
  ],
  trace: [
    { step: "Paso 1", value: "Arsenal (1.54 / 0.90) · Chelsea (1.24 / 1.12)" },
    { step: "Paso 2", value: "Goles esperados: 1.72 local · 1.38 visitante" },
    { step: "Paso 3", value: "Matriz de 64 marcadores (0–7 goles) con ajuste de marcadores bajos" },
    { step: "Paso 4", value: "Resultado: 45.3 % · Empate 25.8 % · 28.9 %" },
  ],
  steps: [
    "Arsenal (1.54 / 0.90) · Chelsea (1.24 / 1.12)",
    "Goles esperados: 1.72 local · 1.38 visitante",
    "Matriz de 64 marcadores (0–7 goles) con ajuste de marcadores bajos",
    "Resultado: 45.3 % · Empate 25.8 % · 28.9 %",
    "Totales: Más de 2.5 goles 59.2 % · Ambos anotan 57.4 %",
    "Cuota justa local: 2.21 (+121)",
  ],
  updatedAt: "hace 2 h",
};

export const Primitives = () => (
  <div style={{ display: "grid", gap: "16px", padding: "24px", maxWidth: "680px" }}>
    <BrandLogo variant="horizontal" />
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <Button variant="primary">Acción primaria</Button>
      <Button variant="secondary">Secundaria</Button>
      <Button variant="ghost">Fantasma</Button>
    </div>
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <Tag variant="ok" dot>
        Activo
      </Tag>
      <Tag variant="info" dot>
        Beta privada
      </Tag>
      <Tag variant="model" dot>
        Modelo PitchLab · en validación
      </Tag>
      <Tag variant="demo">Demo</Tag>
    </div>
    <Panel style={{ padding: "16px" }}>
      <p style={{ margin: 0 }}>Panel base con tokens de superficie D1.</p>
    </Panel>
    <Notice>
      Las cuentas abren pronto. Mientras tanto, la beta es solo con código de socio.
    </Notice>
    <Field id="email" label="Correo" placeholder="tu@correo.com" />
    <Mascot edition="radar" size={140} />
    <Skeleton width="200px" height="16px" />
    <EmptyState />
    <ErrorState />
  </div>
);

export const BarsAndSplits = () => (
  <div style={{ display: "grid", gap: "20px", padding: "24px", maxWidth: "560px" }}>
    <PBar value={0.584} lead />
    <PBar value={0.258} />
    <ProbBar outcomes={sampleMatch.outcomes} />
    <ProbSplit outcomes={sampleMatch.outcomes} />
    <Freshness generatedAt="hace 2 h" />
  </div>
);

export const MatchCardStory = () => (
  <div style={{ maxWidth: "380px", padding: "24px" }}>
    <MatchCard match={sampleMatch} />
  </div>
);

export const MarketTableAndCompare = () => (
  <div style={{ display: "grid", gap: "24px", padding: "24px", maxWidth: "720px" }}>
    <MarketTable
      outcomes={sampleMatch.outcomes}
      marketGroups={sampleMatch.marketGroups}
      selectedKey="ResultadoArsenal"
    />
    <OddsCompare marketName="Arsenal" modelProbability={0.453} />
    <FactorsList factors={sampleMatch.factors} />
    <CalcTrace trace={sampleMatch.trace} />
  </div>
);

export const NavigationAndFooter = () => (
  <div style={{ minHeight: "360px", paddingTop: "96px" }}>
    <FloatingNav activeAuthRoute="landing" />
    <PublicFooter />
  </div>
);

export const BadgesShowcase = () => (
  <div style={{ display: "flex", gap: "16px", alignItems: "center", padding: "24px" }}>
    <LeagueBadge league="liga-mx" size={44} />
    <LeagueBadge league="premier-league" size={44} />
    <LeagueBadge league="nfl" size={44} />
    <LeagueBadge league="nhl" size={44} />
    <LeagueBadge league="mlb" size={44} />
    <TeamBadge league="premier-league" slug="arsenal" code="ars" name="Arsenal" size={40} />
    <TeamBadge league="nfl" slug="kansas-city-chiefs" code="kc" name="Chiefs" size={40} />
  </div>
);

export const PinPadDialog = () => (
  <PinPad
    open
    onClose={() => {}}
    onSubmitPin={async (code) => ({ ok: code === "2026" })}
  />
);

export const AnalysisModalResult = () => (
  <AnalysisDialog
    match={sampleMatch}
    open
    skipTrace
    onClose={() => {}}
  />
);
