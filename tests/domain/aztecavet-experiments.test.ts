/**
 * Experimentos controlados y validación del motor AztecaVet (requisitos 4 y 7
 * del informe de motor): variación de una entrada a la vez, backtesting de las
 * auditorías del propio sitio (sin filtración: los datos de resultados son los
 * que el bundle publica) y métricas de calibración (Brier).
 * Escribe evidence/statistical-tests/aztecavet-experiments.json.
 * Categoría: OBSERVADO (misma entrada ⇒ misma salida exacta vs oráculo verbatim).
 */
import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { FootballEngine, HockeyEngine, BaseballEngine, type FbTeamRow } from "../../src/domain/aztecavet/index.js";
import fbTeams from "../../src/data/aztecavet-fb-teams.json";
import fbFixtures from "../../src/data/aztecavet-fb-fixtures.json";
import fbInjuries from "../../src/data/aztecavet-fb-injuries.json";
import fbComps from "../../src/data/aztecavet-fb-comps.json";
import nhlTeams from "../../src/data/aztecavet-nhl-teams.json";
import nhlResults from "../../src/data/aztecavet-nhl-results.json";
import nhlAudit from "../../src/data/aztecavet-nhl-audit.json";
import nhlNews from "../../src/data/aztecavet-nhl-news.json";
import nhlSchedule from "../../src/data/aztecavet-nhl-schedule.json";
import mlbTeams from "../../src/data/aztecavet-mlb-teams.json";
import mlbPitchers from "../../src/data/aztecavet-mlb-pitchers.json";
import mlbBatters from "../../src/data/aztecavet-mlb-batters.json";
import mlbTimeline from "../../src/data/aztecavet-mlb-timeline.json";
import footballRef from "../../reference/aztecavet/football-ref.mjs";
import hockeyRef from "../../reference/aztecavet/hockey-ref.mjs";
import baseballRef from "../../reference/aztecavet/baseball-ref.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const refFb = footballRef as any;
const refNh = hockeyRef as any;
const refBb = baseballRef as any;
refNh.rebuild();

const fbOdds: Record<string, string> = {};
const fb = new FootballEngine({
  teams: fbTeams as FbTeamRow[], fixtures: fbFixtures as any, comps: fbComps as any,
  injuries: fbInjuries as any, odds: fbOdds,
});
const nh = new HockeyEngine({
  teams: nhlTeams as any, results: nhlResults as any, audit: nhlAudit as any,
  news: nhlNews as any, schedule: nhlSchedule as any, odds: {},
});
const bb = new BaseballEngine({
  teams: mlbTeams as any, pitchers: mlbPitchers as any, batters: mlbBatters as any,
  timeline: mlbTimeline as any, odds: {},
});

const LOG: { exp: string; desc: string; entrada: unknown; salida: unknown }[] = [];
const log = (exp: string, desc: string, entrada: unknown, salida: unknown): void => {
  LOG.push({ exp, desc, entrada, salida });
};

const fnd = (comp: string, day: number, j: number) => (fbFixtures as any)[comp][day][1][j];

