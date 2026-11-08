import React from "react";
import { asLeagueId } from "@pitchlab/contracts";
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
  ProbBar,
  ProbSplit,
  Freshness,
  MatchCard,
  MarketTable,
  CalcTrace,
  FactorsList,
} from "./sports.js";

export default {
  title: "PitchLab/DesignSystem",
};

export const PrimitivesShowcase = () => (
  <div style={{ display: "grid", gap: "16px", padding: "24px" }}>
    <BrandLogo variant="horizontal" />
    <div style={{ display: "flex", gap: "12px" }}>
      <Button variant="primary">Acción primaria</Button>
      <Button variant="secondary">Secundaria</Button>
      <Button variant="ghost">Fantasma</Button>
    </div>
    <div style={{ display: "flex", gap: "8px" }}>
      <Tag variant="ok" dot>
        Activo
      </Tag>
      <Tag variant="info" dot>
        Beta privada
      </Tag>
      <Tag variant="model">Modelo estadístico</Tag>
      <Tag variant="demo">Demo</Tag>
    </div>
    <Panel>
      <p>Panel base con tokens de superficie.</p>
    </Panel>
    <Notice>El registro se abre por invitación.</Notice>
    <Field id="email" label="Correo electrónico" placeholder="tu@correo.com" />
    <Mascot edition="radar" size={120} />
    <Skeleton width="200px" height="16px" />
    <EmptyState />
    <ErrorState />
  </div>
);

export const SportsShowcase = () => {
  const outcomes = [
    {
      key: "home" as const,
      label: "Arsenal",
      probability: 0.453,
      fairOdds: { decimal: 2.21, american: 121 },
    },
    {
      key: "draw" as const,
      label: "Empate",
      probability: 0.258,
      fairOdds: { decimal: 3.88, american: 288 },
    },
    {
      key: "away" as const,
      label: "Newcastle",
      probability: 0.289,
      fairOdds: { decimal: 3.46, american: 246 },
    },
  ];
  return (
    <div style={{ display: "grid", gap: "16px", padding: "24px" }}>
      <TeamBadge league="premier-league" slug="arsenal" name="Arsenal" />
      <LeagueBadge league="premier-league" label="Premier League" />
      <ProbBar outcomes={outcomes} />
      <ProbSplit outcomes={outcomes} />
      <Freshness generatedAt="2026-11-08T18:00:00Z" />
      <MarketTable outcomes={outcomes} />
      <CalcTrace
        trace={[
          { step: "Datos de entrada", value: "24 partidos evaluados" },
          { step: "Fuerzas estimadas", value: "Ataque y defensa por sede" },
          { step: "Ajuste de partido", value: "Goles esperados 1.62 vs 1.18" },
          { step: "Simulación del marcador", value: "Matriz 0–10 goles" },
        ]}
      />
      <FactorsList
        factors={[
          {
            label: "Goles esperados",
            detail: "El modelo proyecta 1.62 goles de Arsenal por 1.18 de Newcastle.",
            impact: "1.62 vs 1.18",
          },
        ]}
      />
      <MatchCard
        match={{
          id: "epl-ars-new",
          league: asLeagueId("premier-league"),
          leagueLabel: "Premier League",
          sport: "football",
          round: "Jornada 10",
          day: "sab",
          dayLabel: "Sáb 7 nov",
          kickoffUtc: "2026-11-07T15:00:00Z",
          kickoffLocal: "09:00 CDMX",
          venue: "Emirates Stadium",
          status: "NS",
          home: {
            slug: "arsenal",
            name: "Arsenal",
            shortName: "ARS",
            record: "3G-1E-1P · 10 pts",
          },
          away: {
            slug: "newcastle-united",
            name: "Newcastle",
            shortName: "NEW",
            record: "2G-2E-1P · 8 pts",
          },
          outcomes,
          factors: [
            {
              label: "Goles esperados",
              detail: "El modelo proyecta 1.62 goles de Arsenal por 1.18 de Newcastle.",
              impact: "1.62 vs 1.18",
            },
          ],
          trace: [
            { step: "Datos de entrada", value: "24 partidos evaluados" },
          ],
        }}
      />
    </div>
  );
};
