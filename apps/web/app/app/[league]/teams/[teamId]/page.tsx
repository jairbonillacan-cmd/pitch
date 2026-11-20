import { notFound, permanentRedirect } from "next/navigation";
import { canonicalTeamHref } from "@pitchlab/contracts";
import { teamExistsInSnapshots } from "../../../../../src/server/team-profile";

/** Redirección permanente 308 desde `/app/<league>/teams/<teamId>` hacia `/app/<league>/t/<teamSlug>`. */
export default async function LegacyTeamRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; teamId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}): Promise<never> {
  const [{ league, teamId }, resolvedSearch] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ tab?: string | string[] }>({}),
  ]);
  if (!teamExistsInSnapshots(league, teamId)) {
    notFound();
  }
  const tab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const baseHref = canonicalTeamHref(league, teamId);
  permanentRedirect(tab ? `${baseHref}?tab=${encodeURIComponent(tab)}` : baseHref);
}
