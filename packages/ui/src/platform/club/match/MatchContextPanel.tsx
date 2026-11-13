"use client";

import React from "react";
import { TeamBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { PlatformGame } from "../../types";

type Result = "G" | "E" | "P";

/** «P-G-G-G-G · 4-1» → ["P","G","G","G","G"]. */
export function parseForm(value: string): Result[] {
  const head = value.split("·")[0] ?? "";
  return (head.match(/[GEPWDL]/g) ?? []).map((c) => (c === "W" ? "G" : c === "D" ? "E" : c === "L" ? "P" : (c as Result)));
}

const RESULT_COPY: Record<Result, string> = { G: "Ganó", E: "Empató", P: "Perdió" };

function FormDots({ form }: { form: Result[] }): React.JSX.Element {
  return (
    <span className="pl-form" aria-label={`Últimos ${form.length}: ${form.map((r) => RESULT_COPY[r]).join(", ")}`}>
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

/**
 * Contexto del partido: cómo llega cada equipo (forma, producción, descanso y bajas), la sede
 * y el historial directo con su resumen. Todo sale de datos reales del snapshot y del motor.
 */
export function MatchContextPanel({ game }: { game: PlatformGame }): React.JSX.Element {
  const isNfl = game.sport === "american-football";
  const unit = isNfl ? "pts" : "goles";
  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const others = game.factors.filter((f) => f !== homeFactor && f !== awayFactor);
  const availability = game.spacetime?.availability;
  const stadium = game.spacetime?.stadium;

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
      <div>
        <h2 className="m-0 text-lg font-extrabold">Contexto del partido</h2>
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Cómo llega cada equipo, dónde se juega y qué pasó las últimas veces que se vieron.
        </p>
      </div>
      <section className="pl-ctx-teams" aria-label="Cómo llegan los equipos">
        {sides.map((s) => {
          const form = s.factor ? parseForm(s.factor.value) : [];
          const prod = perGame(s.factor?.sub, form.length);
          return (
            <article key={s.side} className="pl-ctx-team glass-card glass-ring">
              <header className="flex items-center gap-3">
                <TeamBadge league={game.league} slug={s.team.slug} name={s.team.name} size={32} />
                <div className="min-w-0 flex-1">
                  <h3 className="m-0 text-base font-extrabold truncate">{s.team.name}</h3>
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
            Sede
          </h3>
          <p className="m-0 flex items-center gap-2 text-sm font-bold">
            <MaestroIcon name="pin" size={15} />
            <span>{stadium?.name ?? game.venue}</span>
          </p>
          <ul className="pl-ctx-facts">
            <li>
              {game.neutralSite
                ? "Sede neutral: ningún equipo juega en casa."
                : `Local: ${game.home.name}. Visitante: ${game.away.name}.`}
            </li>
            {stadium?.elevationM ? (
              <li className="num">Altitud: {Math.round(stadium.elevationM).toLocaleString("es-MX")} m sobre el nivel del mar.</li>
            ) : null}
            <li>
              {game.dayLabel} · {game.kickoffLocal} (hora del centro de México)
            </li>
          </ul>
          {others.length > 0 ? (
            <>
              <h3 className="pl-cortex-label mt-2">Otros datos</h3>
              <ul className="pl-ctx-facts">
                {others.map((f) => (
                  <li key={f.label}>
                    <strong>{f.label}:</strong> {f.value}
                    {f.sub ? <span style={{ color: "var(--pl-text-muted)" }}> · {f.sub}</span> : null}
                  </li>
                ))}
              </ul>
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
                {isNfl ? null : (
                  <div>
                    <strong>{wins.draw}</strong>
                    <span>Empates</span>
                  </div>
                )}
                <div>
                  <strong>{wins.away}</strong>
                  <span>{game.away.shortName}</span>
                </div>
                <div>
                  <strong>{(goals / h2h.length).toFixed(1)}</strong>
                  <span>{unit} por partido</span>
                </div>
              </div>
              <ul className="pl-ctx-h2h">
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
    </div>
  );
}
