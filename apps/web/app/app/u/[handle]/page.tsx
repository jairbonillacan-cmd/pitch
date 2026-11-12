import React from "react";
import { notFound } from "next/navigation";
import { AnalystProfileClubView, getExampleAnalystSpec, OWN_PROFILE_ALIASES } from "@pitchlab/ui";
import { loadPublicMemberProfile } from "../../../../src/server/profile";
import { twitterCredentials } from "../../../../src/server/twitter";
import { getViewerAccess } from "../../../../src/server/viewer-access";

export default async function ClubAnalystProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ x?: string }>;
}): Promise<React.JSX.Element> {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
  if (getExampleAnalystSpec(cleanHandle)) return <AnalystProfileClubView handle={cleanHandle} />;

  const profile = await loadPublicMemberProfile(cleanHandle);
  if (!profile) {
    const access = await getViewerAccess();
    if (access.via !== "beta" || !(OWN_PROFILE_ALIASES as readonly string[]).includes(cleanHandle)) notFound();
  }
  return (
    <AnalystProfileClubView
      handle={cleanHandle}
      memberProfile={profile}
      xEnabled={Boolean(twitterCredentials())}
      xLinkError={query.x === "error"}
    />
  );
}
