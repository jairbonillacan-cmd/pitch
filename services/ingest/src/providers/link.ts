/**
 * Empareja partidos de proveedores (Bzzoiro, 5Dollar) con el `id` canónico del corpus.
 *
 * Nunca se usa el id del proveedor como llave: se guarda una tabla `provider_ids` aparte.
 *
 * Método (sin depender de que los nombres coincidan):
 *  1. **Ancla:** fecha ±1 día, marcador idéntico y al menos un equipo con nombre parecido.
 *     Si hay un único candidato, se acepta y cada equipo del proveedor «vota» por su
 *     equipo del corpus.
 *  2. **Mapa de equipos:** cada id de equipo del proveedor se queda con el equipo del corpus
 *     más votado (mínimo 2 votos y 75 % de ellos).
 *  3. **Segunda pasada:** con ambos equipos traducidos por el mapa, fecha ±1 día. Así entran
 *     partidos sin marcador igual en el corpus (correcciones) y nombres muy distintos
 *     («Querétaro FC» ↔ `gallos-blancos`, «Man Utd» ↔ `manchester-united`).
 */
import { slugifyTeamName } from "../team-slug.js";

export interface CorpusGame {
  id: string;
  date: string; // AAAA-MM-DD
  homeTeam: string; // "<liga>.<slug>"
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface ProviderGame {
  providerMatchId: number;
  kickoffUtc: string;
  home: { providerTeamId: number; name: string };
  away: { providerTeamId: number; name: string };
  homeScore: number | null;
  awayScore: number | null;
}

export interface LinkResult {
  /** providerMatchId → id del corpus. */
  links: Map<number, string>;
  /** providerTeamId → equipo del corpus, con votos. */
  teamMap: Map<number, { team: string; votes: number; total: number; names: string[] }>;
  unmatched: ProviderGame[];
  stats: { anchored: number; secondPass: number; ambiguous: number };
}

const DAY_MS = 86_400_000;

function tokens(text: string): Set<string> {
  return new Set(text.split("-").filter((t) => t.length > 1));
}

/** Parecido 0–1 entre un nombre del proveedor y un equipo del corpus. */
export function teamSimilarity(providerName: string, corpusTeam: string): number {
  const a = slugifyTeamName(providerName);
  const b = corpusTeam.includes(".") ? corpusTeam.slice(corpusTeam.indexOf(".") + 1) : corpusTeam;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  if (inter === ta.size || inter === tb.size) return 0.85; // uno contiene al otro
  return inter / (ta.size + tb.size - inter);
}

function dayOf(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/**
 * Las fechas del proveedor vienen en UTC y las del corpus en fecha local del partido; por eso
 * se acepta ±1 día.
 */
function candidatesNear(byDay: Map<number, CorpusGame[]>, kickoffUtc: string): CorpusGame[] {
  const day = dayOf(kickoffUtc);
  return [day - DAY_MS, day, day + DAY_MS].flatMap((d) => byDay.get(d) ?? []);
}

export function linkProviderGames(
  corpus: readonly CorpusGame[],
  rows: readonly ProviderGame[],
): LinkResult {
  const byDay = new Map<number, CorpusGame[]>();
  for (const game of corpus) {
    const day = dayOf(game.date);
    const list = byDay.get(day);
    if (list) list.push(game);
    else byDay.set(day, [game]);
  }

  const links = new Map<number, string>();
  const used = new Set<string>();
  const votes = new Map<number, Map<string, number>>();
  const names = new Map<number, Set<string>>();
  const vote = (teamId: number, name: string, team: string): void => {
    const perTeam = votes.get(teamId) ?? new Map<string, number>();
    perTeam.set(team, (perTeam.get(team) ?? 0) + 1);
    votes.set(teamId, perTeam);
    const n = names.get(teamId) ?? new Set<string>();
    n.add(name);
    names.set(teamId, n);
  };
  let anchored = 0;
  let ambiguous = 0;

  // 1. Anclas por marcador + fecha + un nombre parecido.
  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;
    const matches = candidatesNear(byDay, row.kickoffUtc).filter(
      (g) =>
        g.homeScore === row.homeScore &&
        g.awayScore === row.awayScore &&
        Math.max(teamSimilarity(row.home.name, g.homeTeam), teamSimilarity(row.away.name, g.awayTeam)) >= 0.85,
    );
    if (matches.length !== 1) {
      if (matches.length > 1) ambiguous++;
      continue;
    }
    const game = matches[0]!;
    if (used.has(game.id)) continue;
    links.set(row.providerMatchId, game.id);
    used.add(game.id);
    vote(row.home.providerTeamId, row.home.name, game.homeTeam);
    vote(row.away.providerTeamId, row.away.name, game.awayTeam);
    anchored++;
  }

  // 2. Mapa de equipos por mayoría.
  const teamMap: LinkResult["teamMap"] = new Map();
  for (const [teamId, perTeam] of votes) {
    const total = [...perTeam.values()].reduce((s, v) => s + v, 0);
    const [team, best] = [...perTeam.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (best >= 2 && best / total >= 0.75) {
      teamMap.set(teamId, { team, votes: best, total, names: [...(names.get(teamId) ?? [])] });
    }
  }

  // 3. Segunda pasada con el mapa.
  let secondPass = 0;
  for (const row of rows) {
    if (links.has(row.providerMatchId)) continue;
    const home = teamMap.get(row.home.providerTeamId)?.team;
    const away = teamMap.get(row.away.providerTeamId)?.team;
    if (!home || !away) continue;
    const matches = candidatesNear(byDay, row.kickoffUtc).filter(
      (g) => g.homeTeam === home && g.awayTeam === away && !used.has(g.id),
    );
    if (matches.length !== 1) continue;
    links.set(row.providerMatchId, matches[0]!.id);
    used.add(matches[0]!.id);
    secondPass++;
  }

  return {
    links,
    teamMap,
    unmatched: rows.filter((r) => !links.has(r.providerMatchId)),
    stats: { anchored, secondPass, ambiguous },
  };
}
