"use client";

import React from "react";
import {
  isNationalCompetition,
  sportHasDraw,
  sportScoringUnit,
  type StandingRow,
} from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { useOptionalPlatformActions } from "../../platform-provider";
import type { PlatformGame } from "../../types";
import { HONEST_NO_ABSENCES_COPY } from "./pre-match-logic";

type Result = "G" | "E" | "P";

/** «P-G-G-G-G · 4-1» → ["P","G","G","G","G"]. */
export function parseForm(value: string): Result[] {
  const head = value.split("·")[0] ?? "";
  return (head.match(/[GEPWDL]/g) ?? []).map((c) => (c === "W" ? "G" : c === "D" ? "E" : c === "L" ? "P" : (c as Result)));
}

const RESULT_COPY: Record<Result, string> = { G: "Ganó", E: "Empató", P: "Perdió" };

function FormDots({ form }: { form: Result[] }): React.JSX.Element {
  return (
    <span
      className="pl-form"
      role="img"
      aria-label={`Últimos ${form.length}: ${form.map((r) => RESULT_COPY[r]).join(", ")}`}
    >
      {form.map((r, i) => (
        <span key={i} className={`pl-form-dot is-${r}`} aria-hidden="true">
          {r}
        </span>
      ))}
    </span>
  );
}

/** «129 pts a favor · 94 en contra» con 5 partidos → por partido. */
function perGame(sub: string | undefined, games: number): { for: number; against: number } | null {
  if (!sub || games <= 0) return null;
  const nums = sub.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  return { for: Number(nums[0]) / games, against: Number(nums[1]) / games };
}

function standingSlug(teamId: string): string {
  return (teamId.includes(".") ? teamId.split(".")[1]! : teamId).toLowerCase();
}

function matchSideForStanding(
  row: StandingRow,
  game: PlatformGame,
): "home" | "away" | null {
  const rowSlug = standingSlug(row.teamId);
  const rowName = row.name.trim().toLowerCase();
  const homeSlug = game.home.slug.toLowerCase();
  const awaySlug = game.away.slug.toLowerCase();
  if (
    rowSlug === homeSlug ||
    rowName === game.home.name.trim().toLowerCase() ||
    rowName === game.home.shortName.trim().toLowerCase()
  ) {
    return "home";
  }
  if (
    rowSlug === awaySlug ||
    rowName === game.away.name.trim().toLowerCase() ||
    rowName === game.away.shortName.trim().toLowerCase()
  ) {
    return "away";
  }
  return null;
}

function restComparisonLabel(game: PlatformGame): string | null {
  const home = game.restDays?.home;
  const away = game.restDays?.away;
  if (home === undefined || away === undefined) return null;
  if (home === away) {
    return `Igualdad de descanso (${home} ${home === 1 ? "día" : "días"} por lado)`;
  }
  const diff = Math.abs(home - away);
  const restedTeam = home > away ? game.home.shortName : game.away.shortName;
  return `${restedTeam} llega con +${diff} ${diff === 1 ? "día" : "días"} extra de descanso`;
}

/**
 * Contexto del partido: tabla de posiciones, cómo llega cada equipo (forma, producción,
 * descanso y bajas), la sede y el historial directo. Todo sale de datos reales del snapshot.
 */