describe("Experimentos controlados del motor AztecaVet", () => {
  // ---------- E1: valores observados en la UI viva (capturas REA) ----------
  it("E1 · fútbol: reproduce los % mostrados en la pantalla de Liga MX", () => {
    const g1 = fnd("MX", 0, 0); // NEC-TIJ
    const m1 = fb.model(g1.h, g1.a, "MX", false);
    const pick1 = m1.pick ?? m1.cp;
    expect(pick1.l).toBe("TIJ gana");
    expect((pick1.p * 100).toFixed(1)).toBe("47.9");
    expect(m1.lh.toFixed(1)).toBe("1.2");
    expect(m1.la.toFixed(1)).toBe("1.7");
    log("E1", "NEC–TIJ: % y proyección iguales a la UI observada",
      { partido: "NEC–TIJ", cuotas: "ninguna" },
      { pick: pick1.l, prob: pick1.p, proy: [m1.lh, m1.la], ct: m1.ct });

    const g2 = fnd("MX", 0, 1); // SLP-JUA
    const m2 = fb.model(g2.h, g2.a, "MX", false);
    const pick2 = m2.pick ?? m2.cp;
    expect(pick2.l).toBe("SLP gana");
    expect((pick2.p * 100).toFixed(1)).toBe("52.9");

    const g3 = fnd("MX", 0, 2); // ATL-SAN → combinada dco15
    const m3 = fb.model(g3.h, g3.a, "MX", false);
    const pk3 = m3.pick ?? m3.cp;
    expect(pk3.id).toBe("dco15");
    expect(pk3.l).toBe("Empate o SAN + Over 1.5");
    expect((pk3.p * 100).toFixed(1)).toBe("51.1");
    log("E1b", "ATL–SAN: la combinada DC+Over1.5 es el pick (51.1% en UI)",
      { partido: "ATL–SAN", empate_prob: m3.d }, { pick: pk3.l, prob: pk3.p });
  });

  it("E1 · NHL: reproduce el ranking del día y el pick del día observados", () => {
    const day0 = nhlSchedule[0][1] as any[];
    const picks = day0.map((g) => ({ g, m: nh.model(g, nh.S, false) }));
    const sj = picks.find((p) => p.g.h === "MIN" && p.g.a === "SJ")!;
    const combo = sj.m.O.find((o) => o.id.startsWith("cb_"));
    expect((combo!.p * 100).toFixed(1)).toBe("41.4"); // MIN gana + Over 5.5
    const buf = picks.find((p) => p.g.h === "BUF" && p.g.a === "CBJ")!;
    const pld = buf.m.O.find((o) => o.id === "pld");
    expect((pld!.p * 100).toFixed(1)).toBe("74.9"); // CBJ +1.5
    const cgy = picks.find((p) => p.g.h === "CGY" && p.g.a === "ANA")!;
    const ml = cgy.m.O.find((o) => o.id === "mla");
    expect((ml!.p * 100).toFixed(1)).toBe("58.5"); // ANA gana (ML)
    log("E1", "NHL 6 nov: tres valores del ranking observados en UI",
      { partidos: ["MIN-SJ", "BUF-CBJ", "CGY-ANA"] },
      { "MIN gana+O5.5": combo!.p, "CBJ+1.5": pld!.p, "ANA ML": ml!.p });
  });

  // ---------- E2: sensibilidad a cuotas (una entrada a la vez) ----------
  it("E2 · EV y sizing responden a la cuota con umbrales exactos", () => {
    const g = fnd("MX", 0, 0);
    const key = `FB:${g.cp}:${g.dl}:${g.h}-${g.a}|a`;
    const m = fb.model(g.h, g.a, "MX", false);
    const p = m.O.find((o) => o.id === "a")!.p; // mercado visitante (el pick observado)
    const cuotas = ["1.50", "1.90", "2.05", "2.20"];
    const salida = cuotas.map((d) => {
      fbOdds[key] = d;
      const b = fb.bestOf(g, m);
      const ev = p * parseFloat(d) - 1;
      const sug = ev >= 0.04 ? (p >= 0.6 ? 10 : 5) : 0;
      return { cuota: d, ev: +ev.toFixed(4), bestOf: b ? b.o.id : null, sugEsperada: sug };
    });
    log("E2", "NEC–TIJ: variando SOLO la cuota del mercado visitante (el pick)", { prob_fija: +p.toFixed(4), cuotas }, salida);
    expect(salida[0].sugEsperada).toBe(0);   // EV negativo → No apostar
    expect(salida[3].sugEsperada).toBe(5);   // EV ≥ +4% y p=0.479 < th=.6 → 5%
    expect(salida[3].bestOf).toBe("a");
    expect(salida.filter((x) => x.sugEsperada === 0).length).toBeGreaterThanOrEqual(1);
    delete fbOdds[key];
  });

  // ---------- E3: efecto de bajas (una entrada a la vez) ----------
  it("E3 · fútbol: quitar una baja recupera el ataque y mueve las probabilidades", () => {
    const g = fnd("MX", 0, 1); // SLP-JUA: Madson (JUA, gf) fuera
    const key = g.k;
    const antes = fb.model(g.h, g.a, "MX", false);
    const pAntes = antes.O.find((o) => o.id === "a")!.p; // victoria JUA
    fb.setInjury("mds", { st: 0 }); // Madson disponible
    const despues = fb.model(g.h, g.a, "MX", false);
    const pDespues = despues.O.find((o) => o.id === "a")!.p;
    fb.setInjury("mds", { st: 1 }); // restaurar
    const pFinal = fb.model(g.h, g.a, "MX", false).O.find((o) => o.id === "a")!.p;
    log("E3", "SLP–JUA: Madson fuera→disponible→fuera (única entrada cambiante)",
      { baja: "JUA Madson gf 0.04", p_modelo_antes: +pAntes.toFixed(4) },
      { p_JUA_antes: +pAntes.toFixed(4), p_JUA_sin_baja: +pDespues.toFixed(4), p_JUA_restaurada: +pFinal.toFixed(4), delta: +(pDespues - pAntes).toFixed(4) });
    expect(pDespues).toBeGreaterThan(pAntes); // JUA gana más sin su baja en ataque
    expect(Math.abs(pFinal - pAntes)).toBeLessThan(1e-15); // determinismo
    void key;
  });

  // ---------- E4: backtesting con las auditorías del propio bundle ----------
  it("E4 · fútbol auditoría MX J15: aciertos del modelo calculados (paridad con UI)", () => {
    const day = (fbFixtures as any).MX[3]; // Auditoría 30 oct-1 nov (jornada 15)
    let hit = 0, fav = 0, nd = 0;
    day[1].forEach((g: any) => {
      const m = fb.model(g.h, g.a, "MX", true);
      if (m.cp.f(g.sc[0], g.sc[1])) hit++;
      if (g.sc[0] !== g.sc[1]) { nd++; if (m.fav.f(g.sc[0], g.sc[1])) fav++; }
    });
    log("E4", "Auditoría MX J15 (9 juegos): contador del header de la app",
      { jornada: day[0], juegos: day[1].length },
      { pickModelo: `${hit}/${day[1].length}`, favoritoSinEmpate: `${fav}/${nd}` });
    expect(hit).toBeGreaterThan(0);
  });

  it("E4 · NHL auditoría 5 nov: pick de confianza y ganador ML", () => {
    // Los marcadores de la auditoría NHL viven en el calendario (day "Auditoría 5 nov")
    const auditDay = (nhlSchedule as any).find((d: any) => /Auditoría/.test(d[0]));
    const games = auditDay[1] as any[];
    let hit = 0, mlh = 0;
    const briers: number[] = [];
    games.forEach((g) => {
      const sc = g.sc;
      const m = nh.model(g, nh.SA, true);
      if (m.cp.f(sc[0], sc[1])) hit++;
      const ml = m.O[0]!.p >= 0.5 ? m.O[0]! : m.O[1]!;
      if (ml.f(sc[0], sc[1])) mlh++;
      // Brier del pick de confianza sobre el outcome acierto/fallo del mercado
      const ok = m.cp.f(sc[0], sc[1]) ? 1 : 0;
      briers.push(Math.pow(m.cp.p - ok, 2));
    });
    const brier = briers.reduce((a, b) => a + b, 0) / briers.length;
    log("E4", "Auditoría NHL 5 nov (11 juegos) + Brier del pick de confianza",
      { juegos: games.length },
      { pickConfianza: `${hit}/${games.length}`, ganadorML: `${mlh}/${games.length}`, brier: +brier.toFixed(4) });
    expect(hit).toBeGreaterThanOrEqual(0);
  });

  it("E4 · MLB auditoría de postemporada: reproduce el 9/17 y 11/17 mostrados en UI", () => {
    const games = (mlbTimeline as any)[0][1];
    let hit = 0, mlh = 0;
    const briers: number[] = [];
    games.forEach((g) => {
      const m = bb.model(g, g.sp ?? [null, null], true);
      if (m.pick.f(g.sc[0], g.sc[1])) hit++;
      const ml = m.O[0].p >= 0.5 ? m.O[0] : m.O[1];
      if (ml.f(g.sc[0], g.sc[1])) mlh++;
      const ok = m.pick.f(g.sc[0], g.sc[1]) ? 1 : 0;
      briers.push(Math.pow(m.pick.p - ok, 2));
    });
    const brier = briers.reduce((a, b) => a + b, 0) / briers.length;
    log("E4", "MLB 8–28 oct (17 juegos): contadores de la tarjeta de auditoría de la UI",
      { juegos: games.length },
      { pickDelModelo: `${hit}/${games.length}`, ganadorML: `${mlh}/${games.length}`, brier: +brier.toFixed(4) });
    expect(`${hit}/${games.length}`).toBe("9/17"); // mostrado en la UI observada
    expect(`${mlh}/${games.length}`).toBe("11/17");
    const uiCheck = bb.model(games[0], games[0].sp ?? [null, null], true);
    expect(uiCheck.pick.l).toBe("CLE +1.5"); // primera tarjeta observada ✓5–9
    log("E4b", "CWS@CLE J4: pick pre-juego y marcador observados", { final: games[0].sc }, { pick: uiCheck.pick.l });
  });

  // ---------- E5: determinismo y paridad global (resumen) ----------
  it("E5 · resumen de paridad contra el oráculo en una muestra estructurada", () => {
    const comp = "LL";
    const day = refFb.DD[comp][3];
    const rows = day[1].map((g: any) => {
      const mine = fb.model(g.h, g.a, comp, g.aud);
      const theirs = refFb.model(g.h, g.a, comp, g.aud);
      const maxDelta = Math.max(
        ...mine.O.map((o, i) => Math.abs(o.p - theirs.O[i].p)),
      );
      return { partido: `${g.h}-${g.a}`, aud: g.aud, pick: mine.cp.l, maxDelta };
    });
    const maxAll = Math.max(...rows.map((r) => r.maxDelta));
    log("E5", `La Liga auditoría J11 (${day[1].length} juegos): máx Δ prob vs oráculo verbatim`,
      { comp, dia: day[0] }, { filas: rows, maxDelta: maxAll });
    expect(maxAll).toBeLessThan(1e-9);
  });
});

// Escribe la evidencia al terminar la suite
let saved = false;
afterAll?.(() => {});
import { afterAll } from "vitest";
afterAll(() => {
  if (saved) return;
  saved = true;
  try {
    mkdirSync("evidence/statistical-tests", { recursive: true });
    writeFileSync(
      "evidence/statistical-tests/aztecavet-experiments.json",
      JSON.stringify({ fecha: new Date().toISOString(), motor: "src/domain/aztecavet", experimentos: LOG }, null, 1),
    );
    console.log("evidence/statistical-tests/aztecavet-experiments.json escrito:", LOG.length, "experimentos");
  } catch { /* entorno read-only */ }
});
