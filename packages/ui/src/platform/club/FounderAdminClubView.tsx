"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import { LeagueBadge } from "../../sports";
import { ExampleNotice, LensGlowOrbs, MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { SPACETIME_ENGINES, SPACETIME_METRICS_HEADLINE, TIPSTAR_CREATORS } from "../spacetime-catalog";
import type { SocialReportReason } from "../types";
import { SOCIAL_REPORT_REASON_OPTIONS } from "./community-ui";

interface ModerationQueueItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  isHiddenByModeration: boolean;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  reportCount: number;
  reasons: SocialReportReason[];
  latestReportAt: string;
}

interface ModerationHiddenItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  createdAt: string;
}

interface PausedSocialMember {
  userId: string;
  handle: string | null;
  displayName: string;
  email: string;
}

export interface ModerationPanelResponse {
  pendingQueue: ModerationQueueItem[];
  hiddenItems: ModerationHiddenItem[];
  pausedMembers: PausedSocialMember[];
}

const REASON_LABELS: Record<SocialReportReason, string> = Object.fromEntries(
  SOCIAL_REPORT_REASON_OPTIONS.map((opt) => [opt.value, opt.label]),
) as Record<SocialReportReason, string>;

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

export function FounderAdminClubView({
  storyModeration,
}: {
  storyModeration?: ModerationPanelResponse;
} = {}): React.JSX.Element {
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
  const [moderation, setModeration] = useState<ModerationPanelResponse>(
    () =>
      storyModeration ?? {
        pendingQueue: [],
        hiddenItems: [],
        pausedMembers: [],
      },
  );
  const [moderationLoading, setModerationLoading] = useState<boolean>(
    accountsEnabled && !storyModeration,
  );
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [moderationBusyKey, setModerationBusyKey] = useState<string | null>(null);

  const loadModeration = useCallback(async () => {
    if (!accountsEnabled || storyModeration) {
      setModerationLoading(false);
      return;
    }
    setModerationLoading(true);
    setModerationError(null);
    try {
      const res = await fetch("/api/admin/moderation", { credentials: "same-origin" });
      if (!res.ok) {
        setModerationError(
          res.status === 403
            ? "Solo el equipo fundador tiene acceso al panel de moderación."
            : "No se pudo cargar la cola de moderación.",
        );
        return;
      }
      const json = (await res.json()) as ModerationPanelResponse;
      setModeration({
        pendingQueue: json.pendingQueue ?? [],
        hiddenItems: json.hiddenItems ?? [],
        pausedMembers: json.pausedMembers ?? [],
      });
    } catch (err) {
      void err;
      setModerationError("No se pudo conectar con el servidor de moderación.");
    } finally {
      setModerationLoading(false);
    }
  }, [accountsEnabled, storyModeration]);

  useEffect(() => {
    void loadModeration();
  }, [loadModeration]);

  const runModerationAction = useCallback(
    async (
      busyId: string,
      payload: {
        action: "hide" | "restore" | "dismiss" | "pause_user" | "unpause_user";
        targetType?: "post" | "comment";
        targetId?: string;
        targetUserId?: string;
      },
      successMsg: string,
    ) => {
      if (!accountsEnabled || moderationBusyKey) return;
      setModerationBusyKey(busyId);
      try {
        const res = await fetch("/api/admin/moderation", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => null)) as
          | (ModerationPanelResponse & { ok?: boolean; error?: string })
          | null;
        if (!res.ok || !json?.ok) {
          pushToast(json?.error ?? "No se pudo aplicar la acción.", "danger");
          return;
        }
        setModeration({
          pendingQueue: json.pendingQueue ?? [],
          hiddenItems: json.hiddenItems ?? [],
          pausedMembers: json.pausedMembers ?? [],
        });
        setServerOverview((prev) => (prev ? { ...prev, moderationBlocks: prev.moderationBlocks + 1 } : prev));
        pushToast(successMsg, "success");
      } catch (err) {
        void err;
        pushToast("No se pudo conectar para aplicar la acción.", "danger");
      } finally {
        setModerationBusyKey(null);
      }
    },
    [accountsEnabled, moderationBusyKey, pushToast],
  );
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

        {/* Moderación de Comunidad */}
        <section
          className="glass-card glass-ring rounded-2xl p-5 space-y-4"
          aria-labelledby="pl-admin-mod-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="pl-admin-mod-title" className="m-0 text-lg font-extrabold">
                Moderación
              </h2>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Cola de reportes pendientes en Comunidad. Con 3 reportes distintos el contenido se oculta solo mientras lo revisas.
              </p>
            </div>
            <span className="pl-pill num">
              <MaestroIcon name="flag" size={13} />
              <span>
                {moderation.pendingQueue.length}{" "}
                {moderation.pendingQueue.length === 1 ? "pendiente" : "pendientes"}
              </span>
            </span>
          </div>

          {moderationLoading ? (
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              Cargando cola de moderación…
            </p>
          ) : moderationError ? (
            <div className="pl-admin-mod-state glass-ring rounded-2xl p-4">
              <p className="m-0 text-sm" style={{ color: "var(--pl-danger)" }} role="alert">
                {moderationError}
              </p>
              <button
                type="button"
                className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                onClick={() => void loadModeration()}
              >
                Reintentar
              </button>
            </div>
          ) : moderation.pendingQueue.length === 0 ? (
            <div className="pl-admin-mod-empty glass-ring rounded-2xl p-4">
              <p className="m-0 text-sm font-semibold">Sin reportes pendientes</p>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {accountsEnabled
                  ? "Cuando un socio reporte una publicación o comentario aparecerá aquí para tu revisión."
                  : "Activa las cuentas con base de datos para recibir reportes reales de Comunidad."}
              </p>
            </div>
          ) : (
            <ul className="pl-admin-mod-list">
              {moderation.pendingQueue.map((item) => {
                const key = `${item.targetType}:${item.targetId}`;
                const busy = moderationBusyKey !== null;
                return (
                  <li key={key} className="pl-admin-mod-item glass-ring rounded-2xl p-4 space-y-3">
                    <div className="pl-admin-mod-head">
                      <div className="pl-admin-mod-who">
                        <span className="pl-pill">
                          {item.targetType === "post" ? "Publicación" : "Comentario"}
                        </span>
                        <strong>{item.authorName}</strong>
                        <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                          @{item.authorHandle}
                        </span>
                        {item.authorPaused ? (
                          <span className="pl-pill pl-pill--warning">Socio en pausa</span>
                        ) : null}
                      </div>
                      <div className="pl-admin-mod-badges num">
                        <span className="pl-pill pl-pill--warning">
                          {item.reportCount} {item.reportCount === 1 ? "reporte" : "reportes"}
                        </span>
                        {item.isHiddenByModeration ? (
                          <span className="pl-pill pl-pill--danger">Oculto en revisión</span>
                        ) : (
                          <span className="pl-pill pl-pill--info">Visible</span>
                        )}
                      </div>
                    </div>

                    <blockquote className="pl-admin-mod-quote">{item.body}</blockquote>

                    <div className="pl-admin-mod-reasons" aria-label="Motivos reportados">
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        Motivos:
                      </span>
                      {item.reasons.map((r) => (
                        <span key={r} className="pl-pill">
                          {REASON_LABELS[r] ?? r}
                        </span>
                      ))}
                    </div>

                    <div className="pl-admin-mod-actions">
                      <button
                        type="button"
                        className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                        disabled={busy}
                        aria-label={`Ocultar ${item.targetType === "post" ? "publicación" : "comentario"} de @${item.authorHandle}`}
                        onClick={() =>
                          void runModerationAction(
                            `${key}:hide`,
                            { action: "hide", targetType: item.targetType, targetId: item.targetId },
                            "Contenido ocultado de Comunidad.",
                          )
                        }
                      >
                        Ocultar
                      </button>
                      <button
                        type="button"
                        className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                        disabled={busy}
                        aria-label={`Restaurar ${item.targetType === "post" ? "publicación" : "comentario"} de @${item.authorHandle}`}
                        onClick={() =>
                          void runModerationAction(
                            `${key}:restore`,
                            { action: "restore", targetType: item.targetType, targetId: item.targetId },
                            "Contenido restaurado en Comunidad.",
                          )
                        }
                      >
                        Restaurar
                      </button>
                      <button
                        type="button"
                        className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                        disabled={busy}
                        aria-label={`Descartar reporte sobre @${item.authorHandle}`}
                        onClick={() =>
                          void runModerationAction(
                            `${key}:dismiss`,
                            { action: "dismiss", targetType: item.targetType, targetId: item.targetId },
                            "Reporte descartado.",
                          )
                        }
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm pl-admin-mod-pause"
                        disabled={busy}
                        aria-label={
                          item.authorPaused
                            ? `Quitar pausa en Comunidad a @${item.authorHandle}`
                            : `Pausar a @${item.authorHandle} en Comunidad`
                        }
                        onClick={() =>
                          void runModerationAction(
                            `${key}:pause`,
                            {
                              action: item.authorPaused ? "unpause_user" : "pause_user",
                              targetUserId: item.authorUserId,
                            },
                            item.authorPaused
                              ? `@${item.authorHandle} puede volver a participar en Comunidad.`
                              : `@${item.authorHandle} quedó en pausa en Comunidad.`,
                          )
                        }
                      >
                        {item.authorPaused ? "Quitar pausa en Comunidad" : "Pausar a este socio en Comunidad"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {moderation.hiddenItems.length > 0 ? (
            <div className="pl-admin-mod-sub space-y-2">
              <h3 className="m-0 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                Contenido oculto recientemente
              </h3>
              <ul className="pl-admin-mod-compact">
                {moderation.hiddenItems.map((h) => {
                  const key = `hidden:${h.targetType}:${h.targetId}`;
                  return (
                    <li key={key} className="pl-admin-mod-compact-row">
                      <div className="pl-admin-mod-compact-copy">
                        <strong>@{h.authorHandle}</strong>{" "}
                        <span style={{ color: "var(--pl-text-muted)" }}>
                          ({h.targetType === "post" ? "publicación" : "comentario"}):
                        </span>{" "}
                        <span>{h.body}</span>
                      </div>
                      <button
                        type="button"
                        className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                        disabled={moderationBusyKey !== null}
                        aria-label={`Restaurar ${h.targetType === "post" ? "publicación" : "comentario"} de @${h.authorHandle}`}
                        onClick={() =>
                          void runModerationAction(
                            key,
                            { action: "restore", targetType: h.targetType, targetId: h.targetId },
                            "Contenido restaurado en Comunidad.",
                          )
                        }
                      >
                        Restaurar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {moderation.pausedMembers.length > 0 ? (
            <div className="pl-admin-mod-sub space-y-2">
              <h3 className="m-0 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                Socios en pausa en Comunidad
              </h3>
              <ul className="pl-admin-mod-compact">
                {moderation.pausedMembers.map((m) => (
                  <li key={m.userId} className="pl-admin-mod-compact-row">
                    <div className="pl-admin-mod-compact-copy">
                      <strong>{m.displayName}</strong>{" "}
                      <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                        {m.handle ? `@${m.handle}` : m.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="pl-prof-btn pl-prof-btn--ghost pl-prof-btn--sm"
                      disabled={moderationBusyKey !== null}
                      aria-label={`Quitar pausa en Comunidad a ${m.handle ? `@${m.handle}` : m.displayName}`}
                      onClick={() =>
                        void runModerationAction(
                          `unpause:${m.userId}`,
                          { action: "unpause_user", targetUserId: m.userId },
                          `${m.handle ? `@${m.handle}` : m.displayName} puede volver a participar en Comunidad.`,
                        )
                      }
                    >
                      Quitar pausa
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
              <caption className="sr-only">Códigos promocionales de Tipstars oficiales y comisiones</caption>
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
