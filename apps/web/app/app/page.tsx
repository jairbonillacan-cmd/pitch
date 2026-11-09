import React from "react";
import type { Viewport } from "next";
import { AppHome } from "@pitchlab/ui/app";
import { loadAppHome } from "../../src/server/app-home.js";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { viewportFit: "cover" };

export default function AppIndexPage(): React.JSX.Element {
  return <AppHome data={loadAppHome()} />;
}
