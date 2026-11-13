"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge, PBar } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useIsPickInParlay, usePlatform, usePlatformActions } from "../platform-provider";
import type { MatchPick, PlatformGame } from "../types";

type Band = "all" | "alta" | "media" | "baja";
type Kind = "all" | "resultado" | "goles" | "ambos" | "handicap";
type Sort = "p" | "hora" | "momio";

const BANDS: ReadonlyArray<{ id: Band; label: string; hint: string }> = [
  { id: "all", label: "Todas", hint: "" },
  { id: "alta", label: "Muy probables", hint: "70 % o más" },
  { id: "media", label: "Probables", hint: "55 a 69 %" },
  { id: "baja", label: "Arriesgadas", hint: "menos de 55 %" },
];

const KINDS: ReadonlyArray<{ id: Kind; label: string }> = [
  { id: "all", label: "Todos los mercados" },
  { id: "resultado", label: "Resultado" },
  { id: "goles", label: "Goles y puntos" },
  { id: "ambos", label: "Ambos anotan" },
  { id: "handicap", label: "Hándicap" },
];

function kindOf(pick: MatchPick): Kind {
  const g = `${pick.marketGroup} ${pick.label}`.toLowerCase();
  if (g.includes("ambos")) return "ambos";
  if (g.includes("hándicap") || g.includes("handicap") || g.includes("spread") || /[+-]\d/.test(pick.label)) return "handicap";
  if (g.includes("total") || g.includes("goles") || g.includes("puntos") || g.includes("más de") || g.includes("menos de")) return "goles";
  return "resultado";
}

function bandOf(p: number): Exclude<Band, "all"> {
  return p >= 0.7 ? "alta" : p >= 0.55 ? "media" : "baja";
}

function ParlayToggle({ pick }: { pick: MatchPick }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const on = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-home-parlay-btn ${on ? "is-on" : ""}`.trim()}
      aria-pressed={on}
      aria-label={`${on ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${pick.matchLabel}`}
      onClick={() => (on ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={on ? "check" : "plus"} size={14} />
      <span>{on ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

/**
 * Buscador de picks: todas las selecciones de los partidos por jugar en una sola lista, para
 * encontrar algo concreto o armar un parlay. El Inicio muestra partidos; aquí se buscan picks.
 */
export function PicksFinderClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, navigateTo } = usePlatform();
  const [band, setBand] = useState<Band>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [league, setLeague] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("p");
  const [shown, setShown] = useState(30);

  const all = useMemo(() => {
    const out: Array<{ game: PlatformGame; pick: MatchPick }> = [];
    for (const game of dataset.games) {
      if (game.status === "FT") continue;
      for (const pick of game.picks) out.push({ game, pick });
    }
    return out;
  }, [dataset.games]);

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { game } of all) seen.set(game.league, game.leagueLabel);
    return Array.from(seen.entries());
  }, [all]);

  const rows = useMemo(() => {
    const filtered = all.filter(
      ({ game, pick }) =>
        (league === "all" || game.league === league) &&
        (band === "all" || bandOf(pick.p) === band) &&
        (kind === "all" || kindOf(pick) === kind),
    );
    return filtered.sort((a, b) =>
      sort === "p"
        ? b.pick.p - a.pick.p
        : sort === "momio"
          ? b.pick.fairDecimal - a.pick.fairDecimal
          : Date.parse(a.game.kickoffUtc) - Date.parse(b.game.kickoffUtc),
    );
  }, [all, band, kind, league, sort]);

  const counts = useMemo(() => {
    const c = { all: 0, alta: 0, media: 0, baja: 0 } as Record<Band, number>;
    for (const { game, pick } of all) {
      if (league !== "all" && game.league !== league) continue;
      if (kind !== "all" && kindOf(pick) !== kind) continue;
      c.all += 1;
      c[bandOf(pick.p)] += 1;
    }
    return c;
  }, [all, kind, league]);

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <header className="space-y-1.5">
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Buscar picks</h1>
          <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
            Todas las selecciones de los partidos por jugar en una lista. Filtra por qué tan probable es o por
            mercado y agrégalas a tu parlay. Para ver partido por partido, usa Inicio.
          </p>
        </header>

        <section className="pl-finder-filters glass-card glass-ring" aria-label="Filtros">
          <div className="seg-well" role="group" aria-label="Qué tan probable">
            {BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className="seg-btn text-xs"
                aria-pressed={band === b.id}
                title={b.hint || undefined}
                onClick={() => {
                  setBand(b.id);
                  setShown(30);
                }}
              >
                {b.label} <span className="num opacity-70">{counts[b.id]}</span>
              </button>
            ))}
          </div>
          <div className="pl-finder-selects">
            <label className="pl-finder-select">
              <span>Mercado</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="glass-input">
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-finder-select">
              <span>Liga</span>
              <select value={league} onChange={(e) => setLeague(e.target.value)} className="glass-input">
                <option value="all">Todas</option>
                {leagues.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-finder-select">
              <span>Ordenar</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="glass-input">
                <option value="p">Más probable primero</option>
                <option value="momio">Mayor momio justo</option>
                <option value="hora">Más pronto primero</option>
              </select>
            </label>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="glass-card glass-ring rounded-2xl p-6 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            No hay picks con esos filtros.{" "}
            <button
              type="button"
              className="pl-acct-text-link"
              onClick={() => {
                setBand("all");
                setKind("all");
                setLeague("all");
              }}
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <ul className="pl-finder-list" aria-label={`${rows.length} picks`}>
            {rows.slice(0, shown).map(({ game, pick }) => {
              const unlocked = isPickUnlocked(pick, game.status, viewerRole);
              const href = `/app/${game.league}/games/${game.id}`;
              return (
                <li key={pick.id} className="pl-finder-row glass-card glass-ring">
                  <div className="pl-finder-main">
                    <span className="pl-finder-meta text-xs">
                      <LeagueBadge league={game.league} label={game.leagueLabel} size={14} />
                      <span className="truncate">
                        {game.home.shortName} vs {game.away.shortName} · {game.dayLabel} {game.kickoffLocal}
                      </span>
                    </span>
                    <strong className={`text-[15px] leading-snug ${unlocked ? "" : "locked-redact"}`}>
                      {unlocked ? pick.label : "Pick con Pase Ultra"}
                    </strong>
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      {pick.categoryLabel}
                    </span>
                  </div>
                  <div className="pl-finder-prob num">
                    <strong>{unlocked ? `${(pick.p * 100).toFixed(1)} %` : "—"}</strong>
                    {unlocked ? <PBar p={pick.p} lead={pick.p >= 0.7} /> : null}
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      justo {unlocked ? formatOddsValue(pick.fairDecimal, oddsFormat) : "—"}
                    </span>
                  </div>
                  <div className="pl-finder-actions">
                    {unlocked ? <ParlayToggle pick={pick} /> : null}
                    <a
                      href={href}
                      className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(href);
                      }}
                    >
                      <span>Partido</span>
                      <MaestroIcon name="arrowRight" size={13} />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > shown ? (
          <div className="flex justify-center">
            <button type="button" className="pl-btn-glass text-sm min-h-11 px-5" onClick={() => setShown((n) => n + 30)}>
              Ver más ({rows.length - shown})
            </button>
          </div>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
