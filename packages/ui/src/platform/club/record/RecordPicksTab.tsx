"use client";

import React, { useMemo, useState } from "react";
import { TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { MatchTicketCard } from "../../components/MatchTicketCard";
import type { ShareTicketPayload } from "../../platform-provider";
import type { JournalEntry, OddsFormat, PlatformGame } from "../../types";

type PickFilter = "all" | "open" | "closed";

const ORIGIN_SHORT_LABEL: Record<string, string> = {
  "Spacetime Suite": "Modelo",
  "Parlay Combinado": "Parlay",
  "Player Prop": "Prop",
  Propio: "Propio",
};

export function RecordPicksTab({
  journal,
  oddsFormat,
  watchedGames,
  suggestedUpcoming,
  onToggleWatchlist,
  onNavigateHome,
  onOpenWinningEntry,
  onOpenShareTicket,
}: {
  journal: readonly JournalEntry[];
  oddsFormat: OddsFormat;
  watchedGames: readonly PlatformGame[];
  suggestedUpcoming: readonly PlatformGame[];
  onToggleWatchlist: (gameId: string) => void;
  onNavigateHome: () => void;
  onOpenWinningEntry: (entry: JournalEntry) => void;
  onOpenShareTicket: (payload: ShareTicketPayload) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState<PickFilter>("all");

  const openCount = useMemo(
    () => journal.filter((item) => item.status === "pending").length,
    [journal],
  );
  const closedCount = journal.length - openCount;

  const filtered = useMemo(() => {
    if (filter === "open") return journal.filter((item) => item.status === "pending");
    if (filter === "closed") return journal.filter((item) => item.status !== "pending");
    return journal;
  }, [filter, journal]);

  return (
    <div className="pl-rec-stack">
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-picks-heading">
        <div className="pl-rec-card-head">
          <div>
            <h2 id="pl-rec-picks-heading" className="pl-rec-card-title">
              Picks sellados ({journal.length})
            </h2>
            <p className="pl-rec-card-meta">
              Sellados antes del arranque · sin edición posterior
            </p>
          </div>

          <div className="pl-rec-filter-row num" role="group" aria-label="Filtrar picks por estado">
            {(
              [
                ["all", `Todos · ${journal.length}`],
                ["open", `Abiertos · ${openCount}`],
                ["closed", `Cerrados · ${closedCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="pl-rec-chip"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="pl-rec-hint">
              {journal.length === 0
                ? "Todavía no sellas ningún pick. Elige un partido de hoy para registrar el primero."
                : "No tienes picks en este estado."}
            </p>
            {journal.length === 0 ? (
              <button
                type="button"
                className="pl-rec-btn pl-rec-btn--primary"
                onClick={onNavigateHome}
              >
                <span>Ver partidos de hoy</span>
                <MaestroIcon name="chevronRight" size={14} />
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label="Tabla de picks sellados en Mi récord"
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
                    Partido y pick
                  </th>
                  <th scope="col" className="py-2.5 px-2">
                    Origen
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Unid.
                  </th>
                  <th scope="col" className="py-2.5 px-2 text-right">
                    Tu momio
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
                {filtered.map((item) => (
                  <tr key={item.id} className="hairline-b row-hover">
                    <td
                      className="py-3 pr-3 text-xs num"
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
                      <span className="pl-pill">
                        {ORIGIN_SHORT_LABEL[item.origin] ?? item.origin}
                      </span>
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
                        Justo {formatOddsValue(item.fairDecimal, oddsFormat)}
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
                          ? "Cumplido"
                          : item.status === "lost"
                            ? "No cumplido"
                            : "Abierto"}
                      </span>
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <button
                        type="button"
                        className={`${item.status === "won" ? "pl-btn-primary" : "pl-btn-glass"} px-2.5 min-h-8 text-xs inline-flex items-center`}
                        aria-label={`Compartir boleto ${item.pickLabel}`}
                        onClick={() =>
                          item.status === "won"
                            ? onOpenWinningEntry(item)
                            : onOpenShareTicket({
                                kind: "pick",
                                title: item.matchLabel,
                                subtitle: `${item.leagueLabel} · Mi récord PitchLab`,
                                leagueLabel: item.leagueLabel,
                                pickLabel: item.pickLabel,
                                probability: Math.min(
                                  0.88,
                                  Math.max(0.35, 1 / item.fairDecimal),
                                ),
                                fairDecimal: item.fairDecimal,
                                marketDecimal: item.userDecimal,
                                units: item.units,
                                gameStatus: item.status === "pending" ? "NS" : "FT",
                                pickSlug: item.pickId,
                              })
                        }
                      >
                        <MaestroIcon name="share" size={13} />
                        {item.status === "won" ? <span className="ml-1">Boleto</span> : null}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Partidos en vigilancia */}
      <section className="pl-rec-card glass-card glass-ring" aria-labelledby="pl-rec-watch-heading">
        <div className="pl-rec-card-head">
          <div>
            <h2 id="pl-rec-watch-heading" className="pl-rec-card-title flex items-center gap-2">
              <MaestroIcon
                name="bell"
                size={16}
                style={{ color: "var(--pl-brand)" }}
              />
              <span>Partidos en vigilancia ({watchedGames.length})</span>
            </h2>
            <p className="pl-rec-card-meta">
              Te avisamos si surge valor nuevo en estos partidos antes del arranque.
            </p>
          </div>
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-8 px-3"
            onClick={onNavigateHome}
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
                    onClick={() => onToggleWatchlist(g.id)}
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
    </div>
  );
}
