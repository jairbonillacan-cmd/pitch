import "../../community-v2.css";
import "../../community-social.css";
import React from "react";
import type { Metadata } from "next";
import { SocialVipClubView } from "@pitchlab/ui/social";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function ClubSocialPage(): React.JSX.Element {
  return <SocialVipClubView />;
}
