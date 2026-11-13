#!/usr/bin/env node
/**
 * Generador prospectivo integral de picks quincenales (Esta Semana: 13–19 Nov 2026 | Próxima Semana: 20–26 Nov 2026)
 * usando los motores reales de PitchLab (`MatchOutlook v3.2`, `Tachyon v3.0`, `Minkowski v3.0/v3.2`,
 * `Spacetime Multi-Sport v3.0` y `packages/models/src/picks.ts`) + fuentes de cuotas legales sin anti-bot
 * (`nflverse`, `Kalshi Trade API v2`, `Polymarket Gamma API`, `Open-Meteo`) + alineaciones y bajas reales.
 *
 * Respeta estrictamente:
 *  - Artefactos congelados `v3.1` / `v3.2` en modo solo lectura (0 modificaciones).
 *  - Compuerta `production_segments_v3_1.json` (`0/60` segmentos live con dinero real; EV reportado en modo Paper-Trading).
 *  - Gobernanza `LEGAL_FUENTES_CUOTAS.md` (cero evasión de CAPTCHAs / Cloudflare / `robots.txt`).
 */

import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { createRequire } from "node:module";
import esbuild from "esbuild";

const ROOT = process.cwd();
const TS_DECISION = "2026-11-13T22:15:00Z";
const WINDOW_START = "2026-11-13";
const WINDOW_END = "2026-11-26";
const WEEK1_END = "2026-11-19"; // Vie 13 Nov -> Jue 19 Nov ("Esta semana")

