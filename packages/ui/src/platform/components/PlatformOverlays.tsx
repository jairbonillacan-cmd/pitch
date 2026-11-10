"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons.js";
import { LeagueBadge, TeamBadge } from "../../sports.js";
import {
  canRevealPickOnShare,
  formatOddsValue,
  getSessionWatermark,
} from "../access-guard.js";
import { usePlatform } from "../platform-provider.js";
import type { ViewerRole } from "../types.js";

export function TopLayerModalDialog({
  open,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  variant = "modal",
  maxWidth = "32rem",
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  variant?: "modal" | "drawer";
  maxWidth?: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className={variant === "drawer" ? "pl-native-drawer" : "pl-native-dialog"}
      style={
        variant === "modal"
          ? ({ "--pl-dialog-max-w": maxWidth } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </dialog>
  );
}

export function ParlayFloatingDock(): React.JSX.Element | null {
  const {
    parlaySummary,
    oddsFormat,
    clearParlay,
    sealParlayToJournal,
    openShareTicket,
    navigateTo,
  } = usePlatform();

  if (parlaySummary.legs.length === 0) {
    return null;
  }

  return (
    <aside
      className="parlay-dock glass-pill-bar glass-ring"
      aria-label="Boleto combinado activo"
      data-parlay-dock=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="pl-pill pl-pill--brand num">
            {parlaySummary.legs.length} {parlaySummary.legs.length === 1 ? "pick" : "picks"}
          </span>
          {parlaySummary.hasSgpCorrelation ? (
            <span className="pl-pill pl-pill--info">SGP correlacionado</span>
          ) : null}
          <div className="min-w-0">
            <p className="m-0 text-sm font-bold truncate">
              Prob. conjunta{" "}
              <span className="num">
                {(parlaySummary.combinedProbability * 100).toFixed(1)} %
              </span>{" "}
              · Cuota{" "}
              <span className="num">
                {formatOddsValue(parlaySummary.bookDecimal, oddsFormat)}
              </span>
            </p>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Justa Geodesic:{" "}
              <span className="num">
                {formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}
              </span>{" "}
              · Retorno est.{" "}
              <span className="num font-semibold" style={{ color: "var(--pl-success)" }}>
                {parlaySummary.projectedReturnUnits.toFixed(2)}u
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="pl-btn-glass text-xs"
            onClick={() => navigateTo("/app/parlays")}
          >
            Ver boleto
          </button>
          <button
            type="button"
            className="pl-btn-glass text-xs"
            onClick={() =>
              openShareTicket({
                kind: "parlay",
                title: `Combinada PitchLab (${parlaySummary.legs.length} picks)`,
                subtitle: parlaySummary.hasSgpCorrelation
                  ? "Mismo partido (SGP) calibrado con Geodesic v1.0"
                  : "Multi-liga calibrada con Spacetime Suite v2.1",
                leagueLabel: "Parlay Inteligente",
                pickLabel: parlaySummary.legs.map((l) => l.pick.label).join(" + "),
                probability: parlaySummary.combinedProbability,
                fairDecimal: parlaySummary.fairDecimal,
                marketDecimal: parlaySummary.bookDecimal,
                units: parlaySummary.stakeUnits,
                gameStatus: "NS",
              })
            }
          >
            Compartir
          </button>
          <button
            type="button"
            className="pl-btn-primary text-xs"
            disabled={parlaySummary.legs.length < 2}
            onClick={() => sealParlayToJournal()}
          >
            Sellar {parlaySummary.stakeUnits.toFixed(1)}u
          </button>
          <button
            type="button"
            className="pl-btn-glass px-2.5 text-xs"
            aria-label="Vaciar boleto combinado"
            onClick={clearParlay}
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}

export function PickComposerModal(): React.JSX.Element | null {
  const { composerPick, closeComposer, sealPickToJournal, oddsFormat } = usePlatform();
  const [units, setUnits] = useState<number>(1.5);
  const [userDec, setUserDec] = useState<string>("1.95");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (composerPick) {
      setUnits(composerPick.suggestedUnits);
      setUserDec(composerPick.marketDecimal.toFixed(2));
      setNote("");
    }
  }, [composerPick]);

  if (!composerPick) return null;

  const parsedDec = Math.max(1.05, Number(userDec.replace(",", ".")) || composerPick.marketDecimal);
  const edgeLive = Math.round((composerPick.p - 1 / parsedDec) * 1000) / 10;

  return (
    <TopLayerModalDialog
      open={Boolean(composerPick)}
      onClose={closeComposer}
      ariaLabelledBy="composer-modal-title"
      maxWidth="28rem"
    >
      <div className="glass-lens glass-ring w-full rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
              Sellar en Bitácora Auditada
            </p>
            <h2 id="composer-modal-title" className="m-0 mt-1 text-lg font-bold">
              {composerPick.label}
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              {composerPick.leagueLabel} · {composerPick.matchLabel} · {composerPick.engineName}
            </p>
          </div>
          <button
            type="button"
            className="pl-btn-glass px-2.5"
            aria-label="Cerrar ventana de sellado"
            onClick={closeComposer}
          >
            ✕
          </button>
        </div>

        <div className="ticket-perf" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Prob. Spacetime Suite
            </span>
            <strong className="num text-base">
              {(composerPick.p * 100).toFixed(1)} %
            </strong>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Momio Justo Geodesic
            </span>
            <strong className="num text-base">
              {formatOddsValue(composerPick.fairDecimal, oddsFormat)}
            </strong>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Unidades simuladas (0.5u – 5.0u)</span>
            <div className="sl-stepper" role="group" aria-label="Ajustar unidades">
              <button
                type="button"
                aria-label="Restar media unidad"
                onClick={() => setUnits((u) => Math.max(0.5, Math.round((u - 0.5) * 100) / 100))}
              >
                −
              </button>
              <span className="num">{units.toFixed(2)}u</span>
              <button
                type="button"
                aria-label="Sumar media unidad"
                onClick={() => setUnits((u) => Math.min(5, Math.round((u + 0.5) * 100) / 100))}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="composer-odds-input" className="block text-xs font-semibold mb-1">
              Tu cuota decimal conseguida (calcula CLV en vivo)
            </label>
            <input
              id="composer-odds-input"
              type="text"
              autoFocus
              inputMode="decimal"
              value={userDec}
              onChange={(e) => setUserDec(e.target.value)}
              className="glass-input w-full px-3 py-2 text-sm num"
            />
            <p
              className="m-0 mt-1 text-xs num font-semibold"
              style={{
                color: edgeLive >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
              }}
            >
              {edgeLive >= 0
                ? `Ventaja positiva +${edgeLive.toFixed(1)} pts sobre la cuota ingresada`
                : `Margen en contra ${edgeLive.toFixed(1)} pts frente al momio justo`}
            </p>
          </div>

          <div>
            <label htmlFor="composer-note-input" className="block text-xs font-semibold mb-1">
              Nota táctica opcional
            </label>
            <input
              id="composer-note-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Tomada antes del reporte de bajas 60m"
              className="glass-input w-full px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className="pl-btn-glass" onClick={closeComposer}>
            Cancelar
          </button>
          <button
            type="button"
            className="pl-btn-primary"
            onClick={() => sealPickToJournal(composerPick, units, parsedDec, note || undefined)}
          >
            Confirmar y sellar {units.toFixed(1)}u
          </button>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function ShareTicketModal(): React.JSX.Element | null {
  const { shareTicket, closeShareTicket, viewerRole, oddsFormat, pushToast } = usePlatform();
  const [aspect, setAspect] = useState<"4:5" | "9:16">("4:5");

  if (!shareTicket) return null;

  const isTipstarPromo = shareTicket.kind === "tipstar";
  const revealSelection = canRevealPickOnShare(
    shareTicket.gameStatus,
    viewerRole,
    isTipstarPromo,
  );
  const watermark = getSessionWatermark(viewerRole);

  const handleCopyShareLink = () => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/p/${isTipstarPromo ? "sofia-sem" : "boleto"}`
        : "https://pitchlab.mx/p/sofia-sem";
    try {
      void navigator.clipboard?.writeText(shareUrl);
    } catch (err) {
      void err;
    }
    pushToast("Enlace del boleto copiado con tu código de referido.", "success");
  };

  return (
    <TopLayerModalDialog
      open={Boolean(shareTicket)}
      onClose={closeShareTicket}
      ariaLabelledBy="share-modal-title"
      maxWidth="32rem"
    >
      <div className="glass-lens glass-ring w-full rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="share-modal-title" className="m-0 text-base font-bold">
              Boleto Oficial para Redes Sociales
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Protección anti-fuga activa antes del inicio (Q12)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="seg-well" role="group" aria-label="Formato de historia">
              <button
                type="button"
                className="seg-btn"
                aria-pressed={aspect === "4:5"}
                onClick={() => setAspect("4:5")}
              >
                Post 4:5
              </button>
              <button
                type="button"
                className="seg-btn"
                aria-pressed={aspect === "9:16"}
                onClick={() => setAspect("9:16")}
              >
                Story 9:16
              </button>
            </div>
            <button
              type="button"
              className="pl-btn-glass px-2.5"
              aria-label="Cerrar vista de boleto"
              onClick={closeShareTicket}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className="share-ticket-card mx-auto p-5 flex flex-col justify-between"
          style={{
            maxWidth: aspect === "9:16" ? 310 : 370,
            minHeight: aspect === "9:16" ? 430 : 350,
          }}
          data-share-ticket=""
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--share-card-accent)" }}>
                PITCHLAB · SPACETIME SUITE v2.1
              </span>
              <span className="text-xs font-bold num" style={{ color: "var(--share-card-muted)" }}>
                {shareTicket.leagueLabel}
              </span>
            </div>

            <div>
              <h3 className="m-0 text-lg font-extrabold">{shareTicket.title}</h3>
              <p className="m-0 text-xs mt-0.5" style={{ color: "var(--share-card-muted)" }}>
                {shareTicket.subtitle}
              </p>
            </div>

            <div className="ticket-perf" />

            {revealSelection ? (
              <div
                className="rounded-xl p-3.5 space-y-1.5"
                style={{ background: "var(--share-card-surface)" }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--share-card-success)" }} className="font-bold">
                    {isTipstarPromo
                      ? shareTicket.originBadge ?? "PICK ABIERTO DE LA SEMANA"
                      : "RESULTADO AUDITADO FT"}
                  </span>
                  <span className="num font-bold">{shareTicket.units.toFixed(1)}u</span>
                </div>
                <p className="m-0 text-base font-extrabold">{shareTicket.pickLabel}</p>
                <p className="m-0 text-xs num" style={{ color: "var(--share-card-secondary)" }}>
                  Prob. {(shareTicket.probability * 100).toFixed(1)} % · Momio{" "}
                  {formatOddsValue(shareTicket.marketDecimal, oddsFormat)} (Justa{" "}
                  {formatOddsValue(shareTicket.fairDecimal, oddsFormat)})
                </p>
              </div>
            ) : (
              <div
                className="rounded-xl p-3.5 space-y-1.5"
                style={{ background: "var(--share-card-surface)" }}
                data-sealed-prekickoff=""
              >
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--share-card-warning)" }} className="font-bold">
                    🔒 SELECCIÓN SELLADA HASTA EL INICIO
                  </span>
                  <span className="num font-bold">{shareTicket.units.toFixed(1)}u</span>
                </div>
                <p className="m-0 text-sm font-bold">
                  Pick registrado en Bitácora PitchLab ({(shareTicket.probability * 100).toFixed(0)} % conf.)
                </p>
                <p className="m-0 text-xs" style={{ color: "var(--share-card-muted)" }}>
                  La selección exacta permanece encriptada antes del kickoff para proteger la ventaja de los socios.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-4">
            <div className="ticket-perf" />
            <div className="flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="block font-bold" style={{ color: "var(--share-card-fg)" }}>
                  {shareTicket.promoCode
                    ? `CÓDIGO: ${shareTicket.promoCode} · 5 días gratis`
                    : "7 días gratis + 15d ambos al suscribirse"}
                </span>
                <span style={{ color: "var(--share-card-muted)" }}>
                  pitchlab.mx · +18 Unidades simuladas
                </span>
              </div>
              <span className="num font-bold opacity-60">{watermark}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {revealSelection
              ? "Selección visible (Partido cerrado FT o Pick Abierto Semanal de Tipstar)."
              : "Selección sellada automáticamente porque el encuentro aún no inicia."}
          </span>
          <button
            type="button"
            autoFocus
            className="pl-btn-primary text-xs"
            onClick={handleCopyShareLink}
          >
            Copiar enlace con código
          </button>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function AlertsDrawer(): React.JSX.Element | null {
  const { alertsOpen, setAlertsOpen, dataset, watchlistGameIds, navigateTo } = usePlatform();
  if (!alertsOpen) return null;

  const upcoming = dataset.games.filter((g) => g.status !== "FT").slice(0, 4);

  return (
    <TopLayerModalDialog
      open={alertsOpen}
      onClose={() => setAlertsOpen(false)}
      ariaLabelledBy="alerts-drawer-title"
      variant="drawer"
    >
      <div className="glass-lens glass-ring h-full w-full p-5 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
              Centro de Alertas en Tiempo Real
            </p>
            <h2 id="alerts-drawer-title" className="m-0 text-lg font-bold">
              Cortex IA 60m & Geodesic
            </h2>
          </div>
          <button
            type="button"
            autoFocus
            className="pl-btn-glass px-2.5"
            aria-label="Cerrar panel de alertas"
            onClick={() => setAlertsOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="ticket-perf" />

        <div className="space-y-3">
          {upcoming.map((g, idx) => (
            <div
              key={g.id}
              className="glass-card glass-ring rounded-xl p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="pl-pill pl-pill--info">
                  {idx % 2 === 0 ? "Alineación 60m" : "Movimiento Geodesic"}
                </span>
                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                  {g.leagueLabel} · {g.kickoffLocal}
                </span>
              </div>
              <div className="flex items-center gap-2 font-bold text-sm">
                <TeamBadge league={g.league} slug={g.home.slug} name={g.home.name} size={20} />
                <span>
                  {g.home.shortName} vs {g.away.shortName}
                </span>
                {watchlistGameIds.includes(g.id) ? (
                  <span className="pl-pill pl-pill--success">Siguiendo</span>
                ) : null}
              </div>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                {idx % 2 === 0
                  ? "Convocatoria titular verificada por Cortex IA sin bajas de última hora en el eje ofensivo."
                  : "Geodesic v1.0 detecta +3.1 pts de ventaja neta antes del ajuste de línea de cierre."}
              </p>
              <button
                type="button"
                className="pl-btn-glass text-xs py-1 min-h-8"
                onClick={() => {
                  setAlertsOpen(false);
                  navigateTo(`/app/${g.league}/games/${g.id}`);
                }}
              >
                Abrir radiografía →
              </button>
            </div>
          ))}
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function CommandPaletteModal(): React.JSX.Element | null {
  const { cmdkOpen, setCmdkOpen, dataset, navigateTo } = usePlatform();
  const [query, setQuery] = useState<string>("");

  if (!cmdkOpen) return null;

  const q = query.trim().toLowerCase();
  const matchingGames = dataset.games
    .filter((g) => {
      if (!q) return true;
      return (
        g.home.name.toLowerCase().includes(q) ||
        g.away.name.toLowerCase().includes(q) ||
        g.leagueLabel.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);

  const quickRoutes = [
    { label: "Jornada y Partidos de Hoy", href: "/app" },
    { label: "Multi-Picks del Día (4–5 por partido)", href: "/app/picks" },
    { label: "Armador Inteligente de Parlays & SGP", href: "/app/parlays" },
    { label: "Explorador de Momios & Geodesic v1.0", href: "/app/momios" },
    { label: "Player Props Lab (NFL y Fútbol)", href: "/app/props" },
    { label: "Comunidad VIP Verificada", href: "/app/social" },
    { label: "Portal Tipstar Oficial (SOFIA5)", href: "/app/tipstar" },
    { label: "Tecnología & Precisión · Spacetime Suite v2.1", href: "/app/tech" },
  ].filter((r) => !q || r.label.toLowerCase().includes(q));

  return (
    <TopLayerModalDialog
      open={cmdkOpen}
      onClose={() => setCmdkOpen(false)}
      ariaLabel="Buscar en PitchLab"
      maxWidth="36rem"
    >
      <div className="glass-lens glass-ring w-full rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="search" className="icon" />
          <input
            type="search"
            autoFocus
            aria-label="Buscar equipo, liga, partido o módulo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipo, liga, partido o herramienta..."
            className="glass-input w-full px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            className="pl-btn-glass px-3 text-xs"
            onClick={() => setCmdkOpen(false)}
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-3">
          {matchingGames.length > 0 ? (
            <div>
              <p className="m-0 mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                Partidos y Radiografías
              </p>
              <div className="space-y-1">
                {matchingGames.map((g) => (
                  <a
                    key={g.id}
                    href={`/app/${g.league}/games/${g.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setCmdkOpen(false);
                      navigateTo(`/app/${g.league}/games/${g.id}`);
                    }}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm no-underline row-hover"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <LeagueBadge league={g.league} label={g.leagueLabel} size={18} />
                      <span>
                        {g.home.shortName} vs {g.away.shortName}
                      </span>
                    </span>
                    <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                      {g.leagueLabel} · {g.status === "FT" ? "Final" : g.kickoffLocal}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {quickRoutes.length > 0 ? (
            <div>
              <p className="m-0 mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                Módulos del Club
              </p>
              <div className="space-y-1">
                {quickRoutes.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setCmdkOpen(false);
                      navigateTo(item.href);
                    }}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium no-underline row-hover"
                  >
                    <span>{item.label}</span>
                    <span className="text-xs" style={{ color: "var(--pl-brand)" }}>
                      Ir →
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function BetaPinModal(): React.JSX.Element | null {
  const { betaPinOpen, closeBetaPin, submitBetaPin } = usePlatform();
  const [digits, setDigits] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!betaPinOpen) {
      setDigits("");
      setError("");
      setBusy(false);
    }
  }, [betaPinOpen]);

  const triggerVerify = async (code: string) => {
    setBusy(true);
    setError("");
    const res = await submitBetaPin(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Código incorrecto.");
      setDigits("");
    }
  };

  const handleDigit = (d: string) => {
    if (busy || digits.length >= 4) return;
    const next = `${digits}${d}`;
    setDigits(next);
    setError("");
    if (next.length === 4) {
      void triggerVerify(next);
    }
  };

  if (!betaPinOpen) return null;

  return (
    <TopLayerModalDialog
      open={betaPinOpen}
      onClose={closeBetaPin}
      ariaLabelledBy="beta-pin-modal-title"
      maxWidth="24rem"
    >
      <div className="pin-dialog glass-lens glass-ring w-full rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
              Acceso Inmediato de Socio
            </p>
            <h2 id="beta-pin-modal-title" className="m-0 mt-1 text-lg font-bold">
              Ingresa tu PIN de 4 dígitos
            </h2>
          </div>
          <button
            type="button"
            className="pl-btn-glass px-2.5"
            aria-label="Cerrar acceso con PIN"
            onClick={closeBetaPin}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5 py-1" aria-live="polite">
          {[0, 1, 2, 3].map((idx) => {
            const char = digits[idx] ?? "";
            return (
              <div
                key={idx}
                className="h-12 rounded-xl flex items-center justify-center text-xl font-extrabold num"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: char
                    ? "1.5px solid var(--pl-brand)"
                    : "1px solid var(--pl-border)",
                }}
              >
                {char ? "•" : ""}
              </div>
            );
          })}
        </div>

        {error ? (
          <p
            className="pin-feedback error m-0 text-xs font-semibold text-center"
            role="alert"
            style={{ color: "var(--pl-danger)" }}
          >
            {error}
          </p>
        ) : (
          <p className="m-0 text-xs text-center" style={{ color: "var(--pl-text-muted)" }}>
            Sesión encriptada por 30 días en este dispositivo.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              autoFocus={d === "1"}
              data-pin-digit={d}
              disabled={busy}
              className="pin-key pl-btn-glass h-11 text-base font-bold num"
              onClick={() => handleDigit(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || digits.length === 0}
            className="pl-btn-glass h-11 text-xs font-semibold"
            onClick={() => setDigits("")}
          >
            Limpiar
          </button>
          <button
            type="button"
            data-pin-digit="0"
            disabled={busy}
            className="pin-key pl-btn-glass h-11 text-base font-bold num"
            onClick={() => handleDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            disabled={busy || digits.length === 0}
            aria-label="Borrar último dígito"
            className="pl-btn-glass h-11 text-sm font-bold"
            onClick={() => setDigits((prev) => prev.slice(0, -1))}
          >
            ⌫
          </button>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}

export function RoleSimulatorBar(): React.JSX.Element | null {
  const { allowRoleSimulation, viewerRole, setViewerRole } = usePlatform();
  const [expanded, setExpanded] = useState<boolean>(false);
  if (!allowRoleSimulation) return null;

  const roles: Array<{ id: ViewerRole; label: string; short: string }> = [
    { id: "visitor", label: "Visitante (Cero-Fuga)", short: "Visitante" },
    { id: "member", label: "Socio Pase Total", short: "Socio" },
    { id: "tipstar", label: "Tipstar (@sofia_nfl)", short: "Tipstar" },
    { id: "admin", label: "Admin Founder", short: "Admin" },
  ];

  const activeRole = roles.find((r) => r.id === viewerRole) ?? roles[0]!;

  return (
    <div
      className="role-sim-pill glass-pill-bar glass-ring"
      role="region"
      aria-label="Simulador de rol de usuario"
      data-role-simulator=""
    >
      <button
        type="button"
        className="seg-btn text-xs min-h-7 px-2.5"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span style={{ color: "var(--pl-brand)" }} className="font-extrabold">
          Rol:
        </span>
        <span>{activeRole.short}</span>
        <span aria-hidden="true">{expanded ? "✕" : "▾"}</span>
      </button>
      {expanded
        ? roles.map((r) => (
            <button
              key={r.id}
              type="button"
              className="seg-btn text-xs min-h-7 px-2.5"
              aria-pressed={viewerRole === r.id}
              data-sim-role={r.id}
              onClick={() => {
                setViewerRole(r.id);
                setExpanded(false);
              }}
            >
              {r.label}
            </button>
          ))
        : null}
    </div>
  );
}

export function ToastViewport(): React.JSX.Element | null {
  const { toasts } = usePlatform();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-pill-bar glass-ring rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg flex items-center gap-2.5"
        >
          <span
            className="dot"
            aria-hidden="true"
            style={{
              color:
                t.tone === "success"
                  ? "var(--pl-success)"
                  : t.tone === "warning"
                    ? "var(--pl-warning)"
                    : t.tone === "danger"
                      ? "var(--pl-danger)"
                      : "var(--pl-brand)",
            }}
          />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
