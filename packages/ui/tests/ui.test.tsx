import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asLeagueId } from "@pitchlab/contracts";
import {
  Button,
  Tag,
  Panel,
  Notice,
  Field,
  Mascot,
  BrandLogo,
  ProbSplit,
  MatchCard,
  MarketTable,
  CalcTrace,
  FactorsList,
  PublicFooter,
} from "../src/index.js";

describe("@pitchlab/ui components", () => {
  it("renders primitives cleanly", () => {
    const html = renderToStaticMarkup(
      <div>
        <Button variant="primary">Entrar</Button>
        <Tag variant="info" dot>
          Beta
        </Tag>
        <Panel>Contenido</Panel>
        <Notice>Aviso</Notice>
        <Field id="f1" label="Correo" />
        <Mascot edition="radar" />
        <BrandLogo variant="horizontal" />
      </div>,
    );
    expect(html).toContain("btn-primary");
    expect(html).toContain("tag-info");
    expect(html).toContain("/brand/mascot/r1/radar.webp");
  });

  it("renders sports components and footer without leaking internal model names", () => {
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
    const html = renderToStaticMarkup(
      <div>
        <ProbSplit outcomes={outcomes} />
        <MarketTable outcomes={outcomes} />
        <CalcTrace trace={[{ step: "Datos de entrada", value: "45 partidos" }]} />
        <FactorsList
          factors={[
            { label: "Goles esperados", detail: "Proyección", impact: "1.6 vs 1.1" },
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
                detail: "Proyección",
                impact: "1.6 vs 1.1",
              },
            ],
            trace: [{ step: "Datos de entrada", value: "45 partidos" }],
          }}
        />
        <PublicFooter />
      </div>,
    );

    expect(html).toContain("45.3 %");
    expect(html).toContain("2.21");
    expect(html).toContain("Emirates Stadium");
    expect(html).toContain("/legal/creditos");
  });
});
