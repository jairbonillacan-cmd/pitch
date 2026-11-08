/** Experimentos de sensibilidad (objetivo §4): entrada→salida con una variable a la vez. */
import { it } from "vitest";
import { NflEngine } from "../../src/domain/engine-nfl.js";
import { NcaaEngine } from "../../src/domain/engine-ncaa.js";
import { unitOf } from "../../src/domain/betting.js";
import { nfl, ncaa } from "../../src/data/index.js";

const e = new NflEngine({ teams: nfl.teams, results: nfl.results, audit: nfl.audit, injuries: nfl.injuries, constants: nfl.constants });

it("sensibilidad: lesiones on/off", () => {
  for (const [h, a] of [["WAS", "LAR"], ["MIA", "DET"], ["NO", "CLE"], ["SF", "LV"]] as const) {
    const con = e.model(h, a);
    const sin = e.model0(h, a, (e as never as { S: never }).S, true);
    const dP = (con.pH - sin.pH) * 100;
    console.log(`SENS-LES ${h}@${a}: pH con=${(con.pH * 100).toFixed(1)}% sin=${(sin.pH * 100).toFixed(1)}% (Δ${dP >= 0 ? "+" : ""}${dP.toFixed(1)} pp, ${con.notes.length} ajustes)`);
  }
});

it("sensibilidad: EV vs cuota para LAR 67.8%", () => {
  const p = 0.678;
  const rows = [1.4, 1.45, 1.47, 1.53, 1.6, 1.8].map((d) => {
    const ev = p * d - 1;
    return `  cuota ${d.toFixed(2)} → EV ${(ev * 100).toFixed(1)}% · sizing ${unitOf(p, d, 0.6)}%`;
  });
  console.log("SENS-EV LAR ML 67.8%:\n" + rows.join("\n"));
});

it("sensibilidad: campo neutral (Londres) y SHR NCAA", () => {
  const mLon = e.model("PHI", "NYG"); // NEUT: JAX-PHI/JAX-HOU — PHI@NYG no es neutral
  const jax = e.model("JAX", "HOU");
  console.log(`SENS-NEUT JAX-HOU (Londres): pH=${(jax.pH * 100).toFixed(1)}% · PH-NYG normal pH=${(mLon.pH * 100).toFixed(1)}%`);
  const nc = new NcaaEngine({ teams: ncaa.teams, results: ncaa.results, audit: ncaa.audit, injuries: [], constants: ncaa.constants, lgp: 28 });
  const mN = nc.model("MICH", "MSU");
  console.log(`SENS-SHR NCAA MICH-MSU: pH con SHR=${(mN.pH * 100).toFixed(1)}% (Log5 crudo ≈ ${(0.5 + (mN.pn - 0.5) * 0.85).toFixed(3)}·)`);
});
