import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { asLeagueId } from "@pitchlab/contracts";
import {
  Button,
  Tag,
  ThemeToggle,
  Panel,
  Notice,
  Field,
  Mascot,
  BrandLogo,
  ProbSplit,
  MatchCard,
  ResultsSection,
  MarketTable,
  CalcTrace,
  FactorsList,
  PublicFooter,
} from "../src/index";

describe("@pitchlab/ui components", () => {
  it("renders primitives cleanly", () => {
    const html = renderToStaticMarkup(
      <div>
        <Button>Entrar</Button>
        <Panel>Contenido</Panel>
        <Notice>Aviso</Notice>
        <Field id="f1" label="Correo" />
        <Mascot edition="radar" />
        <BrandLogo variant="horizontal" />
      </div>,
    );
    expect(html).toContain("data-slot=\"button\"");
    expect(html).toContain("bg-primary");
    expect(html).toContain("/brand/mascot/r1/radar.webp");
  });

  it("renders Tag and ThemeToggle with the shadcn slots", () => {
    const tag = renderToStaticMarkup(<Tag variant="info" dot>Beta</Tag>);
    const toggle = renderToStaticMarkup(<ThemeToggle />);

    expect(tag).toContain('data-slot="badge"');
    expect(tag).toContain('data-variant="pill-info"');
    expect(tag).toContain('class="dot"');
    expect(toggle).toContain('data-slot="button"');
    expect(toggle).toContain('data-theme-toggle=""');
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

  it("colors finished MatchCards green (final-hit) or red (final-miss) and renders ResultsSection", () => {
    const outcomes = [
      {
        key: "home" as const,
        label: "Arsenal gana",
        probability: 0.56,
        fairOdds: { decimal: 1.79, american: -127 },
      },
      {
        key: "draw" as const,
        label: "Empate",
        probability: 0.24,
        fairOdds: { decimal: 4.17, american: 317 },
      },
      {
        key: "away" as const,
        label: "Newcastle gana",
        probability: 0.2,
        fairOdds: { decimal: 5.0, american: 400 },
      },
    ];
    const baseMatch = {
      id: "epl-ars-new-ft",
      league: asLeagueId("premier-league"),
      leagueLabel: "Premier League",
      sport: "football" as const,
      round: "Jornada 10",
      day: "sab",
      dayLabel: "Sáb 7 nov",
      kickoffUtc: "2026-11-07T15:00:00Z",
      kickoffLocal: "09:00",
      venue: "Emirates Stadium",
      status: "FT" as const,
      x12: [0.56, 0.24, 0.2] as [number, number, number],
      home: {
        slug: "arsenal",
        name: "Arsenal",
        shortName: "Arsenal",
        record: "10 PJ",
      },
      away: {
        slug: "newcastle-united",
        name: "Newcastle",
        shortName: "Newcastle",
        record: "10 PJ",
      },
      outcomes,
      factors: [],
      trace: [],
    };

    const wonMatch = { ...baseMatch, id: "m-won", score: { home: 2, away: 0 } };
    const lostMatch = { ...baseMatch, id: "m-lost", score: { home: 0, away: 1 } };

    const html = renderToStaticMarkup(
      <ResultsSection matches={[wonMatch, lostMatch]} leagueLabel="Premier League" />,
    );

    expect(html).toContain("final-hit");
    expect(html).toContain("final-miss");
    expect(html).toContain("1 ganado");
    expect(html).toContain("1 perdido");
  });
});
