/**
 * Metadatos canónicos de conferencias y divisiones para ligas de Norteamérica
 * (NFL, NBA, NHL, MLB) más cálculo compartido de sembrados y juegos detrás.
 */
import type { GameDTO, StandingFormToken, StandingRow } from "@pitchlab/contracts";
import type { NflTeamRateInput } from "@pitchlab/engines-reference";
import { NFL_SHORT_NAMES } from "./mappings.js";

export interface TeamDivisionMeta {
  conference: string;
  division: string;
}

export const NFL_DIVISIONS: Readonly<Record<string, TeamDivisionMeta>> = {
  "buffalo-bills": { conference: "AFC", division: "AFC Este" },
  "miami-dolphins": { conference: "AFC", division: "AFC Este" },
  "new-england-patriots": { conference: "AFC", division: "AFC Este" },
  "new-york-jets": { conference: "AFC", division: "AFC Este" },
  "baltimore-ravens": { conference: "AFC", division: "AFC Norte" },
  "cincinnati-bengals": { conference: "AFC", division: "AFC Norte" },
  "cleveland-browns": { conference: "AFC", division: "AFC Norte" },
  "pittsburgh-steelers": { conference: "AFC", division: "AFC Norte" },
  "houston-texans": { conference: "AFC", division: "AFC Sur" },
  "indianapolis-colts": { conference: "AFC", division: "AFC Sur" },
  "jacksonville-jaguars": { conference: "AFC", division: "AFC Sur" },
  "tennessee-titans": { conference: "AFC", division: "AFC Sur" },
  "denver-broncos": { conference: "AFC", division: "AFC Oeste" },
  "kansas-city-chiefs": { conference: "AFC", division: "AFC Oeste" },
  "las-vegas-raiders": { conference: "AFC", division: "AFC Oeste" },
  "los-angeles-chargers": { conference: "AFC", division: "AFC Oeste" },
  "dallas-cowboys": { conference: "NFC", division: "NFC Este" },
  "new-york-giants": { conference: "NFC", division: "NFC Este" },
  "philadelphia-eagles": { conference: "NFC", division: "NFC Este" },
  "washington-commanders": { conference: "NFC", division: "NFC Este" },
  "chicago-bears": { conference: "NFC", division: "NFC Norte" },
  "detroit-lions": { conference: "NFC", division: "NFC Norte" },
  "green-bay-packers": { conference: "NFC", division: "NFC Norte" },
  "minnesota-vikings": { conference: "NFC", division: "NFC Norte" },
  "atlanta-falcons": { conference: "NFC", division: "NFC Sur" },
  "carolina-panthers": { conference: "NFC", division: "NFC Sur" },
  "new-orleans-saints": { conference: "NFC", division: "NFC Sur" },
  "tampa-bay-buccaneers": { conference: "NFC", division: "NFC Sur" },
  "arizona-cardinals": { conference: "NFC", division: "NFC Oeste" },
  "los-angeles-rams": { conference: "NFC", division: "NFC Oeste" },
  "san-francisco-49ers": { conference: "NFC", division: "NFC Oeste" },
  "seattle-seahawks": { conference: "NFC", division: "NFC Oeste" },
};

