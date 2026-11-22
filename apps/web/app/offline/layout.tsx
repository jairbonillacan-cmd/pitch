import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sin conexión · PitchLab",
  robots: { index: false, follow: false },
};

export default function OfflineLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
