"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports.js";
import { formatOddsValue, getSessionWatermark } from "../access-guard.js";
import {
  ExampleBadge,
  ExampleNotice,
  LensGlowOrbs,
  MaestroIcon,
} from "../components/MaestroPrimitives.js";
import { MatchTicketCard } from "../components/MatchTicketCard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import { TechPrecisionSection } from "../public/TechAndPricingSurfaces.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  SPACETIME_ENGINES,
  SPACETIME_METRICS_HEADLINE,
  TIPSTAR_CREATORS,
} from "../spacetime-catalog.js";
import type { RiskBand } from "../types.js";

export function ClubTechView(): React.JSX.Element {
  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tech">
        <TechPrecisionSection inClub />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function HistorialClubView(): React.JSX.Element {
  const { dataset } = usePlatform();
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "hit" | "miss">("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const allFt = useMemo(
    () => dataset.games.filter((g) => g.status === "FT" && g.score),
    [dataset.games],
  );

  const finishedGames = useMemo(
    () =>
      allFt.filter((g) => {
        if (leagueFilter !== "all" && g.league !== leagueFilter) return false;
        const res = g.picks[0]?.result;
        if (outcomeFilter === "hit") return res === "hit";
        if (outcomeFilter === "miss") return res === "miss";
        return true;
      }),
    [allFt, leagueFilter, outcomeFilter],
  );

  const hitsCount = allFt.filter((g) => g.picks[0]?.result === "hit").length;
  const hitRatePct = allFt.length
    ? ((hitsCount / allFt.length) * 100).toFixed(1)
    : "0.0";

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <section className="glass-lens glass-ring relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5">
          <LensGlowOrbs subtle />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="pl-pill pl-pill--success">
                <MaestroIcon name="shield" size={13} />
                <span>Registro Público Inmutable · Partidos Finalizados FT</span>
              </span>
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Resultados Cerrados y Auditoría ({allFt.length} encuentros)
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Boletos congelados al silbatazo inicial frente al marcador oficial. Públicos y
                auditables sin fuga de pronósticos futuros.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="seg-well"
                role="group"
                aria-label="Filtrar resultados cerrados"
              >
                {(["all", "hit", "miss"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={outcomeFilter === f}
                    onClick={() => setOutcomeFilter(f)}
                  >
                    {f === "all"
                      ? "Todos"
                      : f === "hit"
                        ? "Cumplidos"
                        : "No cumplidos"}
                  </button>
                ))}
              </div>

              <select
                aria-label="Liga en historial"
                value={leagueFilter}
                onChange={(e) => setLeagueFilter(e.target.value)}
                className="glass-input px-3 py-1.5 text-xs font-semibold min-h-9"
              >
                <option value="all">Todas las ligas ({allFt.length})</option>
                {dataset.leagues.map((l) => (
                  <option key={l.league} value={l.league}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tira de 4 KPIs de Auditoría Pública */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Encuentros liquidados FT</span>
                <MaestroIcon
                  name="calendar"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong className="block text-2xl font-extrabold">{allFt.length}</strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Marcadores oficiales cerrados
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
                <span>Picks principales cumplidos</span>
                <MaestroIcon
                  name="check"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                {hitsCount} / {allFt.length} ({hitRatePct} %)
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Calificación automática post-juego
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
                <span>Desviación de calibración</span>
                <MaestroIcon
                  name="activity"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {SPACETIME_METRICS_HEADLINE.calibrationError}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Spacetime Suite v3.0 auditada
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
                <span>Integridad histórica</span>
                <MaestroIcon
                  name="shield"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong className="block text-xl sm:text-2xl font-extrabold">
                0 editados
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-success)" }}>
                0 picks editados o borrados
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {finishedGames.slice(0, 15).map((g) => (
            <MatchTicketCard key={g.id} game={g} />
          ))}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function BitacoraClubView(): React.JSX.Element {
  const {
    dataset,
    journal,
    oddsFormat,
    watchlistGameIds,
    toggleWatchlistGame,
    exportJournalCsv,
    openShareTicket,
    pushToast,
    navigateTo,
  } = usePlatform();

  const [publicRecordVisible, setPublicRecordVisible] = useState<boolean>(true);

  const stats = useMemo(() => {
    let netUnits = 0;
    let clvSum = 0;
    let won = 0;
    let lost = 0;
    let settled = 0;
    for (const j of journal) {
      clvSum += j.clvPct;
      if (j.status === "won") {
        won += 1;
        settled += 1;
        netUnits += j.units * (j.userDecimal - 1);
      } else if (j.status === "lost") {
        lost += 1;
        settled += 1;
        netUnits -= j.units;
      }
    }
    return {
      won,
      lost,
      netUnits: Math.round(netUnits * 100) / 100,
      avgClv: journal.length ? Math.round((clvSum / journal.length) * 10) / 10 : 0,
      winRate: settled ? Math.round((won / settled) * 1000) / 10 : 0,
    };
  }, [journal]);

  const watchedGames = useMemo(
    () => dataset.games.filter((g) => watchlistGameIds.includes(g.id)),
    [dataset.games, watchlistGameIds],
  );

  const suggestedUpcoming = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status !== "FT" && !watchlistGameIds.includes(g.id))
        .slice(0, 3),
    [dataset.games, watchlistGameIds],
  );

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/lab">
        <section className="glass-lens glass-ring relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5">
          <LensGlowOrbs subtle />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="pl-pill pl-pill--brand">
                <MaestroIcon name="ticket" size={13} />
                <span>Unidades Simuladas Auditadas · CLV Automático</span>
              </span>
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Mi Bitácora Cuantitativa
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Registro en unidades simuladas (0.25u–5.0u) para picks individuales y parlays
                combinados.
              </p>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }} data-local-storage-note="">
                Por ahora tu Bitácora se guarda en este navegador. Cuando actives tu cuenta se
                sincronizará y quedará sellada en el servidor.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="pl-btn-primary text-xs"
                onClick={() =>
                  openShareTicket({
                    kind: "pick",
                    title: "Récord Verificado · Bitácora PitchLab",
                    subtitle: `@socio_pl · ${journal.length} boletos sellados`,
                    leagueLabel: "Récord Auditado",
                    pickLabel: `${stats.won}G-${stats.lost}P · ${
                      stats.netUnits >= 0 ? `+${stats.netUnits.toFixed(2)}` : stats.netUnits.toFixed(2)
                    }u · CLV +${stats.avgClv.toFixed(1)} %`,
                    probability: Math.max(0.5, stats.winRate / 100),
                    fairDecimal: 1.72,
                    marketDecimal: 1.91,
                    units: Math.max(1, Math.abs(stats.netUnits)),
                    gameStatus: "FT",
                  })
                }
              >
                <MaestroIcon name="share" size={14} />
                <span>Compartir Récord 4:5 / 9:16</span>
              </button>

              <button
                type="button"
                className="pl-btn-glass text-xs"
                onClick={() => exportJournalCsv()}
              >
                <MaestroIcon name="download" size={14} />
                <span>Exportar Bitácora CSV</span>
              </button>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-1 hairline-t">
            <span className="text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Visibilidad de tu insignia de unidades y CLV en Comunidad VIP y Ranking:
            </span>
            <Switch
              isSelected={publicRecordVisible}
              onChange={(next) => {
                setPublicRecordVisible(next);
                pushToast(
                  next
                    ? "Tu récord auditado es visible en tu perfil VIP."
                    : "Tu récord pasó a modo privado (solo tú puedes verlo).",
                  "default",
                );
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content>
                <span className="text-xs font-bold">
                  Mostrar mi récord en perfil VIP
                </span>
              </Switch.Content>
            </Switch>
          </div>

          {/* 4 KPI Lenses */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Balance en unidades</span>
                <MaestroIcon
                  name="chart"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{
                  color: stats.netUnits >= 0 ? "var(--pl-success)" : "var(--pl-danger)",
                }}
              >
                {stats.netUnits >= 0
                  ? `+${stats.netUnits.toFixed(2)}u`
                  : `${stats.netUnits.toFixed(2)}u`}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Récord {stats.won}G – {stats.lost}P resueltos
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
                <span>CLV Promedio</span>
                <MaestroIcon
                  name="bolt"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                +{stats.avgClv.toFixed(1)} %
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Frente a cuota justa Geodesic
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
                <span>Acierto resuelto</span>
                <MaestroIcon
                  name="check"
                  size={15}
                  style={{ color: "var(--pl-info)" }}
                />
              </div>
              <strong className="block text-2xl font-extrabold">
                {stats.winRate.toFixed(1)} %
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {journal.length} boletos sellados totales
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
                <span>En vigilancia</span>
                <MaestroIcon
                  name="bell"
                  size={15}
                  style={{ color: "var(--pl-accent)" }}
                />
              </div>
              <strong className="block text-2xl font-extrabold">
                {watchlistGameIds.length}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Alertas de XI titular Cortex IA
              </span>
            </div>
          </div>
        </section>

        {/* Tabla de Bitácora Verificada */}
        <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-extrabold">
              Boletos Sellados ({journal.length})
            </h2>
            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Sellado criptográfico pre-partido · Sin edición posterior
            </span>
          </div>

          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label="Bitácora verificada de selecciones selladas"
          >
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr
                  className="hairline-b text-xs uppercase"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  <th scope="col" className="py-2.5 pr-3">
                    Corte
                  </th>
                  <th scope="col" className="py-2.5 pr-3">
                    Partido & Selección
                  </th>
                  <th scope="col" className="py-2.5 px-2">
                    Origen
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Unid.
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Tu Cuota
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    CLV
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Estado
                  </th>
                  <th scope="col" className="py-2.5 pl-2 text-right">
                    Boleto
                  </th>
                </tr>
              </thead>
              <tbody>
                {journal.map((item) => (
                  <tr key={item.id} className="hairline-b row-hover">
                    <td
                      className="py-3 pr-3 text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {item.sealedAt}
                    </td>
                    <th scope="row" className="py-3 pr-3 font-normal">
                      <strong className="block font-bold">{item.pickLabel}</strong>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {item.leagueLabel} · {item.matchLabel}
                        {item.note ? ` — “${item.note}”` : ""}
                      </span>
                    </th>
                    <td className="py-3 px-2">
                      <span className="pl-pill">{item.origin}</span>
                    </td>
                    <td className="py-3 px-2 text-right num font-bold">
                      {item.units.toFixed(2)}u
                    </td>
                    <td className="py-3 px-2 text-right num">
                      <span className="font-bold">
                        {formatOddsValue(item.userDecimal, oddsFormat)}
                      </span>
                      <span
                        className="block text-xs"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        Justa {formatOddsValue(item.fairDecimal, oddsFormat)}
                      </span>
                    </td>
                    <td
                      className="py-3 px-2 text-right num font-bold"
                      style={{
                        color:
                          item.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                      }}
                    >
                      {item.clvPct >= 0
                        ? `+${item.clvPct.toFixed(1)}`
                        : item.clvPct.toFixed(1)}{" "}
                      %
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span
                        className={
                          item.status === "won"
                            ? "pl-pill pl-pill--success"
                            : item.status === "lost"
                              ? "pl-pill pl-pill--danger"
                              : "pl-pill pl-pill--info"
                        }
                      >
                        {item.status === "won"
                          ? "Ganado"
                          : item.status === "lost"
                            ? "Perdido"
                            : "En juego"}
                      </span>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <button
                        type="button"
                        className="pl-btn-glass px-2.5 min-h-8 text-xs"
                        aria-label={`Compartir boleto ${item.pickLabel}`}
                        onClick={() =>
                          openShareTicket({
                            kind: "pick",
                            title: item.matchLabel,
                            subtitle: `${item.leagueLabel} · Bitácora PitchLab`,
                            leagueLabel: item.leagueLabel,
                            pickLabel: item.pickLabel,
                            probability: Math.min(0.88, Math.max(0.35, 1 / item.fairDecimal)),
                            fairDecimal: item.fairDecimal,
                            marketDecimal: item.userDecimal,
                            units: item.units,
                            gameStatus: item.status === "pending" ? "NS" : "FT",
                          })
                        }
                      >
                        <MaestroIcon name="share" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Partidos en Vigilancia 60m */}
        <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-lg font-extrabold flex items-center gap-2">
                <MaestroIcon
                  name="bell"
                  size={16}
                  style={{ color: "var(--pl-brand)" }}
                />
                <span>Partidos en vigilancia ({watchedGames.length})</span>
              </h2>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                Te avisaremos de valor nuevo en estos partidos. Las alertas de alineaciones llegan
                cuando conectemos la fuente oficial de convocatorias.
              </p>
            </div>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-3"
              onClick={() => navigateTo("/app")}
            >
              <span>Explorar jornada</span>
              <MaestroIcon name="chevronRight" size={14} />
            </button>
          </div>

          {watchedGames.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {watchedGames.map((g) => (
                <MatchTicketCard key={g.id} game={g} />
              ))}
            </div>
          ) : null}

          {suggestedUpcoming.length > 0 ? (
            <div className="space-y-2 pt-1">
              <span
                className="block text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {watchedGames.length === 0
                  ? "Vigila partidos próximos:"
                  : "Agregar más partidos a vigilancia:"}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {suggestedUpcoming.map((g) => (
                  <div
                    key={g.id}
                    className="glass-ring rounded-xl p-3 flex items-center justify-between gap-2"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamBadge
                        league={g.league}
                        slug={g.home.slug}
                        name={g.home.name}
                        size={20}
                      />
                      <div className="min-w-0">
                        <strong className="block text-xs font-bold truncate">
                          {g.home.shortName} vs {g.away.shortName}
                        </strong>
                        <span
                          className="block text-xs num truncate"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {g.leagueLabel} · {g.kickoffLocal}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-h-8 px-2.5 shrink-0"
                      onClick={() => toggleWatchlistGame(g.id)}
                    >
                      <MaestroIcon name="bell" size={13} />
                      <span>+ Vigilar</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

interface ResolvedAnalystProfile {
  handle: string;
  name: string;
  roleBadge: string;
  specialty: string;
  bio: string;
  avatarInitials: string;
  avatarGradVar: string;
  verifiedUnits: string;
  clvAvg: string;
  roi95Ci: string;
  settledCount: number;
  followers: number;
  following: number;
  favSlugs: readonly string[];
  isTipstar: boolean;
  promoCode?: string;
  weeklyPickSlug?: string;
}

export function AnalystProfileClubView({
  handle,
}: {
  handle: string;
}): React.JSX.Element {
  const {
    dataset,
    journal,
    socialPosts,
    oddsFormat,
    viewerRole,
    openShareTicket,
    pushToast,
    navigateTo,
  } = usePlatform();

  const [following, setFollowing] = useState<boolean>(true);
  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();

  const profile = useMemo<ResolvedAnalystProfile>(() => {
    const tipstar = TIPSTAR_CREATORS.find(
      (c) => c.handle.toLowerCase() === cleanHandle,
    );
    if (tipstar) {
      return {
        handle: tipstar.handle,
        name: tipstar.name,
        roleBadge: "Tipstar Oficial",
        specialty: tipstar.specialty,
        bio: tipstar.weeklyPickThesis,
        avatarInitials: tipstar.avatarInitials,
        avatarGradVar: tipstar.avatarGradVar,
        verifiedUnits: tipstar.verifiedUnits,
        clvAvg: tipstar.clvAvg,
        roi95Ci: tipstar.roi95Ci,
        settledCount: tipstar.settledCount,
        followers: 420 + tipstar.activeReferrals * 9,
        following: 28,
        favSlugs:
          tipstar.handle === "sofia_nfl"
            ? ["nfl", "liga-mx", "premier-league"]
            : tipstar.handle === "carlos_quant"
              ? ["premier-league", "laliga", "serie-a"]
              : ["liga-mx", "bundesliga", "nfl"],
        isTipstar: true,
        promoCode: tipstar.promoCode,
        weeklyPickSlug: tipstar.weeklyPickSlug,
      };
    }

    if (cleanHandle === "jair" || cleanHandle === "jair_founder") {
      return {
        handle: cleanHandle,
        name: "Jair R.",
        roleBadge: "Founder & Socio Pase Total",
        specialty: "NFL, Liga MX & Valor Geodesic",
        bio: "Investigación cuantitativa pre-partido con disciplina estricta de CLV contra cierre y gestión en unidades simuladas.",
        avatarInitials: "JR",
        avatarGradVar: "var(--avatar-grad-4)",
        verifiedUnits: "+9.2u",
        clvAvg: "+2.8 %",
        roi95Ci: "+4.6 % (±2.8 %)",
        settledCount: 112,
        followers: 184,
        following: 19,
        favSlugs: ["nfl", "liga-mx", "premier-league"],
        isTipstar: false,
      };
    }

    if (cleanHandle === "socio_pl") {
      return {
        handle: "socio_pl",
        name: "Socio Pase Total",
        roleBadge: "Socio Pase Total",
        specialty: "Bitácora Verificada Multi-Liga",
        bio: "Perfil auditado de socio activo en el Club PitchLab. Todos los picks están sellados antes del inicio del encuentro.",
        avatarInitials: "SP",
        avatarGradVar: "var(--avatar-grad-5)",
        verifiedUnits: "+6.4u",
        clvAvg: "+2.6 %",
        roi95Ci: "+4.1 % (±3.1 %)",
        settledCount: Math.max(34, journal.length * 8),
        followers: 42,
        following: 12,
        favSlugs: ["liga-mx", "nfl", "premier-league"],
        isTipstar: false,
      };
    }

    const fallback = TIPSTAR_CREATORS[0]!;
    return {
      handle: fallback.handle,
      name: fallback.name,
      roleBadge: "Tipstar Oficial",
      specialty: fallback.specialty,
      bio: fallback.weeklyPickThesis,
      avatarInitials: fallback.avatarInitials,
      avatarGradVar: fallback.avatarGradVar,
      verifiedUnits: fallback.verifiedUnits,
      clvAvg: fallback.clvAvg,
      roi95Ci: fallback.roi95Ci,
      settledCount: fallback.settledCount,
      followers: 762,
      following: 28,
      favSlugs: ["nfl", "liga-mx", "premier-league"],
      isTipstar: true,
      promoCode: fallback.promoCode,
      weeklyPickSlug: fallback.weeklyPickSlug,
    };
  }, [cleanHandle, journal.length]);

  const posts = useMemo(
    () =>
      socialPosts.filter(
        (p) =>
          p.authorHandle.toLowerCase() === profile.handle.toLowerCase() ||
          (profile.handle === "jair" && p.authorHandle === "jair_founder"),
      ),
    [profile.handle, socialPosts],
  );
  const isExampleProfile =
    TIPSTAR_CREATORS.some((c) => c.isExample && c.handle === profile.handle) ||
    socialPosts.some((p) => p.isExample && p.authorHandle === profile.handle);

  const memberJournalFeed =
    !profile.isTipstar ? journal.slice(0, 4) : [];

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/u/${profile.handle}`}>
        {isExampleProfile ? (
          <ExampleNotice>
            @{profile.handle} es un perfil de ejemplo. Su récord, unidades y publicaciones son
            ficticios y sirven para mostrar cómo se verá un perfil verificado.
          </ExampleNotice>
        ) : null}
        <section className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-6 space-y-5">
          <LensGlowOrbs />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span
                className="w-16 h-16 rounded-full avatar-ring inline-flex items-center justify-center text-xl font-extrabold shrink-0"
                style={{
                  background: profile.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
              >
                {profile.avatarInitials}
              </span>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {profile.name}
                  </h1>
                  {isExampleProfile ? <ExampleBadge /> : null}
                  <span
                    className={
                      profile.isTipstar
                        ? "pl-pill pl-pill--success"
                        : "pl-pill pl-pill--brand"
                    }
                  >
                    {profile.roleBadge}
                  </span>
                  {profile.promoCode ? (
                    <span className="pl-pill pl-pill--info num">
                      CÓDIGO: {profile.promoCode}
                    </span>
                  ) : null}
                </div>

                <div
                  className="flex flex-wrap items-center gap-3 text-xs num"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  <span>@{profile.handle}</span>
                  <span>
                    <strong style={{ color: "var(--pl-text)" }}>
                      {profile.followers + (following ? 1 : 0)}
                    </strong>{" "}
                    seguidores
                  </span>
                  <span>
                    <strong style={{ color: "var(--pl-text)" }}>
                      {profile.following}
                    </strong>{" "}
                    siguiendo
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {dataset.leagues
                      .filter((lg) => profile.favSlugs.includes(lg.league))
                      .map((lg) => (
                        <LeagueBadge
                          key={lg.league}
                          league={lg.league}
                          label={lg.label}
                          size={16}
                        />
                      ))}
                  </span>
                </div>

                <p
                  className="m-0 text-sm max-w-2xl"
                  style={{ color: "var(--pl-text-secondary)" }}
                >
                  {profile.bio}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="pl-btn-glass text-xs"
                onClick={() => {
                  setFollowing((prev) => !prev);
                  pushToast(
                    following
                      ? `Dejaste de seguir a @${profile.handle}.`
                      : `Siguiendo boletos auditados de @${profile.handle}.`,
                    "default",
                  );
                }}
              >
                <MaestroIcon name="users" size={14} />
                <span>{following ? "Siguiendo" : "+ Seguir analista"}</span>
              </button>

              {profile.isTipstar && profile.weeklyPickSlug ? (
                <a
                  href={`/p/${profile.weeklyPickSlug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(`/p/${profile.weeklyPickSlug}`);
                  }}
                  className="pl-btn-primary text-xs"
                >
                  <MaestroIcon name="unlock" size={14} />
                  <span>Ver Pick Abierto Semanal ({profile.promoCode}) →</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="pl-btn-primary text-xs"
                  onClick={() =>
                    openShareTicket({
                      kind: "pick",
                      title: `Perfil Auditado · @${profile.handle}`,
                      subtitle: profile.specialty,
                      leagueLabel: "Récord Verificado",
                      pickLabel: `${profile.verifiedUnits} · CLV ${profile.clvAvg} · ROI ${profile.roi95Ci}`,
                      probability: 0.63,
                      fairDecimal: 1.59,
                      marketDecimal: 1.87,
                      units: 1.5,
                      gameStatus: "FT",
                    })
                  }
                >
                  <MaestroIcon name="share" size={14} />
                  <span>Compartir Tarjeta de Récord</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative z-10 ticket-perf" />

          {/* 4 Métricas Verificadas */}
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Unidades verificadas
              </span>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                {profile.verifiedUnits}
              </strong>
            </div>
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                CLV Medio
              </span>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {profile.clvAvg}
              </strong>
            </div>
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                ROI (IC 95 %)
              </span>
              <strong className="block text-xl sm:text-2xl font-extrabold">
                {profile.roi95Ci}
              </strong>
            </div>
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Muestra auditada
              </span>
              <strong className="block text-2xl font-extrabold">
                {profile.settledCount} picks
              </strong>
            </div>
          </div>
        </section>

        {/* Boletos y aportes verificados */}
        <section className="space-y-3">
          <h2 className="m-0 text-lg font-extrabold">
            Boletos y aportes recientes de @{profile.handle}
          </h2>

          {posts.map((p) => (
            <article
              key={p.id}
              className="glass-card glass-ring rounded-2xl p-5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="pl-pill pl-pill--brand">
                  {p.leagueLabel} · {p.originType}
                </span>
                <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                  {p.createdAt}
                </span>
              </div>
              {viewerRole !== "visitor" || profile.isTipstar ? (
                <>
                  <strong className="block text-sm font-extrabold uppercase">
                    {p.matchLabel} — {p.pickBadge}
                  </strong>
                  <p
                    className="m-0 text-sm"
                    style={{ color: "var(--pl-text-secondary)" }}
                  >
                    {p.body}
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="locked-redact font-extrabold text-sm">
                    BOLETO ACTIVO RESERVADO PASE TOTAL
                  </span>
                  <a
                    href="/signup"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo("/signup");
                    }}
                    className="pl-btn-primary text-xs min-h-8 px-3"
                  >
                    Desbloquear
                  </a>
                </div>
              )}
            </article>
          ))}

          {memberJournalFeed.map((j) => (
            <article
              key={j.id}
              className="glass-card glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {j.leagueLabel} · {j.matchLabel} · {j.sealedAt}
                </span>
                <strong className="block text-sm font-extrabold uppercase mt-0.5">
                  {j.pickLabel} ({j.units.toFixed(1)}u)
                </strong>
              </div>
              <div className="text-right num text-xs">
                <strong className="block text-sm">
                  {formatOddsValue(j.userDecimal, oddsFormat)}
                </strong>
                <span
                  style={{
                    color: j.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                  }}
                >
                  CLV +{j.clvPct.toFixed(1)} %
                </span>
              </div>
            </article>
          ))}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

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
                <span className="pl-pill pl-pill--brand">
                  Membresía Única · Referidos Doble Vía · CFDI 4.0
                </span>
                <h1 className="m-0 mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Mi Cuenta, Referidos y Facturación
                </h1>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  @socio_pl · {MEMBERSHIP_SPEC.name} · Marca anti-fuga {watermark}
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
              <span>Referidos (+15 días)</span>
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
              <span>Pase Total</span>
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
              <span>CFDI 4.0</span>
            </button>
          </div>
        </section>

        {/* PESTAÑA 1 (DEFAULT): REFERIDOS DOBLE VÍA (+15 DÍAS AMBOS) */}
        {accountTab === "referrals" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-referrals">
            <section
              className="glass-lens glass-ring glass-ring--featured relative overflow-hidden rounded-3xl p-6 space-y-5"
              data-referrals-card=""
            >
              <LensGlowOrbs />
              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="pl-pill pl-pill--success">
                      <MaestroIcon name="gift" size={13} />
                      <span>Socio ↔ Socio · Ambos Ganan +15 Días Gratis</span>
                    </span>
                    <h2 className="m-0 text-xl sm:text-2xl font-extrabold tracking-tight">
                      Invita amigos a PitchLab y ambos acumulan tiempo gratis
                    </h2>
                    <p
                      className="m-0 text-sm max-w-2xl"
                      style={{ color: "var(--pl-text-secondary)" }}
                    >
                      Tu enlace otorga a tu invitado{" "}
                      <strong>{MEMBERSHIP_SPEC.referralFriendBenefit}</strong>. En cuanto
                      liquida su primer mes, <strong>ambos reciben +15 días gratis</strong>{" "}
                      automáticos en su Pase Total.
                    </p>
                  </div>

                  {isAmbassador ? (
                    <span className="pl-pill pl-pill--brand">
                      <MaestroIcon name="star" size={13} />
                      <span>Insignia Embajador Activa (+30d extra)</span>
                    </span>
                  ) : null}
                </div>

                {/* Flujo visual en 3 pasos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div
                    className="glass-ring rounded-2xl p-4 space-y-1"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      Paso 1 · Invitación
                    </span>
                    <strong className="block text-sm font-bold">
                      7 días gratis + 30 % off
                    </strong>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Tu amigo entra con acceso completo y paga solo $209 MXN en su 1.er mes.
                    </p>
                  </div>

                  <div
                    className="glass-ring rounded-2xl p-4 space-y-1"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: "var(--pl-success)" }}
                    >
                      Paso 2 · Recompensa Bilateral
                    </span>
                    <strong className="block text-sm font-bold">
                      +15 días gratis para ambos
                    </strong>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Se acreditan al instante en el saldo de días de tu amigo y en el tuyo.
                    </p>
                  </div>

                  <div
                    className="glass-ring rounded-2xl p-4 space-y-1"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: "var(--pl-accent)" }}
                    >
                      Paso 3 · Meta Embajador
                    </span>
                    <strong className="block text-sm font-bold">
                      5 amigos = +30 días extra
                    </strong>
                    <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Al quinto socio referido activo recibes un mes adicional completo sin costo.
                    </p>
                  </div>
                </div>

                {/* Caja de enlace personal */}
                <div className="glass-input rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Tu enlace personal verificado
                    </span>
                    <strong
                      className="block text-sm font-extrabold num truncate"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      https://pitchlab.mx/signup?ref=SOCIO-8842
                    </strong>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="pl-btn-primary text-xs"
                      onClick={() => {
                        try {
                          void navigator.clipboard?.writeText(
                            "https://pitchlab.mx/signup?ref=SOCIO-8842",
                          );
                        } catch (err) {
                          void err;
                        }
                        pushToast(
                          "Enlace de referido copiado al portapapeles.",
                          "success",
                        );
                      }}
                    >
                      <MaestroIcon name="copy" size={14} />
                      <span>Copiar mi enlace de referido</span>
                    </button>

                    {/* Con cuentas, el conteo es real; simular queda solo como herramienta de preview. */}
                    {!accountsEnabled || allowRoleSimulation ? (
                      <button
                        type="button"
                        className="pl-btn-glass text-xs"
                        data-simulate-referral=""
                        onClick={simulateFriendFirstPayment}
                      >
                        <MaestroIcon name="plus" size={14} />
                        <span>Simular 1er pago de amigo (+15d ambos)</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* 3 KPIs + Barra de Progreso Embajador 5 amigos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 num">
                  <div
                    className="glass-ring rounded-2xl p-4"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Amigos con 1er mes pagado
                    </span>
                    <strong
                      className="text-2xl font-extrabold"
                      data-referral-friends=""
                    >
                      {referralPaidFriends} / 5
                    </strong>
                  </div>

                  <div
                    className="glass-ring rounded-2xl p-4"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Días gratis acumulados
                    </span>
                    <strong
                      className="text-2xl font-extrabold"
                      style={{ color: "var(--pl-success)" }}
                      data-referral-days=""
                    >
                      +{earnedDays} días
                    </strong>
                  </div>

                  <div
                    className="glass-ring rounded-2xl p-4"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <span
                      className="block text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      Código personal
                    </span>
                    <strong
                      className="text-xl font-extrabold"
                      style={{ color: "var(--pl-brand)" }}
                    >
                      SOCIO-8842
                    </strong>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs num">
                    <span style={{ color: "var(--pl-text-secondary)" }}>
                      Barra de Progreso Embajador (+30d extra al llegar a 5 amigos)
                    </span>
                    <strong style={{ color: "var(--pl-brand)" }}>
                      {Math.min(5, referralPaidFriends)} / 5 amigos ({ambassadorPct} %)
                    </strong>
                  </div>
                  <div
                    className="pbar pos"
                    style={{ "--w": `${ambassadorPct}%` } as React.CSSProperties}
                  >
                    <span />
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {/* PESTAÑA 2: PASE TOTAL ($299 MENSUAL VS $2,390 ANUAL) */}
        {accountTab === "plan" ? (
          <div role="tabpanel" aria-labelledby="acct-tab-plan">
            <section className="glass-lens glass-ring relative overflow-hidden rounded-3xl p-6 space-y-5">
              <LensGlowOrbs subtle />
              <div className="relative z-10 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="pl-pill pl-pill--success">
                      {month1NoCardMode
                        ? "Mes 1 Lanzamiento · Prueba sin tarjeta activa"
                        : "Mes 2+ · Verificación bancaria $0 MXN"}
                    </span>
                    <h2 className="m-0 mt-1 text-xl sm:text-2xl font-extrabold">
                      {MEMBERSHIP_SPEC.name}
                    </h2>
                  </div>

                  <div
                    className="seg-well"
                    role="group"
                    aria-label="Ciclo de facturación Pase Total"
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
                            ? "Plan actualizado a Pase Total Anual ($2,390 MXN/año · ahorras 4 meses)."
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
                    "Armador Inteligente de Parlays & SGP con Geodesic v2.0",
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
                <span className="block text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                  Perfil predeterminado en Multi-Picks y Parlays
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
                <span className="block text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
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
                Admin Founder · Prueba $0, Anti-Abuso, Tipstars y Motores
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
                Cada creador recibe Pase Total bonificado, 1 Pick Abierto semanal y 25 % de
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
                  className="hairline-b text-xs uppercase"
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
                Prueba fuera de muestra: {SPACETIME_METRICS_HEADLINE.historicalMatches} partidos ·{" "}
                {dataCutLabel}
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
