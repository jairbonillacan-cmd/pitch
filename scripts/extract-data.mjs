// Extrae los datasets embebidos de la app original (fase D — data access layer).
// Lee los scripts analizados en touchiq-analysis y escribe JSON tipables en src/data/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = decodeURIComponent(new URL("../Reportes/analisis-touchiq/", import.meta.url).pathname);
const core = readFileSync(BASE + "page_nfl_s1.js", "utf8").slice(0, 28586);
const s3 = readFileSync(BASE + "page_nfl_s3.js", "utf8");
const s4 = readFileSync(BASE + "page_nfl_s4.js", "utf8");
const s9 = readFileSync(BASE + "page_nfl_s9.js", "utf8");

// Stub del puente AVX (igual que el harness offline verificado)
const stub = `const AVX={odds:{},unit:()=>0,addBtn:()=>""},document={addEventListener:()=>{},getElementById:()=>null},window={addEventListener:()=>{}};`;

// NFL: T, R, AUD, N, D ya mapeado, constantes del motor
const nfl = new Function(
  stub +
    core +
    `; return {T, R, AUD, N, D, C:{E,HFA,K,NG,SDM,SDT,SDP,LGPF,NEUT:[...NEUT]}};`,
)();
// Props: PJ, DF, PRI, LGP/LGR/LGS (tras el core, con T/D disponibles)
const props = new Function(
  stub + core + readFileSync(BASE + "page_nfl_s1.js", "utf8").slice(28586, 31047) +
    s3 + `; return {PJ, DF, PRI, LIGA:{LGP,LGR,LGS}};`,
)();
// Dinero: MONEY (s9) — vive dentro de un IIFE; el literal es JSON válido
const m9 = s9.match(/const MONEY=(\{[\s\S]*?\});\nlet MK/);
if (!m9) throw new Error("MONEY no encontrado en s9");
const MONEY = JSON.parse(m9[1]);
// Noticias/colores (s4): localizar el array de noticias (nombre desconocido) y TC
const s4m = s4.match(/const (\w+)\s*=\s*(\[\s*\[\s*1,\s*"[A-Z]{3}"[\s\S]*?\]);/);
const tc = new Function(stub + core + s4 + `; return {TC};`)();

const NCAA_BASE = BASE;
const ncaaS1 = readFileSync(NCAA_BASE + "page_ncaa_s1.js", "utf8");
// NCAA: cortar en el inicio del render (function row)
const ncaaCore = ncaaS1.slice(0, ncaaS1.indexOf("function row"));
const ncaa = new Function(
  stub + ncaaCore + `; return {T, R, D, AUD, C:{E,HFA,K,SDM,NG}, CONF, LGP:typeof LGP!=="undefined"?LGP:null};`,
)();

mkdirSync(decodeURIComponent(new URL("../src/data/", import.meta.url).pathname), { recursive: true });
const out = (name, obj) =>
  writeFileSync(decodeURIComponent(new URL(`../src/data/${name}.json`, import.meta.url).pathname), JSON.stringify(obj));

out("nfl-teams", nfl.T);
out("nfl-results", nfl.R);
out("nfl-audit", nfl.AUD);
out("nfl-injuries", nfl.N);
out("nfl-schedule", nfl.D);
out("nfl-constants", nfl.C);
out("props-players", props.PJ);
out("props-defenses", props.DF);
out("props-prior", { PRI: props.PRI, LIGA: props.LIGA });
out("money", MONEY);
out("ncaa-teams", ncaa.T);
out("ncaa-results", ncaa.R);
out("ncaa-schedule", ncaa.D);
out("ncaa-constants", { ...ncaa.C, CONF: ncaa.CONF });
out("ncaa-audit", ncaa.AUD);
if (s4m) out("news", JSON.parse(s4m[2]));
out("team-colors", tc.TC);
console.log("OK datasets:", ["nfl-teams","nfl-results","nfl-audit","nfl-injuries","nfl-schedule","nfl-constants","props-players","props-defenses","props-prior","money","ncaa-teams","ncaa-results","ncaa-schedule","ncaa-constants","news","team-colors"].join(", "));