// ---------------------------------------------------------------------------
// 1. Empaquetado en memoria de los motores reales TypeScript (0 duplicación)
// ---------------------------------------------------------------------------
async function loadPitchLabEngine() {
  const entryCode = `
    export { buildMatchOutlook } from "./src/domain/prediction/outlook.ts";
    export {
      buildTeamMasterIndex,
      synthesizeFootballSnapshotRowFromMaster,
      synthesizeNflSnapshotRowFromMaster,
      resolveProductionSegmentGate,
      SERVICE_CONSTANTS_V3_2,
    } from "./src/domain/prediction/service.ts";
    export {
      computeLineupAvailabilityDelta,
      predictMotorAWithAvailability,
      predictNFL,
      applyAvailabilityDeltaToProbs,
    } from "./src/domain/prediction/engine.ts";
    export { applyMinkowskiV3LiveContext } from "./src/domain/prediction/nfl_live.ts";
    export {
      buildDixonColesScoreMatrix,
      deriveAll2WayMarkets,
    } from "./src/domain/prediction/markets_2way.ts";
    export { predictMultiSport, MULTISPORT_CODENAMES } from "./src/domain/prediction/multisport.ts";
    export { devig, devig2Way, devigAdaptive1X2, overround } from "./src/domain/prediction/devig.ts";
    export { normalCdf, clamp, logit, sigmoid } from "./src/domain/prediction/math.ts";
    export {
      selectPicks,
      featuredPick,
      confidenceIndex,
      coherentScore,
      picksCompatible,
    } from "./packages/models/src/picks.ts";
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: ROOT,
      sourcefile: "pitchlab-biweekly-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node22",
    alias: {
      "@pitchlab/contracts": path.join(ROOT, "packages/contracts/src/index.ts"),
    },
    logLevel: "warning",
  });

  const code = result.outputFiles[0].text;
  const req = createRequire(import.meta.url);
  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", "__filename", "__dirname", code);
  fn(mod.exports, req, mod, path.join(ROOT, "pitchlab-bundle.cjs"), ROOT);
  return mod.exports;
}

// ---------------------------------------------------------------------------
// 2. Utilidades de normalización, cuotas y similitud de nombres
// ---------------------------------------------------------------------------
function slug(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|cd|ud|rcd|ssc|aj|as|es|ogc|vfl|fsv|rb|1|de|club|futbol|football|united|city|town|athletic|atletico|sporting|real|borussia|bayer|sv|tsg|osc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fullSlug(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES = {
  "internazionale": "inter",
  "inter milan": "inter",
  "fc internazionale milano": "inter",
  "paris saint germain": "psg",
  "paris sg": "psg",
  "bayern munchen": "bayern munich",
  "bayern": "bayern munich",
  "koln": "cologne",
  "1 fc koln": "cologne",
  "mainz 05": "mainz",
  "borussia monchengladbach": "monchengladbach",
  "m gladbach": "monchengladbach",
  "gladbach": "monchengladbach",
  "st pauli": "pauli",
  "athletic club": "athletic bilbao",
  "bilbao": "athletic bilbao",
  "atletico de madrid": "atletico madrid",
  "celta de vigo": "celta",
  "celta vigo": "celta",
  "deportivo alaves": "alaves",
  "rayo vallecano": "rayo",
  "real sociedad": "sociedad",
  "real betis": "betis",
  "hellas verona": "verona",
  "como 1907": "como",
  " Wolverhampton wanderers": "wolves",
  "wolverhampton wanderers": "wolves",
  "wolverhampton": "wolves",
  "brighton and hove albion": "brighton",
  "brighton hove albion": "brighton",
  "tottenham hotspur": "tottenham",
  "spurs": "tottenham",
  "nottingham forest": "forest",
  "west ham united": "west ham",
  "manchester united": "man utd",
  "manchester city": "man city",
  "newcastle united": "newcastle",
  "leeds united": "leeds",
  "afc bournemouth": "bournemouth",
  "guadalajara": "chivas",
  "chivas guadalajara": "chivas",
  "cd guadalajara": "chivas",
  "club america": "america",
  "cf america": "america",
  "cruz azul": "cruz azul",
  "tigres uanl": "tigres",
  "unam": "pumas",
  "pumas unam": "pumas",
  "atletico san luis": "san luis",
  "atletico de san luis": "san luis",
  "fc juarez": "juarez",
  "bravos juarez": "juarez",
  "santos laguna": "santos",
  "club tijuana": "tijuana",
  "xolos": "tijuana",
  "club leon": "leon",
  "gallos blancos": "queretaro",
  "queretaro fc": "queretaro",
  "cf monterrey": "monterrey",
  "rayados": "monterrey",
  "deportivo toluca": "toluca",
  "atlas guadalajara": "atlas",
  "club necaxa": "necaxa",
  "club puebla": "puebla",
  "cf pachuca": "pachuca",
  "mazatlan fc": "mazatlan",
  "stade brestois 29": "brest",
  "stade brestois": "brest",
  "stade rennais": "rennes",
  "rc strasbourg alsace": "strasbourg",
  "rc lens": "lens",
  "olympique de marseille": "marseille",
  "olympique lyonnais": "lyon",
  "as monaco": "monaco",
  "losc lille": "lille",
  "toulouse fc": "toulouse",
  "fc nantes": "nantes",
  "es troyes ac": "troyes",
  "es troyes": "troyes",
  "le havre ac": "le havre",
  "aj auxerre": "auxerre",
  "ogc nice": "nice",
  "angers sco": "angers",
  "paris fc": "paris fc",
  "fc lorient": "lorient",
  "fc metz": "metz",
  "bodo glimt": "bodoe glimt",
  "fk bodo glimt": "bodoe glimt",
  "sporting cp": "sporting lisbon",
  "psv eindhoven": "psv",
  "club brugge": "brugge",
  "red star belgrade": "crvena zvezda",
};

function canonTeamKey(raw) {
  const fs0 = fullSlug(raw);
  if (fs0.includes("saint germain") || fs0 === "psg") return "psg";
  if (fs0 === "paris fc" || fs0 === "paris") return "paris fc";
  if (TEAM_ALIASES[fs0]) return TEAM_ALIASES[fs0];
  for (const [k, v] of Object.entries(TEAM_ALIASES)) {
    if (fs0 === k || (k.length >= 6 && fs0.includes(k))) return v;
  }
  const s = slug(raw);
  if (TEAM_ALIASES[s]) return TEAM_ALIASES[s];
  return s || fs0;
}

function teamsMatch(a, b) {
  if (!a || !b) return false;
  const ca = canonTeamKey(a);
  const cb = canonTeamKey(b);
  if (ca === cb) return true;
  if (ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))) {
    // Evitar colisión man city vs man utd / milan vs inter milan / madrid vs atletico madrid / paris fc vs psg
    const guardPairs = [
      ["man city", "man utd"],
      ["paris fc", "psg"],
      ["inter", "milan"],
      ["real madrid", "atletico madrid"],
      ["espanyol", "barcelona"],
      ["everton", "liverpool"],
      ["sevilla", "betis"],
      ["roma", "lazio"],
    ];
    for (const [x, y] of guardPairs) {
      if ((ca.includes(x) && cb.includes(y)) || (ca.includes(y) && cb.includes(x))) return false;
    }
    return true;
  }
  const ta = new Set(ca.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(cb.split(" ").filter((t) => t.length >= 3));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter > 0 && inter >= Math.min(ta.size, tb.size);
}

function americanToDecimal(am) {
  const n = Number(am);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return +(1 + n / 100).toFixed(4);
  return +(1 + 100 / Math.abs(n)).toFixed(4);
}

function decimalToAmerican(dec) {
  if (!Number.isFinite(dec) || dec <= 1.0001) return null;
  if (dec >= 2.0) return Math.round((dec - 1) * 100);
  return -Math.round(100 / (dec - 1));
}

function fmtAm(am) {
  if (am === null || am === undefined || !Number.isFinite(am)) return "s/c";
  return am > 0 ? `+${am}` : `${am}`;
}

function round4(x) {
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;
}

function round2(x) {
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

async function fetchJsonSafe(url, label) {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PitchLab-ingest/1.0 (+https://pitchlab.app; compliant public API reader)",
      },
    });
    if (!res.ok) {
      console.warn(`[WARN] ${label}: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[WARN] ${label}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Overrides verificados de lesiones, QBs, sanciones y Fecha FIFA (13 Nov 2026)
// ---------------------------------------------------------------------------
const NFL_QB_AND_INJURY_OVERRIDES = {
  BAL: {
    qbInjured: 1,
    starterQb: "Jacoby Brissett",
    injuriesOutDelta: 3,
    note: "Lamar Jackson (pulgar, IR 6-10 sem) y Tyler Huntley (pie, IR) FUERA; Jacoby Brissett debuta como QB titular tras traspaso desde Arizona.",
  },
  PHI: {
    qbInjured: 1,
    starterQb: "Joe Milton III",
    injuriesOutDelta: 2,
    note: "Jalen Hurts FUERA toda la temporada en IR (trombosis/coágulos pulmonares); Joe Milton III toma los controles ofensivos.",
  },
  MIN: {
    qbInjured: 1,
    starterQb: "Kirk Cousins",
    injuriesOutDelta: 2,
    note: "Kyler Murray FUERA (isquiotibiales grado 2); Kirk Cousins inicia como QB titular.",
  },
  MIA: {
    qbInjured: 1,
    starterQb: "Kyle McCord",
    injuriesOutDelta: 2,
    note: "Malik Willis colocado en IR (ingle/abdomen); el QB de 2.º año Kyle McCord realiza la primera titularidad de su carrera.",
  },
  ARI: {
    qbInjured: 1,
    starterQb: "Carson Beck",
    injuriesOutDelta: 2,
    note: "Gardner Minshew en IR (rotura ligamento UCL codo); el novato Carson Beck recibe su primera titularidad NFL.",
  },
  SEA: {
    qbInjured: 1,
    starterQb: "Drew Lock",
    injuriesOutDelta: 2,
    note: "Sam Darnold FUERA en Semana 10 (cuádriceps/costilla, apunta a volver tras el bye de S11); Drew Lock inicia en Las Vegas.",
  },
  LA: {
    qbInjured: 0,
    starterQb: "Matthew Stafford",
    injuriesOutDelta: 2,
    note: "WR estrella Puka Nacua en IR (esguince MCL/PCL rodilla, baja hasta ~Semana 15).",
  },
  LAR: {
    qbInjured: 0,
    starterQb: "Matthew Stafford",
    injuriesOutDelta: 2,
    note: "WR estrella Puka Nacua en IR (esguince MCL/PCL rodilla, baja hasta ~Semana 15).",
  },
  NE: {
    qbInjured: 0,
    starterQb: "Drake Maye",
    injuriesOutDelta: 2,
    questionableDelta: 2,
    note: "Juego en Múnich: RB TreVeyon Henderson (enfermedad) y CB Carlton Davis III (rodilla) FUERA; WR A.J. Brown y RB Rhamondre Stevenson cuestionables.",
  },
  DET: {
    qbInjured: 0,
    starterQb: "Jared Goff",
    injuriesOutDelta: 2,
    questionableDelta: 1,
    note: "Secundaria mermada: S All-Pro Kerby Joseph (rodilla) y CB D.J. Reed (cadera) FUERA; WR Amon-Ra St. Brown cuestionable (costillas).",
  },
  GB: {
    qbInjured: 0,
    starterQb: "Jordan Love",
    injuriesOutDelta: 1,
    questionableDelta: 1,
    note: "RB titular Josh Jacobs apunta a ser baja/muy limitado; carga terrestre para Emanuel Wilson/MarShawn Lloyd.",
  },
  KC: {
    qbInjured: 0,
    starterQb: "Patrick Mahomes",
    injuriesOutDelta: 0,
    questionableDelta: 1,
    note: "Patrick Mahomes entrenó al 100%; RB Kenneth Walker III cuestionable (ingle, no entrenó viernes).",
  },
  CLE: {
    qbInjured: 0,
    starterQb: "Deshaun Watson",
    injuriesOutDelta: 0,
    note: "Deshaun Watson superó protocolo de conmoción cerebral y será titular.",
  },
  SF: {
    qbInjured: 0,
    starterQb: "Brock Purdy",
    injuriesOutDelta: 1,
    note: "WR Mike Evans fuera semana a semana (tendón de Aquiles).",
  },
  DAL: {
    qbInjured: 0,
    starterQb: "Dak Prescott",
    injuriesOutDelta: 0,
    questionableDelta: 1,
    note: "WR George Pickens cuestionable / decisión pre-partido (isquiotibiales).",
  },
  LAC: {
    qbInjured: 0,
    starterQb: "Justin Herbert",
    injuriesOutDelta: 1,
    note: "Chargers llegan 0-8 urgidos de su primera victoria; Justin Herbert activo.",
  },
};

const NFL_W12_THANKSGIVING_ODDS = {
  "2026_12_GB_LA": {
    homeSpreadLine: -3.5,
    awaySpreadOdds: -110,
    homeSpreadOdds: -110,
    awayMoneyline: 164,
    homeMoneyline: -198,
    totalLine: 49.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel_opener",
    awayQb: "Jordan Love",
    homeQb: "Matthew Stafford",
  },
  "2026_12_CHI_DET": {
    homeSpreadLine: -2.5,
    awaySpreadOdds: -110,
    homeSpreadOdds: -110,
    awayMoneyline: 108,
    homeMoneyline: -126,
    totalLine: 53.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel_opener",
    awayQb: "Caleb Williams",
    homeQb: "Jared Goff",
  },
  "2026_12_PHI_DAL": {
    homeSpreadLine: -1.5,
    awaySpreadOdds: -110,
    homeSpreadOdds: -110,
    awayMoneyline: -102,
    homeMoneyline: -116,
    totalLine: 49.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel_opener",
    awayQb: "Joe Milton III",
    homeQb: "Dak Prescott",
  },
  "2026_12_KC_BUF": {
    homeSpreadLine: -2.5,
    awaySpreadOdds: -110,
    homeSpreadOdds: -110,
    awayMoneyline: 118,
    homeMoneyline: -140,
    totalLine: 50.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel_opener",
    awayQb: "Patrick Mahomes",
    homeQb: "Josh Allen",
  },
};

// Coordenadas de estadios NFL exteriores para pronóstico horario Open-Meteo
const NFL_OUTDOOR_COORDS = {
  CLE: { lat: 41.5061, lon: -81.6995 },
  GB: { lat: 44.5013, lon: -88.0622 },
  NYJ: { lat: 40.8128, lon: -74.0742 },
  NYG: { lat: 40.8128, lon: -74.0742 },
  TEN: { lat: 36.1665, lon: -86.7713 },
  CIN: { lat: 39.0955, lon: -84.5161 },
  BAL: { lat: 39.278, lon: -76.6227 },
  BUF: { lat: 42.7738, lon: -78.787 },
  CAR: { lat: 35.2258, lon: -80.8528 },
  CHI: { lat: 41.8623, lon: -87.6167 },
  KC: { lat: 39.0489, lon: -94.4839 },
  DEN: { lat: 39.7439, lon: -105.0201 },
  PHI: { lat: 39.9008, lon: -75.1675 },
  SF: { lat: 37.4032, lon: -121.9698 },
  WAS: { lat: 38.9076, lon: -76.8645 },
};

// Overrides tácticos/bajas de fútbol por partido o equipo
function getSoccerTeamOverride(league, teamName, matchDateStr) {
  const k = canonTeamKey(teamName);
  const isFifaWindow = matchDateStr <= "2026-11-17";

  if (league === "liga-mx") {
    if (k === "monterrey" && isFifaWindow) {
      return {
        missingMarketValueRatio: 0.36,
        injuredCount: 4,
        suspendedCount: 2,
        note: "6 BAJAS CLAVE en Fecha FIFA (DT Matías Almeyda): Tecatito Corona (Tri), Iker Fimbres (Sub-23) y Hugo Cuypers (Bélgica) convocados; Carlos Salcedo (roja) y Óliver Torres (5 amarillas) suspendidos; Uroš Đurđević 'Djuka' lesionado.",
      };
    }
    if (k === "monterrey" && !isFifaWindow) {
      return {
        missingMarketValueRatio: 0.09,
        injuredCount: 1,
        suspendedCount: 0,
        note: "Regresan Tecatito Corona, Cuypers, Salcedo y Óliver Torres para cerrar J17; Uroš Đurđević sigue en duda/baja muscular.",
      };
    }
    if (k === "queretaro" && isFifaWindow) {
      return {
        missingMarketValueRatio: 0.08,
        injuredCount: 0,
        suspendedCount: 1,
        note: "Santiago Homenchenko suspendido (acumulación de 5 amarillas); resto del plantel de Esteban González completo.",
      };
    }
    if (k === "toluca") {
      return {
        missingMarketValueRatio: 0.16,
        injuredCount: 2,
        suspendedCount: 0,
        note: "Marcel Ruiz FUERA todo el torneo (rotura de LCA); Alexis Vega y Jesús Gallardo regresan con carga de Selección Mexicana.",
      };
    }
    if (k === "america") {
      return {
        missingMarketValueRatio: 0.13,
        injuredCount: 2,
        suspendedCount: 0,
        note: "Brian Rodríguez y Víctor Dávila lesionados; 5 seleccionados (Reyes, Kevin Álvarez, Érick Sánchez, Violante, Perea) vuelven de Fecha FIFA.",
      };
    }
    if (k === "tigres") {
      return {
        missingMarketValueRatio: 0.11,
        injuredCount: 3,
        suspendedCount: 0,
        note: "Bajas de Marcelo Flores (LCA), Jesús Angulo (rodilla) y Paco Reyes (Aquiles).",
      };
    }
    if (k === "cruz azul") {
      return {
        missingMarketValueRatio: 0.09,
        injuredCount: 2,
        suspendedCount: 0,
        note: "Amaury Morales (LCA) y Mateo Levy (menisco) fuera; Erik Lira, Chiquete Orozco y Montaño vuelven del Tri.",
      };
    }
    if (k === "chivas") {
      return {
        missingMarketValueRatio: 0.05,
        injuredCount: 1,
        suspendedCount: 0,
        note: "Regresan 14 convocados entre Mayor y juveniles (Tala Rangel, Romo, Piojo Alvarado, Campillo) con desgaste de viaje.",
      };
    }
  }

  const euroOverrides = {
    "arsenal": {
      missingMarketValueRatio: 0.14,
      injuredCount: 2,
      suspendedCount: 1,
      note: "Bukayo Saka FUERA (cuádriceps, varias semanas) y Max Dowman suspendido (roja directa).",
    },
    "man city": {
      missingMarketValueRatio: 0.09,
      injuredCount: 2,
      suspendedCount: 0,
      note: "A. Semenyo baja; Josko Gvardiol y Marc Guehi en duda (molestia de cadera con Inglaterra).",
    },
    "liverpool": {
      missingMarketValueRatio: 0.08,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Szoboszlai (rodilla) y Gravenberch (talón) entre algodones tras Fecha FIFA; Van Dijk al 75%.",
    },
    "man utd": {
      missingMarketValueRatio: 0.08,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Carlos Baleba fuera (isquiotibiales).",
    },
    "tottenham": {
      missingMarketValueRatio: 0.07,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Mathys Tel baja (lesión en el pie).",
    },
    "real madrid": {
      missingMarketValueRatio: 0.08,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Aurélien Tchouaméni baja (aductor) + desgaste tras parón internacional.",
    },
    "athletic bilbao": {
      missingMarketValueRatio: 0.11,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Gorka Guruzeta FUERA (rotura de LCA); gestión de minutos en Nico Williams.",
    },
    "valencia": {
      missingMarketValueRatio: 0.1,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Capitán José Luis Gayà SUSPENDIDO (roja directa).",
    },
    "sevilla": {
      missingMarketValueRatio: 0.08,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Nemanja Gudelj SUSPENDIDO (acumulación de amarillas) en el Gran Derbi.",
    },
    "malaga": {
      missingMarketValueRatio: 0.07,
      injuredCount: 0,
      suspendedCount: 1,
      note: "Adam Aznou SUSPENDIDO.",
    },
    "dortmund": {
      missingMarketValueRatio: 0.07,
      injuredCount: 1,
      suspendedCount: 0,
      note: "Serhou Guirassy en seguimiento médico tras el parón.",
    },
    "union berlin": {
      missingMarketValueRatio: 0.09,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Defensa central Felix Uduokhai SUSPENDIDO (roja).",
    },
    "augsburg": {
      missingMarketValueRatio: 0.08,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Juma Bah SUSPENDIDO (roja).",
    },
    "mainz": {
      missingMarketValueRatio: 0.08,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Stefan Posch SUSPENDIDO.",
    },
    "atalanta": {
      missingMarketValueRatio: 0.13,
      injuredCount: 2,
      suspendedCount: 0,
      note: "Zaga golpeada ante Inter: Isak Hien y Odilon Kossounou FUERA por lesión.",
    },
    "napoli": {
      missingMarketValueRatio: 0.05,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Luca Marianucci SUSPENDIDO.",
    },
    "cagliari": {
      missingMarketValueRatio: 0.07,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Adam Obert SUSPENDIDO.",
    },
    "toulouse": {
      missingMarketValueRatio: 0.09,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Extremo titular Aron Dønnum SUSPENDIDO.",
    },
    "le havre": {
      missingMarketValueRatio: 0.08,
      injuredCount: 1,
      suspendedCount: 1,
      note: "Mediocentro Ayumu Seko SUSPENDIDO.",
    },
    "psg": {
      missingMarketValueRatio: 0.07,
      injuredCount: 1,
      suspendedCount: 0,
      note: "Ousmane Dembélé en evaluación física tras Fecha FIFA.",
    },
  };

  return euroOverrides[k] ?? null;
}

// ---------------------------------------------------------------------------
// 4. Ingesta de Roster Availability (RotoWire XI + Transfermarkt + SportsGambler)
// ---------------------------------------------------------------------------
function loadRosterAvailabilityFromGit() {
  const bySoccerTeam = new Map();
  const byMultiTeam = new Map();
  try {
    const raw = cp.execSync("git show web-scraping:data/normalized/roster_availability.json", {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw);
    for (const r of parsed.records || []) {
      if (r.record_type === "rotowire_soccer_team_lineup" && r.team) {
        const k = canonTeamKey(r.team);
        const cur = bySoccerTeam.get(k) || { xi: [], out: [], ques: [], tmAbsences: [] };
        if (Array.isArray(r.starting_11_players) && r.starting_11_players.length > 0) {
          cur.xi = r.starting_11_players.map((p) => `${p.player_name} (${p.position})`);
        }
        if (Array.isArray(r.injured_out_players)) {
          for (const p of r.injured_out_players) {
            cur.out.push(`${p.player_name} (${p.position})`);
          }
        }
        if (Array.isArray(r.questionable_players)) {
          for (const p of r.questionable_players) {
            cur.ques.push(`${p.player_name} (${p.position}, Duda)`);
          }
        }
        bySoccerTeam.set(k, cur);
      } else if (
        (r.record_type === "transfermarkt_player_absence" ||
          r.record_type === "premierinjuries_sportsgambler_sportsgambler_records" ||
          r.record_type === "premierinjuries_sportsgambler_premierinjuries_records") &&
        (r.club || r.team)
      ) {
        const k = canonTeamKey(r.club || r.team);
        const cur = bySoccerTeam.get(k) || { xi: [], out: [], ques: [], tmAbsences: [] };
        const reason = r.injury_or_suspension_reason || r.reason || r.absence_type || "baja";
        const tag = r.absence_type === "suspended" ? "Susp." : "Lesión";
        const label = `${r.player_name} (${tag}: ${reason})`;
        if (!cur.tmAbsences.includes(label) && cur.tmAbsences.length < 5) {
          cur.tmAbsences.push(label);
        }
        bySoccerTeam.set(k, cur);
      } else if (r.record_type === "multisport_player_injury" && r.team) {
        const k = `${String(r.league || "").toLowerCase()}::${fullSlug(r.team)}`;
        const arr = byMultiTeam.get(k) || [];
        if (arr.length < 5) {
          arr.push(`${r.player_name} (${r.position || ""} - ${r.status || r.injury || "Out"})`);
        }
        byMultiTeam.set(k, arr);
      }
    }
  } catch (err) {
    console.warn("[WARN] No se pudo leer roster_availability.json:", err.message);
  }
  return { bySoccerTeam, byMultiTeam };
}

// ---------------------------------------------------------------------------
// 5. Ingesta de Mercados Legales en Vivo: Kalshi API v2 + Polymarket Gamma API
// ---------------------------------------------------------------------------
async function fetchKalshiSeries(seriesTicker) {
  const data = await fetchJsonSafe(
    `https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${seriesTicker}&status=open&limit=200&with_nested_markets=true`,
    `Kalshi ${seriesTicker}`,
  );
  return data?.events || [];
}

async function fetchPolymarketTag(tag) {
  const data = await fetchJsonSafe(
    `https://gamma-api.polymarket.com/events?tag_slug=${encodeURIComponent(tag)}&closed=false&end_date_min=${WINDOW_START}&limit=200`,
    `Polymarket ${tag}`,
  );
  return Array.isArray(data) ? data : [];
}

function parsePolymarketExecutable2Way(m) {
  // Extrae precios decimales ejecutables desde bestBid / bestAsk con filtro estricto de liquidez (spread <= 0.08)
  const bid = Number(m.bestBid);
  const ask = Number(m.bestAsk);
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0.02 && ask < 0.98 && ask >= bid && ask - bid <= 0.085) {
    const pYesExec = ask;
    const pNoExec = 1 - bid;
    if (pYesExec > 0.02 && pNoExec > 0.02 && pYesExec + pNoExec > 1.0005 && pYesExec + pNoExec < 1.15) {
      return {
        dec0: +(1 / pYesExec).toFixed(4),
        dec1: +(1 / pNoExec).toFixed(4),
        mid0: +((bid + ask) / 2).toFixed(4),
        spread: +(ask - bid).toFixed(4),
        liquidityUsd: Number(m.liquidity) || 0,
      };
    }
  }
  // Respaldo solo si existe liquidez real > $2,500 y outcomePrices coherentes
  const liq = Number(m.liquidity) || 0;
  if (liq >= 2500 && typeof m.outcomePrices === "string") {
    try {
      const arr = JSON.parse(m.outcomePrices).map(Number);
      if (arr.length === 2 && arr[0] > 0.04 && arr[0] < 0.96 && arr[1] > 0.04 && arr[1] < 0.96) {
        // Añade half-tick conservador de 0.75c por lado para reflejar ejecución real
        const p0 = Math.min(0.985, arr[0] + 0.0075);
        const p1 = Math.min(0.985, arr[1] + 0.0075);
        return {
          dec0: +(1 / p0).toFixed(4),
          dec1: +(1 / p1).toFixed(4),
          mid0: +arr[0].toFixed(4),
          spread: 0.015,
          liquidityUsd: liq,
        };
      }
    } catch {}
  }
  return null;
}

function extractSoccerMarketBundle(homeName, awayName, kickoffUtc, polyEvents, kalshiGameEvents, kalshiTotalEvents, kalshiBttsEvents) {
  const kickoffMs = Date.parse(kickoffUtc);
  const bundle = {
    availableMarkets: [],
    sources: [],
    h2h: null, // { home, draw, away, book, overround }
    totals: {}, // { "1.5": { over, under, book }, "2.5": ..., "3.5": ... }
    btts: null, // { yes, no, book }
    spreads: {}, // { "-1.5": ..., "+1.5": ... }
    teamTotals: {}, // { home_1_5: ..., away_1_5: ... }
    volumeUsd: 0,
  };

  // 1) Emparejar evento principal Polymarket (moneyline 3-way)
  const polyMain = polyEvents.find((ev) => {
    if (!ev.title || ev.title.includes("More Markets")) return false;
    const parts = ev.title.split(/\s+vs\.?\s+/i);
    if (parts.length < 2) return false;
    const mls = (ev.markets || []).filter((m) => m.sportsMarketType === "moneyline");
    if (mls.length !== 3) return false;
    return teamsMatch(homeName, parts[0]) && teamsMatch(awayName, parts[1]);
  });

  if (polyMain) {
    const mls = polyMain.markets.filter((m) => m.sportsMarketType === "moneyline");
    let pH = null, pD = null, pA = null, vol = 0;
    for (const m of mls) {
      const git = String(m.groupItemTitle || m.question || "");
      const ask = Number(m.bestAsk);
      let price = Number.isFinite(ask) && ask > 0.02 && ask < 0.98 ? ask : null;
      if (price === null && typeof m.outcomePrices === "string") {
        try {
          const p0 = Number(JSON.parse(m.outcomePrices)[0]);
          if (p0 > 0.02 && p0 < 0.98) price = Math.min(0.985, p0 + 0.007);
        } catch {}
      }
      vol += Number(m.volume) || 0;
      if (/^draw\b/i.test(git)) pD = price;
      else if (teamsMatch(homeName, git)) pH = price;
      else if (teamsMatch(awayName, git)) pA = price;
    }
    bundle.volumeUsd += Math.round(vol);
    if (pH && pD && pA && pH + pD + pA > 1.0005 && pH + pD + pA < 1.18) {
      bundle.h2h = {
        home: +(1 / pH).toFixed(4),
        draw: +(1 / pD).toFixed(4),
        away: +(1 / pA).toFixed(4),
        book: "polymarket",
        overround: +(pH + pD + pA - 1).toFixed(4),
      };
      bundle.sources.push("Polymarket");
      bundle.availableMarkets.push("1X2");
    }
  }

  // 2) Respaldo o comparación Kalshi GAME (1X2)
  const kalshiGame = kalshiGameEvents.find((ev) => {
    const parts = String(ev.title || "").split(/\s+vs\.?\s+/i);
    if (parts.length < 2) return false;
    return (
      (teamsMatch(homeName, parts[0]) && teamsMatch(awayName, parts[1])) ||
      (teamsMatch(homeName, parts[1]) && teamsMatch(awayName, parts[0]))
    );
  });

  if (kalshiGame && Array.isArray(kalshiGame.markets) && kalshiGame.markets.length === 3) {
    let kH = null, kD = null, kA = null;
    for (const m of kalshiGame.markets) {
      const sub = String(m.yes_sub_title || m.title || "");
      const ask = Number(m.yes_ask_dollars);
      const last = Number(m.last_price_dollars);
      const p = Number.isFinite(ask) && ask > 0.02 && ask < 0.98 ? ask : Number.isFinite(last) && last > 0.02 ? Math.min(0.985, last + 0.01) : null;
      if (/tie|draw/i.test(sub)) kD = p;
      else if (teamsMatch(homeName, sub)) kH = p;
      else if (teamsMatch(awayName, sub)) kA = p;
    }
    if (kH && kD && kA && kH + kD + kA > 1.0005 && kH + kD + kA < 1.18) {
      if (!bundle.sources.includes("Kalshi")) bundle.sources.push("Kalshi");
      if (!bundle.h2h) {
        bundle.h2h = {
          home: +(1 / kH).toFixed(4),
          draw: +(1 / kD).toFixed(4),
          away: +(1 / kA).toFixed(4),
          book: "kalshi",
          overround: +(kH + kD + kA - 1).toFixed(4),
        };
        bundle.availableMarkets.push("1X2");
      } else {
        bundle.h2h.kalshi = {
          home: +(1 / kH).toFixed(4),
          draw: +(1 / kD).toFixed(4),
          away: +(1 / kA).toFixed(4),
        };
      }
    }
  }

  // 3) Emparejar Polymarket "- More Markets" (Totals 1.5/2.5/3.5, BTTS, Handicap -1.5, Team Totals)
  const polyMore = polyEvents.find((ev) => {
    if (!ev.title || !ev.title.includes("More Markets")) return false;
    const clean = ev.title.replace(/\s*-\s*More Markets.*$/i, "");
    const parts = clean.split(/\s+vs\.?\s+/i);
    if (parts.length < 2) return false;
    return teamsMatch(homeName, parts[0]) && teamsMatch(awayName, parts[1]);
  });

  if (polyMore) {
    if (!bundle.sources.includes("Polymarket")) bundle.sources.push("Polymarket");
    for (const m of polyMore.markets || []) {
      const smt = m.sportsMarketType;
      if (smt === "totals") {
        const line = Number(m.line);
        if ([1.5, 2.5, 3.5].includes(line)) {
          const ex = parsePolymarketExecutable2Way(m);
          if (ex) {
            bundle.totals[String(line)] = {
              over: ex.dec0,
              under: ex.dec1,
              book: "polymarket",
              liquidityUsd: Math.round(ex.liquidityUsd),
            };
            const tag = `O/U ${line}`;
            if (!bundle.availableMarkets.includes(tag)) bundle.availableMarkets.push(tag);
          }
        }
      } else if (smt === "both_teams_to_score") {
        const ex = parsePolymarketExecutable2Way(m);
        if (ex) {
          bundle.btts = {
            yes: ex.dec0,
            no: ex.dec1,
            book: "polymarket",
            liquidityUsd: Math.round(ex.liquidityUsd),
          };
          if (!bundle.availableMarkets.includes("BTTS")) bundle.availableMarkets.push("BTTS");
        }
      } else if (smt === "spreads") {
        const line = Number(m.line);
        if (Math.abs(line) === 1.5) {
          const ex = parsePolymarketExecutable2Way(m);
          if (ex) {
            const git = String(m.groupItemTitle || "");
            if (teamsMatch(homeName, git)) {
              bundle.spreads["home_-1.5"] = { home: ex.dec0, awayPlus1_5: ex.dec1, book: "polymarket" };
            } else if (teamsMatch(awayName, git)) {
              bundle.spreads["away_-1.5"] = { away: ex.dec0, homePlus1_5: ex.dec1, book: "polymarket" };
            }
            if (!bundle.availableMarkets.includes("Hándicap ±1.5")) bundle.availableMarkets.push("Hándicap ±1.5");
          }
        }
      } else if (smt === "soccer_team_totals") {
        const line = Number(m.line);
        if (line === 1.5) {
          const ex = parsePolymarketExecutable2Way(m);
          if (ex) {
            const git = String(m.groupItemTitle || "");
            if (teamsMatch(homeName, git)) {
              bundle.teamTotals.home_1_5 = { over: ex.dec0, under: ex.dec1 };
            } else if (teamsMatch(awayName, git)) {
              bundle.teamTotals.away_1_5 = { over: ex.dec0, under: ex.dec1 };
            }
            if (!bundle.availableMarkets.includes("Team Totals 1.5")) bundle.availableMarkets.push("Team Totals 1.5");
          }
        }
      }
    }
  }

  // 4) Kalshi Totals / BTTS adicionales si existen
  const kTot = kalshiTotalEvents.find((ev) => {
    const clean = String(ev.title || "").split(":")[0] || "";
    const parts = clean.split(/\s+vs\.?\s+/i);
    return parts.length >= 2 && teamsMatch(homeName, parts[0]) && teamsMatch(awayName, parts[1]);
  });
  if (kTot) {
    for (const m of kTot.markets || []) {
      const strike = Number(m.floor_strike);
      const bid = Number(m.yes_bid_dollars);
      const ask = Number(m.yes_ask_dollars);
      if ([1.5, 2.5, 3.5].includes(strike) && bid > 0.03 && ask < 0.97 && ask >= bid && ask - bid <= 0.08) {
        if (!bundle.totals[String(strike)]) {
          bundle.totals[String(strike)] = {
            over: +(1 / ask).toFixed(4),
            under: +(1 / (1 - bid)).toFixed(4),
            book: "kalshi",
          };
          const tag = `O/U ${strike}`;
          if (!bundle.availableMarkets.includes(tag)) bundle.availableMarkets.push(tag);
        }
      }
    }
  }

  const kBtts = kalshiBttsEvents.find((ev) => {
    const clean = String(ev.title || "").split(":")[0] || "";
    const parts = clean.split(/\s+vs\.?\s+/i);
    return parts.length >= 2 && teamsMatch(homeName, parts[0]) && teamsMatch(awayName, parts[1]);
  });
  if (kBtts && !bundle.btts && kBtts.markets?.[0]) {
    const m = kBtts.markets[0];
    const bid = Number(m.yes_bid_dollars);
    const ask = Number(m.yes_ask_dollars);
    if (bid > 0.03 && ask < 0.97 && ask >= bid && ask - bid <= 0.08) {
      bundle.btts = {
        yes: +(1 / ask).toFixed(4),
        no: +(1 / (1 - bid)).toFixed(4),
        book: "kalshi",
      };
      if (!bundle.availableMarkets.includes("BTTS")) bundle.availableMarkets.push("BTTS");
    }
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// 6. Clima horario en vivo Open-Meteo (estadios exteriores NFL)
// ---------------------------------------------------------------------------
async function fetchNflOutdoorWeatherMap(nflGames) {
  const weatherByGameId = new Map();
  const tasks = [];
  for (const g of nflGames) {
    const homeAbbr = g.home_team === "LA" ? "LAR" : g.home_team;
    const coords = NFL_OUTDOOR_COORDS[homeAbbr] || NFL_OUTDOOR_COORDS[g.home_team];
    const isOutdoor = !g.roof || g.roof === "outdoors" || g.roof === "open";
    if (!coords || !isOutdoor || g.location === "Neutral") continue;
    tasks.push(
      (async () => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,precipitation,wind_speed_10m&wind_speed_unit=mph&start_date=${g.gameday}&end_date=${g.gameday}&timezone=UTC`;
        const data = await fetchJsonSafe(url, `Open-Meteo ${homeAbbr} ${g.gameday}`);
        if (data?.hourly?.time) {
          // Hora aproximada UTC del kickoff (gametime en ET -> +5h UTC en noviembre EST)
          const [hh] = String(g.gametime || "13:00").split(":").map(Number);
          const targetUtcHour = Math.min(23, (hh || 13) + 5);
          const idx = Math.min(data.hourly.time.length - 1, Math.max(0, targetUtcHour));
          weatherByGameId.set(g.game_id, {
            tempC: data.hourly.temperature_2m?.[idx] ?? null,
            windMph: data.hourly.wind_speed_10m?.[idx] ?? 0,
            precipMm: data.hourly.precipitation?.[idx] ?? 0,
          });
        }
      })(),
    );
  }
  await Promise.all(tasks);
  return weatherByGameId;
}

// ---------------------------------------------------------------------------
// 7. Adaptación de MatchOutlook -> candidatos de selectPicks y comparador EV
// ---------------------------------------------------------------------------
function buildPickCandidatesFromOutlook(outlook) {
  const cands = [];
  for (const m of outlook.markets) {
    if (m.marketKey === "1x2" || m.marketKey === "moneyline") {
      for (const s of m.selections) {
        cands.push({
          market: "h2h",
          rawMarketKey: m.marketKey,
          selection: s.selection,
          p: s.p,
          fairOdds: s.fairOdds.decimal,
          label: s.label,
        });
      }
    } else if (m.marketKey === "double_chance") {
      for (const s of m.selections) {
        cands.push({
          market: "double_chance",
          rawMarketKey: m.marketKey,
          selection: s.selection.toLowerCase(), // "1x" | "12" | "x2"
          p: s.p,
          fairOdds: s.fairOdds.decimal,
          label: s.label,
        });
      }
    } else if (m.marketKey.startsWith("totals")) {
      for (const s of m.selections) {
        cands.push({
          market: "totals",
          rawMarketKey: m.marketKey,
          selection: s.selection, // "over" | "under"
          line: s.line ?? m.line ?? 2.5,
          p: s.p,
          fairOdds: s.fairOdds.decimal,
          label: s.label,
        });
      }
    } else if (m.marketKey === "btts") {
      for (const s of m.selections) {
        cands.push({
          market: "btts",
          rawMarketKey: m.marketKey,
          selection: s.selection, // "yes" | "no"
          p: s.p,
          fairOdds: s.fairOdds.decimal,
          label: s.label,
        });
      }
    } else if (m.marketKey === "ah_-0_5" || m.marketKey === "ah_0_5" || m.marketKey === "spread") {
      // Hándicaps de medio punto / spread sin ambigüedad de push entero en selectionHolds
      for (const s of m.selections) {
        if (s.line !== null && Math.abs(s.line - Math.round(s.line)) > 0.1) {
          cands.push({
            market: "spreads",
            rawMarketKey: m.marketKey,
            selection: s.selection, // "home" | "away"
            line: s.line,
            p: s.p,
            fairOdds: s.fairOdds.decimal,
            label: s.label,
          });
        }
      }
    }
  }
  return cands;
}

function evaluateInformationalMarketEdges(outlook, marketBundle, devig2Way, devigAdaptive1X2) {
  const edges = [];

  if (outlook.sport === "football") {
    // 1X2
    if (marketBundle.h2h && outlook.marketsByKey["1x2"]) {
      const m = outlook.marketsByKey["1x2"];
      const { home, draw, away, book } = marketBundle.h2h;
      const novig = devigAdaptive1X2([home, draw, away]);
      const map = [
        { sel: "home", odd: home, pMkt: novig.pHome },
        { sel: "draw", odd: draw, pMkt: novig.pDraw },
        { sel: "away", odd: away, pMkt: novig.pAway },
      ];
      for (const item of map) {
        const s = m.selections.find((x) => x.selection === item.sel);
        if (!s) continue;
        const ev = s.p * item.odd - 1;
        const dp = s.p - item.pMkt;
        edges.push({
          market: "1x2",
          selection: s.label,
          book,
          marketDecimal: round2(item.odd),
          marketAmerican: decimalToAmerican(item.odd),
          fairDecimal: s.fairOdds.decimal,
          pEngine: round4(s.p),
          pMarketNovig: round4(item.pMkt),
          edgeProbPct: round2(dp * 100),
          evPct: round2(ev * 100),
        });
      }
    }

    // Totals 1.5, 2.5, 3.5
    for (const [lineStr, key] of [
      ["1.5", "totals_1_5"],
      ["2.5", "totals_2_5"],
      ["3.5", "totals_3_5"],
    ]) {
      const qt = marketBundle.totals?.[lineStr];
      const m = outlook.marketsByKey[key];
      if (qt && m) {
        const novig = devig2Way(qt.over, qt.under, "adaptive");
        for (const [sel, odd, pMkt] of [
          ["over", qt.over, novig.pHome],
          ["under", qt.under, novig.pAway],
        ]) {
          const s = m.selections.find((x) => x.selection === sel);
          if (!s) continue;
          const ev = s.p * odd - 1;
          const dp = s.p - pMkt;
          edges.push({
            market: key,
            selection: s.label,
            book: qt.book,
            marketDecimal: round2(odd),
            marketAmerican: decimalToAmerican(odd),
            fairDecimal: s.fairOdds.decimal,
            pEngine: round4(s.p),
            pMarketNovig: round4(pMkt),
            edgeProbPct: round2(dp * 100),
            evPct: round2(ev * 100),
          });
        }
      }
    }

    // BTTS
    if (marketBundle.btts && outlook.marketsByKey["btts"]) {
      const qb = marketBundle.btts;
      const m = outlook.marketsByKey["btts"];
      const novig = devig2Way(qb.yes, qb.no, "adaptive");
      for (const [sel, odd, pMkt] of [
        ["yes", qb.yes, novig.pHome],
        ["no", qb.no, novig.pAway],
      ]) {
        const s = m.selections.find((x) => x.selection === sel);
        if (!s) continue;
        const ev = s.p * odd - 1;
        const dp = s.p - pMkt;
        edges.push({
          market: "btts",
          selection: s.label,
          book: qb.book,
          marketDecimal: round2(odd),
          marketAmerican: decimalToAmerican(odd),
          fairDecimal: s.fairOdds.decimal,
          pEngine: round4(s.p),
          pMarketNovig: round4(pMkt),
          edgeProbPct: round2(dp * 100),
          evPct: round2(ev * 100),
        });
      }
    }
  } else if (outlook.sport === "nfl") {
    for (const [mKey, qObj, selA, selB] of [
      ["moneyline", marketBundle.moneyline, "home", "away"],
      ["spread", marketBundle.spread, "home", "away"],
      ["totals", marketBundle.totals, "over", "under"],
    ]) {
      const m = outlook.marketsByKey[mKey];
      if (!qObj || !m || !qObj.decA || !qObj.decB) continue;
      const novig = devig2Way(qObj.decA, qObj.decB, "adaptive");
      for (const [sel, odd, pMkt] of [
        [selA, qObj.decA, novig.pHome],
        [selB, qObj.decB, novig.pAway],
      ]) {
        const s = m.selections.find((x) => x.selection === sel);
        if (!s) continue;
        const ev = s.p * odd - 1;
        const dp = s.p - pMkt;
        edges.push({
          market: mKey,
          selection: s.label,
          book: qObj.book,
          marketDecimal: round2(odd),
          marketAmerican: decimalToAmerican(odd),
          fairDecimal: s.fairOdds.decimal,
          pEngine: round4(s.p),
          pMarketNovig: round4(pMkt),
          edgeProbPct: round2(dp * 100),
          evPct: round2(ev * 100),
        });
      }
    }
  }

  edges.sort((a, b) => b.evPct - a.evPct);
  // Filtro Anti-Winner's Curse alineado con `engine.ts::evaluateValueExecution`
  // (`|pEngine - pMarketNovig| <= 13.5%`, `pEngine >= 34%`, `EV` en `[+2.0%, +18.0%]`)
  const actionable = edges.filter(
    (e) =>
      e.pEngine >= 0.34 &&
      Math.abs(e.edgeProbPct) <= 13.5 &&
      e.evPct >= 2.0 &&
      e.evPct <= 18.0 &&
      e.edgeProbPct >= 1.5,
  );
  return {
    bestValue: actionable[0] ?? null,
    allPositiveEdges: actionable.slice(0, 4),
    allComparisons: edges,
  };
}

// ---------------------------------------------------------------------------
// 8. Ejecución Principal
// ---------------------------------------------------------------------------
async function main() {
  console.log("1/6 Empaquetando motores reales TypeScript de PitchLab...");
  const engine = await loadPitchLabEngine();

  // Artefactos locales congelados (solo lectura)
  const footballModel = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/prediction/model_motor_a.json"), "utf8"));
  const nflModelV30 = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/prediction/model_nfl.json"), "utf8"));
  const nflModelV32 = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/prediction/model_nfl_v3_2_candidate.json"), "utf8"));
  const multisportModel = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/prediction/model_multisport.json"), "utf8"));
  const liveSnap = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/prediction/live_matchday_v3_snapshot.json"), "utf8"));

  const teamIndex = engine.buildTeamMasterIndex(liveSnap.team_master_records, nflModelV30);
  const { bySoccerTeam: rosterSoccerMap, byMultiTeam: rosterMultiMap } = loadRosterAvailabilityFromGit();

  // Índice rápido de team_master_records por clave canónica
  const masterByCanon = new Map();
  for (const r of liveSnap.team_master_records) {
    const ck = canonTeamKey(r.team_name);
    masterByCanon.set(`${r.league}::${ck}`, r);
    if (!masterByCanon.has(`any::${ck}`)) masterByCanon.set(`any::${ck}`, r);
  }

  console.log("2/6 Descargando calendarios y cuotas reales de mercados públicos sancionados...");
  const [
    nflCsvText,
    kalshiNflGame,
    kalshiNflSpread,
    kalshiNflTotal,
    kalshiMxGame,
    kalshiMxTotal,
    kalshiMxBtts,
    kalshiEplGame,
    kalshiLaLigaGame,
    kalshiLaLigaTotal,
    kalshiLaLigaBtts,
    kalshiBundGame,
    kalshiSerieAGame,
    kalshiLigue1Game,
    kalshiUclGame,
    kalshiNbaGame,
    kalshiNhlGame,
    kalshiNcaafGame,
    polyMex,
    polyEpl,
    polyLaLiga,
    polyBund,
    polySerieA,
    polyLigue1,
    polyUcl,
  ] = await Promise.all([
    fetch("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv").then((r) => r.text()),
    fetchKalshiSeries("KXNFLGAME"),
    fetchKalshiSeries("KXNFLSPREAD"),
    fetchKalshiSeries("KXNFLTOTAL"),
    fetchKalshiSeries("KXLIGAMXGAME"),
    fetchKalshiSeries("KXLIGAMXTOTAL"),
    fetchKalshiSeries("KXLIGAMXBTTS"),
    fetchKalshiSeries("KXEPLGAME"),
    fetchKalshiSeries("KXLALIGAGAME"),
    fetchKalshiSeries("KXLALIGATOTAL"),
    fetchKalshiSeries("KXLALIGABTTS"),
    fetchKalshiSeries("KXBUNDESLIGAGAME"),
    fetchKalshiSeries("KXSERIEAGAME"),
    fetchKalshiSeries("KXLIGUE1GAME"),
    fetchKalshiSeries("KXUCLGAME"),
    fetchKalshiSeries("KXNBAGAME"),
    fetchKalshiSeries("KXNHLGAME"),
    fetchKalshiSeries("KXNCAAFGAME"),
    fetchPolymarketTag("mex"),
    fetchPolymarketTag("premier-league"),
    fetchPolymarketTag("la-liga"),
    fetchPolymarketTag("bundesliga"),
    fetchPolymarketTag("sea"),
    fetchPolymarketTag("ligue-1"),
    fetchPolymarketTag("ucl"),
  ]);

  // Snapshots 2026-11-13 desde git (`gemini-reestructura`)
  const snapLeagues = ["nfl", "liga-mx", "premier-league", "laliga", "bundesliga", "serie-a", "ligue-1"];
  const branchSnapshots = {};
  for (const lg of snapLeagues) {
    branchSnapshots[lg] = JSON.parse(
      cp.execSync(`git show gemini-reestructura:data/snapshots/${lg}/2026-11-13.json`, {
        encoding: "utf8",
        maxBuffer: 25 * 1024 * 1024,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 3/6 Procesamiento NFL (Semanas 10, 11 y Thanksgiving Semana 12: 30 juegos)
  // -------------------------------------------------------------------------
  console.log("3/6 Ejecutando motor NFL Minkowski v3.0 + MatchOutlook v3.2 + Clima Open-Meteo...");
  const csvLines = nflCsvText.trim().split("\n");
  const csvHdr = csvLines[0].split(",");
  const nflGamesRaw = csvLines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      const obj = {};
      csvHdr.forEach((h, i) => (obj[h] = cols[i] ?? ""));
      return obj;
    })
    .filter((g) => g.season === "2026" && g.gameday >= WINDOW_START && g.gameday <= WINDOW_END);

  const nflWeatherMap = await fetchNflOutdoorWeatherMap(nflGamesRaw);

  // Tasas ajustadas 2026 de NFL desde snapshot 2026-11-13
  const nflRatesByCode = new Map();
  for (const tr of Object.values(branchSnapshots.nfl.teamRates || {})) {
    if (tr.code) nflRatesByCode.set(tr.code, tr);
    if (tr.code === "LAR") nflRatesByCode.set("LA", tr);
  }

  const nflResults = [];
  for (const g of nflGamesRaw) {
    const homeCode = g.home_team === "LA" ? "LAR" : g.home_team;
    const awayCode = g.away_team === "LA" ? "LAR" : g.away_team;
    const homeRate = nflRatesByCode.get(homeCode) || nflRatesByCode.get(g.home_team);
    const awayRate = nflRatesByCode.get(awayCode) || nflRatesByCode.get(g.away_team);
    const homeName = homeRate?.name || homeCode;
    const awayName = awayRate?.name || awayCode;

    const homeMaster =
      masterByCanon.get(`nfl::${canonTeamKey(homeName)}`) ||
      liveSnap.team_master_records.find((r) => r.league === "nfl" && fullSlug(r.team_name).includes(fullSlug(homeName)));
    const awayMaster =
      masterByCanon.get(`nfl::${canonTeamKey(awayName)}`) ||
      liveSnap.team_master_records.find((r) => r.league === "nfl" && fullSlug(r.team_name).includes(fullSlug(awayName)));

    const w12Override = NFL_W12_THANKSGIVING_ODDS[g.game_id] || null;
    // En nflverse spread_line > 0 significa que el LOCAL es favorito por spread_line puntos -> homeSpreadLine = -spread_line
    const homeSpreadLine =
      g.spread_line !== "" && Number.isFinite(Number(g.spread_line))
        ? -Number(g.spread_line)
        : (w12Override?.homeSpreadLine ?? null);
    const totalLine =
      g.total_line !== "" && Number.isFinite(Number(g.total_line))
        ? Number(g.total_line)
        : (w12Override?.totalLine ?? null);

    const homeMlAm = g.home_moneyline !== "" ? Number(g.home_moneyline) : (w12Override?.homeMoneyline ?? null);
    const awayMlAm = g.away_moneyline !== "" ? Number(g.away_moneyline) : (w12Override?.awayMoneyline ?? null);
    const homeSpAm = g.home_spread_odds !== "" ? Number(g.home_spread_odds) : (w12Override?.homeSpreadOdds ?? null);
    const awaySpAm = g.away_spread_odds !== "" ? Number(g.away_spread_odds) : (w12Override?.awaySpreadOdds ?? null);
    const overAm = g.over_odds !== "" ? Number(g.over_odds) : (w12Override?.overOdds ?? null);
    const underAm = g.under_odds !== "" ? Number(g.under_odds) : (w12Override?.underOdds ?? null);
    const oddsBook = g.home_moneyline !== "" ? "nflverse_consensus" : (w12Override?.book ?? null);

    // Kalshi NFL moneyline cross-check
    const kEv = kalshiNflGame.find((ev) => {
      const codes = (ev.markets || []).map((m) => {
        const c = m.ticker.slice(m.ticker.lastIndexOf("-") + 1);
        return c === "JAC" ? "JAX" : c === "LA" ? "LAR" : c;
      });
      return codes.includes(homeCode) && codes.includes(awayCode);
    });
    let kalshiMl = null;
    if (kEv) {
      let kh = null, ka = null;
      for (const m of kEv.markets || []) {
        const rawC = m.ticker.slice(m.ticker.lastIndexOf("-") + 1);
        const c = rawC === "JAC" ? "JAX" : rawC === "LA" ? "LAR" : rawC;
        const ask = Number(m.yes_ask_dollars);
        const p = Number.isFinite(ask) && ask > 0.02 && ask < 0.98 ? ask : null;
        if (c === homeCode) kh = p;
        if (c === awayCode) ka = p;
      }
      if (kh && ka) {
        kalshiMl = { homeDec: +(1 / kh).toFixed(4), awayDec: +(1 / ka).toFixed(4) };
      }
    }

    // Síntesis base + contexto Minkowski v3.0 con overrides reales de QB, lesiones, neutralSite y clima Open-Meteo
    const synth = engine.synthesizeNflSnapshotRowFromMaster(
      homeCode,
      awayCode,
      homeMaster || null,
      awayMaster || null,
      { matchup_id: g.game_id, league: "nfl", sport: "football", home_team: homeName, away_team: awayName },
      nflModelV30,
    );

    const hOvr = NFL_QB_AND_INJURY_OVERRIDES[homeCode] || NFL_QB_AND_INJURY_OVERRIDES[g.home_team] || null;
    const aOvr = NFL_QB_AND_INJURY_OVERRIDES[awayCode] || NFL_QB_AND_INJURY_OVERRIDES[g.away_team] || null;
    const wx = nflWeatherMap.get(g.game_id) || null;
    const isNeutral = g.location === "Neutral";

    // Proyección base de puntos 2026 desde puntos ajustados por rival (2026-11-13) + EPA Minkowski
    const baseTotal2026 =
      homeRate && awayRate
        ? 0.5 * (homeRate.adjustedFor + awayRate.adjustedAgainst) +
          0.5 * (awayRate.adjustedFor + homeRate.adjustedAgainst)
        : 45.2;
    const rateMargin2026 =
      homeRate && awayRate
        ? 0.5 * (homeRate.adjustedFor - awayRate.adjustedAgainst) -
          0.5 * (awayRate.adjustedFor - homeRate.adjustedAgainst) +
          (isNeutral ? 0 : 1.9)
        : null;

    const liveCtx = {
      ...synth.liveContext,
      neutralSite: isNeutral,
      windMph: wx ? wx.windMph : synth.liveContext.windMph,
      precipitationMm: wx ? wx.precipMm : synth.liveContext.precipitationMm,
      homeQbInjured: hOvr?.qbInjured ?? synth.liveContext.homeQbInjured ?? 0,
      awayQbInjured: aOvr?.qbInjured ?? synth.liveContext.awayQbInjured ?? 0,
      homeInjuriesOutIr: (synth.liveContext.homeInjuriesOutIr || 0) + (hOvr?.injuriesOutDelta || 0),
      awayInjuriesOutIr: (synth.liveContext.awayInjuriesOutIr || 0) + (aOvr?.injuriesOutDelta || 0),
      homeInjuriesQuestionable:
        (synth.liveContext.homeInjuriesQuestionable || 0) + (hOvr?.questionableDelta || 0),
      awayInjuriesQuestionable:
        (synth.liveContext.awayInjuriesQuestionable || 0) + (aOvr?.questionableDelta || 0),
      baseExpectedTotal: baseTotal2026,
    };

    // Ejecutamos Minkowski v3.0 + ajuste estructural 2026 (récord/puntos ajustados temporada 2026)
    const basePredV30 = engine.predictNFL(synth.row, nflModelV30);
    const livePred = engine.applyMinkowskiV3LiveContext(
      {
        pHome: basePredV30.pHome,
        pDraw: basePredV30.pDraw,
        pAway: basePredV30.pAway,
        expectedTotal: baseTotal2026,
      },
      liveCtx,
      nflModelV30,
    );

    // Combinamos el modelo deportivo 2026 (puntos ajustados por rival + EPA/clima/árbitros Minkowski v3.0 + bajas QB)
    // con el pool log-lineal Singularity v3.0 frente al mercado sin vig (nflverse / Kalshi)
    const pMinkCond = livePred.pHome / (livePred.pHome + livePred.pAway);
    let pSportsHome = pMinkCond;
    if (rateMargin2026 !== null) {
      const qbMarginAdj = -4.2 * ((liveCtx.homeQbInjured ? 1 : 0) - (liveCtx.awayQbInjured ? 1 : 0));
      const weatherMarginScale = livePred.delta?.weatherCompression ?? 1.0;
      const pRate2026 = engine.normalCdf(((rateMargin2026 + qbMarginAdj) * weatherMarginScale) / 13.5);
      // 78% margen ajustado 2026 + bajas QB + clima + 22% prior EPA Minkowski
      pSportsHome = engine.sigmoid(
        0.78 * engine.logit(engine.clamp(pRate2026, 0.04, 0.96)) +
          0.22 * engine.logit(engine.clamp(pMinkCond, 0.08, 0.92)),
      );
    }

    let pCombinedHome = pSportsHome;
    const rawHomeMlDec = americanToDecimal(homeMlAm) || kalshiMl?.homeDec || null;
    const rawAwayMlDec = americanToDecimal(awayMlAm) || kalshiMl?.awayDec || null;
    if (rawHomeMlDec && rawAwayMlDec) {
      const nv2 = engine.devig2Way(rawHomeMlDec, rawAwayMlDec, "adaptive");
      // Pool Singularity v3.0: 58% ancla institucional sin vig + 42% modelo deportivo/contexto QB en vivo
      pCombinedHome = engine.sigmoid(
        0.58 * engine.logit(engine.clamp(nv2.pHome, 0.03, 0.97)) +
          0.42 * engine.logit(engine.clamp(pSportsHome, 0.03, 0.97)),
      );
    }
    const pCombinedAway = 1 - pCombinedHome;
    const rawSportsTotal = engine.clamp(livePred.expectedTotalPoints, 33.0, 58.0);
    const expectedTotal =
      totalLine !== null && totalLine > 25
        ? engine.clamp(0.48 * totalLine + 0.52 * rawSportsTotal, 33.0, 58.0)
        : rawSportsTotal;

    // Construimos kickoff ISO UTC (gametime está en ET = UTC-5 en noviembre)
    const [ghh, gmm] = String(g.gametime || "13:00").split(":").map(Number);
    const kickoffDateObj = new Date(Date.UTC(
      Number(g.gameday.slice(0, 4)),
      Number(g.gameday.slice(5, 7)) - 1,
      Number(g.gameday.slice(8, 10)),
      (ghh || 13) + 5,
      gmm || 0,
      0,
    ));
    const kickoffUtc = kickoffDateObj.toISOString();

    const marketQuotes = [];
    const nflMarketBundle = {
      availableMarkets: ["Moneyline"],
      sources: [],
      moneyline: null,
      spread: null,
      totals: null,
    };
    if (oddsBook) nflMarketBundle.sources.push(oddsBook === "nflverse_consensus" ? "nflverse Sportsbook Consensus" : "FanDuel Opener");
    if (kalshiMl) nflMarketBundle.sources.push("Kalshi (KXNFL)");

    const homeMlDec = americanToDecimal(homeMlAm);
    const awayMlDec = americanToDecimal(awayMlAm);
    if (homeMlDec && awayMlDec) {
      nflMarketBundle.moneyline = {
        decA: homeMlDec,
        decB: awayMlDec,
        amHome: homeMlAm,
        amAway: awayMlAm,
        book: oddsBook,
      };
      marketQuotes.push({
        market: "moneyline",
        line: null,
        book: oddsBook,
        tsCaptured: TS_DECISION,
        tsEventStart: kickoffUtc,
        oddsBySelection: { home: homeMlDec, away: awayMlDec },
      });
    } else if (kalshiMl) {
      nflMarketBundle.moneyline = {
        decA: kalshiMl.homeDec,
        decB: kalshiMl.awayDec,
        amHome: decimalToAmerican(kalshiMl.homeDec),
        amAway: decimalToAmerican(kalshiMl.awayDec),
        book: "kalshi",
      };
    }

    const homeSpDec = americanToDecimal(homeSpAm);
    const awaySpDec = americanToDecimal(awaySpAm);
    if (homeSpreadLine !== null && homeSpDec && awaySpDec) {
      nflMarketBundle.availableMarkets.push(`Spread (${homeSpreadLine > 0 ? "+" : ""}${homeSpreadLine})`);
      nflMarketBundle.spread = {
        line: homeSpreadLine,
        decA: homeSpDec,
        decB: awaySpDec,
        amHome: homeSpAm,
        amAway: awaySpAm,
        book: oddsBook,
      };
      marketQuotes.push({
        market: "spread",
        line: homeSpreadLine,
        book: oddsBook,
        tsCaptured: TS_DECISION,
        tsEventStart: kickoffUtc,
        oddsBySelection: { home: homeSpDec, away: awaySpDec },
      });
    }

    const overDec = americanToDecimal(overAm);
    const underDec = americanToDecimal(underAm);
    if (totalLine !== null && overDec && underDec) {
      nflMarketBundle.availableMarkets.push(`Total O/U (${totalLine})`);
      nflMarketBundle.totals = {
        line: totalLine,
        decA: overDec,
        decB: underDec,
        amOver: overAm,
        amUnder: underAm,
        book: oddsBook,
      };
      marketQuotes.push({
        market: "totals",
        line: totalLine,
        book: oddsBook,
        tsCaptured: TS_DECISION,
        tsEventStart: kickoffUtc,
        oddsBySelection: { over: overDec, under: underDec },
      });
    }

    const outlook = engine.buildMatchOutlook({
      matchId: g.game_id,
      sport: "nfl",
      league: "NFL",
      homeTeam: homeName,
      awayTeam: awayName,
      tsDecision: TS_DECISION,
      kickoffUtc,
      nfl: {
        pHome: pCombinedHome,
        pDraw: livePred.pDraw,
        pAway: pCombinedAway,
        expectedTotal,
        spreadLine: homeSpreadLine,
        totalLine,
        featureCoverageRatio: 0.92,
      },
      marketQuotes,
    });

    const cands = buildPickCandidatesFromOutlook(outlook);
    const picks = engine.selectPicks(cands, { maxScore: 75 });
    const mainPick = engine.featuredPick(picks) || cands.sort((a, b) => b.p - a.p)[0];
    const compatible = engine.picksCompatible(picks, 75);
    const conf = engine.confidenceIndex({
      favorite: Math.max(pCombinedHome, pCombinedAway),
      minGamesPlayed: Math.min(homeRate?.gamesPlayed ?? 9, awayRate?.gamesPlayed ?? 9),
      disagreement: Math.abs(pMinkCond - pCombinedHome),
      outcomes: 2,
    });

    const marketEval = evaluateInformationalMarketEdges(
      outlook,
      nflMarketBundle,
      engine.devig2Way,
      engine.devigAdaptive1X2,
    );

    const awayStarterQb = aOvr?.starterQb || g.away_qb_name || w12Override?.awayQb || "Titular";
    const homeStarterQb = hOvr?.starterQb || g.home_qb_name || w12Override?.homeQb || "Titular";
    const contextNotes = [];
    contextNotes.push(`QBs: ${awayCode} ${awayStarterQb} vs ${homeCode} ${homeStarterQb}`);
    if (isNeutral) contextNotes.push("Sede neutral internacional (HFA = 0)");
    if (aOvr?.note) contextNotes.push(`${awayCode}: ${aOvr.note}`);
    if (hOvr?.note) contextNotes.push(`${homeCode}: ${hOvr.note}`);
    if (wx && (wx.windMph >= 12 || wx.precipMm >= 0.5)) {
      contextNotes.push(`Clima Open-Meteo: ${wx.tempC}°C, viento ${wx.windMph} mph, precip ${wx.precipMm} mm`);
    }

    const expMargin = (() => {
      let lo = -40, hi = 40;
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (engine.normalCdf(mid / 13.5) < pCombinedHome) lo = mid;
        else hi = mid;
      }
      return round2(0.5 * (lo + hi));
    })();

    const projHomePts = Math.max(10, Math.round(0.5 * (expectedTotal + (expMargin || 0))));
    const projAwayPts = Math.max(10, Math.round(0.5 * (expectedTotal - (expMargin || 0))));

    nflResults.push({
      matchId: g.game_id,
      windowBucket: g.gameday <= WEEK1_END ? "esta_semana" : "proxima_semana",
      sport: "nfl",
      league: "NFL",
      round: `Semana ${g.week}`,
      date: g.gameday,
      kickoffUtc,
      homeTeam: homeName,
      awayTeam: awayName,
      homeCode,
      awayCode,
      neutralSite: isNeutral,
      availableMarkets: nflMarketBundle.availableMarkets,
      marketSources: nflMarketBundle.sources,
      marketLines: {
        moneylineHomeAm: homeMlAm,
        moneylineAwayAm: awayMlAm,
        homeSpreadLine,
        totalLine,
        kalshiMl,
      },
      engineProjection: {
        model: "PitchLab Minkowski v3.0 + MatchOutlook v3.2",
        pHome: round4(outlook.marketsByKey.moneyline.selections[0].p),
        pAway: round4(outlook.marketsByKey.moneyline.selections[1].p),
        fairHomeDec: outlook.marketsByKey.moneyline.selections[0].fairOdds.decimal,
        fairAwayDec: outlook.marketsByKey.moneyline.selections[1].fairOdds.decimal,
        expectedTotal: round2(expectedTotal),
        projectedScore: `${awayCode} ${projAwayPts} - ${projHomePts} ${homeCode}`,
        spreadCoverHomeProb: outlook.marketsByKey.spread ? round4(outlook.marketsByKey.spread.selections[0].p) : null,
        totalOverProb: outlook.marketsByKey.totals ? round4(outlook.marketsByKey.totals.selections[0].p) : null,
      },
      picks: {
        featured: mainPick,
        conservadora: picks.find((p) => p.profile === "conservadora") || null,
        intermedia: picks.find((p) => p.profile === "intermedia") || null,
        arriesgada: picks.find((p) => p.profile === "arriesgada") || null,
        compatible,
      },
      confidence: conf,
      marketValuePaperTrading: marketEval,
      lineupsAndNews: contextNotes,
    });
  }

  // -------------------------------------------------------------------------
  // 4/6 Procesamiento Fútbol: 6 Ligas Core (58 partidos) + UCL J5 (18 partidos)
  // -------------------------------------------------------------------------
  console.log("4/6 Ejecutando motor Fútbol Tachyon v3.0 + Dixon-Coles MatchOutlook v3.2 (11 mercados)...");

  const SOCCER_LEAGUE_CFG = [
    {
      snapKey: "liga-mx",
      masterLeague: "liga-mx",
      div: "MEX",
      displayLeague: "Liga MX",
      polyEvents: polyMex,
      kGame: kalshiMxGame,
      kTotal: kalshiMxTotal,
      kBtts: kalshiMxBtts,
    },
    {
      snapKey: "premier-league",
      masterLeague: "epl",
      div: "E0",
      displayLeague: "Premier League",
      polyEvents: polyEpl,
      kGame: kalshiEplGame,
      kTotal: [],
      kBtts: [],
    },
    {
      snapKey: "laliga",
      masterLeague: "laliga",
      div: "SP1",
      displayLeague: "LaLiga",
      polyEvents: polyLaLiga,
      kGame: kalshiLaLigaGame,
      kTotal: kalshiLaLigaTotal,
      kBtts: kalshiLaLigaBtts,
    },
    {
      snapKey: "bundesliga",
      masterLeague: "bundesliga",
      div: "D1",
      displayLeague: "Bundesliga",
      polyEvents: polyBund,
      kGame: kalshiBundGame,
      kTotal: [],
      kBtts: [],
    },
    {
      snapKey: "serie-a",
      masterLeague: "serie-a",
      div: "I1",
      displayLeague: "Serie A",
      polyEvents: polySerieA,
      kGame: kalshiSerieAGame,
      kTotal: [],
      kBtts: [],
    },
    {
      snapKey: "ligue-1",
      masterLeague: "ligue-1",
      div: "F1",
      displayLeague: "Ligue 1",
      polyEvents: polyLigue1,
      kGame: kalshiLigue1Game,
      kTotal: [],
      kBtts: [],
    },
  ];

  const soccerResults = [];

  for (const cfg of SOCCER_LEAGUE_CFG) {
    const snap = branchSnapshots[cfg.snapKey];
    const teamRates = snap.teamRates || {};
    const rateValues = Object.values(teamRates);
    const leagueMeanGpg =
      rateValues.length > 0
        ? rateValues.reduce((acc, r) => acc + (Number(r.adjustedFor) || 1.35), 0) / rateValues.length
        : 1.38;
    const standingsMap = new Map();
    for (const st of snap.standings || []) {
      if (st.team?.id) standingsMap.set(st.team.id, st);
    }

    const scheduledGames = (snap.games || []).filter((g) => {
      const d = String(g.startTime || "").slice(0, 10);
      return g.status === "scheduled" && d >= WINDOW_START && d <= WINDOW_END;
    });

    for (const g of scheduledGames) {
      const homeName = g.home.name;
      const awayName = g.away.name;
      const kickoffRaw = String(g.startTime);
      const kickoffUtc = /[zZ]|[+-]\d\d:?\d\d$/.test(kickoffRaw) ? kickoffRaw : `${kickoffRaw}Z`;
      const dateStr = kickoffUtc.slice(0, 10);

      const hRate = teamRates[g.home.id] || null;
      const aRate = teamRates[g.away.id] || null;
      const hSt = standingsMap.get(g.home.id) || null;
      const aSt = standingsMap.get(g.away.id) || null;

      let hMaster = masterByCanon.get(`${cfg.masterLeague}::${canonTeamKey(homeName)}`) || null;
      let aMaster = masterByCanon.get(`${cfg.masterLeague}::${canonTeamKey(awayName)}`) || null;

      // Si es recién ascendido 2026-27 (ej. Coventry, Sunderland, Leeds, Paderborn, Troyes, Málaga), sintetizamos su registro maestro desde sus tasas reales 2026-27
      if (!hMaster && hRate) {
        const gp = Math.max(8, hRate.gamesPlayed || 10);
        const ptsPg = hSt && hSt.played > 0 ? hSt.points / hSt.played : 1.25;
        hMaster = {
          team_id: g.home.id,
          team_name: homeName,
          league: cfg.masterLeague,
          sport: "soccer",
          club_elo_rating: 1580 + (ptsPg - 1.35) * 160,
          xg_for: hRate.adjustedFor * gp,
          xg_against: hRate.adjustedAgainst * gp,
          xpts: ptsPg * gp,
          value_ratio_vs_league_median: 0.72,
          injured_players_count: 1,
          suspended_players_count: 0,
          missing_market_value_ratio: 0.04,
          stadium_elevation_m: 80,
        };
      }
      if (!aMaster && aRate) {
        const gp = Math.max(8, aRate.gamesPlayed || 10);
        const ptsPg = aSt && aSt.played > 0 ? aSt.points / aSt.played : 1.25;
        aMaster = {
          team_id: g.away.id,
          team_name: awayName,
          league: cfg.masterLeague,
          sport: "soccer",
          club_elo_rating: 1580 + (ptsPg - 1.35) * 160,
          xg_for: aRate.adjustedFor * gp,
          xg_against: aRate.adjustedAgainst * gp,
          xpts: ptsPg * gp,
          value_ratio_vs_league_median: 0.72,
          injured_players_count: 1,
          suspended_players_count: 0,
          missing_market_value_ratio: 0.04,
          stadium_elevation_m: 80,
        };
      }

      // Contexto de alineaciones, lesiones y sanciones (RotoWire + Transfermarkt + Overrides 13 Nov)
      const hRoster = rosterSoccerMap.get(canonTeamKey(homeName)) || { xi: [], out: [], ques: [], tmAbsences: [] };
      const aRoster = rosterSoccerMap.get(canonTeamKey(awayName)) || { xi: [], out: [], ques: [], tmAbsences: [] };
      const hOvr = getSoccerTeamOverride(cfg.snapKey, homeName, dateStr);
      const aOvr = getSoccerTeamOverride(cfg.snapKey, awayName, dateStr);

      const homeCtx = {
        ...(hMaster || {}),
        missing_market_value_ratio: Math.max(
          hMaster?.missing_market_value_ratio ?? 0,
          hOvr?.missingMarketValueRatio ?? 0,
        ),
        injured_players_count: Math.max(
          hMaster?.injured_players_count ?? 0,
          hRoster.out.length,
          hOvr?.injuredCount ?? 0,
        ),
        suspended_players_count: Math.max(
          hMaster?.suspended_players_count ?? 0,
          hOvr?.suspendedCount ?? 0,
        ),
        rotowire_injured_out_count: Math.max(
          hMaster?.rotowire_injured_out_count ?? 0,
          hRoster.out.length,
        ),
      };
      const awayCtx = {
        ...(aMaster || {}),
        missing_market_value_ratio: Math.max(
          aMaster?.missing_market_value_ratio ?? 0,
          aOvr?.missingMarketValueRatio ?? 0,
        ),
        injured_players_count: Math.max(
          aMaster?.injured_players_count ?? 0,
          aRoster.out.length,
          aOvr?.injuredCount ?? 0,
        ),
        suspended_players_count: Math.max(
          aMaster?.suspended_players_count ?? 0,
          aOvr?.suspendedCount ?? 0,
        ),
        rotowire_injured_out_count: Math.max(
          aMaster?.rotowire_injured_out_count ?? 0,
          aRoster.out.length,
        ),
      };

      const availDelta = engine.computeLineupAvailabilityDelta(
        homeCtx,
        awayCtx,
        footballModel.prospective_availability_prior,
      );

      // Síntesis estructural Tachyon v3.0
      const hElev = homeCtx.stadium_elevation_m ?? 100;
      const aElev = awayCtx.stadium_elevation_m ?? 100;
      const synth = engine.synthesizeFootballSnapshotRowFromMaster(
        cfg.div,
        homeCtx,
        awayCtx,
        {
          matchup_id: g.id,
          league: cfg.masterLeague,
          sport: "soccer",
          home_team: homeName,
          away_team: awayName,
          home_stadium_elevation_m: hElev,
          altitude_diff_m: hElev - aElev,
        },
        footballModel,
      );

      const tachyonPred = engine.predictMotorAWithAvailability(
        synth.row,
        footballModel,
        availDelta.lineup_availability_delta,
      );

      // Tasas de gol multiplicativas reales Dixon-Coles 2026-27 (sin compresión por raíz cuadrada)
      // + síntesis ClubElo/xG Tachyon v3.0 + pool Singularity v3.0 con mercados líquidos + ajuste de bajas reales
      const dcMult2026H =
        hRate && aRate
          ? 1.07 * ((hRate.adjustedFor * aRate.adjustedAgainst) / Math.max(0.95, leagueMeanGpg))
          : synth.row.features[footballModel.features.indexOf("dc_lam_home")];
      const dcMult2026A =
        hRate && aRate
          ? 0.94 * ((aRate.adjustedFor * hRate.adjustedAgainst) / Math.max(0.95, leagueMeanGpg))
          : synth.row.features[footballModel.features.indexOf("dc_lam_away")];

      const rawSynthLamH = synth.row.features[footballModel.features.indexOf("dc_lam_home")] || dcMult2026H;
      const rawSynthLamA = synth.row.features[footballModel.features.indexOf("dc_lam_away")] || dcMult2026A;

      const availScaleH = Math.exp(0.6 * availDelta.lineup_availability_delta);
      const availScaleA = Math.exp(-0.6 * availDelta.lineup_availability_delta);

      const hAttackPenalty = 1 - 0.32 * Math.min(0.45, homeCtx.missing_market_value_ratio || 0);
      const aAttackPenalty = 1 - 0.32 * Math.min(0.45, awayCtx.missing_market_value_ratio || 0);

      let sportsLamH = (0.72 * dcMult2026H + 0.28 * rawSynthLamH) * availScaleH * hAttackPenalty;
      let sportsLamA = (0.72 * dcMult2026A + 0.28 * rawSynthLamA) * availScaleA * aAttackPenalty;

      // Mercados reales Polymarket + Kalshi (capturados antes de cerrar lambdas para permitir pool Singularity v3.0)
      const marketBundle = extractSoccerMarketBundle(
        homeName,
        awayName,
        kickoffUtc,
        cfg.polyEvents,
        cfg.kGame,
        cfg.kTotal,
        cfg.kBtts,
      );

      let lamHome = sportsLamH;
      let lamAway = sportsLamA;
      if (marketBundle.h2h) {
        const nv = engine.devigAdaptive1X2([
          marketBundle.h2h.home,
          marketBundle.h2h.draw,
          marketBundle.h2h.away,
        ]);
        const mktShareH = engine.clamp(nv.pHome / Math.max(0.05, nv.pHome + nv.pAway), 0.06, 0.94);
        let mktTotalGoals = sportsLamH + sportsLamA;
        if (marketBundle.totals["2.5"]) {
          const nvTot = engine.devig2Way(
            marketBundle.totals["2.5"].over,
            marketBundle.totals["2.5"].under,
            "adaptive",
          );
          // Aproximación suave de goles totales implícitos desde P(Over 2.5)
          mktTotalGoals = engine.clamp(1.45 + 2.35 * nvTot.pHome, 1.65, 3.85);
        }
        // Si hay shock fuerte de alineación de última hora (ej. Monterrey con 6 bajas en Fecha FIFA),
        // damos mayor peso al modelo con disponibilidad en vivo (62% sports / 38% market); de lo contrario 48% sports / 52% market
        const wSports = Math.abs(availDelta.lineup_availability_delta) >= 0.1 ? 0.62 : 0.48;
        const mktLamH = mktTotalGoals * mktShareH;
        const mktLamA = mktTotalGoals * (1 - mktShareH);
        lamHome = wSports * sportsLamH + (1 - wSports) * mktLamH;
        lamAway = wSports * sportsLamA + (1 - wSports) * mktLamA;
      }

      lamHome = engine.clamp(lamHome, 0.35, 3.95);
      lamAway = engine.clamp(lamAway, 0.25, 3.65);

      const marketQuotes = [];
      if (marketBundle.h2h) {
        marketQuotes.push({
          market: "1x2",
          line: null,
          book: marketBundle.h2h.book,
          tsCaptured: TS_DECISION,
          tsEventStart: kickoffUtc,
          oddsBySelection: {
            home: marketBundle.h2h.home,
            draw: marketBundle.h2h.draw,
            away: marketBundle.h2h.away,
          },
        });
      }
      for (const [lStr, qt] of Object.entries(marketBundle.totals)) {
        marketQuotes.push({
          market: "totals",
          line: Number(lStr),
          book: qt.book,
          tsCaptured: TS_DECISION,
          tsEventStart: kickoffUtc,
          oddsBySelection: { over: qt.over, under: qt.under },
        });
      }
      if (marketBundle.btts) {
        marketQuotes.push({
          market: "btts",
          line: null,
          book: marketBundle.btts.book,
          tsCaptured: TS_DECISION,
          tsEventStart: kickoffUtc,
          oddsBySelection: { yes: marketBundle.btts.yes, no: marketBundle.btts.no },
        });
      }

      const outlook = engine.buildMatchOutlook({
        matchId: g.id,
        sport: "football",
        league: cfg.div,
        homeTeam: homeName,
        awayTeam: awayName,
        tsDecision: TS_DECISION,
        kickoffUtc,
        football: {
          lamHome,
          lamAway,
          featureCoverageRatio: 0.95,
        },
        marketQuotes,
      });

      const dcMatrix = engine.buildDixonColesScoreMatrix(
        outlook.dixonColesParams.lamHome,
        outlook.dixonColesParams.lamAway,
        outlook.dixonColesParams.rho,
        outlook.dixonColesParams.maxGoals,
      );
      const cohScore = engine.coherentScore(dcMatrix, 2.5);

      const cands = buildPickCandidatesFromOutlook(outlook);
      const picks = engine.selectPicks(cands, { maxScore: 10 });
      const mainPick = engine.featuredPick(picks) || cands.sort((a, b) => b.p - a.p)[0];
      const compatible = engine.picksCompatible(picks, 10);

      const p1x2 = outlook.marketsByKey["1x2"].selections;
      const pH = p1x2.find((s) => s.selection === "home").p;
      const pD = p1x2.find((s) => s.selection === "draw").p;
      const pA = p1x2.find((s) => s.selection === "away").p;

      const conf = engine.confidenceIndex({
        favorite: Math.max(pH, pD, pA),
        minGamesPlayed: Math.min(hRate?.gamesPlayed ?? 10, aRate?.gamesPlayed ?? 10),
        disagreement: Math.max(
          Math.abs(pH - tachyonPred.pHome),
          Math.abs(pA - tachyonPred.pAway),
        ),
        outcomes: 3,
      });

      const marketEval = evaluateInformationalMarketEdges(
        outlook,
        marketBundle,
        engine.devig2Way,
        engine.devigAdaptive1X2,
      );

      // Resumen limpio de alineaciones y noticias
      const lineupNotes = [];
      if (hOvr?.note) lineupNotes.push(`${homeName}: ${hOvr.note}`);
      else if (hRoster.tmAbsences.length > 0)
        lineupNotes.push(`${homeName} bajas: ${hRoster.tmAbsences.slice(0, 3).join(", ")}`);
      else if (hRoster.out.length > 0 || hRoster.ques.length > 0)
        lineupNotes.push(`${homeName}: ${[...hRoster.out, ...hRoster.ques].slice(0, 3).join(", ")}`);

      if (aOvr?.note) lineupNotes.push(`${awayName}: ${aOvr.note}`);
      else if (aRoster.tmAbsences.length > 0)
        lineupNotes.push(`${awayName} bajas: ${aRoster.tmAbsences.slice(0, 3).join(", ")}`);
      else if (aRoster.out.length > 0 || aRoster.ques.length > 0)
        lineupNotes.push(`${awayName}: ${[...aRoster.out, ...aRoster.ques].slice(0, 3).join(", ")}`);

      if (hElev >= 1500 && hElev - aElev >= 1000) {
        lineupNotes.push(`Factor Altitud: ${homeName} juega a ${hElev}m (Δ+${hElev - aElev}m vs visita)`);
      }

      soccerResults.push({
        matchId: g.id,
        windowBucket: dateStr <= WEEK1_END ? "esta_semana" : "proxima_semana",
        sport: "football",
        league: cfg.displayLeague,
        leagueSlug: cfg.snapKey,
        round: g.round || `Jornada ${g.week}`,
        date: dateStr,
        kickoffUtc,
        homeTeam: homeName,
        awayTeam: awayName,
        standingsContext:
          hSt && aSt
            ? `${homeName} (#${hSt.rank}, ${hSt.points} pts) vs ${awayName} (#${aSt.rank}, ${aSt.points} pts)`
            : null,
        availableMarkets: marketBundle.availableMarkets,
        marketSources: marketBundle.sources,
        marketLines: {
          h2h: marketBundle.h2h,
          ou2_5: marketBundle.totals["2.5"] || null,
          btts: marketBundle.btts || null,
          volumeUsd: marketBundle.volumeUsd,
        },
        engineProjection: {
          model: "PitchLab Tachyon v3.0 + Dixon-Coles MatchOutlook v3.2",
          lamHome: round2(lamHome),
          lamAway: round2(lamAway),
          lineupAvailabilityDelta: round4(availDelta.lineup_availability_delta),
          pHome: round4(pH),
          pDraw: round4(pD),
          pAway: round4(pA),
          fair1X2: {
            home: p1x2.find((s) => s.selection === "home").fairOdds.decimal,
            draw: p1x2.find((s) => s.selection === "draw").fairOdds.decimal,
            away: p1x2.find((s) => s.selection === "away").fairOdds.decimal,
          },
          doubleChance: {
            p1X: round4(outlook.marketsByKey.double_chance.selections.find((s) => s.selection === "1X").p),
            p12: round4(outlook.marketsByKey.double_chance.selections.find((s) => s.selection === "12").p),
            pX2: round4(outlook.marketsByKey.double_chance.selections.find((s) => s.selection === "X2").p),
          },
          dnbHome: round4(outlook.marketsByKey.dnb.selections[0].p),
          over1_5: round4(outlook.marketsByKey.totals_1_5.selections[0].p),
          over2_5: round4(outlook.marketsByKey.totals_2_5.selections[0].p),
          over3_5: round4(outlook.marketsByKey.totals_3_5.selections[0].p),
          bttsYes: round4(outlook.marketsByKey.btts.selections[0].p),
          ahMinus0_5Home: round4(outlook.marketsByKey["ah_-0_5"].selections[0].p),
          ahPlus0_5Home: round4(outlook.marketsByKey["ah_0_5"].selections[0].p),
          coherentScore: `${cohScore.home}-${cohScore.away}`,
          topScorelines: outlook.topScorelines.map((s) => `${s.score} (${(s.p * 100).toFixed(1)}%)`),
        },
        picks: {
          featured: mainPick,
          conservadora: picks.find((p) => p.profile === "conservadora") || null,
          intermedia: picks.find((p) => p.profile === "intermedia") || null,
          arriesgada: picks.find((p) => p.profile === "arriesgada") || null,
          compatible,
        },
        confidence: conf,
        marketValuePaperTrading: marketEval,
        predictedXI: {
          home: hRoster.xi.length > 0 ? hRoster.xi : null,
          away: aRoster.xi.length > 0 ? aRoster.xi : null,
        },
        lineupsAndNews: lineupNotes,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4b/6 UEFA Champions League — Jornada 5 (24–25 Nov 2026, 18 partidos)
  // -------------------------------------------------------------------------
  const uclResults = [];
  const uclMainEvents = polyUcl.filter((ev) => {
    if (!ev.title || ev.title.includes("More Markets")) return false;
    const mls = (ev.markets || []).filter((m) => m.sportsMarketType === "moneyline");
    if (mls.length !== 3) return false;
    const startRaw = mls[0]?.gameStartTime || ev.endDate || "";
    const d = startRaw.slice(0, 10);
    return d >= "2026-11-24" && d <= "2026-11-26";
  });

  for (const ev of uclMainEvents) {
    const [homeRaw, awayRaw] = ev.title.split(/\s+vs\.?\s+/i);
    if (!homeRaw || !awayRaw) continue;
    const homeName = homeRaw.trim();
    const awayName = awayRaw.trim();
    const mls = ev.markets.filter((m) => m.sportsMarketType === "moneyline");
    const startRaw = String(mls[0]?.gameStartTime || ev.endDate || "2026-11-24T20:00:00Z")
      .replace(" ", "T")
      .replace(/\+00$/, "Z");
    const kickoffUtc = /[zZ]|[+-]\d\d:?\d\d$/.test(startRaw) ? startRaw : `${startRaw}Z`;
    const dateStr = kickoffUtc.slice(0, 10);

    const hMaster = masterByCanon.get(`any::${canonTeamKey(homeName)}`) || null;
    const aMaster = masterByCanon.get(`any::${canonTeamKey(awayName)}`) || null;

    const marketBundle = extractSoccerMarketBundle(
      homeName,
      awayName,
      kickoffUtc,
      polyUcl,
      kalshiUclGame,
      [],
      [],
    );

    const hOvr = getSoccerTeamOverride("ucl", homeName, dateStr);
    const aOvr = getSoccerTeamOverride("ucl", awayName, dateStr);

    // Elo estructural (ClubElo real para clubes Top-5 o prior europeo 1715 para clubes fuera de Top-5 anclado con mercado sin vig)
    const hElo = hMaster?.club_elo_rating ?? 1715;
    const aElo = aMaster?.club_elo_rating ?? 1715;
    const eloDiff = hElo + 55 - aElo;
    const pEloHome = 1 / (1 + Math.pow(10, -eloDiff / 400));

    let lamHome = engine.clamp(1.48 * Math.pow(pEloHome / 0.5, 0.72), 0.5, 3.4);
    let lamAway = engine.clamp(1.22 * Math.pow((1 - pEloHome) / 0.5, 0.72), 0.4, 3.1);

    // Pool Singularity v3.0 en UCL: combina ClubElo estructural con ancla sin vig de mercado líquido Polymarket/Kalshi
    if (marketBundle.h2h) {
      const nv = engine.devigAdaptive1X2([
        marketBundle.h2h.home,
        marketBundle.h2h.draw,
        marketBundle.h2h.away,
      ]);
      const shareMkt = engine.clamp(nv.pHome / Math.max(0.05, nv.pHome + nv.pAway), 0.06, 0.94);
      const totGoals = 2.78;
      const wElo = hMaster && aMaster ? 0.42 : 0.30;
      lamHome = wElo * lamHome + (1 - wElo) * (totGoals * shareMkt);
      lamAway = wElo * lamAway + (1 - wElo) * (totGoals * (1 - shareMkt));
    }

    const availAdj = -0.45 * ((hOvr?.missingMarketValueRatio || 0) - (aOvr?.missingMarketValueRatio || 0));
    lamHome = engine.clamp(lamHome * Math.exp(0.5 * availAdj), 0.4, 3.6);
    lamAway = engine.clamp(lamAway * Math.exp(-0.5 * availAdj), 0.3, 3.4);

    const outlook = engine.buildMatchOutlook({
      matchId: `ucl-${dateStr}-${canonTeamKey(homeName)}-${canonTeamKey(awayName)}`.replace(/\s+/g, "-"),
      sport: "football",
      league: "UCL",
      homeTeam: homeName,
      awayTeam: awayName,
      tsDecision: TS_DECISION,
      kickoffUtc,
      football: { lamHome, lamAway, featureCoverageRatio: hMaster && aMaster ? 0.9 : 0.75 },
    });

    const dcMatrix = engine.buildDixonColesScoreMatrix(
      outlook.dixonColesParams.lamHome,
      outlook.dixonColesParams.lamAway,
      outlook.dixonColesParams.rho,
      outlook.dixonColesParams.maxGoals,
    );
    const cohScore = engine.coherentScore(dcMatrix, 2.5);
    const cands = buildPickCandidatesFromOutlook(outlook);
    const picks = engine.selectPicks(cands, { maxScore: 10 });
    const mainPick = engine.featuredPick(picks) || cands.sort((a, b) => b.p - a.p)[0];
    const p1x2 = outlook.marketsByKey["1x2"].selections;
    const pH = p1x2.find((s) => s.selection === "home").p;
    const pD = p1x2.find((s) => s.selection === "draw").p;
    const pA = p1x2.find((s) => s.selection === "away").p;

    const conf = engine.confidenceIndex({
      favorite: Math.max(pH, pD, pA),
      minGamesPlayed: 10,
      outcomes: 3,
    });
    const marketEval = evaluateInformationalMarketEdges(
      outlook,
      marketBundle,
      engine.devig2Way,
      engine.devigAdaptive1X2,
    );

    const notes = [];
    if (hOvr?.note) notes.push(`${homeName}: ${hOvr.note}`);
    if (aOvr?.note) notes.push(`${awayName}: ${aOvr.note}`);
    if (!notes.length) notes.push("Fase de Liga UCL Jornada 5 post-parón FIFA.");

    uclResults.push({
      matchId: outlook.matchId,
      windowBucket: "proxima_semana",
      sport: "football",
      league: "UEFA Champions League",
      leagueSlug: "ucl",
      round: "Jornada 5",
      date: dateStr,
      kickoffUtc,
      homeTeam: homeName,
      awayTeam: awayName,
      availableMarkets: marketBundle.availableMarkets,
      marketSources: marketBundle.sources,
      marketLines: {
        h2h: marketBundle.h2h,
        ou2_5: marketBundle.totals["2.5"] || null,
        btts: marketBundle.btts || null,
      },
      engineProjection: {
        model: "PitchLab Tachyon/ClubElo + Dixon-Coles MatchOutlook v3.2",
        lamHome: round2(lamHome),
        lamAway: round2(lamAway),
        pHome: round4(pH),
        pDraw: round4(pD),
        pAway: round4(pA),
        fair1X2: {
          home: p1x2.find((s) => s.selection === "home").fairOdds.decimal,
          draw: p1x2.find((s) => s.selection === "draw").fairOdds.decimal,
          away: p1x2.find((s) => s.selection === "away").fairOdds.decimal,
        },
        over2_5: round4(outlook.marketsByKey.totals_2_5.selections[0].p),
        bttsYes: round4(outlook.marketsByKey.btts.selections[0].p),
        coherentScore: `${cohScore.home}-${cohScore.away}`,
        topScorelines: outlook.topScorelines.map((s) => `${s.score} (${(s.p * 100).toFixed(1)}%)`),
      },
      picks: {
        featured: mainPick,
        conservadora: picks.find((p) => p.profile === "conservadora") || null,
        intermedia: picks.find((p) => p.profile === "intermedia") || null,
        arriesgada: picks.find((p) => p.profile === "arriesgada") || null,
        compatible: engine.picksCompatible(picks, 10),
      },
      confidence: conf,
      marketValuePaperTrading: marketEval,
      lineupsAndNews: notes,
    });
  }

  // -------------------------------------------------------------------------
  // 5/6 Multi-Sport (`NBA`, `NHL`, `NCAAF` — esta semana con Kalshi en vivo)
  // -------------------------------------------------------------------------
  console.log("5/6 Ejecutando PitchLab Spacetime Multi-Sport v3.0 (NBA, NHL, NCAAF)...");
  const multisportResults = [];

  function parseKalshiDateStr(ticker) {
    const m = /-(\d{2})([A-Z]{3})(\d{2})/.exec(ticker);
    if (!m) return null;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const mo = months.indexOf(m[2]);
    if (mo < 0) return null;
    return `20${m[1]}-${String(mo + 1).padStart(2, "0")}-${m[3]}`;
  }

  for (const [msLeague, events, maxCount] of [
    ["nba", kalshiNbaGame, 8],
    ["nhl", kalshiNhlGame, 6],
    ["ncaaf", kalshiNcaafGame, 8],
  ]) {
    let added = 0;
    for (const ev of events) {
      if (added >= maxCount) break;
      const dateStr = parseKalshiDateStr(ev.event_ticker);
      if (!dateStr || dateStr < WINDOW_START || dateStr > WINDOW_END) continue;
      // En Kalshi el título es "Away vs Home" ("Milwaukee vs Orlando" con ticker MILORL -> MIL @ ORL)
      const parts = String(ev.title || "").split(/\s+(?:vs\.?|at)\s+/i);
      if (parts.length < 2 || (ev.markets || []).length !== 2) continue;
      const awayRaw = parts[0].trim();
      const homeRaw = parts[1].trim();

      try {
        const hInj = rosterMultiMap.get(`${msLeague}::${fullSlug(homeRaw)}`) || [];
        const aInj = rosterMultiMap.get(`${msLeague}::${fullSlug(awayRaw)}`) || [];
        const pred = engine.predictMultiSport(
          msLeague,
          {
            homeTeam: homeRaw,
            awayTeam: awayRaw,
            homeInjuriesOut: hInj.length,
            awayInjuriesOut: aInj.length,
          },
          multisportModel,
        );

        let pAskHome = null, pAskAway = null;
        for (const m of ev.markets) {
          const sub = String(m.yes_sub_title || m.title || "");
          const ask = Number(m.yes_ask_dollars);
          if (Number.isFinite(ask) && ask > 0.03 && ask < 0.97) {
            if (fullSlug(sub).includes(fullSlug(homeRaw)) || fullSlug(homeRaw).includes(fullSlug(sub))) pAskHome = ask;
            else if (fullSlug(sub).includes(fullSlug(awayRaw)) || fullSlug(awayRaw).includes(fullSlug(sub))) pAskAway = ask;
          }
        }
        const homeDec = pAskHome ? +(1 / pAskHome).toFixed(3) : null;
        const awayDec = pAskAway ? +(1 / pAskAway).toFixed(3) : null;

        const favHome = pred.pHome >= pred.pAway;
        const pFav = favHome ? pred.pHome : pred.pAway;
        const pickSide = favHome ? `${homeRaw} (Ganador)` : `${awayRaw} (Ganador)`;
        const mktOdd = favHome ? homeDec : awayDec;
        const evPct = mktOdd ? round2((pFav * mktOdd - 1) * 100) : null;

        const expTot =
          pred.sport === "nhl" ? pred.expectedTotalGoals : pred.expectedTotalPoints;

        multisportResults.push({
          matchId: ev.event_ticker,
          windowBucket: dateStr <= WEEK1_END ? "esta_semana" : "proxima_semana",
          sport: msLeague,
          league: msLeague.toUpperCase(),
          date: dateStr,
          homeTeam: pred.homeTeamName || pred.homeTeam || homeRaw,
          awayTeam: pred.awayTeamName || pred.awayTeam || awayRaw,
          model: pred.modelId,
          pHome: round4(pred.pHome),
          pAway: round4(pred.pAway),
          fairHomeDec: round2(1 / pred.pHome),
          fairAwayDec: round2(1 / pred.pAway),
          expectedTotal: round2(expTot),
          kalshiHomeDec: homeDec,
          kalshiAwayDec: awayDec,
          featuredPick: {
            label: pickSide,
            p: round4(pFav),
            fairOdds: round2(1 / pFav),
            kalshiDecimal: mktOdd,
            evPct,
          },
          injuries: [
            ...(aInj.length ? [`${awayRaw}: ${aInj.slice(0, 2).join(", ")}`] : []),
            ...(hInj.length ? [`${homeRaw}: ${hInj.slice(0, 2).join(", ")}`] : []),
          ],
        });
        added++;
      } catch {}
    }
  }

  // Ordenar todos los resultados cronológicamente
  nflResults.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.matchId.localeCompare(b.matchId));
  soccerResults.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.matchId.localeCompare(b.matchId));
  uclResults.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.matchId.localeCompare(b.matchId));

  // Verificación de invariantes duras
  const allCore = [...nflResults, ...soccerResults, ...uclResults];
  let incompatibleCount = 0;
  for (const r of allCore) {
    if (!r.picks.compatible) incompatibleCount++;
  }
  if (incompatibleCount > 0) {
    throw new Error(`Fallo de invariante: ${incompatibleCount} partidos con picks incompatibles`);
  }

  // Ranking global de mejores oportunidades de valor (Paper-Trading EV > 0)
  const topValueOpportunities = allCore
    .filter((r) => r.marketValuePaperTrading?.bestValue && r.marketValuePaperTrading.bestValue.evPct >= 3.0)
    .map((r) => ({
      date: r.date,
      windowBucket: r.windowBucket,
      league: r.league,
      match: `${r.awayTeam} @ ${r.homeTeam}`,
      ...r.marketValuePaperTrading.bestValue,
      note: r.lineupsAndNews[0] || "",
    }))
    .sort((a, b) => b.evPct - a.evPct);

  // -------------------------------------------------------------------------
  // 6/6 Escritura de artefactos JSON y CSV reproducibles en `data/picks/`
  // -------------------------------------------------------------------------
  const outDir = path.join(ROOT, "data/picks");
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "picks_2026-11-13_2026-11-26.json");
  const csvPath = path.join(outDir, "picks_2026-11-13_2026-11-26.csv");

  const payload = {
    schemaVersion: "pitchlab_biweekly_picks_v3.2.0",
    generatedAtUtc: TS_DECISION,
    window: {
      estaSemana: { start: WINDOW_START, end: WEEK1_END },
      proximaSemana: { start: "2026-11-20", end: WINDOW_END },
    },
    governanceAndCompliance: {
      productionSegmentsEnabledLive: "0/60 (modo Paper-Trading / Informativo; sin dimensionamiento Kelly de banca real)",
      frozenArtifactsModified: false,
      sanctionedMarketSourcesUsed: [
        "nflverse CC-BY 4.0 (games.csv sportsbook consensus)",
        "Kalshi Public Trade API v2 (orderbook ejecutable)",
        "Polymarket Gamma API (orderbook ejecutable con filtro bid-ask <= 0.08)",
        "Open-Meteo Weather API (viento/precipitación horaria)",
        "FanDuel Public Week 12 Thanksgiving Openers",
      ],
      blockedGatedCasinosNotScraped: [
        "Caliente.mx (bloqueado: sin API pública documentada / protección anti-bot)",
        "Codere.mx (bloqueado: robots.txt Disallow: /)",
        "Pinnacle Web / Smarkets Exchange (HTTP 403 / requiere THE_ODDS_API_KEY o BETFAIR_APP_KEY no presentes en entorno)",
      ],
    },
    counts: {
      totalMatchesAnalyzed: allCore.length + multisportResults.length,
      nflGames: nflResults.length,
      coreFootballMatches: soccerResults.length,
      uclMatches: uclResults.length,
      multisportMatches: multisportResults.length,
      estaSemanaCore: allCore.filter((r) => r.windowBucket === "esta_semana").length,
      proximaSemanaCore: allCore.filter((r) => r.windowBucket === "proxima_semana").length,
      incompatiblePickSets: incompatibleCount,
    },
    topValuePaperTrading: topValueOpportunities.slice(0, 25),
    nfl: nflResults,
    football: soccerResults,
    ucl: uclResults,
    multisport: multisportResults,
  };

  const serializedPayload = JSON.stringify(payload, null, 2);
  fs.writeFileSync(jsonPath, serializedPayload, "utf8");
  fs.writeFileSync(path.join(outDir, "latest.json"), serializedPayload, "utf8");

  // CSV compacto de todos los partidos
  const csvRows = [
    [
      "ventana",
      "fecha",
      "liga",
      "ronda",
      "local",
      "visitante",
      "pick_principal",
      "prob_pick",
      "cuota_justa",
      "pick_conservador",
      "pick_arriesgado",
      "confianza",
      "marcador_proyectado",
      "mejor_valor_mercado",
      "ev_pct_paper",
      "mercados_disponibles",
      "nota_alineacion_bajas",
    ].join(","),
  ];

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  for (const r of allCore) {
    const fp = r.picks.featured;
    const cpPick = r.picks.conservadora;
    const apPick = r.picks.arriesgada;
    const bv = r.marketValuePaperTrading?.bestValue;
    const score = r.sport === "nfl" ? r.engineProjection.projectedScore : r.engineProjection.coherentScore;
    csvRows.push(
      [
        esc(r.windowBucket),
        esc(r.date),
        esc(r.league),
        esc(r.round),
        esc(r.homeTeam),
        esc(r.awayTeam),
        esc(fp ? fp.label : ""),
        esc(fp ? (fp.p * 100).toFixed(1) + "%" : ""),
        esc(fp ? fp.fairOdds.toFixed(2) : ""),
        esc(cpPick ? `${cpPick.label} (${(cpPick.p * 100).toFixed(1)}%)` : "—"),
        esc(apPick ? `${apPick.label} (${(apPick.p * 100).toFixed(1)}%)` : "—"),
        esc(`${r.confidence.level.toUpperCase()} (${r.confidence.score})`),
        esc(score),
        esc(bv ? `${bv.selection} @ ${bv.marketDecimal} (${bv.book})` : "—"),
        esc(bv ? `+${bv.evPct}%` : "—"),
        esc((r.availableMarkets || []).join(" | ")),
        esc((r.lineupsAndNews || []).join(" ; ")),
      ].join(","),
    );
  }
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf8");

  console.log("6/6 ¡Generación completada con éxito!");
  console.log(JSON.stringify(payload.counts, null, 2));
  console.log("Top 8 Value Spots (Paper-Trading):");
  for (const v of topValueOpportunities.slice(0, 8)) {
    console.log(
      `  [${v.date}] ${v.league} | ${v.match} -> ${v.selection} | Engine ${(v.pEngine * 100).toFixed(1)}% (Fair ${v.fairDecimal}) vs Mkt ${v.marketDecimal} (${v.book}) | EV +${v.evPct}%`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