export const NBA_DIVISIONS: Readonly<Record<string, TeamDivisionMeta>> = {
  "boston-celtics": { conference: "Este", division: "Atlántico" },
  "brooklyn-nets": { conference: "Este", division: "Atlántico" },
  "new-york-knicks": { conference: "Este", division: "Atlántico" },
  "philadelphia-76ers": { conference: "Este", division: "Atlántico" },
  "toronto-raptors": { conference: "Este", division: "Atlántico" },
  "chicago-bulls": { conference: "Este", division: "Central" },
  "cleveland-cavaliers": { conference: "Este", division: "Central" },
  "detroit-pistons": { conference: "Este", division: "Central" },
  "indiana-pacers": { conference: "Este", division: "Central" },
  "milwaukee-bucks": { conference: "Este", division: "Central" },
  "atlanta-hawks": { conference: "Este", division: "Sureste" },
  "charlotte-hornets": { conference: "Este", division: "Sureste" },
  "miami-heat": { conference: "Este", division: "Sureste" },
  "orlando-magic": { conference: "Este", division: "Sureste" },
  "washington-wizards": { conference: "Este", division: "Sureste" },
  "denver-nuggets": { conference: "Oeste", division: "Noroeste" },
  "minnesota-timberwolves": { conference: "Oeste", division: "Noroeste" },
  "oklahoma-city-thunder": { conference: "Oeste", division: "Noroeste" },
  "portland-trail-blazers": { conference: "Oeste", division: "Noroeste" },
  "utah-jazz": { conference: "Oeste", division: "Noroeste" },
  "golden-state-warriors": { conference: "Oeste", division: "Pacífico" },
  "los-angeles-clippers": { conference: "Oeste", division: "Pacífico" },
  "la-clippers": { conference: "Oeste", division: "Pacífico" },
  "los-angeles-lakers": { conference: "Oeste", division: "Pacífico" },
  "phoenix-suns": { conference: "Oeste", division: "Pacífico" },
  "sacramento-kings": { conference: "Oeste", division: "Pacífico" },
  "dallas-mavericks": { conference: "Oeste", division: "Suroeste" },
  "houston-rockets": { conference: "Oeste", division: "Suroeste" },
  "memphis-grizzlies": { conference: "Oeste", division: "Suroeste" },
  "new-orleans-pelicans": { conference: "Oeste", division: "Suroeste" },
  "san-antonio-spurs": { conference: "Oeste", division: "Suroeste" },
};

export const NHL_DIVISIONS: Readonly<Record<string, TeamDivisionMeta>> = {
  "boston-bruins": { conference: "Este", division: "Atlántico" },
  "buffalo-sabres": { conference: "Este", division: "Atlántico" },
  "detroit-red-wings": { conference: "Este", division: "Atlántico" },
  "florida-panthers": { conference: "Este", division: "Atlántico" },
  "montreal-canadiens": { conference: "Este", division: "Atlántico" },
  "ottawa-senators": { conference: "Este", division: "Atlántico" },
  "tampa-bay-lightning": { conference: "Este", division: "Atlántico" },
  "toronto-maple-leafs": { conference: "Este", division: "Atlántico" },
  "carolina-hurricanes": { conference: "Este", division: "Metropolitana" },
  "columbus-blue-jackets": { conference: "Este", division: "Metropolitana" },
  "new-jersey-devils": { conference: "Este", division: "Metropolitana" },
  "new-york-islanders": { conference: "Este", division: "Metropolitana" },
  "new-york-rangers": { conference: "Este", division: "Metropolitana" },
  "philadelphia-flyers": { conference: "Este", division: "Metropolitana" },
  "pittsburgh-penguins": { conference: "Este", division: "Metropolitana" },
  "washington-capitals": { conference: "Este", division: "Metropolitana" },
  "chicago-blackhawks": { conference: "Oeste", division: "Central" },
  "colorado-avalanche": { conference: "Oeste", division: "Central" },
  "dallas-stars": { conference: "Oeste", division: "Central" },
  "minnesota-wild": { conference: "Oeste", division: "Central" },
  "nashville-predators": { conference: "Oeste", division: "Central" },
  "st-louis-blues": { conference: "Oeste", division: "Central" },
  "utah-mammoth": { conference: "Oeste", division: "Central" },
  "utah-hockey-club": { conference: "Oeste", division: "Central" },
  "winnipeg-jets": { conference: "Oeste", division: "Central" },
  "anaheim-ducks": { conference: "Oeste", division: "Pacífico" },
  "calgary-flames": { conference: "Oeste", division: "Pacífico" },
  "edmonton-oilers": { conference: "Oeste", division: "Pacífico" },
  "los-angeles-kings": { conference: "Oeste", division: "Pacífico" },
  "san-jose-sharks": { conference: "Oeste", division: "Pacífico" },
  "seattle-kraken": { conference: "Oeste", division: "Pacífico" },
  "vancouver-canucks": { conference: "Oeste", division: "Pacífico" },
  "vegas-golden-knights": { conference: "Oeste", division: "Pacífico" },
};

