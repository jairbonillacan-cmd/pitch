/**
 * Paridad matemática AztecaVet — motores limpios vs oráculo verbatim
 * (código original extraído del bundle público con scripts/extract-aztecavet-reference.mjs).
 * Recorre TODOS los partidos del bundle: fútbol (242 = 29 próximos + 213 auditados), NHL (61 = 50 futuros + 11 auditoría, +sim) y MLB (17+sim).
 * Categoría de la conclusión: OBSERVADO — misma entrada ⇒ misma salida exacta.
 */
import { describe, expect, it } from "vitest";
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
// @ts-expect-error los oráculos son .mjs sin tipos (declaración global en reference/aztecavet/refs.d.ts)
import footballRef from "../../reference/aztecavet/football-ref.mjs";
// @ts-expect-error ver arriba
import hockeyRef from "../../reference/aztecavet/hockey-ref.mjs";
// @ts-expect-error ver arriba
import baseballRef from "../../reference/aztecavet/baseball-ref.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const refFb = footballRef as any;
const refNh = hockeyRef as any;
const refBb = baseballRef as any;

const fbOdds: Record<string, string> = {};
const fb = new FootballEngine({
  teams: fbTeams as FbTeamRow[],
  fixtures: fbFixtures as any,
  comps: fbComps as any,
  injuries: fbInjuries as any,
  odds: fbOdds,
});
refNh.rebuild();
const nh = new HockeyEngine({
  teams: nhlTeams as any,
  results: nhlResults as any,
  audit: nhlAudit as any,
  news: nhlNews as any,
  schedule: nhlSchedule as any,
  odds: {},
});
const bb = new BaseballEngine({
  teams: mlbTeams as any,
  pitchers: mlbPitchers as any,
  batters: mlbBatters as any,
  timeline: mlbTimeline as any,
  odds: {},
});

const EPS = 1e-9;

function expectMarketParity(tag: string, mine: any, theirs: any) {
  const a = [...mine.O].sort((x: any, y: any) => x.id.localeCompare(y.id));
  const b = [...theirs.O].sort((x: any, y: any) => x.id.localeCompare(y.id));
  expect(a.map((m: any) => m.id), tag).toEqual(b.map((m: any) => m.id));
  a.forEach((m: any, i: number) => {
    expect(a[i].l, tag + " " + m.id).toBe(b[i].l);
    expect(Math.abs(a[i].p - b[i].p), tag + " p(" + m.id + ")").toBeLessThan(EPS);
    if (b[i].g != null) expect(a[i].g, tag + " g(" + m.id + ")").toBe(b[i].g);
  });
}

describe("Paridad fútbol — motor limpio vs oráculo verbatim (242 partidos)", () => {
  let count = 0;
  Object.keys(refFb.DD).forEach((comp) => {
    refFb.DD[comp].forEach((day: [string, any[]]) => {
      day[1].forEach((g: any) => {
        count++;
        it(`${comp} · ${day[0]} · ${g.h} vs ${g.a}${g.aud ? " (auditoría)" : ""}`, () => {
          const mine = fb.model(g.h, g.a, comp, g.aud);
          const theirs = refFb.model(g.h, g.a, comp, g.aud);
          expectMarketParity(`${comp} ${g.h}-${g.a}`, mine, theirs);
          expect(mine.cp.id, "pick id").toBe(theirs.cp.id);
          expect(mine.ct, "etiqueta del pick").toBe(theirs.ct);
          if (mine.why || theirs.why) expect(mine.why ?? "", "razón").toBe(theirs.why ?? "");
          expect(Math.abs(mine.lh - theirs.lh)).toBeLessThan(EPS);
          expect(Math.abs(mine.la - theirs.la)).toBeLessThan(EPS);
          expect(Math.abs(mine.tot - theirs.tot)).toBeLessThan(EPS);
          expect(mine.line).toBe(theirs.line);
          expect(Math.abs(mine.share - theirs.share)).toBeLessThan(EPS);
          expect(Math.abs(mine.w - theirs.w)).toBeLessThan(EPS);
          expect(Math.abs(mine.d - theirs.d)).toBeLessThan(EPS);
        });
      });
    });
  });
  it("el bundle contiene 242 partidos de fútbol (29 próximos + 213 auditados)", () => expect(count).toBe(242));
});

