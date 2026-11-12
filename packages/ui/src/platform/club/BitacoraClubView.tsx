"use client";

import React, { useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import { TeamBadge } from "../../sports";
import { formatOddsValue } from "../access-guard";
import { LensGlowOrbs, MaestroIcon } from "../components/MaestroPrimitives";
import { MatchTicketCard } from "../components/MatchTicketCard";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { ownHandleFor, usePlatform } from "../platform-provider";
import { formatUnitsAsMxn } from "./account/account-helpers";

export function BitacoraClubView(): React.JSX.Element {
  const {
    dataset,
    journal,
    oddsFormat,
    showMxnBalance,
    unitMxn,
    watchlistGameIds,
    toggleWatchlistGame,
    exportJournalCsv,
    openShareTicket,
    pushToast,
    navigateTo,
    viewerIdentity,
    viewerRole,
    accountsEnabled,
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
                Mi bitácora
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Registro en unidades simuladas (0.25u–5.0u) para picks individuales y parlays
                combinados.
              </p>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }} data-local-storage-note="">
                {accountsEnabled
                  ? "Sincronizada y sellada en tu cuenta de socio."
                  : "Por ahora tu Bitácora se guarda en este navegador. Cuando actives tu cuenta se sincronizará y quedará sellada en el servidor."}
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
                    subtitle: `@${ownHandleFor(viewerIdentity, viewerRole)} · ${journal.length} boletos sellados`,
                    leagueLabel: "Récord Auditado",
                    pickLabel: `${stats.won}G-${stats.lost}P · ${
                      stats.netUnits >= 0 ? `+${stats.netUnits.toFixed(2)}` : stats.netUnits.toFixed(2)
                    }u · CLV +${stats.avgClv.toFixed(1)} %`,
                    probability: Math.max(0.5, stats.winRate / 100),
                    fairDecimal: 1.72,
                    marketDecimal: 1.91,
                    units: Math.max(1, Math.abs(stats.netUnits)),
                    gameStatus: "FT",
                    pickSlug: journal[0]?.pickId,
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
              {showMxnBalance ? (
                <span
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-text-secondary)" }}
                  data-bitacora-mxn-balance=""
                >
                  ≈ {formatUnitsAsMxn(stats.netUnits, unitMxn)} (1u = ${unitMxn.toLocaleString("es-MX")})
                </span>
              ) : null}
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
                  className="hairline-b text-xs"
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
                            pickSlug: item.pickId,
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
                className="block text-xs font-bold"
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
