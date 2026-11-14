import React from "react";
import { notFound } from "next/navigation";
import { AnalystProfileClubView } from "@pitchlab/ui/profile";
import { normalizeClubHandle } from "../../../../src/profile-path";
import { isAvatarStorageEnabled } from "../../../../src/server/avatar-storage";
import { loadClubProfile } from "../../../../src/server/club-profile";
import { loadProfileBadges } from "../../../../src/server/badges";
import { loadPublicRecord } from "../../../../src/server/public-record";
import { loadFollowInfo } from "../../../../src/server/social";
import { twitterCredentials } from "../../../../src/server/twitter";
import { getViewerAccess } from "../../../../src/server/viewer-access";

export default async function ClubAnalystProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ x?: string }>;
}): Promise<React.JSX.Element> {
  const [{ handle }, query, access] = await Promise.all([params, searchParams, getViewerAccess()]);
  const cleanHandle = normalizeClubHandle(handle);
  const result = await loadClubProfile(cleanHandle, access.via === "beta");
  if (!result) notFound();
  const [follow, publicRecord, badges] = result.profile
    ? await Promise.all([
        loadFollowInfo(result.profile.handle),
        loadPublicRecord(result.profile.handle),
        loadProfileBadges(result.profile.handle),
      ])
    : [null, null, null];
  return (
    <AnalystProfileClubView
      handle={cleanHandle}
      memberProfile={result.profile && follow ? { ...result.profile, ...follow } : result.profile}
      publicRecord={publicRecord}
      badges={badges}
      xEnabled={Boolean(twitterCredentials())}
      avatarEnabled={isAvatarStorageEnabled()}
      xLinkError={query.x === "error"}
    />
  );
}