describe("Paridad NHL — motor limpio vs oráculo verbatim", () => {
  refNh.D.forEach((day: [string, any[]]) => {
    day[1].forEach((g: any) => {
      it(`${day[0]} · ${g.h} vs ${g.a}${g.aud ? " (auditoría)" : ""}`, () => {
        const mine = nh.model(g, g.aud ? nh.SA : nh.S, g.aud);
        const theirs = refNh.model(g.h, g.a, g.aud ? refNh.SA : refNh.S, g.aud);
        expectMarketParity(g.h + "-" + g.a, mine, theirs);
        expect(mine.cp.id).toBe(theirs.cp.id);
        expect(mine.ct).toBe(theirs.ct);
        expect(Math.abs(mine.pH - theirs.pH)).toBeLessThan(EPS);
        expect(Math.abs(mine.lh - theirs.lh)).toBeLessThan(EPS);
      });
    });
  });
  it("simulador COL@CAR", () => {
    const mine = nh.model({ h: nh.SIM.h, a: nh.SIM.a, dl: undefined }, nh.S, false);
    const theirs = refNh.model(refNh.SIM.h, refNh.SIM.a, refNh.S, false);
    expectMarketParity("sim NHL", mine, theirs);
    expect(mine.cp.id).toBe(theirs.cp.id);
  });
});

describe("Paridad MLB — motor limpio vs oráculo verbatim (timeline de playoffs)", () => {
  refBb.D.forEach((day: [string, any[]]) => {
    day[1].forEach((g: any) => {
      it(`${g.t} · ${g.h} vs ${g.a}`, () => {
        const mine = bb.model(g, g.sp, !!g.aud);
        const theirs = refBb.model(g.h, g.a, g.sp[0], g.sp[1], !!g.aud);
        expectMarketParity(g.h + "-" + g.a, mine, theirs);
        expect(mine.pick.id).toBe(theirs.pick.id);
        expect(Math.abs(mine.gh - theirs.gh)).toBeLessThan(EPS);
        expect(mine.line).toBe(theirs.line);
        expect(Math.abs(mine.pH - theirs.pH)).toBeLessThan(EPS);
      });
    });
  });
  it("simulador MIL@LAD (con abridores del original)", () => {
    const mine = bb.model({ h: "MIL", a: "LAD" }, ["mis", "sku"], false);
    const theirs = refBb.model("MIL", "LAD", "mis", "sku", false);
    expectMarketParity("sim MLB", mine, theirs);
    expect(mine.pick.id).toBe(theirs.pick.id);
  });
});

describe("Paridad con cuotas del usuario — bestOf/NOB (fútbol y NHL)", () => {
  it("bestOf elige el mismo mercado y EV en fútbol", () => {
    const g = refFb.DD.MX[0][1][0];
    const k = "FB:" + g.cp + ":" + g.dl + ":" + g.h + "-" + g.a;
    const mine = fb.model(g.h, g.a, "MX", false);
    const theirs = refFb.model(g.h, g.a, "MX", false);
    // Cuotas con y sin valor (una le saca >4%, otras no).
    const oddsRef = refFb.AVX.odds;
    const oddsMine = fbOdds; // el mapa del motor es el mismo objeto (por referencia)
    oddsMine[k + "|h"] = "2.15";
    oddsRef[k + "|h"] = "2.15";
    oddsMine[k + "|un"] = "1.80";
    oddsRef[k + "|un"] = "1.80";
    const bM = ((): { o: any; ev: number; d: number } | null => {
      let b: any = null;
      mine.O.forEach((o: any) => {
        const dv = oddsMine[k + "|" + o.id];
        const d = dv ? parseFloat(dv) : null;
        if (d) {
          const ev = o.p * d - 1;
          if (ev >= 0.04 && (!b || ev > b.ev)) b = { o, ev, d };
        }
      });
      return b;
    })();
    const bT = refFb.bestOf(g, theirs);
    expect(bM?.o.id).toBe(bT?.o.id);
    expect(Math.abs((bM?.ev ?? 0) - (bT?.ev ?? 0))).toBeLessThan(EPS);
    // NOB con cuotas presentes pero sin valor.
    oddsMine[k + "|h"] = "1.50";
    oddsRef[k + "|h"] = "1.50";
    expect(fb.NOB(g)).toBe(refFb.NOB(g));
  });
});
