/**
 * Tipos del dominio AztecaVet — derivados de la evidencia (aztecavet-analysis/
 * INFORME-PROFUNDO.md; bundle público decodificado y verificado con REA).
 * Categoría: OBSERVADO (formas tomadas del código cliente del propio sitio).
 */

// ---------- Fútbol ----------

/** Fila de TD: [código, nombre, liga, GF, GC, PJ, [GF,GC,PJ 2026-27] | 0, bandera, competiciones]. */
export type FbTeamRow = [
  string, string, string, number, number, number,
  [number, number, number] | 0,
  "" | "e" | "n" | "p",
  string,
];

export interface FbTeam {
  c: string;
  n: string;
  lg: string;
  gf: number;
  ga: number;
  gp: number;
  cur: [number, number, number] | 0;
  fl: string;
  comps: string[];
}

/** Partido futuro: mk([local, visita, hora CST, ref 1/X/2 %, nota]). */
export interface FbGame {
  h: string;
  a: string;
  t: string;
  ref: number;
  s: string;
}
/** Partido auditado: aud([local, visita, golesLocal, golesVisita]). */
export interface FbAuditGame {
  h: string;
  a: string;
  t: "Final";
  sc: [number, number];
}
export type FbAnyGame = FbGame | FbAuditGame;
export type FbDayRow = [string, FbAnyGame[]];

export interface FbComp {
  n: string;
  sub: string;
  lg: string;
  em: string;
  g: string;
  gl: string;
  ac: string;
  ac2: string;
  sim: [string, string];
}

/** Baja/noticia de fútbol: impacto en goles/juego según rol (gf resta ataque, ga suma defensa). */
export interface FbInjury {
  id: string;
  t: string;
  n: string;
  r: "gf" | "ga";
  i: number;
  st: number; // 0 disponible, .5 duda, 1 fuera
  h: string; // nota con fuente y fecha
  d: string; // fecha
}

export interface Market {
  id: string;
  l: string;
  p: number;
  g?: number;
  f: (ph: number, pa: number) => boolean;
}

export interface FbModel {
  why?: string;
  O: Market[];
  cp: Market;
  ct: string;
  dom: "h" | "a" | null;
  lh: number;
  la: number;
  tot: number;
  H: { rs: number; ra: number };
  A: { rs: number; ra: number };
  x: number;
  y: number;
  share: number;
  w: number;
  d: number;
  l: number;
  line: number;
  fav: Market;
  pick?: Market;
}

// ---------- NHL ----------

/** T[cod] = [nombre, GF 2025-26, GA 2025-26]. */
export type NhlTeams = Record<string, [string, number, number]>;
/** Resultado jugado: [local, visita, golesLocal, golesVisita]. */
export type NhlResult = [string, string, number, number];
export type NhlInjury = FbInjury; // misma forma (N del original)
export interface NhlGame {
  h: string;
  a: string;
  t: string;
  ref: number | null;
  sc: [number, number] | null;
  aud: boolean;
  k: string;
  dl: string;
}
export type NhlDayRow = [string, NhlGame[]];

export interface NhlStanding {
  rs: number;
  ra: number;
  n: number;
  kn: boolean;
  gf: number | "";
  ga: number | "";
  f5?: [number, number];
}

export interface NhlModel {
  O: Market[];
  cp: Market;
  ct: string;
  dom: "h" | "a" | null;
  lh: number;
  la: number;
  tot: number;
  H: { rs: number; ra: number; nt: [string, boolean][] };
  A: { rs: number; ra: number; nt: [string, boolean][] };
  x: number;
  y: number;
  pn: number;
  pH: number;
  notes: [string, string, boolean][];
  pick?: Market;
  why?: string;
}

// ---------- MLB ----------

/** T[cod] = [nombre, RS/juego, RA/juego, ERA del bullpen]. */
export type MlbTeams = Record<string, [string, number, number, number]>;
export interface MlbPitcher {
  id: string;
  t: string;
  n: string;
  era: number | null;
  ip: number;
}
export interface MlbBatter {
  id: string;
  t: string;
  n: string;
  i: number; // carreras/juego si falta
  out: number; // 1 = fuera
  note: string;
}
export interface MlbTimelineGame {
  h: string;
  a: string;
  t: string;
  s: string;
  sc: [number, number];
  sp?: [string | null, string | null];
  aud?: boolean;
  k?: string;
  dl?: string;
}
export type MlbDayRow = [string, MlbTimelineGame[]];

export interface MlbModel {
  O: Market[];
  opts: Market[];
  gh: number;
  ga: number;
  tot: number;
  line: number;
  H: { rs: number; ra: number; nt: string[] };
  A: { rs: number; ra: number; nt: string[] };
  x: number;
  y: number;
  pH: number;
  pick: Market;
  cp?: Market;
  ct?: string;
  why?: string;
  notes: string[];
}

// ---------- Motores / estado compartido ----------

export type OddsMap = Record<string, string>;
export type Overrides = Record<string, { rs?: number; ra?: number; f?: number; a?: number }>;

/** Selección del boleto (mensajes {av:"add"} del original). */
export interface SlipPick {
  k: string;
  gk: string;
  sp: string;
  m: string;
  l: string;
  p: number;
  d: number | null;
  t: string;
}
