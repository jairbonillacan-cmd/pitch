"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge } from "../../sports";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import type { PlatformGame } from "../types";

type Outcome = "all" | "hit" | "miss";

interface Rate {
  key: string;
  label: string;
  hits: number;
  total: number;
}

const pct = (hits: number, total: number) => (total > 0 ? (hits / total) * 100 : 0);

/** Acierto agrupado por una clave, de más a menos partidos. */
export function groupRates<T>(items: readonly T[], keyOf: (t: T) => { key: string; label: string }, hit: (t: T) => boolean): Rate[] {
  const m = new Map<string, Rate>();
  for (const it of items) {
    const { key, label } = keyOf(it);
    const r = m.get(key) ?? { key, label, hits: 0, total: 0 };
    r.total += 1;
    if (hit(it)) r.hits += 1;
    m.set(key, r);
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total);
}

function RateBars({ title, rates, renderIcon }: { title: string; rates: Rate[]; renderIcon?: (r: Rate) => React.ReactNode }): React.JSX.Element {
  return (
    <section className="pl-hist-card glass-card glass-ring" aria-label={title}>
      <h2 className="pl-cortex-label">{title}</h2>
      <ul className="pl-hist-bars">
        {rates.map((r) => {
          const v = pct(r.hits, r.total);
          return (
            <li key={r.key}>
              <span className="pl-hist-bar-label">
                {renderIcon?.(r)}
                <span className="truncate">{r.label}</span>
              </span>
              <span className="pl-hist-bar-track" aria-hidden="true">
                <span style={{ width: `${v}%` }} />
                <i style={{ left: "50%" }} />
              </span>
              <span className="pl-hist-bar-value num">
                <strong>{v.toFixed(0)} %</strong>
                <small>
                  {r.hits}/{r.total}
                </small>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
        La línea marca 50 %. Con pocos partidos el porcentaje se mueve mucho.
      </p>
    </section>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });

/**
 * Resultados: cada pick principal se publica antes del partido y se califica con el marcador
 * oficial. Acierto por liga y por tipo de pick, racha reciente y lista por día.
 */
export function HistorialClubView(): React.JSX.Element {
  const { dataset, navigateTo } = usePlatform();
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [league, setLeague] = useState("all");
  const [shown, setShown] = useState(20);

  const graded = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status === "FT" && g.score && (g.picks[0]?.result === "hit" || g.picks[0]?.result === "miss"))
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc)),
    [dataset.games],
  );
  const scoped = useMemo(() => graded.filter((g) => league === "all" || g.league === league), [graded, league]);
  const listed = useMemo(
    () => scoped.filter((g) => outcome === "all" || g.picks[0]?.result === outcome),
    [scoped, outcome],
  );

  const hits = scoped.filter((g) => g.picks[0]!.result === "hit").length;
  const recent = scoped.slice(0, 10);
  const byLeague = useMemo(
    () => groupRates(graded, (g) => ({ key: g.league, label: g.leagueLabel }), (g) => g.picks[0]!.result === "hit"),
    [graded],
  );
  const byCategory = useMemo(() => {
    const picks = scoped.flatMap((g) => g.picks.filter((p) => p.result === "hit" || p.result === "miss"));
    return groupRates(picks, (p) => ({ key: p.category, label: p.categoryLabel }), (p) => p.result === "hit");
  }, [scoped]);

  const days = useMemo(() => {
    const m = new Map<string, PlatformGame[]>();
    for (const g of listed.slice(0, shown)) {
      const k = g.kickoffUtc.slice(0, 10);
      const list = m.get(k) ?? [];
      list.push(g);
      m.set(k, list);
    }
    return Array.from(m.entries());
  }, [listed, shown]);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Resultados</h1>
            <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
              Cada pick principal se publica antes del partido y se califica con el marcador oficial. Aquí están
              todos, los que se dieron y los que no.
            </p>
          </div>
          <label className="pl-finder-select">
            <span>Liga</span>
            <select className="glass-input" value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="all">Todas</option>
              {byLeague.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="pl-hist-kpis" aria-label="Resumen">
          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Partidos calificados</span>
            <strong className="num">{scoped.length}</strong>
          </div>
          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Pick principal cumplido</span>
            <strong className="num">{pct(hits, scoped.length).toFixed(1)} %</strong>
            <small className="num">
              {hits} de {scoped.length}
            </small>
          </div>
          <div className="pl-hist-kpi glass-card glass-ring">
            <span>Últimos {recent.length}</span>
            <span className="pl-hist-streak" aria-label={`Últimos resultados: ${recent.map((g) => (g.picks[0]!.result === "hit" ? "cumplido" : "no cumplido")).join(", ")}`}>
              {recent.map((g) => (
                <span key={g.id} className={g.picks[0]!.result === "hit" ? "is-hit" : "is-miss"} aria-hidden="true">
                  <MaestroIcon name={g.picks[0]!.result === "hit" ? "check" : "x"} size={11} />
                </span>
              ))}
            </span>
          </div>
        </section>

        {scoped.length > 0 ? (
          <div className="pl-hist-grid">
            {league === "all" && byLeague.length > 1 ? (
              <RateBars
                title="Acierto por liga"
                rates={byLeague}
                renderIcon={(r) => <LeagueBadge league={r.key as PlatformGame["league"]} label={r.label} size={16} />}
              />
            ) : null}
            {byCategory.length > 0 ? <RateBars title="Acierto por tipo de pick" rates={byCategory} /> : null}
          </div>
        ) : null}

        <section className="space-y-3" aria-label="Partidos calificados">
          <div className="seg-well" role="group" aria-label="Filtrar por resultado">
            {(
              [
                ["all", "Todos"],
                ["hit", "Cumplidos"],
                ["miss", "No cumplidos"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="seg-btn text-xs"
                aria-pressed={outcome === id}
                onClick={() => {
                  setOutcome(id);
                  setShown(20);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {days.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-muted)" }}>
              Todavía no hay partidos calificados con ese filtro.
            </p>
          ) : (
            days.map(([day, games]) => (
              <div key={day} className="space-y-2">
                <h3 className="pl-home-day-head m-0 capitalize">{DAY_FMT.format(new Date(`${day}T18:00:00Z`))}</h3>
                <ul className="pl-hist-list">
                  {games.map((g) => {
                    const pick = g.picks[0]!;
                    const hit = pick.result === "hit";
                    const href = `/app/${g.league}/games/${g.id}`;
                    return (
                      <li key={g.id}>
                        <a
                          href={href}
                          className="pl-hist-row glass-card glass-ring"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateTo(href);
                          }}
                        >
                          <LeagueBadge league={g.league} label={g.leagueLabel} size={18} />
                          <span className="pl-hist-match">
                            <strong className="truncate">
                              {g.home.shortName} <span className="num">{g.score!.home}–{g.score!.away}</span> {g.away.shortName}
                            </strong>
                            <span className="truncate text-xs" style={{ color: "var(--pl-text-muted)" }}>
                              {pick.label} · <span className="num">{(pick.p * 100).toFixed(0)} %</span>
                            </span>
                          </span>
                          <span className={`pl-hist-chip ${hit ? "is-hit" : "is-miss"}`}>
                            <MaestroIcon name={hit ? "check" : "x"} size={12} />
                            <span>{hit ? "Cumplido" : "No cumplido"}</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {listed.length > shown ? (
            <div className="flex justify-center">
              <button type="button" className="pl-btn-glass text-sm min-h-11 px-5" onClick={() => setShown((n) => n + 20)}>
                Ver más ({listed.length - shown})
              </button>
            </div>
          ) : null}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
