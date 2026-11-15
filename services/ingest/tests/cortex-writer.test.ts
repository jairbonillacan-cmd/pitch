import { describe, expect, it } from "vitest";
import { CortexWriteupSchema, type GameAnalysis, type GameDTO } from "@pitchlab/contracts";
import {
  cortexFactsFromAnalysis,
  cortexFingerprint,
  sectionKeys,
  sectionStats,
  templateHeadline,
  writeCortex,
} from "../src/cortex-writer.js";

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

const GOOD = {
  titular: "Monterrey llega un paso adelante en un partido corto",
  lectura: "Monterrey gana en 40 % de los escenarios y Querétaro en 34 %; el empate queda en 26 %.",
  goles: "Querétaro anotará 3 goles seguro y Monterrey 2.", // números inventados → plantilla
  ritmo: "Se esperan 10.8 tiros de esquina repartidos casi por igual, sin un dominador claro por las bandas.",
  tabla: null,
  cambia: "La lectura no incluye árbitro ni alineaciones; una expulsión o el primer gol pueden moverla.",
};

describe("Cortex en el corte", () => {
  it("arma secciones según los datos y cifras que salen del motor", () => {
    expect(sectionKeys(facts)).toEqual(["lectura", "goles", "ritmo", "tabla", "cambia"]);
    expect(sectionStats("goles", facts)).toEqual([
      { label: "Goles esperados", home: 1.41, away: 1.55 },
      { label: "Ambos anotan", value: "60 %" },
      { label: "Más de 2.5 goles", value: "57 %" },
    ]);
    expect(sectionStats("ritmo", facts)).toEqual([{ label: "Tiros de esquina", home: 5.5, away: 5.3 }]);
    expect(cortexFingerprint(facts)).toBe(cortexFingerprint(cortexFactsFromAnalysis({ leagueName: "Liga MX", game, analysis })));
    expect(templateHeadline(facts)).toBe("Querétaro y Monterrey, un partido de margen corto");
  });

  it("guarda lo que pasa la validación y cambia por plantilla lo que inventa números", async () => {
    const out = await writeCortex(facts, { apiKey: "k", fetchImpl: fakeFetch(GOOD), now: () => new Date("2026-11-14T00:00:00Z") });
    expect(out).not.toBeNull();
    expect(() => CortexWriteupSchema.parse(out)).not.toThrow();
    expect(out!.headline).toBe(GOOD.titular);
    expect(out!.headlineOrigin).toBe("ia");
    const byKey = Object.fromEntries(out!.sections.map((s) => [s.key, s]));
    expect(byKey.lectura!.origin).toBe("ia");
    expect(byKey.goles!.origin).toBe("plantilla");
    expect(byKey.goles!.text).toContain("2.96");
    expect(byKey.goles!.stats?.[0]).toEqual({ label: "Goles esperados", home: 1.41, away: 1.55 });
    expect(byKey.ritmo!.origin).toBe("ia");
    expect(byKey.tabla!.origin).toBe("plantilla"); // solo descanso: lo arma la plantilla
    expect(byKey.tabla!.text).toContain("6 días");
  });

  it("rechaza el favorito invertido y un titular con números inventados", async () => {
    const out = await writeCortex(facts, {
      apiKey: "k",
      fetchImpl: fakeFetch({
        ...GOOD,
        titular: "Querétaro gana 3 a 0",
        lectura: "Querétaro es el favorito con 40 % de victoria frente a Monterrey, que juega de visita.",
      }),
    });
    expect(out!.sections.find((s) => s.key === "lectura")!.origin).toBe("plantilla");
    expect(out!.headlineOrigin).toBe("plantilla");
  });

  it("si OpenRouter falla no guarda nada (el siguiente corte reintenta)", async () => {
    expect(await writeCortex(facts, { apiKey: "k", fetchImpl: fakeFetch({}, 429) })).toBeNull();
    expect(await writeCortex(facts, { apiKey: "k", fetchImpl: (async () => new Response("no es json")) as typeof fetch })).toBeNull();
  });
});
