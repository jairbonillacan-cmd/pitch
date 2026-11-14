import { describe, expect, it } from "vitest";
import type { PlatformGame } from "@pitchlab/ui";
import { cortexFactsFor, cortexSummary, validateCortexText } from "../src/server/cortex";

const game = {
  id: "pl-1",
  sport: "football",
  leagueLabel: "Premier League",
  status: "NS",
  home: { name: "Chelsea", shortName: "Chelsea" },
  away: { name: "Leeds United", shortName: "Leeds" },
  x12: [0.54, 0.24, 0.22],
  projection: { home: 1.62, away: 0.98, total: 2.6 },
  preGame: { absences: [{ player: "2 lesionados · Leeds" }] },
  spacetime: {
    market: { bookLabel: "Caliente · 9 nov", noVig: { home: 0.52, draw: 0.25, away: 0.23 } },
    drivers: [{ label: "Fuerza estructural y xG", impactLogit: 0.3 }],
    stadium: { name: "Stamford Bridge", elevationM: 10 },
  },
} as unknown as PlatformGame;

const facts = cortexFactsFor(game);

const reply = (content: string) =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;

describe("Cortex IA", () => {
  it("arma los datos solo con números del motor", () => {
    expect(facts.probabilidades).toEqual({ Chelsea: "54 %", Leeds: "22 %", Empate: "24 %" });
    expect(facts.mercado?.casa).toBe("Caliente · 9 nov");
    expect(facts.proyeccion).toBe("Chelsea 1.62 – 0.98 Leeds");
  });

  it("acepta un texto que solo usa los datos", () => {
    const text = "Chelsea llega como favorito con 54 % frente a 22 % de Leeds. La proyección es 1.62 – 0.98 y el mercado de Caliente le da 52 %.";
    expect(validateCortexText(text, facts)).toEqual({ ok: true, text });
  });

  it("rechaza números inventados y nombres prohibidos", () => {
    expect(validateCortexText("Chelsea gana 54 % y lleva 7 victorias seguidas en casa, según el análisis.", facts)).toMatchObject({
      ok: false,
      reason: "numero_no_respaldado:7",
    });
    expect(validateCortexText("Según el modelo Poisson, Chelsea tiene 54 % de ganar este partido en casa.", facts)).toMatchObject({
      ok: false,
      reason: "termino_prohibido:poisson",
    });
  });

  describe("coherencia equipo ↔ dato (fallas medidas en Astra)", () => {
    const ok = (text: string) => expect(validateCortexText(text, facts)).toMatchObject({ ok: true });
    const bad = (text: string, reason: string) =>
      expect(validateCortexText(text, facts)).toMatchObject({ ok: false, reason });

    it("rechaza al favorito equivocado", () => {
      bad("Leeds llega como favorito para este partido ante un rival que viene irregular.", "favorito_invertido");
      ok("Chelsea es el favorito del partido y el empate queda como segunda opción del motor.");
      ok("Leeds no es el favorito, pero llega con una defensa ordenada a este partido.");
    });

    it("rechaza porcentajes atribuidos al rival", () => {
      bad("Leeds tiene 54 % de ganar mientras que el local apenas suma lo justo en este duelo.", "porcentaje_mal_atribuido");
      bad("El motor da 54 % para Leeds y deja poco margen al local en este encuentro.", "porcentaje_mal_atribuido");
      ok("El motor da 22 % para Leeds y 54 % para Chelsea en este encuentro de liga.");
      ok("Chelsea tiene 54 % y el empate 24 %, con Leeds como la opción menos probable.");
    });

    it("rechaza local y visitante invertidos", () => {
      bad("Leeds en casa buscará sorprender a un Chelsea que llega con 54 % según el motor.", "rol_invertido");
      bad("Chelsea de visita enfrenta un partido complicado ante Leeds, con 54 % a su favor.", "rol_invertido");
    });

    it("rechaza muletillas de chat y lenguaje de apuesta", () => {
      bad("Perdón, corrijo: Chelsea llega con 54 % y Leeds con 22 % en este partido de liga.", "muletilla_de_chat");
      bad("Según el JSON, Chelsea llega con 54 % y Leeds con 22 % en este partido de liga.", "muletilla_de_chat");
      bad("Chelsea con 54 % es una apuesta segura para este fin de semana en la liga inglesa.", "lenguaje_de_apuesta");
    });
  });

  it("usa OpenRouter con el modelo del fundador y sin retención de datos", async () => {
    let sent: { model?: string; provider?: { data_collection?: string } } = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Chelsea parte con 54 % y el mercado de Caliente coincide con 52 %, con Leeds en 22 %." } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await cortexSummary({ ...game, id: "pl-2" } as PlatformGame, { apiKey: "k", fetchImpl });
    expect(out).toContain("54 %");
    expect(sent.model).toBe("deepseek/deepseek-v4.1-flash-1017");
    expect(sent.provider?.data_collection).toBe("deny");
  });

  it("si el texto no pasa la validación o no hay clave, devuelve null", async () => {
    expect(await cortexSummary({ ...game, id: "pl-3" } as PlatformGame, { apiKey: "k", fetchImpl: reply("Chelsea gana 3-0 seguro.") })).toBeNull();
    expect(await cortexSummary({ ...game, id: "pl-4" } as PlatformGame, { apiKey: "" })).toBeNull();
  });
});
