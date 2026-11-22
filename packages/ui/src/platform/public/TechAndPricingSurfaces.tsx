"use client";

import React, { useState } from "react";
import {
  Button,
  SofascoreCard,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  AtmosphereStage,
  PublicFooterV4,
  PublicHeaderV4,
} from "../components/ShellChrome";
import { sanitizeInternalHref } from "../navigation-helpers";
import {
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  CORTEX_SAMPLE_QUOTE,
  MEMBERSHIP_SPEC,
  PRECISION_BUCKETS,
  SPACETIME_ENGINES,
  SPACETIME_METRICS_HEADLINE,
  SPACETIME_VS_TIPSTER_ROWS,
} from "../spacetime-catalog";
import type {
  PrecisionBucket,
  SpacetimeEngineSpec,
  SpacetimeVsTipsterRow,
} from "../types";

export { PublicSharedPickSurface as PublicTipsterPickSurface } from "./AuthAndOnboardingSurfaces";

const ENGINE_COLUMNS: readonly SofascoreTableColumn<SpacetimeEngineSpec>[] = [
  {
    key: "engine",
    header: "Motor",
    sticky: true,
    render: (eng) => (
      <div className="pl-ed-engine-cell">
        <span aria-hidden="true" className="pl-ed-engine-mono num">
          {eng.mono}
        </span>
        <div className="pl-ed-engine-meta">
          <span className="pl-ed-engine-name">
            {eng.shortName} <span className="pl-ed-engine-sub num">{eng.version}</span>
          </span>
          <span className="pl-ed-engine-sub">{eng.pillar}</span>
          <span className="pl-ed-engine-sub num">{eng.domain}</span>
        </div>
      </div>
    ),
  },
  {
    key: "summary",
    header: "Qué analiza",
    render: (eng) => (
      <div>
        <p className="pl-ed-engine-reads">{eng.summary}</p>
        <p className="pl-ed-engine-cadence num">{eng.retrainCadence}</p>
      </div>
    ),
  },
  {
    key: "proof",
    header: "Evidencia fuera de muestra",
    numeric: true,
    align: "end",
    render: (eng) => (
      <div className="pl-ed-proof-cell">
        <span className={`pl-ed-proof-fig num${eng.proofTone === "ok" ? " is-ok" : ""}`}>
          {eng.proofFigure}
        </span>
        <span className="pl-ed-proof-ctx num">{eng.inputsLabel}</span>
      </div>
    ),
  },
];

