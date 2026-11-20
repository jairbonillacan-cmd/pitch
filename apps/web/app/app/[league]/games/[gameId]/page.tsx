import "../../../../live.css";
import "../../../../pre-match.css";
import "../../../../sport-outlook.css";
import { notFound, permanentRedirect } from "next/navigation";
import { canonicalGameHref, resolveGameBySlugOrId } from "@pitchlab/contracts";
import {
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  type ProductLeague,
} from "../../../../../src/server/snapshots";

function isProductLeague(val: string): val is ProductLeague {
  return (PRODUCT_LEAGUES as readonly string[]).includes(val);
}

/** Redirección permanente 308 desde `/app/<league>/games/<id>` hacia la URL canónica corta `/app/<league>/g/<slug>`. */
export default async function LegacyMatchRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; gameId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}): Promise<never> {
  const [{ league, gameId }, resolvedSearch] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ tab?: string | string[] }>({}),
  ]);
  if (!isProductLeague(league)) {
    notFound();
  }
  const envelope = loadLeagueSnapshotEnvelope(league);
  const resolvedGame = envelope.data ? resolveGameBySlugOrId(envelope.data.games, gameId) : null;
  if (!resolvedGame) {
    notFound();
  }
  const tab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const baseHref = canonicalGameHref(league, resolvedGame);
  permanentRedirect(tab ? `${baseHref}?tab=${encodeURIComponent(tab)}` : baseHref);
}
