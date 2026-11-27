import React from "react";
import type { Metadata, Viewport } from "next";
import { DashboardEntryProvider } from "../src/client/dashboard-entry";
import { PwaRuntimeMount } from "../src/client/pwa-runtime";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR, THEME_INIT_SCRIPT } from "../src/theme-init-script";
import "./globals.css";
import "./public-mobile-nav.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx"),
  title: "PitchLab · Probabilidades deportivas, momio justo y parlays",
  description:
    "Probabilidad estimada antes del partido, hasta 5 picks por encuentro, armador de parlays sin contradicciones y récord verificado.",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    title: "PitchLab · Probabilidades deportivas, momio justo y parlays",
    description:
      "Probabilidad estimada antes del partido, hasta 5 picks por encuentro, armador de parlays sin contradicciones y récord verificado.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PitchLab · Probabilidades deportivas, momio justo y parlays",
    description:
      "Probabilidad estimada antes del partido, hasta 5 picks por encuentro, armador de parlays sin contradicciones y récord verificado.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PitchLab",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/brand/app-icons/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/app-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/app-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/app-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="es-MX" data-theme="dark" data-style="solid" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content={DARK_THEME_COLOR} suppressHydrationWarning />
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
        <PwaRuntimeMount />
        <DashboardEntryProvider>{children}</DashboardEntryProvider>
      </body>
    </html>
  );
}