const PRECISION_COLUMNS: readonly SofascoreTableColumn<PrecisionBucket>[] = [
  {
    key: "band",
    header: "Banda",
    sticky: true,
    render: (bucket) => (
      <div className="pl-ed-pick-cell">
        <span className="pl-ed-pick-label">{bucket.label}</span>
        <span className="pl-ed-pick-meta">{bucket.rangeLabel}</span>
      </div>
    ),
  },
  {
    key: "promised",
    header: "Prob. anunciada",
    numeric: true,
    align: "end",
    render: (bucket) => (
      <div style={{ minInlineSize: 120 }}>
        <strong className="num">{(bucket.promisedMeanP * 100).toFixed(1)} %</strong>
        <div className="pl-ed-flat-track" style={{ marginTop: 6 }} aria-hidden="true">
          <span
            className="pl-ed-flat-fill"
            style={{ width: `${Math.round(bucket.promisedMeanP * 100)}%` }}
          />
        </div>
      </div>
    ),
  },
  {
    key: "actual",
    header: "Real auditado",
    numeric: true,
    align: "end",
    render: (bucket) =>
      bucket.actualHitRate !== null ? (
        <div style={{ minInlineSize: 120 }}>
          <strong className="num" style={{ color: "var(--pl-success)" }}>
            {(bucket.actualHitRate * 100).toFixed(1)} %
          </strong>
          <div className="pl-ed-flat-track" style={{ marginTop: 6 }} aria-hidden="true">
            <span
              className="pl-ed-flat-fill pl-ed-flat-fill--actual"
              style={{ width: `${Math.round(bucket.actualHitRate * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <span className="pl-ed-muted">Se publica con picks auditados</span>
      ),
  },
  {
    key: "sample",
    header: "Muestra",
    numeric: true,
    align: "end",
    render: (bucket) => (
      <span className="num pl-ed-muted">
        {bucket.auditedPicksCount === null
          ? "Auditoría en curso"
          : `${bucket.auditedPicksCount.toLocaleString("es-MX")} auditados`}
      </span>
    ),
  },
];

const VS_TIPSTER_COLUMNS: readonly SofascoreTableColumn<SpacetimeVsTipsterRow>[] = [
  {
    key: "criterion",
    header: "Criterio",
    sticky: true,
    render: (row) => row.criterion,
  },
  {
    key: "pitchlab",
    header: "PitchLab",
    render: (row) => <strong className="num">{row.pitchlab}</strong>,
  },
  {
    key: "tipster",
    header: "Tipster típico",
    render: (row) => <span className="pl-ed-muted">{row.tipster}</span>,
  },
];

export function TechPrecisionSection({
  inClub = false,
  isStandalone = false,
}: {
  inClub?: boolean;
  isStandalone?: boolean;
}): React.JSX.Element {
  const { viewerRole, upgradeHref } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const hasFullAccess = viewerRole !== "visitor";
  const isPrimaryHeading = isStandalone || inClub;
  const PrimaryHeadingTag = isPrimaryHeading ? "h1" : "h2";

  const kpiItems: SofascoreKpiItem[] = [
    {
      id: "matches",
      label: "Partidos históricos en los motores",
      value: SPACETIME_METRICS_HEADLINE.historicalMatches,
      delta: `${SPACETIME_METRICS_HEADLINE.holdoutTestMatches} prueba`,
      tone: "brand",
    },
    {
      id: "telemetry",
      label: "Registros normalizados",
      value: SPACETIME_METRICS_HEADLINE.telemetryPoints,
      delta: `${SPACETIME_METRICS_HEADLINE.variablesPerMatch} variables`,
    },
    {
      id: "clv",
      label: "Ventaja CLV fuera de muestra",
      value: SPACETIME_METRICS_HEADLINE.closingLineBeatPct,
      delta: "Temporada 2024–25",
      tone: "positive",
    },
    {
      id: "ece",
      label: "Error de calibración",
      value: SPACETIME_METRICS_HEADLINE.calibrationError,
      delta: "5 modelos propios",
      tone: "positive",
    },
  ];

  const primaryHref = hasFullAccess ? (inClub ? "/app" : "/app/parlays") : upgradeHref;
  const primaryLabel = hasFullAccess
    ? inClub
      ? "Volver a partidos de hoy"
      : "Armar un parlay"
    : "Activar Pase PitchLab Ultra";

  return (
    <section id="motores" className="pl-ed-stack" data-tech-precision-section="">
      <SofascoreCard>
        <div className="pl-ed-stack">
          <div className="pl-ed-head-row">
            <div className="pl-ed-head-copy">
              <p className="pl-ed-eyebrow">Cómo calculamos</p>
              <PrimaryHeadingTag className={isPrimaryHeading ? "pl-ed-title" : "pl-ed-h2"}>
                Modelos probados con partidos que no vieron al entrenar.
              </PrimaryHeadingTag>
              <p className="pl-ed-lede">
                Cada versión se evalúa con{" "}
                <strong className="num">
                  {SPACETIME_METRICS_HEADLINE.historicalMatches} partidos
                </strong>{" "}
                históricos y{" "}
                <strong className="num">
                  {SPACETIME_METRICS_HEADLINE.holdoutTestMatches} partidos
                </strong>{" "}
                fuera de muestra antes de publicarse, sin datos posteriores al silbatazo.
              </p>
            </div>
            <span className="pl-ed-badge pl-ed-badge--ok">
              <span className="pl-ed-badge-dot" aria-hidden="true" />
              <span>Validación fuera de muestra · 2024–25</span>
            </span>
          </div>

          <SofascoreKpiStrip items={kpiItems} className="pl-ed-kpi-4" />

          <div className="pl-ed-actions">
            <Button
              variant="primary"
              onClick={() => navigateTo(primaryHref)}
            >
              <span>{primaryLabel}</span>
              <MaestroIcon name="arrowRight" size={15} />
            </Button>
            <a href="/resultados" className="pl-ed-link-btn">
              Ver resultados FT
            </a>
            <a href="/verificacion" className="pl-ed-link-btn">
              Verificar recibo SHA-256
            </a>
          </div>
        </div>
      </SofascoreCard>

      <div className="pl-ed-table-stack">
        <SofascoreCard
          title="Cinco motores propietarios de PitchLab"
          meta="Sin datos posteriores al partido"
        >
          <SofascoreTable
            caption="Motores estadísticos de PitchLab, alcance y evidencia fuera de muestra"
            columns={ENGINE_COLUMNS}
            rows={SPACETIME_ENGINES}
            rowKey={(eng) => eng.key}
          />
        </SofascoreCard>
      </div>

      <div className="pl-ed-table-stack">
        <SofascoreCard
          title="Probabilidad anunciada contra resultado real"
          meta="Bandas de calibración públicas"
        >
          <div className="pl-ed-stack">
            <p className="pl-ed-subcopy">
              Si decimos 70 %, esos picks deberían cumplirse cerca de 7 de cada 10 veces. Aquí
              publicamos la banda de referencia y su seguimiento auditado.
            </p>
            <SofascoreTable
              caption="Bandas de calibración anunciada contra resultado auditado"
              columns={PRECISION_COLUMNS}
              rows={PRECISION_BUCKETS}
              rowKey={(bucket) => bucket.id}
            />
          </div>
        </SofascoreCard>
      </div>

      <div className="pl-ed-split">
        <div className="pl-ed-table-stack">
          <SofascoreCard title="PitchLab contra un tipster típico" meta="Comparativa directa">
            <SofascoreTable
              caption="Comparativa estructural entre PitchLab y un tipster típico"
              columns={VS_TIPSTER_COLUMNS}
              rows={SPACETIME_VS_TIPSTER_ROWS}
              rowKey={(row) => row.criterion}
            />
          </SofascoreCard>
        </div>

        <SofascoreCard title="Cortex IA lo explica en claro" meta="Trazabilidad total">
          <div className="pl-ed-stack">
            <blockquote className="pl-ed-quote">{CORTEX_SAMPLE_QUOTE}</blockquote>
            <p className="pl-ed-subcopy">
              Cortex IA solo resume lo que producen Tachyon, Singularity, Minkowski y Geodesic. Si
              falta una alineación o un dato relevante, lo advierte antes del partido.
            </p>
            <p className="pl-ed-muted">
              Contenido estrictamente analítico para mayores de 18 años en México. No aceptamos
              apuestas ni garantizamos resultados futuros.
            </p>
          </div>
        </SofascoreCard>
      </div>
    </section>
  );
}

const BILLING_TABS: readonly SofascoreTabItem[] = [
  { id: "monthly", label: `Mensual · $${MEMBERSHIP_SPEC.monthlyMxn}` },
  {
    id: "annual",
    label: `Anual · $${MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")} (Ahorras 4 meses)`,
  },
];

export function PlansAndReferralsSection({
  isStandalone = false,
}: {
  isStandalone?: boolean;
}): React.JSX.Element {
  const { month1NoCardMode, accountsEnabled, hasAccountSession, paymentMode, upgradeHref } =
    usePlatformCore();
  const { navigateTo, pushToast } = usePlatformActions();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [checkoutBusy, setCheckoutBusy] = useState<boolean>(false);

  const handleSubscribe = async (): Promise<void> => {
    const planTarget = `/app/account?tab=plan&plan=${billing}#transfer`;
    if (paymentMode === "transfer") {
      if (hasAccountSession) {
        navigateTo(planTarget);
      } else if (month1NoCardMode) {
        navigateTo("/signup");
      } else {
        navigateTo(`/signup?next=${encodeURIComponent(planTarget)}`);
      }
      return;
    }
    if (!accountsEnabled || month1NoCardMode) {
      navigateTo(hasAccountSession ? upgradeHref : "/signup");
      return;
    }
    setCheckoutBusy(true);
    const result = await startCheckout(billing);
    setCheckoutBusy(false);
    const safeCheckoutUrl = (() => {
      const internal = sanitizeInternalHref(result.url);
      if (internal) return internal;
      if (typeof result.url !== "string") return null;
      const trimmed = result.url.trim();
      if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
      try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          !(host === "checkout.stripe.com" || host === "billing.stripe.com" || host.endsWith(".stripe.com"))
        ) {
          return null;
        }
        return parsed.toString();
      } catch (err) {
        void err;
        return null;
      }
    })();
    if (safeCheckoutUrl) {
      window.location.assign(safeCheckoutUrl);
    } else if (result.status === 401) {
      navigateTo("/login?next=%2Fapp%2Faccount%3Ftab%3Dplan");
    } else {
      pushToast(result.error ?? "No se pudo abrir el pago.", "warning");
    }
  };

  const isAnnual = billing === "annual";
  const HeadingTag = isStandalone ? "h1" : "h2";

  const checklistItems = [
    "Hasta 5 picks por partido (Conservador, Medio, Arriesgado y Totales)",
    "Armador de parlays de 2 a 6 selecciones, también del mismo partido",
    "Todos los picks y mercados, con resumen previo y bajas reportadas",
    "Comparador de momios y comunidad de socios",
  ];

  return (
    <section id="pase-total" className="pl-ed-stack">
      <div className="pl-ed-head-row">
        <div className="pl-ed-head-copy">
          <HeadingTag className={isStandalone ? "pl-ed-title" : "pl-ed-h2"}>
            Un solo plan: Pase PitchLab Ultra.
          </HeadingTag>
          <p className="pl-ed-subcopy">
            Menos de $10 pesos al día por todos los picks, parlays sin límite y la comunidad.
            {paymentMode === "transfer"
              ? " Precios con IVA incluido · activación por transferencia SPEI o cupón en Beta 1.0."
              : " Incluye IVA y factura CFDI."}
          </p>
        </div>

        <SofascoreTabs
          items={BILLING_TABS}
          value={billing}
          onChange={(next) => setBilling(next === "annual" ? "annual" : "monthly")}
          variant="segmented"
          ariaLabel="Periodicidad de facturación"
        />
      </div>

      <div className="pl-ed-pricing-grid">
        <SofascoreCard
          title={MEMBERSHIP_SPEC.name}
          meta={month1NoCardMode ? "7 días gratis, sin tarjeta" : "7 días gratis"}
        >
          <div className="pl-ed-stack">
            <div className="num" style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>$</span>
              <span style={{ fontSize: "2.75rem", fontWeight: 800, lineHeight: 1 }}>
                {isAnnual
                  ? MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")
                  : MEMBERSHIP_SPEC.monthlyMxn}
              </span>
              <span className="pl-ed-muted">
                MXN /{" "}
                {isAnnual
                  ? `año (equivale a $${MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn}/mes)`
                  : "mes · cancela cuando quieras"}
              </span>
            </div>

            <ul className="pl-ed-checklist">
              {checklistItems.map((item) => (
                <li key={item}>
                  <MaestroIcon
                    name="check"
                    size={15}
                    style={{ color: "var(--pl-success)", marginTop: 3, flexShrink: 0 }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="pl-ed-actions">
              <Button
                variant="primary"
                disabled={checkoutBusy}
                aria-busy={checkoutBusy}
                onClick={() => void handleSubscribe()}
              >
                <span>
                  {month1NoCardMode
                    ? "Empezar prueba gratis"
                    : "Suscribirme al Pase PitchLab Ultra"}
                </span>
                <MaestroIcon name="arrowRight" size={15} />
              </Button>
              <Button variant="secondary" onClick={() => navigateTo("/onboarding")}>
                Elegir mis ligas
              </Button>
            </div>
          </div>
        </SofascoreCard>

        <SofascoreCard title="Invita a un amigo y los dos suman días" meta="Referidos Doble Vía">
          <div className="pl-ed-stack">
            <ol className="pl-ver-steps">
              <li className="pl-ver-step">
                <span className="pl-ver-step-num num" aria-hidden="true">
                  1
                </span>
                <span className="pl-ed-subcopy">
                  Tu amigo recibe{" "}
                  <strong>7 días de Pase PitchLab Ultra gratis + 30 % de descuento</strong> en su
                  1.er mes ($209 MXN).
                </span>
              </li>
              <li className="pl-ver-step">
                <span className="pl-ver-step-num num" aria-hidden="true">
                  2
                </span>
                <span className="pl-ed-subcopy">
                  En cuanto paga su primer mes,{" "}
                  <strong>ambos suman +7 días gratis</strong> acumulados automáticamente.
                </span>
              </li>
              <li className="pl-ver-step">
                <span className="pl-ver-step-num num" aria-hidden="true">
                  3
                </span>
                <span className="pl-ed-subcopy">
                  Al llegar a 5 amigos activos sumas <strong>+1 mes completo extra</strong> e
                  insignia Embajador.
                </span>
              </li>
            </ol>

            <p className="pl-ed-muted">
              <strong style={{ color: "var(--pl-text)" }}>¿Eres creador o tipster?</strong> Aplica
              como <strong>Tipster Oficial</strong>: obtén Pase PitchLab Ultra incluido, 1 Pick
              Gratis semanal y <strong>25 % de comisión recurrente</strong>.
            </p>

            <Button variant="secondary" onClick={() => navigateTo("/signup")}>
              <MaestroIcon name="trophy" size={15} />
              <span>Solicitar perfil Tipster Oficial</span>
            </Button>
          </div>
        </SofascoreCard>
      </div>
    </section>
  );
}

export function TechPrecisionSurface(): React.JSX.Element {
  return (
    <AtmosphereStage activePath="/motores">
      <PublicHeaderV4 activePath="/motores" />
      <main
        id="main"
        className="pl-page-enter max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-12 space-y-10"
      >
        <TechPrecisionSection isStandalone />
        <PlansAndReferralsSection />
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

export function PricingSurface(): React.JSX.Element {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "¿Por qué solo existe un Pase PitchLab Ultra?",
      a: "Eliminamos escalones artificiales. Con una sola suscripción ($299 MXN/mes o $2,390 MXN/año) tienes acceso a todos los picks de cada partido (hasta 5), el resumen previo de cada partido, el armador de parlays y la comunidad.",
    },
    {
      q: "¿Cómo funciona la prueba gratis?",
      a: "Te registras con Google o tu correo y tienes 7 días gratis. Durante el lanzamiento no pedimos tarjeta. Hay una prueba por persona.",
    },
    {
      q: "¿Cómo sumamos días gratis mi amigo y yo con los referidos?",
      a: "Tu invitado recibe 7 días gratis + 30 % de descuento en su primer mes ($209 MXN). En cuanto completa el pago de su primer mes, el sistema abona automáticamente +7 días gratis tanto a tu cuenta como a la suya.",
    },
    {
      q: "¿Emiten factura fiscal mexicana CFDI 4.0?",
      a: "Sí, todos los precios incluyen IVA. Durante Beta 1.0 puedes solicitar tu CFDI 4.0 enviando tus datos fiscales a soporte@pitchlab.mx.",
    },
  ];

  return (
    <AtmosphereStage activePath="/precio">
      <PublicHeaderV4 activePath="/precio" />
      <main
        id="main"
        className="pl-page-enter max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-12 space-y-10"
      >
        <PlansAndReferralsSection isStandalone />
        <TechPrecisionSection />

        <SofascoreCard title="Preguntas frecuentes">
          <div className="pl-ed-stack">
            {faqs.map((f, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={f.q} className="pl-ed-faq-item">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="pl-ed-faq-btn"
                  >
                    <span>{f.q}</span>
                    <MaestroIcon name={isOpen ? "minus" : "plus"} size={15} />
                  </button>
                  {isOpen ? <p className="pl-ed-faq-body">{f.a}</p> : null}
                </div>
              );
            })}
          </div>
        </SofascoreCard>
      </main>
      <PublicFooterV4 />
    </AtmosphereStage>
  );
}

async function startCheckout(
  interval: "monthly" | "annual",
): Promise<{ url?: string; status: number; error?: string }> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    return { url: json.url, status: res.status, error: json.error };
  } catch (err) {
    void err;
    return { status: 0, error: "Sin conexión" };
  }
}
