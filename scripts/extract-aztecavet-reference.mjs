// AztecaVet — fase D (data access layer) + oráculos de referencia, siguiendo el
// patrón de extract-data.mjs (touchiq).
//
// 1. Escribe src/data/aztecavet-*.json desde el inventario ya evaluado en
//    aztecavet-analysis/data/inventory.json (REA + node:vm, literales puros).
// 2. Extrae las funciones ORIGINALES verbatim de las páginas decodificadas
//    (aztecavet-analysis/scripts/pages/*.html) como oráculo de referencia para
//    los tests de paridad matemática — misma técnica de stubs del proyecto.
//
// Los modelos originales viven en el cliente (OBSERVADO); nada de servidor.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ANALYSIS = decodeURIComponent(new URL("../Reportes/analisis-aztecavet/", import.meta.url).pathname);
const DATA_DIR = decodeURIComponent(new URL("../src/data/", import.meta.url).pathname);
const REF_DIR = decodeURIComponent(new URL("../reference/aztecavet/", import.meta.url).pathname);
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(REF_DIR, { recursive: true });

// ---------- 1) Datos ----------
const inv = JSON.parse(readFileSync(ANALYSIS + "data/inventory.json", "utf8"));

const write = (name, value) => {
  writeFileSync(DATA_DIR + name, JSON.stringify(value, null, 1));
  console.log("data/", name, Array.isArray(value) ? `array(${value.length})` : typeof value);
};

write("aztecavet-fb-teams.json", inv.fb_teams);
write("aztecavet-fb-fixtures.json", inv.fb_fixtures);
write("aztecavet-fb-injuries.json", inv.fb_injuries);
write("aztecavet-fb-comps.json", inv.fb_comps);
write("aztecavet-fb-constants.json", { raw: inv.fb_constants.raw });
write("aztecavet-nhl-teams.json", inv.nhl_teams);
write("aztecavet-nhl-results.json", inv.nhl_results);
write("aztecavet-nhl-audit.json", inv.nhl_audit);
write("aztecavet-nhl-news.json", inv.nhl_news);
write("aztecavet-nhl-schedule.json", inv.nhl_schedule);
write("aztecavet-nhl-constants.json", { raw: inv.nhl_constants.raw });
write("aztecavet-mlb-teams.json", inv.mlb_teams);
write("aztecavet-mlb-pitchers.json", inv.mlb_pitchers);
write("aztecavet-mlb-batters.json", inv.mlb_batters);
write("aztecavet-mlb-timeline.json", inv.mlb_timeline);
write("aztecavet-mlb-constants.json", { raw: inv.mlb_constants.raw });
write("aztecavet-meta.json", {
  dataDate: "2026-11-06",
  timezone: "America/Mexico_City",
  storageKey: "azteca_av",
  accessCodeLength: 4,
  source: "aztecavet.com (bundle público; ver aztecavet-analysis/INFORME-PROFUNDO.md)",
});

// ---------- 2) Oráculos de referencia ----------
// Stubs mínimos para que el código original cargue sin DOM ni red (mismo
// enfoque que extract-data.mjs para touchiq).
const STUB = `
const AVX={odds:{},EVMIN:.04,th:.6,bank:1000,inSlip:new Set(),pk:{},cbs:[],
  unit:()=>0,setOdd:()=>{},add:()=>{},on:()=>{},addBtn:()=>"",stakeBox:()=>"",noVig:()=>({p:{},mg:[]}),anim:()=>{},fmt:""};
const document={addEventListener(){},getElementById:()=>({innerHTML:"",value:"",textContent:"",style:{},
  classList:{toggle(){},add(){},remove(){},contains:()=>false},addEventListener(){},on(){},appendChild(){},children:[],
  dataset:{},scrollTop:0,querySelectorAll:()=>[],querySelector:()=>null,contentWindow:null,scrollIntoView(){}})};
const window={addEventListener(){},__START:undefined};
const parent={postMessage(){}};
const localStorage={getItem:()=>null,setItem(){}};
const performance={now:()=>0};
const requestAnimationFrame=()=>0;const cancelAnimationFrame=()=>{};
const setTimeout=()=>0;const clearTimeout=()=>{};
const Image=function(){};const CSS={escape:s=>s};
`;

const page = (p) => readFileSync(ANALYSIS + "scripts/pages/" + p, "utf8");

function sliceBetween(html, start, end) {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error(`ancla no encontrada: ${start} … ${end}`);
  return html.slice(i, j);
}

function buildRef(name, pageFile, core, returns) {
  const src = STUB + core + `\n;return {${returns}};`;
  const fn = new Function(src);
  const mod = fn(); // validación en runtime: el bloque carga sin DOM y expone todo
  const file = REF_DIR + name;
  // El archivo sí es un módulo ESM válido (return solo funciona dentro de new Function).
  writeFileSync(file, STUB + core + `\n;const __ref = {${returns}};\nexport default __ref;\n`);
  console.log("reference/", name, "OK — exports:", Object.keys(mod).join(", "));
  return mod;
}

// Fútbol: bloque continuo const LG0= … const RIMG= (incluye TD/TM/COMPS/DD/NW,
// pois/tilt/dec/base/rate/inj/model0/markets/model/COMBOS/bestOf…).
const fbCore = sliceBetween(page("fb.html"), "const LG0=", "const RIMG=");
const refFb = buildRef("football-ref.mjs", "fb.html", fbCore,
  "model, model0, bestOf, NOB, NV, STK, PK, KEY, SPN, dec, MG, TD, TM, COMPS, DD, NW, AVX, C:{LG0,STR,LGU,E,HFA,SHR,DRAW,DCO,K,NG}");

// NHL: const T= … const RIMG= (incluye R/AUD/N/D, build/rebuild/form, OVR, eff, model0…).
const nhlCore = sliceBetween(page("nhl.html"), "const T={", "const RIMG=");
const refNh = buildRef("hockey-ref.mjs", "nhl.html", nhlCore,
  "model, model0, bestOf, NOB, NV, STK, PK, KEY, dec, T, R, AUD, N, D, SIM, build, rebuild, OVR, AVX, C:{E,HFA,K,SHR,NG,FORMW}, get S(){return S}, get SA(){return SA}, get ed(){return ed}");

// MLB: const LG=4.40 … const RIMG= (incluye T/PL/BT/D, phi/base/eff/model0/COMBOS…).
const mlbCore = sliceBetween(page("mlb.html"), "const LG=4.40", "const RIMG=");
const refBb = buildRef("baseball-ref.mjs", "mlb.html", mlbCore,
  "model, model0, bestOf, NOB, NV, STK, PK, KEY, dec, T, PL, BT, D, SIM, AVX, C:{LG,EX,HFA,SHR,SD}");

// ---------- 3) Colecciones NORMALIZADAS (con el .map/transform original aplicado) ----------
// El escáner de literales corta antes del .map del original, así que la forma
// canónica (objetos) se toma de los propios bloques evaluados arriba.
write("aztecavet-fb-injuries.json", refFb.NW);
write("aztecavet-nhl-news.json", refNh.N);
write("aztecavet-nhl-schedule.json", refNh.D);
write("aztecavet-mlb-pitchers.json", Object.values(refBb.PL));
write("aztecavet-mlb-batters.json", refBb.BT);
