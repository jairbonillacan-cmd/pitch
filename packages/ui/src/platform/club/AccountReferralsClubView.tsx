"use client";

import React, { useState } from "react";
import { Switch } from "@heroui/react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import { getSessionWatermark } from "../access-guard";
import { BrandLogo } from "../../primitives";
import { LensGlowOrbs, MaestroIcon, UltraTag } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { MEMBERSHIP_SPEC } from "../spacetime-catalog";
import type { RiskBand } from "../types";

const REFERRAL_CODE = "SOCIO-8842";
const REFERRAL_PATH = `/pricing/referral?sku=ultra&interval=MONTHLY&code=${REFERRAL_CODE}#subscribe`;
const REFERRAL_URL = `https://pitchlab.mx${REFERRAL_PATH}`;

const SAT_REGIMENS = [
  "601 · General de Ley Personas Morales",
  "612 · Personas Físicas con Actividades Empresariales",
  "626 · Régimen Simplificado de Confianza (RESICO)",
  "605 · Sueldos y Salarios",
] as const;

export function AccountReferralsClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    referralPaidFriends,
    simulateFriendFirstPayment,
    accountsEnabled,
    allowRoleSimulation,
    month1NoCardMode,
    favoriteLeagues,
    setFavoriteLeagues,
    riskPreference,
    setRiskPreference,
    pushToast,
    navigateTo,
  } = usePlatform();

  // "referrals" es la pestaña activa por defecto para que [data-referrals-card],
  // [data-referral-friends], [data-referral-days] y [data-simulate-referral] estén montados y visibles de inmediato.
  const [accountTab, setAccountTab] = useState<
    "referrals" | "plan" | "prefs" | "cfdi"
  >("referrals");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [baseUnitMxn, setBaseUnitMxn] = useState<100 | 250 | 500 | 1000>(250);
  const [socialPause, setSocialPause] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  const [rfc, setRfc] = useState<string>("XAXX010101000");
  const [razonSocial, setRazonSocial] = useState<string>("SOCIO PITCHLAB SA DE CV");
  const [cpFiscal, setCpFiscal] = useState<string>("06600");
  const [regimenSat, setRegimenSat] = useState<string>(SAT_REGIMENS[2]);

  const earnedDays =
    referralPaidFriends * MEMBERSHIP_SPEC.referralBothRewardDays +
    (referralPaidFriends >= MEMBERSHIP_SPEC.referralAmbassadorThreshold
      ? MEMBERSHIP_SPEC.referralAmbassadorBonusDays
      : 0);
  const isAmbassador =
    referralPaidFriends >= MEMBERSHIP_SPEC.referralAmbassadorThreshold;
  const ambassadorPct = Math.min(
    100,
    Math.round(
      (referralPaidFriends / MEMBERSHIP_SPEC.referralAmbassadorThreshold) * 100,
    ),
  );

  const watermark = getSessionWatermark(viewerRole);

  const toggleFavLeague = (lid: LeagueId) => {
    const exists = favoriteLeagues.includes(lid);
    if (exists && favoriteLeagues.length <= 1) {
      pushToast("Conserva al menos 1 liga prioritaria activa.", "warning");
      return;
    }
    const next = exists
      ? favoriteLeagues.filter((x) => x !== lid)
      : [...favoriteLeagues, lid];
    setFavoriteLeagues(next);
  };

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/account">
        {/* Cabecera de Cuenta + 4-tab .seg-well */}
        <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <span
                className="w-12 h-12 rounded-full avatar-ring inline-flex items-center justify-center text-sm font-extrabold shrink-0"
                style={{
                  background: "var(--avatar-grad-4)",
                  color: "var(--share-card-fg)",
                }}
              >
                SP
              </span>
              <div>
                <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
                  Mi cuenta <UltraTag />
                </h1>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  @socio_pl · {MEMBERSHIP_SPEC.name}
                </p>
              </div>
            </div>

            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/");
              }}
              className="pl-btn-glass text-xs"
            >
              <span>Ver portada pública</span>
              <MaestroIcon name="arrowRight" size={13} />
            </a>
          </div>

          <div
            className="seg-well"
            role="tablist"
            aria-label="Secciones de mi cuenta"
          >
            <button
              id="acct-tab-referrals"
              type="button"
              role="tab"
              aria-selected={accountTab === "referrals"}
              className="seg-btn"
              onClick={() => setAccountTab("referrals")}
            >
              <MaestroIcon name="gift" size={14} />
              <span>Invitar amigos</span>
            </button>
            <button
              id="acct-tab-plan"
              type="button"
              role="tab"
              aria-selected={accountTab === "plan"}
              className="seg-btn"
              onClick={() => setAccountTab("plan")}
            >
              <MaestroIcon name="crown" size={14} />
              <span>Pase PitchLab Ultra</span>
            </button>
            <button
              id="acct-tab-prefs"
              type="button"
              role="tab"
              aria-selected={accountTab === "prefs"}
              className="seg-btn"
              onClick={() => setAccountTab("prefs")}
            >
              <MaestroIcon name="sliders" size={14} />
              <span>Preferencias</span>
            </button>
            <button
              id="acct-tab-cfdi"
              type="button"
              role="tab"
              aria-selected={accountTab === "cfdi"}
              className="seg-btn"
              onClick={() => setAccountTab("cfdi")}
            >
              <MaestroIcon name="shield" size={14} />
              <span>Facturación</span>
            </button>
          </div>
        </section>

        {/* PESTAÑA 1 (DEFAULT): REFERIDOS DOBLE VÍA (+15 DÍAS AMBOS) */}
        {accountTab === "referrals" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-referrals">
            <section
              className="glass-card glass-ring rounded-3xl p-5 sm:p-6"
              data-referrals-card=""
            >
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-6 items-center">
                <div className="space-y-5 min-w-0">
                  <div className="space-y-2">
                    <h2 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                      Regala {MEMBERSHIP_SPEC.referralFriendBenefit.split(" + ")[0]}, gana{" "}
                      {MEMBERSHIP_SPEC.referralBothRewardDays} días
                    </h2>
                    <p className="m-0 text-sm max-w-xl" style={{ color: "var(--pl-text-secondary)" }}>
                      Tu amigo prueba Pase PitchLab Ultra gratis y paga menos su primer mes. Cuando lo
                      pague, los dos reciben {MEMBERSHIP_SPEC.referralBothRewardDays} días gratis.
                    </p>
                  </div>

                  {/* Enlace */}
                  <div className="pl-ref-link">
                    <MaestroIcon name="link" size={16} style={{ color: "var(--pl-text-muted)" }} />
                    <span className="pl-ref-link-url num" title={REFERRAL_URL}>
                      {REFERRAL_URL.replace("https://", "")}
                    </span>
                    <button
                      type="button"
                      className="pl-btn-primary text-xs !min-h-9 !px-4"
                      onClick={() => {
                        try {
                          void navigator.clipboard?.writeText(REFERRAL_URL);
                        } catch (err) {
                          void err;
                        }
                        setLinkCopied(true);
                        window.setTimeout(() => setLinkCopied(false), 2200);
                      }}
                    >
                      <MaestroIcon name={linkCopied ? "check" : "copy"} size={14} />
                      <span>{linkCopied ? "Copiado" : "Copiar"}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      className="pl-btn-glass text-xs !min-h-9"
                      href={`https://wa.me/?text=${encodeURIComponent(`Prueba PitchLab gratis con mi enlace: ${REFERRAL_URL}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MaestroIcon name="message" size={14} />
                      <span>WhatsApp</span>
                    </a>
                    <a
                      className="pl-btn-glass text-xs !min-h-9"
                      href={`https://x.com/intent/post?text=${encodeURIComponent(`Mis picks salen de aquí. Prueba PitchLab gratis: ${REFERRAL_URL}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MaestroIcon name="share" size={14} />
                      <span>Publicar en X</span>
                    </a>
                    <a
                      className="pl-btn-glass text-xs !min-h-9"
                      href={REFERRAL_PATH}
                    >
                      <MaestroIcon name="eye" size={14} />
                      <span>Ver invitación</span>
                    </a>
                    {/* Con cuentas, el conteo es real; simular queda solo como herramienta de preview. */}
                    {!accountsEnabled || allowRoleSimulation ? (
                      <button
                        type="button"
                        className="pl-btn-glass text-xs !min-h-9"
                        data-simulate-referral=""
                        onClick={simulateFriendFirstPayment}
                      >
                        <MaestroIcon name="plus" size={14} />
                        <span>Simular pago de un amigo</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Resultados */}
                  <dl className="pl-profile-stats num">
                    <div>
                      <dt>Amigos que pagaron</dt>
                      <dd data-referral-friends="">{referralPaidFriends} / 5</dd>
                    </div>
                    <div>
                      <dt>Días ganados</dt>
                      <dd style={{ color: "var(--pl-success)" }} data-referral-days="">
                        +{earnedDays} días
                      </dd>
                    </div>
                    <div>
                      <dt>Tu código</dt>
                      <dd className="!text-lg" style={{ color: "var(--pl-brand)" }}>
                        {REFERRAL_CODE}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs num">
                      <span style={{ color: "var(--pl-text-secondary)" }}>
                        {isAmbassador
                          ? "Eres embajador: ganaste un mes extra"
                          : `Con 5 amigos ganas un mes extra · te faltan ${Math.max(0, 5 - referralPaidFriends)}`}
                      </span>
                      <strong style={{ color: "var(--pl-success)" }}>{ambassadorPct} %</strong>
                    </div>
                    <div className="pbar lead" style={{ "--w": `${ambassadorPct}%` } as React.CSSProperties}>
                      <span />
                    </div>
                  </div>
                </div>

                {/* Tarjeta de regalo */}
                <div className="pl-gift-card w-full max-w-sm justify-self-center xl:order-none -order-1" aria-hidden="true">
                  <div className="pl-gift-card-inner">
                    <div className="flex items-center justify-between">
                      <BrandLogo variant="horizontal" width={104} height={20} alt="" />
                      <UltraTag />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                        Invitación para un amigo
                      </span>
                      <strong className="block text-3xl font-extrabold tracking-tight">7 días gratis</strong>
                      <span className="block text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                        y su primer mes con descuento
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                          De parte de
                        </span>
                        <strong className="text-sm">@socio_pl</strong>
                      </div>
                      <span className="pl-gift-card-code num">{REFERRAL_CODE}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {/* PESTAÑA 2: PASE PITCHLAB ULTRA ($299 MENSUAL VS $2,390 ANUAL) */}
        {accountTab === "plan" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-plan">
            <section className="glass-lens glass-ring relative overflow-hidden rounded-3xl p-6 space-y-5">
              <LensGlowOrbs subtle />
              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="pl-pill pl-pill--success">
                      {month1NoCardMode
                        ? "Primer mes gratis, sin tarjeta (activo)"
                        : "Mes 2+ · Verificación bancaria $0 MXN"}
                    </span>
                    <h2 className="m-0 mt-1 text-xl sm:text-2xl font-extrabold">
                      {MEMBERSHIP_SPEC.name}
                    </h2>
                  </div>

                  <div
                    className="seg-well"
                    role="group"
                    aria-label="Ciclo de facturación Pase PitchLab Ultra"
                  >
                    <button
                      type="button"
                      className="seg-btn text-xs"
                      aria-pressed={billingCycle === "monthly"}
                      onClick={() => setBillingCycle("monthly")}
                    >
                      Mensual $299 MXN
                    </button>
                    <button
                      type="button"
                      className="seg-btn text-xs"
                      aria-pressed={billingCycle === "annual"}
                      onClick={() => setBillingCycle("annual")}
                    >
                      Anual $2,390 MXN (Ahorras 4 meses)
                    </button>
                  </div>
                </div>

                <div
                  className="glass-ring rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <div className="space-y-1">
                    <div className="text-2xl sm:text-3xl font-extrabold num">
                      {billingCycle === "monthly" ? (
                        <>
                          ${MEMBERSHIP_SPEC.monthlyMxn} MXN{" "}
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            / mes · IVA incluido
                          </span>
                        </>
                      ) : (
                        <>
                          ${MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")} MXN{" "}
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "var(--pl-success)" }}
                          >
                            / año (${MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn}/mes eq. · -
                            {MEMBERSHIP_SPEC.annualSavingsPct} %)
                          </span>
                        </>
                      )}
                    </div>
                    <p
                      className="m-0 text-xs num"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      Tienes{" "}
                      <strong style={{ color: "var(--pl-success)" }}>
                        +{earnedDays} días gratis acumulados
                      </strong>{" "}
                      antes de tu siguiente corte · {MEMBERSHIP_SPEC.cfdiNote}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="pl-btn-primary text-xs"
                      onClick={() =>
                        pushToast(
                          billingCycle === "annual"
                            ? "Plan actualizado a Pase PitchLab Ultra Anual ($2,390 MXN/año · ahorras 4 meses)."
                            : "Ciclo Mensual ($299 MXN/mes) confirmado.",
                          "success",
                        )
                      }
                    >
                      <MaestroIcon name="check" size={14} />
                      <span>
                        {billingCycle === "annual"
                          ? "Activar Anual ($2,390 MXN)"
                          : "Mantener Mensual ($299 MXN)"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="pl-btn-glass text-xs"
                      onClick={() =>
                        pushToast(
                          "Renovación automática pausada en 1 clic sin penalización.",
                          "default",
                        )
                      }
                    >
                      Cancelar en 1 clic
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    "hasta 5 picks por partido en las 7 ligas activas",
                    "Armador de parlays, también del mismo partido",
                    "Alertas de valor de Geodesic en tus partidos",
                    "Comunidad VIP verificada + Factura CFDI 4.0 automática",
                  ].map((feat) => (
                    <div
                      key={feat}
                      className="rounded-xl p-3 flex items-center gap-2 font-semibold"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <MaestroIcon
                        name="check"
                        size={14}
                        style={{ color: "var(--pl-success)" }}
                      />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {/* PESTAÑA 3: PREFERENCIAS (SIMULADOR UNIDAD BASE + LIGAS + MODO PAUSA SOCIAL) */}
        {accountTab === "prefs" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-prefs">
            <section className="glass-card glass-ring rounded-3xl p-6 space-y-5">
              {/* Simulador de Unidad Base */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-base font-extrabold">
                      Simulador de Equivalencia de Unidad Base (1.0u)
                    </h2>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Referencia personal de gestión de riesgo. PitchLab contabiliza únicamente
                      unidades simuladas (u).
                    </p>
                  </div>

                  <div
                    className="seg-well"
                    role="group"
                    aria-label="Valor simulado de 1 unidad en MXN"
                  >
                    {([100, 250, 500, 1000] as const).map((mxn) => (
                      <button
                        key={mxn}
                        type="button"
                        className="seg-btn text-xs num"
                        aria-pressed={baseUnitMxn === mxn}
                        onClick={() => setBaseUnitMxn(mxn)}
                      >
                        ${mxn.toLocaleString("es-MX")} MXN
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 num text-xs">
                  {[0.5, 1.0, 1.5, 2.0].map((u) => (
                    <div
                      key={u}
                      className="glass-ring rounded-xl p-3"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <span
                        className="block"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        Stake {u.toFixed(1)}u
                      </span>
                      <strong className="text-base font-extrabold">
                        ${(u * baseUnitMxn).toLocaleString("es-MX")} MXN
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ticket-perf" />

              {/* Perfil de riesgo preferido */}
              <div className="space-y-2">
                <span className="block text-xs font-extrabold" style={{ color: "var(--pl-text-muted)" }}>
                  Perfil predeterminado en picks y parlays
                </span>
                <div className="seg-well" role="group" aria-label="Perfil de riesgo">
                  {(["conservador", "medio", "arriesgado"] as const).map((rb: RiskBand) => (
                    <button
                      key={rb}
                      type="button"
                      className="seg-btn text-xs capitalize"
                      aria-pressed={riskPreference === rb}
                      onClick={() => setRiskPreference(rb)}
                    >
                      {rb}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ligas prioritarias */}
              <div className="space-y-2">
                <span className="block text-xs font-extrabold" style={{ color: "var(--pl-text-muted)" }}>
                  Ligas prioritarias en tu Jornada y alertas de valor
                </span>
                <div className="flex flex-wrap gap-2">
                  {dataset.leagues.map((lg) => {
                    const active = favoriteLeagues.includes(lg.league);
                    return (
                      <button
                        key={lg.league}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleFavLeague(lg.league)}
                        className="glass-ring rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer border-0"
                        style={{
                          background: active
                            ? "var(--pl-surface-active)"
                            : "var(--pl-surface)",
                          color: "var(--pl-text)",
                        }}
                      >
                        <LeagueBadge league={lg.league} label={lg.label} size={16} />
                        <span>{lg.label}</span>
                        {active ? (
                          <MaestroIcon
                            name="check"
                            size={12}
                            style={{ color: "var(--pl-success)" }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ticket-perf" />

              {/* Modo Pausa Social */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5 max-w-xl">
                  <strong className="block text-sm font-extrabold">
                    Modo Pausa Social (Autoexclusión temporal de Comunidad)
                  </strong>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Silencia notificaciones de debates, oculta tu usuario del Ranking CLV y
                    mantiene tu Bitácora 100 % privada.
                  </span>
                </div>

                <Switch
                  isSelected={socialPause}
                  onChange={(next) => {
                    setSocialPause(next);
                    pushToast(
                      next
                        ? "Modo Pausa Social activado. Tu perfil ahora es privado."
                        : "Comunidad VIP reactivada.",
                      "default",
                    );
                  }}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <span className="text-xs font-bold">
                      {socialPause ? "Pausa activa" : "Comunidad activa"}
                    </span>
                  </Switch.Content>
                </Switch>
              </div>
            </section>
          </div>
        ) : null}

        {/* PESTAÑA 4: FACTURACIÓN FISCAL CFDI 4.0 */}
        {accountTab === "cfdi" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-cfdi">
            <section className="glass-card glass-ring rounded-3xl p-6 space-y-4">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  Constancia Fiscal SAT · Factura Automática CFDI 4.0
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                  Timbramos automáticamente tu factura PDF + XML en cada renovación de tu Pase
                  Total (Uso G03 · Gastos en general).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="cfdi-rfc" className="block text-xs font-bold mb-1">
                    RFC
                  </label>
                  <input
                    id="cfdi-rfc"
                    type="text"
                    maxLength={13}
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    className="glass-input w-full px-3 py-2 text-xs uppercase font-extrabold num"
                  />
                </div>

                <div>
                  <label htmlFor="cfdi-cp" className="block text-xs font-bold mb-1">
                    Código Postal Fiscal
                  </label>
                  <input
                    id="cfdi-cp"
                    type="text"
                    maxLength={5}
                    inputMode="numeric"
                    value={cpFiscal}
                    onChange={(e) => setCpFiscal(e.target.value)}
                    className="glass-input w-full px-3 py-2 text-xs font-extrabold num"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label htmlFor="cfdi-razon" className="block text-xs font-bold mb-1">
                    Nombre o Razón Social
                  </label>
                  <input
                    id="cfdi-razon"
                    type="text"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                    placeholder="Tal como aparece en tu CSF"
                    className="glass-input w-full px-3 py-2 text-xs uppercase font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-bold">
                  Régimen Fiscal SAT
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SAT_REGIMENS.map((reg) => {
                    const active = regimenSat === reg;
                    return (
                      <button
                        key={reg}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setRegimenSat(reg)}
                        className="glass-ring rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer border-0"
                        style={{
                          background: active
                            ? "var(--pl-surface-active)"
                            : "var(--pl-surface)",
                          color: "var(--pl-text)",
                        }}
                      >
                        <span>{reg}</span>
                        {active ? (
                          <MaestroIcon
                            name="check"
                            size={13}
                            style={{ color: "var(--pl-brand)" }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className="pl-btn-primary text-xs"
                  onClick={() =>
                    pushToast(
                      `Datos CFDI 4.0 guardados (${rfc} · CP ${cpFiscal} · ${regimenSat.slice(0, 3)}).`,
                      "success",
                    )
                  }
                >
                  <MaestroIcon name="check" size={14} />
                  <span>Guardar datos CFDI 4.0</span>
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
