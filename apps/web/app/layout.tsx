import React from "react";
import type { Metadata } from "next";
import { DashboardEntryProvider } from "../src/client/dashboard-entry";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx"),
  title: "PitchLab · Probabilidades deportivas, momio justo y parlays",
  description:
    "Probabilidad estimada antes del partido, hasta 5 picks por encuentro, armador de parlays sin contradicciones y bitácora verificada.",
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
