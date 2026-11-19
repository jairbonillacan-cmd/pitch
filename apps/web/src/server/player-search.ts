import fs from "node:fs";
import path from "node:path";
import { isNationalCompetition, LeagueSquadsFileSchema } from "@pitchlab/contracts";
import { PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague } from "./snapshots";

export interface PlayerSearchItem {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  jersey: string | null;
  positionGroup: "GK" | "DEF" | "MID" | "FWD";
  positionLabel: string;
  teamSlug: string;
  teamName: string;
  league: ProductLeague;
  leagueLabel: string;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
  href: string;
  isNational: boolean;
  /** Campo pre-normalizado sin acentos para búsqueda ultrarrápida. */
  searchHaystack: string;
  searchName: string;
}

const LEAGUE_LABELS: Readonly<Record<ProductLeague, string>> = {
  "liga-mx": "Liga MX",
  "premier-league": "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
  "concacaf-nations": "Concacaf Nations",
  "uefa-nations": "UEFA Nations",
  amistosos: "Amistosos FIFA",
  "copa-del-mundo": "Copa del Mundo",
  eliminatorias: "Eliminatorias",
  "copa-america": "Copa América",
  eurocopa: "Eurocopa",
  "copa-oro": "Copa Oro",
  "copa-africana": "Copa Africana",
  "copa-asiatica": "Copa Asiática",
};

function normSearch(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let cachedIndex: { builtAtMs: number; items: PlayerSearchItem[] } | null = null;
const INDEX_TTL_MS = 5 * 60 * 1000;

export function getPlayerSearchIndex(): readonly PlayerSearchItem[] {
  const now = Date.now();
  if (cachedIndex && now - cachedIndex.builtAtMs < INDEX_TTL_MS) {
    return cachedIndex.items;
  }

  const root = resolveSnapshotsRoot();
  const items: PlayerSearchItem[] = [];

  for (const league of PRODUCT_LEAGUES) {
    const filePath = path.join(root, league, "squads.json");
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = LeagueSquadsFileSchema.safeParse(
        JSON.parse(fs.readFileSync(filePath, "utf8")),
      );
      if (!parsed.success) continue;
      const leagueLabel = LEAGUE_LABELS[league] ?? league;
      const isNat = isNationalCompetition(league);

      for (const team of parsed.data.teams) {
        for (const p of team.players) {
          const searchName = normSearch(`${p.name} ${p.shortName}`);
          const searchHaystack = normSearch(
            `${p.name} ${p.shortName} ${team.teamName} ${p.positionLabel} ${leagueLabel}`,
          );
          items.push({
            id: `${league}:${team.teamSlug}:${p.slug}`,
            slug: p.slug,
            name: p.name,
            shortName: p.shortName,
            jersey: p.jersey,
            positionGroup: p.positionGroup,
            positionLabel: p.positionLabel,
            teamSlug: team.teamSlug,
            teamName: team.teamName,
            league,
            leagueLabel,
            photoKey: p.photoKey ?? null,
            fallbackPhotoKey: p.fallbackPhotoKey ?? null,
            href: `/app/${league}/teams/${team.teamSlug}/players/${p.slug}`,
            isNational: isNat,
            searchHaystack,
            searchName,
          });
        }
      }
    } catch (err) {
      void err;
    }
  }

  cachedIndex = { builtAtMs: now, items };
  return items;
}

export interface PlayerSearchPublicHit {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  jersey: string | null;
  positionLabel: string;
  teamSlug: string;
  teamName: string;
  league: ProductLeague;
  leagueLabel: string;
  photoKey: string | null;
  fallbackPhotoKey: string | null;
  href: string;
}

export function searchPlayersDirectory(
  rawQuery: string,
  options: { league?: string | null; teamSlug?: string | null; limit?: number } = {},
): PlayerSearchPublicHit[] {
  const nq = normSearch(rawQuery);
  const leagueFilter = options.league?.trim().toLowerCase() || null;
  const teamFilter = options.teamSlug?.trim().toLowerCase() || null;
  const limit = Math.max(1, Math.min(24, options.limit ?? 8));

  if (!nq && !leagueFilter && !teamFilter) return [];

  const tokens = nq ? nq.split(" ").filter(Boolean) : [];
  const index = getPlayerSearchIndex();
  const scored: Array<{ score: number; item: PlayerSearchItem }> = [];

  for (const item of index) {
    if (leagueFilter && item.league !== leagueFilter) continue;
    if (teamFilter && item.teamSlug !== teamFilter) continue;

    if (tokens.length === 0) {
      scored.push({ score: item.photoKey ? 5 : 1, item });
      continue;
    }

    if (!tokens.every((tok) => item.searchHaystack.includes(tok))) continue;

    let score = 10;
    if (item.searchName === nq) score += 100;
    else if (item.searchName.startsWith(nq)) score += 60;
    else if (tokens.every((tok) => item.searchName.includes(tok))) score += 40;
    if (item.photoKey) score += 8;
    // Priorizar perfil de club sobre selección salvo que se filtre por selección
    if (!item.isNational) score += 12;

    scored.push({ score, item });
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "es-MX"));

  // Deduplicar por nombre normalizado cuando aparece en club + selección
  const seenNames = new Set<string>();
  const out: PlayerSearchPublicHit[] = [];
  for (const { item } of scored) {
    const dedupeKey = leagueFilter ? `${item.league}:${item.teamSlug}:${item.slug}` : item.searchName;
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);
    out.push({
      id: item.id,
      slug: item.slug,
      name: item.name,
      shortName: item.shortName,
      jersey: item.jersey,
      positionLabel: item.positionLabel,
      teamSlug: item.teamSlug,
      teamName: item.teamName,
      league: item.league,
      leagueLabel: item.leagueLabel,
      photoKey: item.photoKey,
      fallbackPhotoKey: item.fallbackPhotoKey,
      href: item.href,
    });
    if (out.length >= limit) break;
  }

  return out;
}