export const MLB_DIVISIONS: Readonly<Record<string, TeamDivisionMeta>> = {
  "baltimore-orioles": { conference: "Liga Americana", division: "AL Este" },
  "boston-red-sox": { conference: "Liga Americana", division: "AL Este" },
  "new-york-yankees": { conference: "Liga Americana", division: "AL Este" },
  "tampa-bay-rays": { conference: "Liga Americana", division: "AL Este" },
  "toronto-blue-jays": { conference: "Liga Americana", division: "AL Este" },
  "chicago-white-sox": { conference: "Liga Americana", division: "AL Central" },
  "cleveland-guardians": { conference: "Liga Americana", division: "AL Central" },
  "detroit-tigers": { conference: "Liga Americana", division: "AL Central" },
  "kansas-city-royals": { conference: "Liga Americana", division: "AL Central" },
  "minnesota-twins": { conference: "Liga Americana", division: "AL Central" },
  athletics: { conference: "Liga Americana", division: "AL Oeste" },
  "houston-astros": { conference: "Liga Americana", division: "AL Oeste" },
  "los-angeles-angels": { conference: "Liga Americana", division: "AL Oeste" },
  "seattle-mariners": { conference: "Liga Americana", division: "AL Oeste" },
  "texas-rangers": { conference: "Liga Americana", division: "AL Oeste" },
  "atlanta-braves": { conference: "Liga Nacional", division: "NL Este" },
  "miami-marlins": { conference: "Liga Nacional", division: "NL Este" },
  "new-york-mets": { conference: "Liga Nacional", division: "NL Este" },
  "philadelphia-phillies": { conference: "Liga Nacional", division: "NL Este" },
  "washington-nationals": { conference: "Liga Nacional", division: "NL Este" },
  "chicago-cubs": { conference: "Liga Nacional", division: "NL Central" },
  "cincinnati-reds": { conference: "Liga Nacional", division: "NL Central" },
  "milwaukee-brewers": { conference: "Liga Nacional", division: "NL Central" },
  "pittsburgh-pirates": { conference: "Liga Nacional", division: "NL Central" },
  "st-louis-cardinals": { conference: "Liga Nacional", division: "NL Central" },
  "arizona-diamondbacks": { conference: "Liga Nacional", division: "NL Oeste" },
  "colorado-rockies": { conference: "Liga Nacional", division: "NL Oeste" },
  "los-angeles-dodgers": { conference: "Liga Nacional", division: "NL Oeste" },
  "san-diego-padres": { conference: "Liga Nacional", division: "NL Oeste" },
  "san-francisco-giants": { conference: "Liga Nacional", division: "NL Oeste" },
};

export function divisionMetaForTeam(
  league: "nfl" | "nba" | "nhl" | "mlb",
  teamIdOrSlug: string,
): TeamDivisionMeta | null {
  const slug = teamIdOrSlug.includes(".") ? teamIdOrSlug.split(".").slice(1).join(".") : teamIdOrSlug;
  if (league === "nfl") return NFL_DIVISIONS[slug] ?? null;
  if (league === "nba") return NBA_DIVISIONS[slug] ?? null;
  if (league === "nhl") return NHL_DIVISIONS[slug] ?? null;
  return MLB_DIVISIONS[slug] ?? null;
}

