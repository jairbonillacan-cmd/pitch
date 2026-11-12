"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ClubLoadingView } from "@pitchlab/ui";

/** Carga entre páginas del club: la barra lateral y el encabezado no se mueven. */
export default function Loading(): React.JSX.Element {
  const pathname = usePathname() ?? "/app";
  return <ClubLoadingView activePath={pathname} />;
}