export function MatchContextPanel({
  game,
  standings = [],
  unlocked = true,
  opinionsSlot,
}: {
  readonly game: PlatformGame;
  readonly standings?: readonly StandingRow[];
  readonly unlocked?: boolean;
  readonly opinionsSlot?: React.ReactNode;
}): React.JSX.Element {
  const platformActions = useOptionalPlatformActions();
  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport).short;
  const isFinished = game.status === "FT";
  const canReadContext = unlocked || isFinished;
  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const others = game.factors.filter((f) => f !== homeFactor && f !== awayFactor);
  const availability = game.spacetime?.availability;
  const stadium = game.spacetime?.stadium;
  const restBadge = restComparisonLabel(game);
  const absences = canReadContext ? game.preGame.absences : [];

  const homeStandingIdx = standings.findIndex(
    (r) => matchSideForStanding(r, game) === "home",
  );
  const awayStandingIdx = standings.findIndex(
    (r) => matchSideForStanding(r, game) === "away",
  );

  const sides = [
    {
      side: "home" as const,
      team: game.home,
      factor: homeFactor,
      rest: game.restDays?.home,
      injured: availability?.homeInjured ?? null,
      missing: availability?.homeMissingValuePct ?? null,
    },
    {
      side: "away" as const,
      team: game.away,
      factor: awayFactor,
      rest: game.restDays?.away,
      injured: availability?.awayInjured ?? null,
      missing: availability?.awayMissingValuePct ?? null,
    },
  ];

  const h2h = game.headToHead;
  const homeKey = game.home.shortName.toLowerCase();
  const wins = { home: 0, away: 0, draw: 0 };
  let goals = 0;
  for (const m of h2h) {
    goals += m.homeGoals + m.awayGoals;
    if (m.homeGoals === m.awayGoals) wins.draw += 1;
    else {
      const winner = m.homeGoals > m.awayGoals ? m.home : m.away;
      if (winner.toLowerCase().includes(homeKey) || homeKey.includes(winner.toLowerCase())) wins.home += 1;
      else wins.away += 1;
    }
  }

  return (
    <div className="pl-ctx">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 text-lg font-extrabold">Contexto del partido</h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Tabla de posiciones, forma reciente, bajas reportadas, descanso e historial directo.
          </p>
        </div>
        {restBadge ? (
          <span className="pl-pill pl-pill--brand num text-xs" data-ctx-rest="">
            {restBadge}
          </span>
        ) : null}
      </div>
      <section className="pl-ctx-teams" aria-label="Cómo llegan los equipos">
        {sides.map((s) => {
          const form = s.factor ? parseForm(s.factor.value) : [];
          const prod = perGame(s.factor?.sub, form.length);
          return (
            <article key={s.side} className="pl-ctx-team glass-card glass-ring">
              <header className="flex items-center gap-3">
                <TeamBadge
                  league={game.league}
                  slug={s.team.slug}
                  name={s.team.name}
                  logoUrl={s.team.logoUrl}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-base font-extrabold truncate">
                    <a
                      href={`/app/${game.league}/teams/${s.team.slug}`}
                      onClick={(e) => {
                        if (!platformActions) return;
                        e.preventDefault();
                        platformActions.navigateTo(`/app/${game.league}/teams/${s.team.slug}`);
                      }}
                      className="pl-team-link"
                      title={`Ver perfil de ${s.team.name}`}
                    >
                      {s.team.name}
                    </a>
                  </h3>
                  <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {game.neutralSite ? "Sede neutral" : s.side === "home" ? "Juega en casa" : "Juega de visita"} ·{" "}
                    {s.team.record}
                  </span>
                </div>
              </header>
              {form.length > 0 ? (
                <div className="pl-ctx-row">
                  <span>Últimos {form.length}</span>
                  <FormDots form={form} />
                </div>
              ) : null}
              <dl className="pl-ctx-stats">
                {prod ? (
                  <>
                    <div>
                      <dt>A favor</dt>
                      <dd className="num">
                        {prod.for.toFixed(1)} <small>{unit}/p</small>
                      </dd>
                    </div>
                    <div>
                      <dt>En contra</dt>
                      <dd className="num">
                        {prod.against.toFixed(1)} <small>{unit}/p</small>
                      </dd>
                    </div>
                  </>
                ) : null}
                {s.rest !== undefined ? (
                  <div>
                    <dt>Descanso</dt>
                    <dd className="num">
                      {s.rest} <small>días</small>
                    </dd>
                  </div>
                ) : null}
                {s.injured !== null ? (
                  <div>
                    <dt>Lesionados</dt>
                    <dd className="num">{s.injured}</dd>
                  </div>
                ) : null}
                {s.missing !== null ? (
                  <div>
                    <dt>Plantilla fuera</dt>
                    <dd className="num">
                      {s.missing} <small>%</small>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          );
        })}
      </section>

      <div className="pl-ctx-split">
        <section className="pl-ctx-card glass-card glass-ring" aria-labelledby="ctx-venue">
          <h3 id="ctx-venue" className="pl-cortex-label">
            Sede y ficha del encuentro
          </h3>
          <p className="m-0 flex items-center gap-2 text-sm font-bold">
            <MaestroIcon name="pin" size={15} />
            <span>{stadium?.name ?? game.venue}</span>
          </p>
          <dl className="pl-ctx-stats pl-ctx-facts-grid">
            <div>
              <dt>Condición</dt>
              <dd className="text-sm font-bold">
                {game.neutralSite ? "Sede neutral" : `Local: ${game.home.shortName}`}
              </dd>
            </div>
            <div>
              <dt>Visitante</dt>
              <dd className="text-sm font-bold">{game.away.shortName}</dd>
            </div>
            <div>
              <dt>Inicio</dt>
              <dd className="text-sm font-bold num">{game.kickoffLocal}</dd>
            </div>
            {game.referee ? (
              <div>
                <dt>Árbitro</dt>
                <dd className="text-sm font-bold inline-flex items-center gap-1.5">
                  <MaestroIcon name="whistle" size={14} />
                  <span>{game.referee}</span>
                </dd>
              </div>
            ) : null}
            {stadium?.elevationM ? (
              <div>
                <dt>Altitud</dt>
                <dd className="text-sm font-bold num">
                  {Math.round(stadium.elevationM).toLocaleString("es-MX")} m
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {game.dayLabel} · {game.kickoffLocal}
          </p>
          {others.length > 0 ? (
            <>
              <h3 className="pl-cortex-label mt-1">Otros datos del encuentro</h3>
              <dl className="pl-ctx-stats pl-ctx-facts-grid">
                {others.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd className="text-sm font-bold num">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </section>

        <section className="pl-ctx-card glass-card glass-ring" aria-labelledby="ctx-h2h">
          <h3 id="ctx-h2h" className="pl-cortex-label">
            Historial directo
          </h3>
          {h2h.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              No hay enfrentamientos previos registrados.
            </p>
          ) : (
            <>
              <div className="pl-ctx-h2h-sum num">
                <div>
                  <strong>{wins.home}</strong>
                  <span>{game.home.shortName}</span>
                </div>
                {hasDraw ? (
                  <div>
                    <strong>{wins.draw}</strong>
                    <span>Empates</span>
                  </div>
                ) : null}
                <div>
                  <strong>{wins.away}</strong>
                  <span>{game.away.shortName}</span>
                </div>
                <div>
                  <strong>{(goals / h2h.length).toFixed(1)}</strong>
                  <span>{unit} por partido</span>
                </div>
              </div>
              <ul className="pl-ctx-h2h" role="list">
                {h2h.map((m) => {
                  const draw = m.homeGoals === m.awayGoals;
                  const homeWon = m.homeGoals > m.awayGoals;
                  return (
                    <li key={`${m.date}-${m.home}`} className="num">
                      <span className="pl-ctx-date">{m.date}</span>
                      <span className={`truncate ${!draw && homeWon ? "font-extrabold" : ""}`}>{m.home}</span>
                      <strong className="pl-ctx-score">
                        {m.homeGoals}–{m.awayGoals}
                      </strong>
                      <span className={`truncate text-right ${!draw && !homeWon ? "font-extrabold" : ""}`}>{m.away}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Bajas y ausencias detalladas + Opiniones de socios lado a lado cuando existe */}
      {(() => {
        const absencesSection = (
          <section
            className="pl-ctx-card glass-card glass-ring"
            aria-labelledby="ctx-absences"
            data-ctx-absences=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="ctx-absences" className="pl-cortex-label m-0">
                Bajas y disponibilidad
              </h3>
              {canReadContext ? (
                <span className="text-xs num font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                  {absences.length > 0
                    ? `${absences.length} ${absences.length === 1 ? "reporte" : "reportes"}`
                    : "Sin bajas registradas"}
                </span>
              ) : null}
            </div>
            {!canReadContext ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                El reporte detallado de bajas y plantilla fuera está disponible con Pase PitchLab Ultra.
              </p>
            ) : absences.length > 0 ? (
              <ul className="pl-ctx-absences" role="list">
                {absences.map((item, idx) => (
                  <li key={`${item.player}-${idx}`} className="pl-ctx-absence-row">
                    <div className="min-w-0">
                      <strong className="block text-sm truncate">{item.player}</strong>
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                        {item.role}
                        {item.impactNote ? ` · ${item.impactNote}` : ""}
                      </span>
                    </div>
                    <span className="pl-pill text-[11px] shrink-0">{item.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                {HONEST_NO_ABSENCES_COPY}.
              </p>
            )}
          </section>
        );
        if (!opinionsSlot) return absencesSection;
        return (
          <div className="pl-ctx-split">
            {absencesSection}
            {opinionsSlot}
          </div>
        );
      })()}

      {/* Tabla de posiciones */}
      <section
        className="pl-ctx-card glass-card glass-ring"
        aria-labelledby="ctx-standings"
        data-ctx-standings=""
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ctx-standings" className="pl-cortex-label m-0">
            Tabla de posiciones · {game.leagueLabel}
          </h3>
          {standings.length > 0 && (homeStandingIdx >= 0 || awayStandingIdx >= 0) ? (
            <div className="flex flex-wrap items-center gap-2 text-xs num">
              {homeStandingIdx >= 0 ? (
                <span className="pl-pill pl-pill--brand">
                  {game.home.shortName}: {homeStandingIdx + 1}.º ({standings[homeStandingIdx]!.points} pts)
                </span>
              ) : null}
              {awayStandingIdx >= 0 ? (
                <span className="pl-pill">
                  {game.away.shortName}: {awayStandingIdx + 1}.º ({standings[awayStandingIdx]!.points} pts)
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {standings.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {game.sport !== "football"
              ? `La ${game.leagueLabel} se consulta por conferencia; arriba puedes comparar la marca de cada club.`
              : "La tabla oficial de esta jornada se actualizará con el siguiente corte."}
          </p>
        ) : (
          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label={`Tabla de posiciones de ${game.leagueLabel}`}
          >
            <table className="standings w-full text-left border-collapse text-sm">
              <thead>
                <tr className="hairline-b text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">Pos.</th>
                  <th scope="col" className="py-2 pr-3">
                    {isNationalCompetition(game.league) ? "Selección" : "Club"}
                  </th>
                  <th scope="col" className="py-2 px-2 text-right">PJ</th>
                  <th scope="col" className="py-2 px-2 text-right">G</th>
                  <th scope="col" className="py-2 px-2 text-right">E</th>
                  <th scope="col" className="py-2 px-2 text-right">P</th>
                  <th scope="col" className="py-2 px-2 text-right">DG</th>
                  <th scope="col" className="py-2 pl-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, idx) => {
                  const side = matchSideForStanding(row, game);
                  const slug = standingSlug(row.teamId);
                  const dg = row.goalsFor - row.goalsAgainst;
                  return (
                    <tr
                      key={row.teamId}
                      className={`hairline-b ${side ? "pl-ctx-standing-highlight" : ""}`.trim()}
                    >
                      <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 font-semibold">
                          <TeamBadge league={game.league} slug={slug} name={row.name} logoUrl={row.logoUrl} size={20} />
                          <a
                            href={`/app/${game.league}/teams/${slug}`}
                            onClick={(e) => {
                              if (!platformActions) return;
                              e.preventDefault();
                              platformActions.navigateTo(`/app/${game.league}/teams/${slug}`);
                            }}
                            className="pl-team-link"
                            title={`Ver perfil de ${row.name}`}
                          >
                            {row.name}
                          </a>
                          {side ? (
                            <span className="pl-pill text-[10px]">
                              {side === "home" ? "Local" : "Visita"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right num">{row.played}</td>
                      <td className="py-2.5 px-2 text-right num">{row.won}</td>
                      <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                      <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                      <td className="py-2.5 px-2 text-right num">{dg >= 0 ? `+${dg}` : dg}</td>
                      <td className="py-2.5 pl-2 text-right num font-extrabold">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
