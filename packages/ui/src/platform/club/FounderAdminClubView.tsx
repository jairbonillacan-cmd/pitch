"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import { LeagueBadge } from "../../sports";
import { ExampleNotice, LensGlowOrbs, MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { SPACETIME_ENGINES, SPACETIME_METRICS_HEADLINE, TIPSTAR_CREATORS } from "../spacetime-catalog";

interface AdminOverviewData {
  members: number;
  activeSubscriptions: number;
  freeTrialsGranted: number;
  referralsRewarded: number;
  commissionsPayableCentavos: number;
  moderationBlocks: number;
}

interface AdminTipstarRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  pendingCommissionCentavos: number;
}

interface AdminOverviewResponse {
  overview: AdminOverviewData;
  tipstars: AdminTipstarRow[];
  month1NoCardMode: boolean;
}

function toPromoRow(t: AdminTipstarRow): AdminPromoRow {
  return {
    code: t.code,
    handle: t.handle,
    name: t.name,
    freeDays: t.freeDays,
    commissionPct: t.commissionPct,
    activeReferrals: t.activeReferrals,
    monthlyMxn: Math.round(t.pendingCommissionCentavos / 100),
  };
}

interface AdminPromoRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  monthlyMxn: number;
}

export function FounderAdminClubView(): React.JSX.Element {
  const {
    dataset,
    month1NoCardMode,
    setMonth1NoCardMode,
    blockedSpamAttempts,
    referralPaidFriends,
    pushToast,
    accountsEnabled,
  } = usePlatform();

  const [newCreatorCode, setNewCreatorCode] = useState<string>("");
  const [newCreatorHandle, setNewCreatorHandle] = useState<string>("");
  const [newCreatorEmail, setNewCreatorEmail] = useState<string>("");
  const [serverOverview, setServerOverview] = useState<AdminOverviewData | null>(null);
  const dataCutLabel = useMemo(() => {
    const t = Date.parse(dataset.generatedAt);
    return Number.isFinite(t)
      ? `datos al ${new Date(t).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}`
      : "datos del último corte";
  }, [dataset.generatedAt]);
  // Sin cuentas, la consola es una demostración con los tipstars de ejemplo.
  const [promoRows, setPromoRows] = useState<AdminPromoRow[]>(() =>
    accountsEnabled ? [] : TIPSTAR_CREATORS.map((c) => ({
      code: c.promoCode,
      handle: c.handle,
      name: c.name,
      freeDays: c.freeDays,
      commissionPct: c.commissionPct,
      activeReferrals: c.activeReferrals,
      monthlyMxn: c.monthlyCommissionMxn,
    })),
  );

  useEffect(() => {
    if (!accountsEnabled) return;
    void (async () => {
      try {
        const res = await fetch("/api/admin/overview", { credentials: "same-origin" });
        if (!res.ok) {
          pushToast(res.status === 403 ? "Tu cuenta no es del equipo fundador." : "No se pudo cargar la consola.", "warning");
          return;
        }
        const json = (await res.json()) as AdminOverviewResponse;
        setServerOverview(json.overview);
        setPromoRows(json.tipstars.map(toPromoRow));
      } catch (err) {
        void err;
      }
    })();
  }, [accountsEnabled, pushToast]);

  const totalActiveReferrals = useMemo(
    () =>
      serverOverview
        ? serverOverview.referralsRewarded + promoRows.reduce((acc, r) => acc + r.activeReferrals, 0)
        : promoRows.reduce((acc, r) => acc + r.activeReferrals, 0) + referralPaidFriends,
    [promoRows, referralPaidFriends, serverOverview],
  );
  const spamBlocked = serverOverview ? serverOverview.moderationBlocks : blockedSpamAttempts;

  const handleEmitCode = () => {
    const cleanCode = newCreatorCode.trim().toUpperCase();
    const cleanHandle = newCreatorHandle.trim().replace(/^@/, "").toLowerCase() || "creador_pl";
    if (!cleanCode) return;
    if (accountsEnabled) {
      void (async () => {
        const res = await fetch("/api/admin/tipstars", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: newCreatorEmail,
            handle: cleanHandle,
            displayName: `@${cleanHandle}`,
            promoCode: cleanCode,
            specialty: "",
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { tipstars?: AdminTipstarRow[]; error?: string };
        if (res.ok && json.tipstars) {
          setPromoRows(json.tipstars.map(toPromoRow));
          pushToast(`Código ${cleanCode} emitido para @${cleanHandle}.`, "success");
          setNewCreatorCode("");
          setNewCreatorHandle("");
          setNewCreatorEmail("");
        } else {
          pushToast(json.error ?? "No se pudo emitir el código.", "warning");
        }
      })();
      return;
    }
    if (promoRows.some((r) => r.code === cleanCode)) {
      pushToast(`El código ${cleanCode} ya está registrado.`, "warning");
      return;
    }
    setPromoRows((prev) => [
      ...prev,
      {
        code: cleanCode,
        handle: cleanHandle,
        name: `@${cleanHandle}`,
        freeDays: 5,
        commissionPct: 25,
        activeReferrals: 0,
        monthlyMxn: 0,
      },
    ]);
    pushToast(
      `Código ${cleanCode} emitido para @${cleanHandle} (5 días gratis · 25 % comisión).`,
      "success",
    );
    setNewCreatorCode("");
  };

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/admin">
        {!accountsEnabled ? (
          <ExampleNotice>
            Consola en modo demostración: sin cuentas activas, los códigos, referidos y comisiones
            son de ejemplo y no se guardan. Con la base de datos conectada muestra cifras reales.
          </ExampleNotice>
        ) : null}
        {/* Lente Destacado: Control Mes 1 vs Mes 2 + 4 KPIs de Seguridad y Crecimiento */}
        <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5">
          <LensGlowOrbs />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="pl-pill pl-pill--warning">
                <MaestroIcon name="crown" size={13} />
                <span>Consola Operativa Founder · Configuración de Lanzamiento</span>
              </span>
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Consola del fundador
              </h1>
            </div>

            <span className="pl-pill pl-pill--success num">
              <MaestroIcon name="activity" size={13} />
              <span>5 motores Spacetime en línea</span>
            </span>
          </div>

          {/* Switch Mes 1 (Sin Tarjeta) vs Mes 2 (Tarjeta $0 MXN) */}
          <div
            className="relative z-10 glass-ring rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
            style={{ background: "var(--pl-surface)" }}
          >
            <div className="space-y-1 max-w-2xl">
              <h2 className="m-0 text-base sm:text-lg font-extrabold flex flex-wrap items-center gap-2">
                <span>Política de Prueba Gratis:</span>
                <span
                  style={{
                    color: month1NoCardMode ? "var(--pl-success)" : "var(--pl-brand)",
                  }}
                >
                  {month1NoCardMode
                    ? "Mes 1 Lanzamiento · Sin pedir tarjeta ($0 OAuth)"
                    : "Mes 2+ · Verificación bancaria $0.00 MXN"}
                </span>
              </h2>
              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                Escudo anti-abuso de costo <strong>$0 MXN</strong> activo: Google/Apple OAuth,
                normalización de alias Gmail, bloqueo de dominios desechables, Cloudflare
                Turnstile y huella única por dispositivo.
              </p>
            </div>

            <Switch isSelected={month1NoCardMode} onChange={setMonth1NoCardMode}>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <span className="text-xs font-bold">
                  {month1NoCardMode
                    ? "Mes 1: Sin tarjeta"
                    : "Mes 2: Tarjeta $0 MXN"}
                </span>
              </Switch.Content>
            </Switch>
          </div>

          {/* 4 KPIs de Seguridad y Crecimiento */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Sesiones con Watermark</span>
                <MaestroIcon
                  name="shield"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                100 %
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                ID incrustado + share sellado pre-juego
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Links Spam Bloqueados</span>
                <MaestroIcon
                  name="lock"
                  size={15}
                  style={{ color: "var(--pl-warning)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-warning)" }}
              >
                {spamBlocked}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Filtro t.me / wa.me / URLs activo
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Referidos Activos</span>
                <MaestroIcon
                  name="users"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {totalActiveReferrals}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Tipstars (25 %) + Doble Vía (+15d)
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Partidos en Snapshot</span>
                <MaestroIcon
                  name="layers"
                  size={15}
                  style={{ color: "var(--pl-info)" }}
                />
              </div>
              <strong className="block text-2xl font-extrabold">
                {dataset.games.length}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {dataset.leagues.length} ligas sincronizadas
              </span>
            </div>
          </div>
        </section>

        {/* Emisor de Códigos de Tipstars Oficiales */}
        <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-extrabold">
                Códigos de Tipstars Oficiales y Campañas
              </h2>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Cada creador recibe Pase PitchLab Ultra bonificado, 1 Pick abierto semanal y 25 % de
                comisión recurrente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                maxLength={16}
                aria-label="Nuevo código promocional de Tipstar"
                placeholder="NUEVO5"
                value={newCreatorCode}
                onChange={(e) => setNewCreatorCode(e.target.value.toUpperCase())}
                className="glass-input px-3 py-1.5 text-xs uppercase font-extrabold num w-28"
              />
              <input
                type="text"
                maxLength={24}
                aria-label="Handle del Tipstar"
                placeholder="@handle"
                value={newCreatorHandle}
                onChange={(e) => setNewCreatorHandle(e.target.value)}
                className="glass-input px-3 py-1.5 text-xs font-semibold w-36"
              />
              {accountsEnabled ? (
                <input
                  type="email"
                  aria-label="Correo del Tipstar"
                  placeholder="correo@tipstar.com"
                  value={newCreatorEmail}
                  onChange={(e) => setNewCreatorEmail(e.target.value)}
                  className="glass-input px-3 py-1.5 text-xs font-semibold w-48"
                />
              ) : null}
              <button
                type="button"
                className="pl-btn-primary text-xs min-h-9 px-3.5"
                onClick={handleEmitCode}
              >
                <MaestroIcon name="plus" size={14} />
                <span>Emitir código</span>
              </button>
            </div>
          </div>

          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label="Tabla de códigos promocionales de Tipstars"
          >
            <table className="w-full text-left border-collapse text-sm num">
              <thead>
                <tr
                  className="hairline-b text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  <th scope="col" className="py-2.5 pr-3">
                    Código
                  </th>
                  <th scope="col" className="py-2.5 pr-3">
                    Titular
                  </th>
                  <th scope="col" className="py-2.5 px-2">
                    Beneficio prueba
                  </th>
                  <th scope="col" className="py-2.5 px-2">
                    Comisión
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Referidos activos
                  </th>
                  <th scope="col" className="py-2.5 pl-2 text-right">
                    Pago mensual
                  </th>
                </tr>
              </thead>
              <tbody>
                {promoRows.map((row) => (
                  <tr key={row.code} className="hairline-b row-hover">
                    <th
                      scope="row"
                      className="py-2.5 pr-3 font-extrabold"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      {row.code}
                    </th>
                    <td className="py-2.5 pr-3 font-semibold">
                      {row.name} (@{row.handle})
                    </td>
                    <td className="py-2.5 px-2">{row.freeDays} días gratis</td>
                    <td className="py-2.5 px-2">{row.commissionPct} % recurrente</td>
                    <td className="py-2.5 px-2 text-right font-bold">
                      {row.activeReferrals}
                    </td>
                    <td
                      className="py-2.5 pl-2 text-right font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                    >
                      ${row.monthlyMxn.toLocaleString("es-MX")} MXN
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Telemetría de los 5 Motores Spacetime Suite v3.0 */}
        <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-extrabold">
                Telemetría de los 5 Motores · PitchLab Spacetime Suite v3.0
              </h2>
              <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                Partidos históricos en los motores: {SPACETIME_METRICS_HEADLINE.historicalMatches} · Prueba 2024–25:{" "}
                {SPACETIME_METRICS_HEADLINE.holdoutTestMatches} · {dataCutLabel}
              </p>
            </div>

            <span className="text-xs max-w-xs" style={{ color: "var(--pl-text-muted)" }}>
              Los motores se reentrenan y validan en la rama prediction-lab; esta app usa la
              última versión sincronizada.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SPACETIME_ENGINES.map((eng) => (
              <div
                key={eng.key}
                className="glass-ring rounded-2xl p-4 space-y-1.5"
                style={{ background: "var(--pl-surface)" }}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <strong
                    className="font-extrabold text-sm"
                    style={{ color: eng.colorVar }}
                  >
                    {eng.name}
                  </strong>
                  <span className="pl-pill pl-pill--success">ONLINE</span>
                </div>
                <div className="text-xs font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
                  {eng.pillar} · {eng.domain}
                </div>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {eng.retrainCadence}
                </p>
              </div>
            ))}

            {/* Tarjeta 6: Salud de Snapshots de las 7 ligas */}
            <div
              className="glass-ring rounded-2xl p-4 space-y-2"
              style={{ background: "var(--pl-surface)" }}
            >
              <div className="flex items-center justify-between text-xs">
                <strong className="font-extrabold text-sm">
                  Snapshots · 7 Ligas
                </strong>
                <span className="pl-pill pl-pill--info num">
                  {dataset.games.length} juegos
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {dataset.leagues.map((lg) => (
                  <span key={lg.league} className="pl-pill num">
                    <LeagueBadge league={lg.league} label={lg.label} size={13} />
                    <span>
                      {lg.label}: {lg.totalGames}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
