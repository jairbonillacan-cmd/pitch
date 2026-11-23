export interface UrlTeamLike {
  readonly slug?: string;
  readonly shortName?: string;
  readonly name: string;
}

export interface UrlGameLike {
  readonly id: string;
  readonly league?: string;
  readonly home: UrlTeamLike;
  readonly away: UrlTeamLike;
}

const SLUG_NOISE = new Set([
  "fc",
  "cf",
  "sc",
  "ac",
  "as",
  "cd",
  "ca",
  "ud",
  "sd",
  "rcd",
  "rc",
  "sv",
  "vfl",
  "vfb",
  "tsg",
  "club",
  "deportivo",
  "atletico",
  "real",
]);

export function opaqueShortCode(rawId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < rawId.length; i += 1) {
    const ch = rawId.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + ((i + 1) * 31);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const mixed = ((BigInt(h1) << 16n) ^ BigInt(h2)) & 0x7fffffffn;
  const base36 = (mixed % 2176782336n).toString(36).padStart(6, "0");
  return base36.slice(0, 6);
}

function compactTeamSlugPart(team: UrlTeamLike): string {
  const raw = (team.slug?.includes(".") ? team.slug.split(".").slice(1).join("-") : team.slug) ||
    team.shortName ||
    team.name;
  const ascii = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const parts = ascii.split("-").filter(Boolean);
  const pruned = parts.length > 1 ? parts.filter((p) => !SLUG_NOISE.has(p)) : parts;
  const finalParts = pruned.length > 0 ? pruned : parts;
  const joined = finalParts.join("-").slice(0, 14).replace(/-+$/g, "");
  return joined || "team";
}

export function cleanTeamRouteSlug(rawTeamSlugOrId: string): string {
  const trimmed = rawTeamSlugOrId.trim();
  const base = trimmed.includes(".") ? trimmed.split(".").slice(1).join("-") : trimmed;
  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalGameSlug(game: UrlGameLike): string {
  const home = compactTeamSlugPart(game.home);
  const away = compactTeamSlugPart(game.away);
  const code = opaqueShortCode(game.id);
  return `${home}-vs-${away}-${code}`;
}

export function canonicalGameHref(league: string, game: UrlGameLike): string {
  return `/app/${encodeURIComponent(league)}/g/${canonicalGameSlug(game)}`;
}

export function canonicalTeamHref(league: string, teamSlugOrId: string): string {
  return `/app/${encodeURIComponent(league)}/t/${encodeURIComponent(cleanTeamRouteSlug(teamSlugOrId))}`;
}

export function canonicalPlayerHref(
  league: string,
  teamSlugOrId: string,
  playerSlug: string,
): string {
  return `${canonicalTeamHref(league, teamSlugOrId)}/p/${encodeURIComponent(playerSlug)}`;
}

export function resolveGameBySlugOrId<T extends UrlGameLike>(
  games: readonly T[],
  slugOrId: string,
): T | null {
  const needle = slugOrId.trim();
  if (!needle) return null;

  const exactId = games.find((g) => g.id === needle);
  if (exactId) return exactId;

  const lower = needle.toLowerCase();
  const exactSlug = games.find((g) => canonicalGameSlug(g) === lower);
  if (exactSlug) return exactSlug;

  const codeMatch = /-([a-z0-9]{6})$/.exec(lower);
  if (codeMatch) {
    const code = codeMatch[1]!;
    const byCode = games.filter((g) => opaqueShortCode(g.id) === code);
    if (byCode.length === 1) return byCode[0]!;
  }

  return null;
}
