"use client";

import React, { useEffect, useMemo, useState } from "react";
import { canonicalGameHref, isLeagueActiveInWindow } from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../sports";
import { decimalToAmericanInt, formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  BOOKMAKER_OPTIONS,
  computeDeVigProbs,
  computeMarketOverroundPct,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { setActiveSharedTransition } from "../navigation-helpers";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { todayId } from "./home/home-model";

const INITIAL_ODDS_GAMES = 16;

const signedAmerican = (dec: number) => {
  const a = decimalToAmericanInt(dec);
  return a > 0 ? `+${a}` : `−${Math.abs(a)}`;
};

/** Ventaja en puntos de probabilidad: lo que dice el modelo menos lo que implica tu momio. */
export function edgeAgainstBook(p: number, bookDecimal: number): number {
  return Math.round((p - 1 / bookDecimal) * 1000) / 10;
}

function Converter(): React.JSX.Element {
  const [raw, setRaw] = useState("");
  const [rawOpp, setRawOpp] = useState("");
  const dec = raw.trim() ? parseUserOdds(raw) : null;
  const decOpp = rawOpp.trim() ? parseUserOdds(rawOpp) : null;
  const overroundPct = dec && decOpp ? computeMarketOverroundPct([dec, decOpp]) : null;
  const devig = dec && decOpp ? computeDeVigProbs([dec, decOpp]) : null;

  return (
    <section className="pl-odds-conv glass-card glass-ring" aria-labelledby="conv-title">
      <h2 id="conv-title" className="m-0 text-base font-extrabold">
        Convertidor y margen real
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="pl-finder-select">
          <span>Lado A (tu momio)</span>
          <input
            className="glass-input num min-h-11 text-base sm:text-sm"
            inputMode="decimal"
            autoCorrect="off"
            spellCheck={false}
            placeholder="−110, +150 o 1.91"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
        <label className="pl-finder-select">
          <span>Lado B (opcional, ver margen)</span>
          <input
            className="glass-input num min-h-11 text-base sm:text-sm"
            inputMode="decimal"
            autoCorrect="off"
            spellCheck={false}
            placeholder="−110 o 1.91"
            value={rawOpp}
            onChange={(e) => setRawOpp(e.target.value)}
          />
        </label>
      </div>
      <dl className="pl-odds-conv-out num" aria-live="polite">
        <div>
          <dt>Americano</dt>
          <dd>{dec ? signedAmerican(dec) : "—"}</dd>
        </div>
        <div>
          <dt>Decimal</dt>
          <dd>{dec ? dec.toFixed(2) : "—"}</dd>
        </div>
        <div>
          <dt>{devig ? "Prob. sin comisión" : "Prob. implícita"}</dt>
          <dd>
            {devig
              ? `${(devig[0]! * 100).toFixed(1)} %`
              : dec
                ? `${((1 / dec) * 100).toFixed(1)} %`
                : "—"}
          </dd>
        </div>
      </dl>
      {overroundPct !== null && devig ? (
        <div
          className="pl-odds-vig-strip num"
          data-converter-overround=""
          aria-live="polite"
        >
          <span>
            Comisión implícita de la casa:{" "}
            <strong style={{ color: overroundPct > 6 ? "var(--pl-warning)" : "var(--pl-text)" }}>
              {overroundPct.toFixed(1)} %
            </strong>
          </span>
          <span style={{ color: "var(--pl-text-muted)" }}>
            Limpio: {(devig[0]! * 100).toFixed(1)} % / {(devig[1]! * 100).toFixed(1)} %
          </span>
        </div>
      ) : null}
      {(raw.trim() && !dec) || (rawOpp.trim() && !decOpp) ? (
        <p className="m-0 text-xs" role="alert" style={{ color: "var(--pl-danger)" }}>
          Escribe un momio válido, como −110, +150 o 1.91.
        </p>
      ) : null}
    </section>
  );
}

/**
 * /app/momios · Compara tu momio (tabla tabular `.num` en escritorio + tarjetas apiladas
 * con 0 px overflow en móvil vía `@container`, cero `LensGlowOrbs`).
 */
export function OddsCompareClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, preferredBooks, userTimezone } = usePlatformCore();
  const { navigateTo, prefetchRoute, addPickToParlay, removePickFromParlay, requestFullShell } =
    usePlatformActions();
  const { parlayLegs } = useParlayState();
  const [league, setLeague] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookTag, setSelectedBookTag] = useState<string>("all");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [visibleLimit, setVisibleLimit] = useState<number>(INITIAL_ODDS_GAMES);

  useEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const today = useMemo(() => todayId(userTimezone || "America/Mexico_City"), [userTimezone]);
  const parlayIds = useMemo(() => new Set(parlayLegs.map((l) => l.pick.id)), [parlayLegs]);

  const activeLeagues = useMemo(() => {
    const m = new Map<string, { label: string; logoUrl?: string; count: number }>();
    for (const g of dataset.games) {
      if (g.status === "FT") continue;
      if (!isLeagueActiveInWindow(dataset.games, g.league, today, 30)) continue;
      const cur = m.get(g.league);
      if (cur) cur.count += 1;
      else m.set(g.league, { label: g.leagueLabel, logoUrl: g.leagueLogoUrl, count: 1 });
    }
    return Array.from(m.entries());
  }, [dataset.games, today]);

  const games = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = norm(searchQuery);
    return dataset.games
      .filter((g) => {
        if (g.status === "FT") return false;
        if (!isLeagueActiveInWindow(dataset.games, g.league, today, 30)) return false;
        if (league !== "all" && g.league !== league) return false;
        if (!q) return true;
        return (
          norm(g.home.name).includes(q) ||
          norm(g.away.name).includes(q) ||
          norm(g.leagueLabel).includes(q)
        );
      })
      .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc));
  }, [dataset.games, league, searchQuery, today]);

  const myBooks = useMemo(
    () => BOOKMAKER_OPTIONS.filter((b) => preferredBooks.includes(b.id)).slice(0, 6),
    [preferredBooks],
  );

  const comparedStats = useMemo(() => {
    let count = 0;
    let positive = 0;
    for (const g of games) {
      for (const pk of g.picks) {
        const raw = inputs[pk.id];
        if (!raw?.trim()) continue;
        const dec = parseUserOdds(raw);
        if (!dec) continue;
        count += 1;
        if (edgeAgainstBook(pk.p, dec) >= 0) positive += 1;
      }
    }
    return { count, positive };
  }, [games, inputs]);

  const visibleGames = useMemo(() => games.slice(0, visibleLimit), [games, visibleLimit]);

  return (
    <AtmosphereStage activePath="/app/momios">
      <ClubWorkspaceShell activePath="/app/momios">
        <header className="pl-odds-hero glass-card glass-ring">
          <div className="space-y-1.5 min-w-0">
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Compara tu momio</h1>
            <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
              Escribe el momio de tu casa junto a cada selección. Si paga por encima del momio justo
              del modelo, se marca en verde al instante.
            </p>
          </div>
          <div className="pl-odds-hero-kpis num">
            <div className="pl-odds-mini-kpi">
              <span>Partidos activos</span>
              <strong>{games.length}</strong>
            </div>
            <div className="pl-odds-mini-kpi">
              <span>Comparados</span>
              <strong>{comparedStats.count}</strong>
            </div>
            <div className="pl-odds-mini-kpi">
              <span>Con valor</span>
              <strong
                style={{
                  color: comparedStats.positive > 0 ? "var(--pl-success)" : "var(--pl-text)",
                }}
              >
                {comparedStats.positive}
              </strong>
            </div>
          </div>
        </header>

        <div className="pl-odds-toolbar">
          <div className="pl-odds-search-row">
            <div className="pl-odds-search flex-1 min-w-0">
              <MaestroIcon name="search" size={14} />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                spellCheck={false}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLimit(INITIAL_ODDS_GAMES);
                }}
                placeholder="Buscar equipo o liga…"
                aria-label="Buscar partido o liga para comparar momios"
              />
            </div>

            {comparedStats.count > 0 ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 px-3.5 shrink-0 num"
                onClick={() => setInputs({})}
              >
                Limpiar ({comparedStats.count})
              </button>
            ) : null}
          </div>

          <div className="pl-odds-pills pl-scroll-strip-clean" role="group" aria-label="Filtrar por liga activa">
            <button
              type="button"
              className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${league === "all" ? "is-on" : ""}`.trim()}
              aria-pressed={league === "all"}
              onClick={() => {
                setLeague("all");
                setVisibleLimit(INITIAL_ODDS_GAMES);
              }}
            >
              Todas
            </button>
            {activeLeagues.slice(0, 10).map(([id, meta]) => (
              <button
                key={id}
                type="button"
                className={`pl-hist-league-pill min-h-11 sm:min-h-9 ${league === id ? "is-on" : ""}`.trim()}
                aria-pressed={league === id}
                onClick={() => {
                  setLeague(id);
                  setVisibleLimit(INITIAL_ODDS_GAMES);
                }}
              >
                <LeagueBadge
                  league={id as Parameters<typeof LeagueBadge>[0]["league"]}
                  label={meta.label}
                  logoUrl={meta.logoUrl}
                  size={15}
                />
                <span>{meta.label}</span>
              </button>
            ))}
          </div>

          {myBooks.length > 0 ? (
            <div className="pl-odds-books-bar" role="group" aria-label="Etiqueta de casa de referencia">
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                Tu referencia:
              </span>
              <button
                type="button"
                className={`pl-odds-book-chip min-h-11 sm:min-h-8 ${selectedBookTag === "all" ? "is-on" : ""}`.trim()}
                aria-pressed={selectedBookTag === "all"}
                onClick={() => setSelectedBookTag("all")}
              >
                Manual
              </button>
              {myBooks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`pl-odds-book-chip min-h-11 sm:min-h-8 ${selectedBookTag === b.id ? "is-on" : ""}`.trim()}
                  aria-pressed={selectedBookTag === b.id}
                  onClick={() => setSelectedBookTag(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pl-odds-layout">
          <div className="pl-odds-main min-w-0">
            {visibleGames.length === 0 ? (
              <div className="glass-card glass-ring rounded-2xl p-6 text-center space-y-2">
                <p className="m-0 font-bold">Sin partidos activos con ese filtro</p>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Prueba seleccionando otra liga o limpiando la búsqueda.
                </p>
              </div>
            ) : (
              visibleGames.map((g) => {
                const picks = g.picks.filter((p) => isPickUnlocked(p, g.status, viewerRole));
                if (picks.length === 0) return null;
                const matchHref = canonicalGameHref(g.league, g);
                const headingId = `odds-game-${g.id}`;
                return (
                  <section
                    key={g.id}
                    className="pl-odds-game glass-card glass-ring"
                    aria-labelledby={headingId}
                  >
                    <header className="pl-odds-game-head">
                      <a
                        id={headingId}
                        href={matchHref}
                        onPointerEnter={() => prefetchRoute(matchHref)}
                        onTouchStart={() => prefetchRoute(matchHref)}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveSharedTransition(e.currentTarget.closest("section"), "pl-match-hero");
                          navigateTo(matchHref);
                        }}
                        className="pl-odds-game-link no-underline min-h-11 sm:min-h-8"
                      >
                        <LeagueBadge
                          league={g.league}
                          label={g.leagueLabel}
                          logoUrl={g.leagueLogoUrl}
                          size={15}
                        />
                        <TeamBadge
                          league={g.league}
                          slug={g.home.slug}
                          name={g.home.name}
                          logoUrl={g.home.logoUrl}
                          size={18}
                        />
                        <strong className="text-sm truncate" style={{ color: "var(--pl-text)" }}>
                          {g.home.shortName} vs {g.away.shortName}
                        </strong>
                        <TeamBadge
                          league={g.league}
                          slug={g.away.slug}
                          name={g.away.name}
                          logoUrl={g.away.logoUrl}
                          size={18}
                        />
                      </a>
                      <span className="text-xs num shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                        {g.dayLabel} · {g.kickoffLocal}
                      </span>
                    </header>

                    <div
                      className="pl-odds-table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label={`Comparador de momios para ${g.home.name} vs ${g.away.name}`}
                    >
                      <table className="pl-odds-table">
                        <thead>
                          <tr>
                            <th scope="col">Selección</th>
                            <th scope="col" className="is-num">
                              Prob.
                            </th>
                            <th scope="col" className="is-num">
                              Momio justo
                            </th>
                            <th scope="col" className="is-num">
                              Tu casa
                            </th>
                            <th scope="col" className="is-num">
                              Ventaja
                            </th>
                            <th scope="col" className="is-action">
                              <span className="sr-only">Parlay</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {picks.map((pk) => {
                            const raw = inputs[pk.id] ?? "";
                            const dec = raw.trim() ? parseUserOdds(raw) : null;
                            const edge = dec ? edgeAgainstBook(pk.p, dec) : null;
                            const inputId = `odds-${pk.id}`;
                            const inParlay = parlayIds.has(pk.id);
                            return (
                              <tr key={pk.id} className="pl-odds-tr">
                                <th scope="row" className="pl-odds-cell-pick">
                                  <strong className="text-sm block truncate">{pk.label}</strong>
                                  <span
                                    className="pl-odds-cell-sub text-xs num"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    {(pk.p * 100).toFixed(1)} % · justo{" "}
                                    <strong style={{ color: "var(--pl-text)" }}>
                                      {formatOddsValue(pk.fairDecimal, oddsFormat)}
                                    </strong>
                                  </span>
                                </th>
                                <td className="pl-odds-cell-prob num" data-label="Prob.">
                                  {(pk.p * 100).toFixed(1)} %
                                </td>
                                <td className="pl-odds-cell-fair num" data-label="Momio justo">
                                  <strong>{formatOddsValue(pk.fairDecimal, oddsFormat)}</strong>
                                </td>
                                <td className="pl-odds-cell-input" data-label="Tu casa">
                                  <label htmlFor={inputId} className="sr-only">
                                    Tu momio para {pk.label}
                                  </label>
                                  <input
                                    id={inputId}
                                    className="glass-input num pl-odds-input min-h-11 sm:min-h-9"
                                    inputMode="decimal"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder={oddsFormat === "decimal" ? "1.95" : "−110"}
                                    value={raw}
                                    onChange={(e) =>
                                      setInputs((prev) => ({ ...prev, [pk.id]: e.target.value }))
                                    }
                                  />
                                </td>
                                <td className="pl-odds-cell-edge num" data-label="Ventaja">
                                  <span
                                    className={`pl-odds-verdict num ${edge === null ? "" : edge >= 0 ? "is-pos" : "is-neg"}`.trim()}
                                    aria-live="polite"
                                  >
                                    {raw.trim() && !dec
                                      ? "Inválido"
                                      : edge === null
                                        ? "—"
                                        : edge >= 0
                                          ? `+${edge.toFixed(1)} pts`
                                          : `${edge.toFixed(1)} pts`}
                                  </span>
                                </td>
                                <td className="pl-odds-cell-action">
                                  <button
                                    type="button"
                                    className={`pl-odds-parlay-btn min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 ${inParlay ? "is-on" : ""}`.trim()}
                                    aria-pressed={inParlay}
                                    aria-label={
                                      inParlay
                                        ? `Quitar ${pk.label} del parlay`
                                        : `Agregar ${pk.label} al parlay`
                                    }
                                    onClick={() => {
                                      if (inParlay) removePickFromParlay(pk.id);
                                      else addPickToParlay(pk);
                                    }}
                                  >
                                    <MaestroIcon name={inParlay ? "check" : "plus"} size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })
            )}

            {games.length > visibleLimit ? (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  className="pl-btn-glass min-h-11 px-5 text-xs font-bold num"
                  onClick={() => setVisibleLimit((c) => c + INITIAL_ODDS_GAMES)}
                >
                  Ver más partidos ({games.length - visibleLimit} restantes)
                </button>
              </div>
            ) : null}
          </div>

          <aside className="pl-odds-side min-w-0">
            <Converter />
            <section className="pl-odds-conv glass-card glass-ring" aria-labelledby="odds-how">
              <h2 id="odds-how" className="m-0 text-base font-extrabold">
                Cómo leerlo
              </h2>
              <ul className="pl-cortex-list">
                <li>
                  El momio justo es 1 entre la probabilidad del modelo: lo que pagaría una casa sin
                  comisión.
                </li>
                <li>
                  <MaestroIcon name="check" size={12} style={{ color: "var(--pl-success)" }} />{" "}
                  Verde: tu casa paga más que lo justo.
                </li>
                <li>Gris: paga menos; la diferencia es el margen de la casa.</li>
                <li>
                  Una ventaja no asegura el resultado: solo indica que el precio tiene valor
                  matemático.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
