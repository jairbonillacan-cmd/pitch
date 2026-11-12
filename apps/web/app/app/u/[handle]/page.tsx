import React from "react";
import { AnalystProfileClubView } from "@pitchlab/ui";

export default async function ClubAnalystProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<React.JSX.Element> {
  const { handle } = await params;
  return <AnalystProfileClubView handle={handle} />;
}
