import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformProvider } from "../src/platform/platform-provider";
import { CommandPaletteModal } from "../src/platform/components/PlatformOverlays";
import { ClubLayoutShell } from "../src/platform/components/ShellChrome";
import { STORY_DATASET } from "../src/platform/story-fixtures";

describe("ClubLayoutShell header navigation", () => {
  it("mueve la navegación del sidebar al header y elimina el aside lateral", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <ClubLayoutShell activePath="/app">
          <div>Contenido principal</div>
        </ClubLayoutShell>
      </PlatformProvider>,
    );

    expect(html).not.toContain('class="app-rail');
    expect(html).not.toContain("app-rail");
    expect(html).toContain("pl-header-nav");
    expect(html).toContain("pl-header-nav-bar");
    expect(html).toContain("pl-header-nav-label");
    expect(html).toContain("pl-header-nav-overlay");
    expect(html).toContain("rail-group-toggle");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("pl-header-nav-ligas");
    expect(html).toContain("Buscar picks");
    expect(html).toContain("Compara tu momio");
    expect(html).toContain("Resultados");
    expect(html).toContain("pl-header-overlay-leagues");
    expect(html).toContain('href="/app"');
    expect(html).toContain('aria-label="PitchLab Inicio"');
    expect(html).not.toContain('href="/" aria-label="PitchLab Inicio"');
    expect(html).not.toContain('aria-label="Simulador de rol"');
    expect(html).not.toContain("data-role-option");
    expect(html).toContain('href="/app/parlays"');
  });

  it("marca el ítem de liga activo tanto en escritorio (overlay) como en móvil", () => {
    const firstLeague = STORY_DATASET.leagues[0]!;
    const href = `/app/${firstLeague.league}`;
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <ClubLayoutShell activePath={href}>
          <div>Vista liga</div>
        </ClubLayoutShell>
      </PlatformProvider>,
    );

    expect(html).toContain(`data-league="${firstLeague.league}"`);
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("pl-header-sportband");
  });

  it("muestra la tira de deportes en el header solo en /app y la oculta en partido o jugador", () => {
    const homeHtml = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <ClubLayoutShell activePath="/app">
          <div>Inicio</div>
        </ClubLayoutShell>
      </PlatformProvider>,
    );
    expect(homeHtml).toContain("pl-header-sportband");
    expect(homeHtml).not.toContain('aria-label="Ligas rápidas móvil"');
    expect(homeHtml).toContain('data-sport-filter="all"');
    expect(homeHtml).toContain('data-sport-filter="futbol"');
    expect(homeHtml).toContain('data-sport-filter="mlb"');

    for (const hiddenPath of [
      "/app/liga-mx/games/match-123",
      "/app/player/henry-martin",
      "/app/team/america",
      "/app/parlays",
    ]) {
      const subHtml = renderToStaticMarkup(
        <PlatformProvider dataset={STORY_DATASET} initialRole="member">
          <ClubLayoutShell activePath={hiddenPath}>
            <div>Vista secundaria</div>
          </ClubLayoutShell>
        </PlatformProvider>,
      );
      expect(subHtml).not.toContain("pl-header-sportband");
      expect(subHtml).not.toContain("pl-astro-sports");
      expect(subHtml).not.toContain('aria-label="Ligas rápidas móvil"');
      expect(subHtml).not.toContain("pl-mobile-league-strip");
    }
  });

  it("renderiza CommandPaletteModal con el estilo sólido PitchLab (tokens oscuros sólidos), sin glass-ring ni texto @tipster", () => {
    const closedHtml = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <CommandPaletteModal />
      </PlatformProvider>,
    );
    expect(closedHtml).toBe("");

    const openHtml = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member" initialCmdkOpen>
        <CommandPaletteModal />
      </PlatformProvider>,
    );
    expect(openHtml).toContain("pl-cmd-dialog");
    expect(openHtml).toContain("pl-cmd-shell");
    expect(openHtml).toContain("pl-cmd-searchbox");
    expect(openHtml).toContain("pl-cmd-results");
    expect(openHtml).toContain("pl-cmd-league-tile");
    expect(openHtml).toContain("Buscar partido, equipo, jugador, liga o @socio...");
    expect(openHtml).not.toContain("glass-ring--featured");
    expect(openHtml).not.toContain("@tipster");
    expect(openHtml).toContain('<span class="sr-only">Cerrar buscador</span>');
    expect(openHtml).not.toContain('aria-label="Cerrar buscador"');
    expect(openHtml).toContain("Ligas oficiales");
    expect(openHtml).toContain("1 juego");
    expect(openHtml).not.toContain("1 juegos");

    const filteredHtml = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member" initialCmdkOpen>
        <CommandPaletteModal initialQuery="Monterrey" />
      </PlatformProvider>,
    );
    expect(filteredHtml).toContain("Equipos y selecciones");
    expect(filteredHtml).toContain('aria-label="Limpiar búsqueda"');

    const emptyHtml = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member" initialCmdkOpen>
        <CommandPaletteModal initialQuery="ClubInexistenteXYZ" />
      </PlatformProvider>,
    );
    expect(emptyHtml).toContain("pl-cmd-empty");
    expect(emptyHtml).toContain("Sin coincidencias para «ClubInexistenteXYZ»");
  });

  it("muestra Explorar e ícono con badge numérico en Parlay dentro del dock móvil y difiere emblemas img en el overlay SSR cerrado", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <ClubLayoutShell activePath="/app">
          <div>Contenido</div>
        </ClubLayoutShell>
      </PlatformProvider>,
    );

    expect(html).toContain(">Explorar<");
    expect(html).not.toContain(">Más<");
    expect(html).toContain("pl-header-overlay-emblem-ph");
    expect(html).not.toContain("Parlay (");
  });

  it("mantiene ligas activas en el menú al entrar directo a /app/[league] o /app/[league]/g/[slug] con layout diferido", () => {
    const activeSlugs = [
      "premier-league",
      "laliga",
      "bundesliga",
      "serie-a",
      "ligue-1",
      "champions-league",
      "europa-league",
      "eredivisie",
      "liga-portugal",
      "brasileirao",
      "mls",
      "super-lig",
      "saudi-pro-league",
      "liga-mx",
    ] as const;
    const baseLeagues = STORY_DATASET.leagues.slice(0, 1);
    const templateLeague = baseLeagues[0]!;
    const deferredLeagues = activeSlugs.map((slug) => ({
      ...templateLeague,
      league: slug as typeof templateLeague.league,
      label: slug,
      totalGames: 20,
      upcomingCount: 10,
      finishedCount: 10,
      activeInWindow: slug !== "premier-league" && slug !== "bundesliga",
      standings: [],
    }));
    const premierGame = STORY_DATASET.games[0]!;
    const scopedDataset = {
      ...STORY_DATASET,
      leagues: deferredLeagues,
      games: [
        {
          ...premierGame,
          league: "premier-league" as typeof premierGame.league,
        },
      ],
    };

    for (const directPath of [
      "/app/premier-league",
      "/app/premier-league/g/arsenal-chelsea",
    ]) {
      const html = renderToStaticMarkup(
        <PlatformProvider dataset={scopedDataset} initialRole="member">
          <ClubLayoutShell activePath={directPath}>
            <div>Vista directa</div>
          </ClubLayoutShell>
        </PlatformProvider>,
      );

      expect(html).toContain('data-league="premier-league"');
      expect(html).toContain('data-league="champions-league"');
      expect(html).toContain('data-league="laliga"');
      expect(html).toContain("Explorar todas las ligas por región");
    }

    const agedDataset = {
      ...scopedDataset,
      leagues: deferredLeagues.map((lg) => ({ ...lg, activeInWindow: false })),
    };
    const agedHtml = renderToStaticMarkup(
      <PlatformProvider dataset={agedDataset} initialRole="member">
        <ClubLayoutShell activePath="/app/premier-league">
          <div>Vista con ventana vencida</div>
        </ClubLayoutShell>
      </PlatformProvider>,
    );
    expect(agedHtml).toContain('data-league="premier-league"');
    expect(agedHtml).toContain('data-league="laliga"');
  });
});
