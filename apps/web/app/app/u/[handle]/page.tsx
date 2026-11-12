import React from "react";
import { notFound } from "next/navigation";
import { AnalystProfileClubView } from "@pitchlab/ui";
import { normalizeClubHandle } from "../../../../src/profile-path";
import { isAvatarStorageEnabled } from "../../../../src/server/avatar-storage";
import { loadClubProfile } from "../../../../src/server/club-profile";
import { twitterCredentials } from "../../../../src/server/twitter";
import { loadFollowInfo } from "../../../../src/server/social";
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
  const follow = result.profile ? await loadFollowInfo(result.profile.handle) : null;
  return (
    <AnalystProfileClubView
      handle={cleanHandle}
      memberProfile={result.profile && follow ? { ...result.profile, ...follow } : result.profile}
      xEnabled={Boolean(twitterCredentials())}
      avatarEnabled={isAvatarStorageEnabled()}
      xLinkError={query.x === "error"}
    />
  );
}
