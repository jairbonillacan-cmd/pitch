import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui";
import { hasPublicSessionCookie } from "../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preferencias de avisos y baja · PitchLab",
  description: "Administra qué avisos por correo deseas recibir de tu cuenta de PitchLab.",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePreferencesPage(): Promise<React.JSX.Element> {
  const hasSession = await hasPublicSessionCookie();

  return (
    <PublicSiteShell hasSession={hasSession}>
      <section className="pl-lp-section">
        <div
          className="pl-lp-wrap"
          style={{
            maxWidth: 640,
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div className="pl-lp-card glass-lens glass-ring" style={{ padding: "32px 28px" }}>
            <p className="pl-lp-eyebrow">Preferencias de correo</p>
            <h1 className="pl-lp-h2" style={{ marginTop: 8 }}>
              Administra tus avisos de PitchLab
            </h1>
            <p
              style={{
                marginTop: 14,
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--pl-text-secondary)",
              }}
            >
              Desde las preferencias de tu cuenta puedes activar o desactivar con un clic los
              avisos de picks calificados y resúmenes por correo, sin afectar tu acceso ni tu
              bitácora.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
              <a
                href="/app/account?tab=prefs"
                className="pl-prof-btn pl-prof-btn--primary"
              >
                Ir a mis preferencias de avisos
              </a>
              <a
                href="mailto:soporte@pitchlab.mx?subject=Baja%20de%20avisos%20por%20correo"
                className="pl-prof-btn pl-prof-btn--ghost"
              >
                Solicitar baja por soporte
              </a>
            </div>
            <p
              className="pl-lp-fine"
              style={{ marginTop: 18, color: "var(--pl-text-muted)" }}
            >
              Los correos transaccionales esenciales (como enlaces de acceso o comprobantes de
              pago) solo se envían cuando tú realizas esa acción.
            </p>
          </div>
        </div>
      </section>
    </PublicSiteShell>
  );
}
