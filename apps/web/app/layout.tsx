import React from "react";
import type { Metadata } from "next";
import { DashboardEntryProvider } from "../src/client/dashboard-entry.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "PitchLab — Spacetime Suite v3.0 · Picks y Radiografía Deportiva",
  description:
    "Radiografía pre-partido con IA, 4 a 5 picks estructurados por encuentro, Armador de Parlays & SGP y Comunidad VIP auditada.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  icons: {
    icon: { url: "/brand/app-icons/favicon.svg", type: "image/svg+xml" },
  },
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("pl-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="es-MX" data-theme="dark" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/InterVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <DashboardEntryProvider>{children}</DashboardEntryProvider>
      </body>
    </html>
  );
}
