import { afterEach, describe, expect, it } from "vitest";
import {
  clearEspnNewsCacheForTest,
  extractSummaryParagraphsFromStoryHtml,
  fetchEspnLeagueNews,
  isValidEspnArticleUrl,
  resolveVerifiedNewsArticleSummary,
} from "../src/server/espn-news";
import { loadRawLeagueSnapshot } from "../src/server/snapshots";

afterEach(() => {
  clearEspnNewsCacheForTest();
});

describe("Noticias reales de liga y resumen editorial dentro de PitchLab", () => {
  it("parsea, deduplica, clasifica, enlaza equipos locales y expone ruta interna de resumen sin términos prohibidos", async () => {
    const nflSnapshot = loadRawLeagueSnapshot("nfl");
    expect(nflSnapshot).not.toBeNull();

    const payload = {
      articles: [
        {
          id: "99001",
          type: "Media",
          headline: "La historia del touchdown de Jerry Rice en el SB XXIII",
          description: "Clip histórico de archivo.",
          published: "2026-11-16T18:10:05Z",
          categories: [{ type: "team", description: "San Francisco 49ers" }],
          links: {
            web: {
              href: "https://www.espn.com.mx/video/clip/_/id/99001/retro",
            },
          },
        },
        {
          id: 17523001,
          type: "dStory",
          headline: "NFL: Patriots temen fractura de tobillo para Maye, fuentes",
          description: "El mariscal sufrió lesión en el último cuarto según reportes de ESPN.",
          published: "2026-11-16T15:37:36Z",
          byline: "Mike Reiss",
          categories: [
            { type: "team", description: "New England Patriots" },
            { type: "athlete", description: "Drake Maye" },
          ],
          links: {
            web: {
              href: "https://www.espn.com.mx/futbol-americano/nfl/nota/_/id/17523001/maye",
            },
          },
        },
        {
          id: "17523002",
          type: "dStory",
          headline: "NFL: crisis de Chargers explicada en cinco sencillos pasos",
          description: "Balance defensivo rumbo al cierre frente a Baltimore.",
          published: "2026-11-16T17:52:46Z",
          categories: [{ type: "team", description: "Los Angeles Chargers" }],
          links: {
            web: {
              href: "https://www.espn.com.mx/futbol-americano/nfl/nota/_/id/17523002/chargers",
            },
          },
        },
        {
          id: "17523003",
          type: "Media",
          headline: "NFL: crisis de Chargers explicada en cinco sencillos pasos",
          description: "Duplicado en video del mismo titular.",
          published: "2026-11-16T17:40:00Z",
          categories: [{ type: "team", description: "Los Angeles Chargers" }],
          links: {
            web: {
              href: "https://www.espn.com.mx/video/clip/_/id/17523003/chargers-dup",
            },
          },
        },
        {
          id: "17523004",
          type: "dStory",
          headline: "Bengals aplastan a Steelers y toman el liderato de la AFC Norte",
          description: "Triunfo contundente con cuatro envíos de anotación.",
          published: "2026-11-16T05:11:23Z",
          categories: [{ type: "team", description: "Cincinnati Bengals" }],
          links: {
            web: {
              href: "https://www.espn.com.mx/futbol-americano/nfl/nota/_/id/17523004/bengals",
            },
          },
        },
        {
          id: "17523005",
          type: "dStory",
          headline: "Raiders cierran contrato y refuerzo defensivo para semana 11",
          description: "Movimiento en el mercado de agentes libres.",
          published: "2026-11-16T04:00:00Z",
          categories: [{ type: "team", description: "Las Vegas Raiders" }],
          links: {
            web: {
              href: "https://www.espn.com.mx/futbol-americano/nfl/nota/_/id/17523005/raiders",
            },
          },
        },
      ],
    };

    const items = await fetchEspnLeagueNews("nfl", nflSnapshot, async () => payload);
    expect(items.length).toBe(4);
    expect(items.some((x) => /Jerry Rice|SB XXIII/i.test(x.title))).toBe(false);

    const injuryItem = items.find((x) => x.id === "live-nfl-17523001");
    expect(injuryItem?.category).toBe("lesiones");
    expect(injuryItem?.categoryLabel).toBe("Parte médico");
    expect(injuryItem?.summary).not.toMatch(/espn/i);
    expect(injuryItem?.summary).not.toMatch(/pitchlab/i);
    expect(injuryItem?.summaryHref).toBe("/api/news/article?league=nfl&id=17523001");
    expect(injuryItem?.readMoreLabel).toBe("Leer nota");
    expect(injuryItem?.summaryHighlights).toContain("New England Patriots");
    expect(injuryItem?.summaryHighlights).toContain("Drake Maye");
    expect(injuryItem?.team?.logoUrl).toBe("/brand/official/nfl/new-england-patriots.png");

    const chargersItem = items.find((x) => x.id === "live-nfl-17523002");
    expect(chargersItem?.category).toBe("analisis");
    expect(chargersItem?.href).toContain("/app/nfl/");

    const winItem = items.find((x) => x.id === "live-nfl-17523004");
    expect(winItem?.category).toBe("resultados");

    const mktItem = items.find((x) => x.id === "live-nfl-17523005");
    expect(mktItem?.category).toBe("mercado");

    expect(JSON.stringify(items).toLowerCase()).not.toContain("espn");
  });

  it("genera resumen editorial limpio en resolveVerifiedNewsArticleSummary sin HTML ni fugas", async () => {
    const paragraphs = extractSummaryParagraphsFromStoryHtml(
      "<figure><img src='https://x.test/a.jpg'/><figcaption>Pie de foto de ejemplo que no debe filtrarse al resumen.</figcaption></figure><inline1><p>El tobillo derecho de <a href='https://x.test/p'>Aaron Rodgers</a>, tras estudios de imagen, ser&aacute; evaluado el martes.</p><p>Report&oacute; ESPN desde Foxborough.</p><p>Los Raiders mantienen a <b>Brock Bowers</b>. D&iacute;a a d&iacute;a bajo supervisi&oacute;n m&eacute;dica.</p><p>Informaci&oacute;n de Ryan McFadden fue utilizada en la redacci&oacute;n.</p>",
      "Nota base distinta.",
    );
    expect(paragraphs).toEqual([
      "El tobillo derecho de Aaron Rodgers, tras estudios de imagen, será evaluado el martes.",
      "Los Raiders mantienen a Brock Bowers. Día a día bajo supervisión médica.",
    ]);

    const feedPayload = {
      articles: [
        {
          id: "555123",
          type: "dStory",
          headline: "Victoria clave en la Conferencia Este",
          description: "Triunfo sólido con dominio defensivo en el último cuarto.",
          published: "2026-11-16T18:00:00Z",
          categories: [{ type: "team", description: "Boston Celtics" }],
          links: { web: { href: "https://www.espn.com.mx/basquetbol/nota/_/id/555123" } },
        },
      ],
    };
    const storyPayload = {
      headlines: [
        {
          id: 555123,
          headline: "Victoria clave en la Conferencia Este",
          description: "Triunfo sólido con dominio defensivo en el último cuarto.",
          story:
            "<p>Boston cerr&oacute; el partido con una racha de 14-2 en los minutos finales.</p><p>El entrenador destac&oacute; la rotaci&oacute;n exterior como clave.</p>",
          categories: [{ type: "athlete", description: "Jayson Tatum" }],
        },
      ],
    };

    const summary = await resolveVerifiedNewsArticleSummary("nba", "555123", {
      feedFetcher: async () => feedPayload,
      storyFetcher: async () => storyPayload,
    });
    expect(summary).not.toBeNull();
    expect(summary?.lead).toBe("Triunfo sólido con dominio defensivo en el último cuarto.");
    expect(summary?.paragraphs).toEqual([
      "Boston cerró el partido con una racha de 14-2 en los minutos finales.",
      "El entrenador destacó la rotación exterior como clave.",
    ]);
    expect(summary?.keyPoints).toEqual(["Boston Celtics", "Jayson Tatum"]);
    expect(JSON.stringify(summary).toLowerCase()).not.toContain("espn");

    const blocked = await resolveVerifiedNewsArticleSummary("nba", "555999", {
      feedFetcher: async () => ({ articles: [] }),
    });
    expect(blocked).toBeNull();

    const badId = await resolveVerifiedNewsArticleSummary("nba", "../etc/passwd");
    expect(badId).toBeNull();

    expect(isValidEspnArticleUrl("https://www.espn.com.mx/nota/_/id/123")).toBe(true);
    expect(isValidEspnArticleUrl("https://evil.example.com/espn.com")).toBe(false);
  });

  it("degrada sin lanzar error cuando la API externa falla", async () => {
    const items = await fetchEspnLeagueNews("liga-mx", null, async () => {
      throw new Error("ETIMEDOUT");
    });
    expect(items).toEqual([]);
  });
});
