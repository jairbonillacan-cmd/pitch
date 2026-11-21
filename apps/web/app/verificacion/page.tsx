import "../editorial-verificacion.css";
import React from "react";
import type { Metadata } from "next";
import { ClosingCtaSection, PublicSiteShell } from "@pitchlab/ui/public-sections";
import { VerificationSurface } from "@pitchlab/ui/verificacion";
import { JsonLd } from "../../src/server/json-ld";
import { getSiteUrl } from "../../src/server/site-url";

export const revalidate = 3600;

const TITLE = "Verificación SHA-256 · PitchLab";
const DESCRIPTION =
  "Comprueba localmente en tu navegador la huella criptográfica SHA-256 de cualquier recibo registrado antes del partido, sin enviar datos a ningún servidor.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/verificacion" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "PitchLab",
    url: "/verificacion",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function VerificacionPage(): React.JSX.Element {
  const siteUrl = getSiteUrl();
  const jsonLdNodes: ReadonlyArray<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Resultados", item: `${siteUrl}/resultados` },
        { "@type": "ListItem", position: 3, name: "Verificación", item: `${siteUrl}/verificacion` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Verificador SHA-256 de recibos · PitchLab",
      url: `${siteUrl}/verificacion`,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      description: DESCRIPTION,
    },
  ];

  return (
    <>
      <JsonLd data={jsonLdNodes} />
      <PublicSiteShell activePath="/resultados">
        <section className="pl-lp-section pl-lp-section--top">
          <div className="pl-lp-wrap pl-ed-stack">
            <div className="pl-ed-page-head">
              <div className="pl-ed-head-row">
                <div className="pl-ed-head-copy">
                  <p className="pl-ed-eyebrow">Auditoría criptográfica</p>
                  <h1 className="pl-ed-title">
                    Comprueba un recibo SHA-256 directamente en tu navegador.
                  </h1>
                  <p className="pl-ed-lede">
                    Pega un recibo JSON o captura sus campos para recalcular su huella SHA-256 con
                    WebCrypto. Todo corre 100 % en tu dispositivo, sin enviar información a ningún
                    servidor.
                  </p>
                </div>
                <div className="pl-ed-actions">
                  <a className="pl-ed-link-btn" href="/resultados">
                    ← Volver a resultados
                  </a>
                </div>
              </div>
            </div>

            <VerificationSurface />
          </div>
        </section>

        <ClosingCtaSection />
      </PublicSiteShell>
    </>
  );
}
