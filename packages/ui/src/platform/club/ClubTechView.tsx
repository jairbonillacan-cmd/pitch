"use client";

import React from "react";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { TechPrecisionSection } from "../public/TechAndPricingSurfaces";

export function ClubTechView(): React.JSX.Element {
  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tech">
        <TechPrecisionSection inClub />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
