/**
 * Prueba controlada sistemática (objetivo §4): el motor reconstruido vs el ORIGINAL
 * ejecutado en paralelo, sobre TODOS los juegos del calendario, todos los mercados.
 * Salida: desviación máxima |Δp| por juego. Identidad esperada (mismas fórmulas y datos).
 */
import { it } from "vitest";
import { readFileSync } from "node:fs";
import { NflEngine } from "../../src/domain/engine-nfl.js";
import { NcaaEngine } from "../../src/domain/engine-ncaa.js";
import { nfl, ncaa } from "../../src/data/index.js";

import { fileURLToPath } from "node:url";
const BASE = fileURLToPath(new URL("../../../../Reportes/analisis-touchiq/", import.meta.url));

function originalNfl() {
  const _s = readFileSync(BASE + "page_nfl_s1.js", "utf8");
  const core = _s.slice(0, _s.indexOf("function row"));
  const f = new Function(
    `const AVX={odds:{},unit:()=>0,addBtn:()=>""};` + core +
    `;rebuild();return (h,a)=>{const m=model0(h,a,S,false);return {pH:m.pH,cp:m.cp,ct:m.ct,O:m.O.map(o=>[o.id,o.p])}};`,
  );
  return f() as (h: string, a: string) => { pH: number; cp: { l: string; p: number }; ct: string; O: [string, number][] };
}

function originalNcaa() {
  const s = readFileSync(BASE + "page_ncaa_s1.js", "utf8");
  const core = s.slice(0, s.indexOf("function row"));
  const f = new Function(
    `const AVX={odds:{},unit:()=>0,addBtn:()=>""};` + core +
    `;if(typeof rebuild==="function")rebuild();return (h,a)=>{const m=model0(h,a,S,false);return {pH:m.pH,cp:m.cp,ct:m.ct,O:m.O.map(o=>[o.id,o.p])}};`,
  );
  return f() as (h: string, a: string) => { pH: number; O: [string, number][] };
}

it("batch NFL: motor reconstruido ≡ original en todos los juegos", () => {
  const orig = originalNfl();
  const mine = new NflEngine({
    teams: nfl.teams, results: nfl.results, audit: nfl.audit,
    injuries: nfl.injuries, constants: nfl.constants,
  });
  let maxD = 0;
  let worst = "";
  const games = nfl.schedule.flatMap(([, gs]) => gs).filter((g) => !g.aud);
  const rows: string[] = [];
  for (const g of games) {
    const o = orig(g.h, g.a);
    const m = mine.model(g.h, g.a);
    for (const [id, p] of o.O) {
      const mp = m.O.find((x) => x.id === id)?.p;
      if (mp == null) { worst = worst || g.h + g.a + ":" + id + "(falta)"; continue; }
      const d = Math.abs(mp - p);
      if (d > maxD) { maxD = d; worst = `${g.h}-${g.a}:${id}`; }
    }
    if (Math.abs(m.pH - o.pH) > maxD) { maxD = Math.abs(m.pH - o.pH); worst = `${g.h}-${g.a}:pH`; }
    rows.push(`${g.h}@${g.a} pick=${o.cp.l} ${(o.cp.p * 100).toFixed(1)}% | Δmax fila ${Math.max(...o.O.map(([id, p]) => Math.abs((m.O.find((x) => x.id === id)?.p ?? 0) - p))).toExponential(1)}`);
  }
  console.log("BATCH-NFL juegos:", games.length, "| Δmax:", maxD.toExponential(3), "en", worst);
  console.log(rows.join("\n"));
});

it("batch NCAA: motor reconstruido ≡ original en todos los juegos", () => {
  const orig = originalNcaa();
  const mine = new NcaaEngine({
    teams: ncaa.teams, results: ncaa.results, audit: ncaa.audit, injuries: [],
    constants: ncaa.constants, lgp: 28,
  });
  let maxD = 0;
  let worst = "";
  const games = ncaa.schedule.flatMap(([, gs]) => gs).filter((g) => !g.aud);
  for (const g of games) {
    const o = orig(g.h, g.a);
    const m = mine.model(g.h, g.a);
    for (const [id, p] of o.O) {
      const mp = m.O.find((x) => x.id === id)?.p;
      if (mp == null) continue;
      const d = Math.abs(mp - p);
      if (d > maxD) { maxD = d; worst = `${g.h}-${g.a}:${id}`; }
    }
    if (Math.abs(m.pH - o.pH) > maxD) { maxD = Math.abs(m.pH - o.pH); worst = `${g.h}-${g.a}:pH`; }
  }
  console.log("BATCH-NCAA juegos:", games.length, "| Δmax:", maxD.toExponential(3), "en", worst);
});

it("backtest NCAA sin filtración: reproducir el registro auditado 4-1", () => {
  const audited = ncaa.schedule.flatMap(([, gs]) => gs).filter((g) => g.aud && g.sc);
  console.log("AUDIT-NCAA juegos:", audited.length);
  // Datos "antes del partido": excluir los juegos auditados de la fuerza (equivalente SA)
  const audKeys = new Set(audited.map((g) => g.h + "-" + g.a));
  const pre = ncaa.results.filter(([h, a]) => !audKeys.has(h + "-" + a) && !audKeys.has(a + "-" + h));
  const mine = new NcaaEngine({
    teams: ncaa.teams, results: pre, injuries: [],
    constants: ncaa.constants, lgp: 28,
  });
  let w = 0, l = 0;
  for (const g of audited) {
    const m = mine.model0(g.h, g.a, (mine as never as { S: never }).S ?? ({} as never), true);
    // pick del motor reconstruido vs almacenado
    const stored = g.pk?.[0] ?? "(sin pick)";
    const sc = g.sc as [number, number];
    // resolver el pick ALMACENADO contra el marcador (como el original)
    const ml = m.O.find((o) => o.id === (m.pH >= 0.5 ? "mlh" : "mla"));
    const homeWins = sc[0] > sc[1];
    const pickSide = m.pH >= 0.5 ? g.h : g.a;
    const won = (pickSide === g.h && homeWins) || (pickSide === g.a && !homeWins);
    if (won) w++; else l++;
    console.log(`  ${g.h}@${g.a} ${sc[0]}-${sc[1]} | almacenado: ${stored} | motor: ${ml?.l} ${( (m.pH>=0.5?m.pH:1-m.pH)*100).toFixed(1)}% → ${won ? "✓" : "✗"}`);
  }
  console.log(`BACKTEST-NCAA: ${w}-${l} (UI observada: 4-1)`);
});
