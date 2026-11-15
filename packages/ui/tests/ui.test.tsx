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
  EmblemSurfaceProvider,
  LeagueBadge,
  TeamBadge,
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

  it("renders Bzzoiro crests only inside /app surface, with lazy/no-referrer attributes and initials fallback", () => {
    // Superficie pública por omisión (landing/auth): cero llamadas a Bzzoiro aun con logoUrl.
    const publicHtml = renderToStaticMarkup(
      <div>
        <TeamBadge
          league="premier-league"
          slug="arsenal"
          name="Arsenal"
          logoUrl="https://sports.bzzoiro.com/img/team/18/?bg=transparent"
          size={36}
          decorative={false}
        />
        <LeagueBadge
          league="premier-league"
          label="Premier League"
          logoUrl="https://sports.bzzoiro.com/img/league/1/?bg=transparent"
          size={24}
        />
        <TeamBadge league="nba" slug="los-angeles-lakers" name="Lakers" size={36} />
      </div>,
    );
    expect(publicHtml).toContain('data-emblem-source="editorial"');
    expect(publicHtml).toContain('src="/brand/sports/premier-league/r2/svg/arsenal.svg"');
    expect(publicHtml).toContain('src="/brand/sports/premier-league/r2/svg/premier-league.svg"');
    expect(publicHtml).toContain("badge-fallback");
    expect(publicHtml).not.toContain("sports.bzzoiro.com");

    // Superficie /app: usa escudos externos de Bzzoiro con lazy, async, no-referrer y tamaño fijo.
    const appHtml = renderToStaticMarkup(
      <EmblemSurfaceProvider surface="app">
        <div>
          <TeamBadge league="premier-league" slug="arsenal" name="Arsenal" size={36} decorative={false} />
          <TeamBadge
            league="liga-mx"
            slug="club-promocion"
            name="Club Promoción"
            logoUrl="https://sports.bzzoiro.com/img/team/7777/?bg=transparent"
            size={40}
            decorative={false}
          />
          <LeagueBadge
            league="liga-mx"
            label="Liga MX"
            logoUrl="https://sports.bzzoiro.com/img/league/154/?bg=transparent"
            size={28}
          />
          <TeamBadge league="nba" slug="los-angeles-lakers" name="Lakers" size={36} />
        </div>
      </EmblemSurfaceProvider>,
    );
    expect(appHtml).toContain('data-emblem-source="bzzoiro"');
    expect(appHtml).toContain('src="https://sports.bzzoiro.com/img/team/18/?bg=transparent"');
    expect(appHtml).toContain('src="https://sports.bzzoiro.com/img/team/7777/?bg=transparent"');
    expect(appHtml).toContain('src="https://sports.bzzoiro.com/img/league/154/?bg=transparent"');
    expect(appHtml).toContain('src="https://sports.bzzoiro.com/img/basketball/team/13/?bg=transparent"');
    expect(appHtml).toContain('loading="lazy"');
    expect(appHtml).toContain('decoding="async"');
    expect(appHtml).toContain('referrerPolicy="no-referrer"');
    expect(appHtml).toContain('width="36"');
    expect(appHtml).toContain('height="36"');
    expect(appHtml).toContain('alt="Arsenal"');

    // editorialOnly y ligas sin cobertura: en /app solo NFL conserva SVG local; NHL/MLB caen a iniciales salvo editorialOnly.
    const localHtml = renderToStaticMarkup(
      <EmblemSurfaceProvider surface="app">
        <div>
          <TeamBadge league="premier-league" slug="arsenal" name="Arsenal" size={36} editorialOnly />
          <TeamBadge league="nfl" slug="kansas-city-chiefs" name="Chiefs" size={36} />
          <LeagueBadge league="nfl" label="NFL" size={24} />
          <TeamBadge league="nhl" slug="boston-bruins" name="Bruins" size={36} />
          <TeamBadge league="mlb" slug="new-york-yankees" name="Yankees" size={36} />
          <TeamBadge league="nhl" slug="boston-bruins" name="Bruins" size={36} editorialOnly />
          <TeamBadge league="mlb" slug="new-york-yankees" name="Yankees" size={36} editorialOnly />
        </div>
      </EmblemSurfaceProvider>,
    );
    expect(localHtml).toContain('src="/brand/sports/premier-league/r2/svg/arsenal.svg"');
    expect(localHtml).toContain('src="/brand/sports/nfl/r1/svg/kansas-city-chiefs.svg"');
    expect(localHtml).toContain('src="/brand/sports/nfl/r1/svg/nfl.svg"');
    expect(localHtml).toContain("badge-fallback");
    expect(localHtml).toContain(">BRU<");
    expect(localHtml).toContain(">YAN<");
    expect(localHtml).toContain('src="/brand/sports/nhl/r1/svg/boston-bruins.svg"');
    expect(localHtml).toContain('src="/brand/sports/mlb/r1/svg/new-york-yankees.svg"');
    expect(localHtml).not.toContain("sports.bzzoiro.com");

    // Sin escudo (logoUrl null / vacío o sin coincidencia) cae automáticamente a iniciales.
    const fallbackHtml = renderToStaticMarkup(
      <EmblemSurfaceProvider surface="app">
        <div>
          <TeamBadge league="premier-league" slug="club-inexistente" name="Club Prueba" size={36} />
          <TeamBadge league="premier-league" slug="arsenal" name="Arsenal" logoUrl={null} size={36} />
          <LeagueBadge league="premier-league" label="Premier League" logoUrl={null} size={28} />
        </div>
      </EmblemSurfaceProvider>,
    );
    expect(fallbackHtml).toContain("badge-fallback");
    expect(fallbackHtml).toContain(">CP<");
    expect(fallbackHtml).toContain(">ARS<");
    expect(fallbackHtml).toContain(">PL<");
    expect(fallbackHtml).not.toContain("<img");
  });
});
