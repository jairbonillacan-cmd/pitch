import "../community-v2.css";
import React from "react";
import type { Metadata } from "next";
import { PublicSiteShell } from "@pitchlab/ui/public-sections";
import { hasPublicSessionCookie } from "../../src/server/public-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preferencias de avisos y baja · PitchLab",
  description:
    "Administra qué avisos por correo deseas recibir de tu cuenta de PitchLab o solicita la revocación de envíos opcionales.",
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
            maxWidth: 680,
            marginInline: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div className="pl-lp-card glass-lens glass-ring" style={{ padding: "32px 28px" }}>
            <p className="pl-lp-eyebrow">Preferencias de correo y privacidad</p>
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
              Desde las preferencias de tu cuenta (<code>/app/account?tab=prefs</code>) puedes
              activar o desactivar con un clic cada categoría de alerta sin afectar tu vigencia ni
              tu bitácora:
            </p>
            <ul
              style={{
                marginTop: 12,
                paddingLeft: 20,
                fontSize: 14,
                lineHeight: 1.65,
                color: "var(--pl-text-secondary)",
                display: "grid",
                gap: 6,
              }}
            >
              <li>
                <strong>Alertas configurables:</strong> alertas de valor, recordatorio 30 minutos
                antes del partido, resultado de tus picks liquidados y aviso previo de renovación.
              </li>
              <li>
                <strong>Descanso y Comunidad:</strong> puedes activar <em>Pausar Comunidad</em> o un
                descanso voluntario de 24 horas, 7 días o 30 días.
              </li>
              <li>
                <strong>Novedades opcionales y derechos ARCO:</strong> para revocar el envío de
                novedades opcionales (<code>marketingConsent</code>), la analítica anónima (
                <code>analyticsConsent</code>) o ejercer tus derechos ARCO conforme a la LFPDPPP,
                escríbenos desde tu correo registrado a{" "}
                <a href="mailto:soporte@pitchlab.mx">soporte@pitchlab.mx</a>.
              </li>
            </ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
              <a href="/app/account?tab=prefs" className="pl-prof-btn pl-prof-btn--primary">
                Ir a mis preferencias de avisos
              </a>
              <a
                href="mailto:soporte@pitchlab.mx?subject=Baja%20de%20avisos%20por%20correo"
                className="pl-prof-btn pl-prof-btn--ghost"
              >
                Solicitar baja por soporte
              </a>
            </div>
            <p className="pl-lp-fine" style={{ marginTop: 18, color: "var(--pl-text-muted)" }}>
              Los correos transaccionales indispensables —enlaces de acceso desde{" "}
              <code>acceso@pitchlab.mx</code>, entrega de cupones SPEI y comprobantes desde{" "}
              <code>noreply@pitchlab.mx</code>, o respuestas de seguridad y derechos ARCO— solo se
              envían cuando tú solicitas o realizas esa operación. Consulta más detalles en el{" "}
              <a href="/legal/privacidad">Aviso de privacidad</a>.
            </p>
          </div>
        </div>
      </section>
    </PublicSiteShell>
  );
}