export function compareStandingsBySport(
  league: "nfl" | "nba" | "nhl" | "mlb",
  a: StandingRow,
  b: StandingRow,
): number {
  if (league === "nhl") {
    return (
      b.points - a.points ||
      (b.winPct ?? 0) - (a.winPct ?? 0) ||
      b.won - a.won ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name)
    );
  }
  const pctA = a.winPct ?? (a.played > 0 ? (a.won + 0.5 * a.drawn) / a.played : 0);
  const pctB = b.winPct ?? (b.played > 0 ? (b.won + 0.5 * b.drawn) / b.played : 0);
  return (
    pctB - pctA ||
    b.won - b.lost - (a.won - a.lost) ||
    b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Ordena las filas según la liga y asigna `seed` y `gamesBehind` por conferencia.
 */
export function finalizeConferenceStandings(
  league: "nfl" | "nba" | "nhl" | "mlb",
  rows: StandingRow[],
  options: { computeGamesBehind?: boolean } = {},
): StandingRow[] {
  const byConf = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const confKey = row.conference ?? "__all__";
    const list = byConf.get(confKey) ?? [];
    list.push(row);
    byConf.set(confKey, list);
  }

  const annotated: StandingRow[] = [];
  for (const group of byConf.values()) {
    group.sort((a, b) => compareStandingsBySport(league, a, b));
    const leader = group[0];
    group.forEach((row, idx) => {
      let gb = row.gamesBehind;
      if (!gb && options.computeGamesBehind && leader) {
        const diff = ((leader.won - leader.lost) - (row.won - row.lost)) / 2;
        gb = diff <= 0 ? "-" : Number.isInteger(diff) ? String(diff) : diff.toFixed(1);
      }
      annotated.push({
        ...row,
        seed: row.seed ?? idx + 1,
        ...(gb ? { gamesBehind: gb } : {}),
      });
    });
  }

  return annotated.sort((a, b) => compareStandingsBySport(league, a, b));
}

/**
 * Construye la tabla de posiciones de la NFL desde los partidos regulares jugados (`seasonGames`).
 */
export function computeNflStandings(
  seasonGames: readonly GameDTO[],
  teamInputs: readonly NflTeamRateInput[],
  resolveLogo: (teamId: string) => string | undefined,
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const formMap = new Map<string, StandingFormToken[]>();

  for (const t of teamInputs) {
    const slug = t.teamId.includes(".") ? t.teamId.split(".").slice(1).join(".") : t.teamId;
    const meta = divisionMetaForTeam("nfl", slug);
    const logoUrl = resolveLogo(t.teamId);
    table.set(t.teamId, {
      teamId: t.teamId,
      name: t.name,
      shortName: NFL_SHORT_NAMES[slug] ?? t.shortName,
      code: t.code,
      ...(logoUrl ? { logoUrl } : {}),
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      ...(meta ? { conference: meta.conference, division: meta.division } : {}),
    });
    formMap.set(t.teamId, []);
  }

  const playedGames = seasonGames
    .filter((g) => g.status === "final" && g.result)
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const g of playedGames) {
    const home = table.get(g.home.id);
    const away = table.get(g.away.id);
    if (!home || !away || !g.result) continue;
    const hs = g.result.home;
    const as = g.result.away;

    home.played += 1;
    away.played += 1;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;

    if (hs > as) {
      home.won += 1;
      away.lost += 1;
      home.points += 2;
      formMap.get(home.teamId)?.push("W");
      formMap.get(away.teamId)?.push("L");
    } else if (as > hs) {
      away.won += 1;
      home.lost += 1;
      away.points += 2;
      formMap.get(home.teamId)?.push("L");
      formMap.get(away.teamId)?.push("W");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      formMap.get(home.teamId)?.push("D");
      formMap.get(away.teamId)?.push("D");
    }
  }

  const rows: StandingRow[] = [...table.values()]
    .filter((r) => r.played > 0)
    .map((r) => {
      const form = (formMap.get(r.teamId) ?? []).slice(-5);
      const winPct = r.played > 0 ? Math.round(((r.won + 0.5 * r.drawn) / r.played) * 1000) / 1000 : 0;
      return {
        ...r,
        winPct,
        ...(form.length > 0 ? { form } : {}),
      };
    });

  return finalizeConferenceStandings("nfl", rows);
}
