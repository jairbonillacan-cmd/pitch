import { describe, expect, it } from "vitest";
import { CortexWriteupSchema, type GameAnalysis, type GameDTO } from "@pitchlab/contracts";
import { cortexFactsFromAnalysis, cortexFingerprint, sectionKeys, writeCortex } from "../src/cortex-writer.js";

const game = {
  id: "liga-mx-qro-mty",
  home: { id: "liga-mx.queretaro", name: "Querétaro", shortName: "Querétaro" },
  away: { id: "liga-mx.monterrey", name: "Monterrey", shortName: "Monterrey" },
} as unknown as GameDTO;

const analysis = {
  x12: [0.34, 0.26, 0.4],
  projection: { home: 1.41, away: 1.55, total: 2.96 },
  marketGroups: [
    { group: "Goles", rows: [{ market: "totals", selection: "over_2.5", label: "Más de 2.5", p: 0.57, fairOdds: 1.75 }] },
    { group: "Ambos", rows: [{ market: "btts", selection: "yes", label: "Sí", p: 0.6, fairOdds: 1.67 }] },
  ],
  counts: {
    corners: { home: 5.45, away: 5.34, total: 10.8, line: 10.5, pOver: 0.5, sample: { home: 40, away: 40 } },
  },
  insights: { why: [], restDays: { home: 6, away: 7 } },
} as unknown as GameAnalysis;

const facts = cortexFactsFromAnalysis({ leagueName: "Liga MX", game, analysis });

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status })) as typeof fetch;
}

describe("Cortex en el corte", () => {
  it("arma secciones según los datos: con córners, sin faltas", () => {
    expect(sectionKeys(facts)).toEqual(["resumen", "goles", "esquinas", "contexto", "atencion"]);
    expect(cortexFingerprint(facts)).toBe(cortexFingerprint(cortexFactsFromAnalysis({ leagueName: "Liga MX", game, analysis })));
  });

  it("guarda lo que pasa la validación y cambia por plantilla lo que inventa números", async () => {
    const out = await writeCortex(facts, {
      apiKey: "k",
      fetchImpl: fakeFetch({
        resumen: "Partido parejo con ligera ventaja de Monterrey: 40 % de victoria contra 34 % de Querétaro y 26 % de empate.",
        goles: "Querétaro anotará 3 goles seguro y Monterrey 2.", // números inventados
        esquinas: "Se esperan 10.8 tiros de esquina: 5.5 de Querétaro y 5.3 de Monterrey, un reparto muy parejo.",
        faltas: null,
        contexto: null,
        atencion: "El análisis no incluye árbitro ni alineaciones; una expulsión puede cambiar la lectura del partido.",
      }),
      now: () => new Date("2026-11-14T00:00:00Z"),
    });
    expect(out).not.toBeNull();
    expect(() => CortexWriteupSchema.parse(out)).not.toThrow();
    const byKey = Object.fromEntries(out!.sections.map((s) => [s.key, s]));
    expect(byKey.resumen!.origin).toBe("ia");
    expect(byKey.goles!.origin).toBe("plantilla");
    expect(byKey.goles!.text).toContain("2.96");
    expect(byKey.esquinas!.origin).toBe("ia");
    expect(byKey.faltas).toBeUndefined();
    expect(byKey.contexto).toBeUndefined(); // sin tabla no hay contexto que armar
  });

  it("rechaza el favorito invertido", async () => {
    const out = await writeCortex(facts, {
      apiKey: "k",
      fetchImpl: fakeFetch({
        resumen: "Querétaro es el favorito con 40 % de victoria frente a Monterrey, que juega de visita.",
        atencion: "El análisis no incluye árbitro ni alineaciones; una expulsión puede cambiar la lectura del partido.",
      }),
    });
    expect(out!.sections.find((s) => s.key === "resumen")!.origin).toBe("plantilla");
  });

  it("si OpenRouter falla no guarda nada (el siguiente corte reintenta)", async () => {
    expect(await writeCortex(facts, { apiKey: "k", fetchImpl: fakeFetch({}, 429) })).toBeNull();
    expect(await writeCortex(facts, { apiKey: "k", fetchImpl: (async () => new Response("no es json")) as typeof fetch })).toBeNull();
  });
});
