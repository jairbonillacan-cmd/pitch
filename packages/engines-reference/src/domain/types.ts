/** Tipos del dominio — derivados de la evidencia (ver docs/08-data-models.md). */

/** T[cod] = [nombre, PF_2025, PA_2025] (NFL, totales de temporada). */
export type NflTeams = Record<string, [string, number, number]>;
/** T[cod] = [nombre, PF/juego, PA/juego, JJ, conferencia] (NCAA). */
export type NcaaTeams = Record<string, [string, number, number, number, string]>;

/** Resultado jugado: [visitante, local, ptsV, ptsL]. */
export type ResultRow = [string, string, number, number];

export interface Injury {
  id: string;
  t: string; // equipo
  n: string; // jugador (posición)
  r: "gf" | "ga"; // resta a la ofensiva / suma a la defensiva
  i: number; // impacto estimado en puntos
  st: number; // 0 juega, <1 duda (0.25 práctica limitada), 1 fuera
  h: string; // detalle con fuente y fecha (nombre original del campo)
  d: string; // fecha
}

export interface Game {
  h: string; // local
  a: string; // visitante
  t: string; // hora
  ref?: string | null;
  sc?: number[] | null; // marcador final [ptsLocal, ptsVisita] (juegos auditados)
  aud: boolean;
  pk?: [string, number] | null; // pick pre-partido almacenado
  k: string; // "día-j"
  dl: string; // etiqueta del día
}

export type DayRow = [string, Game[]];

export interface Market {
  id: string;
  l: string; // etiqueta
  p: number; // probabilidad del modelo
  g?: number;
  f: (p: number, q: number) => boolean; // verificación contra marcador (auditoría)
}

export interface TeamStrength {
  rs: number; // puntos anotados proyectados
  ra: number; // puntos permitidos proyectados
  n: number;
  kn: boolean;
  gf: number | string;
  ga: number | string;
  nt?: [string, boolean][]; // notas de lesiones aplicadas
}

export interface Standings {
  LG: number; // promedio de liga
  [code: string]: TeamStrength | number;
}

export interface Model {
  O: Market[];
  cp: Market | null; // pick del modelo para el juego
  ct: string; // etiqueta de la regla del pick
  dom: "h" | "a" | null;
  lh: number;
  la: number;
  tot: number;
  H: TeamStrength;
  A: TeamStrength;
  x: number;
  y: number;
  pn: number;
  pH: number;
  mu: number;
  L: number;
  line: number;
  notes: [string, string, boolean][];
}

/** Defensa rival para props: [JJ, pts, ydsPase, ydsTierra] permitidos. */
export type DefenseRow = [number, number, number, number];

export interface PlayerRow {
  t: string;
  n: string;
  pos: "QB" | "RB" | "WR" | "TE";
  g: number;
  py: number; // yds pase
  ptd: number; // TD pase
  ra: number; // acarreos
  ry: number; // yds tierra
  rtd: number; // TD tierra
  rec: number | null;
  rcy: number | null;
  rctd: number; // TD recepción
  st: number; // 0 juega, .5 duda, 1 fuera
  nt: string; // nota
}

export interface PropMarket {
  id: string;
  lab: string;
  mu: number;
  sd?: number;
  kind: "n" | "p" | "td";
}

/** Splits de apuestas por juego y mercado (fuente: DraftKings / DK Network). */
export interface MoneySplit {
  l: string;
  bh?: number;
  ba?: number;
  mh?: number;
  ma?: number;
  bo?: number;
  bu?: number;
  mo?: number;
  mu?: number;
}
export type MoneyData = {
  src: string;
  ts: string;
  g: Record<string, Record<"sp" | "ml" | "tot", MoneySplit>>;
};
