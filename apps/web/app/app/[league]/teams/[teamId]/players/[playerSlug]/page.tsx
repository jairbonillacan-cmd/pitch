import { notFound, permanentRedirect } from "next/navigation";
import { canonicalPlayerHref } from "@pitchlab/contracts";
import { playerExistsInSnapshots } from "../../../../../../../src/server/team-profile";

/** Redirección permanente 308 desde `/app/<league>/teams/<teamId>/players/<playerSlug>` hacia `/app/<league>/t/<teamSlug>/p/<playerSlug>`. */
export default async function LegacyPlayerRedirectPage({
  params,
}: {
  params: Promise<{ league: string; teamId: string; playerSlug: string }>;
}): Promise<never> {
  const { league, teamId, playerSlug } = await params;
  if (!playerExistsInSnapshots(league, teamId, playerSlug)) {
    notFound();
  }
  permanentRedirect(canonicalPlayerHref(league, teamId, playerSlug));
}
