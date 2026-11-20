"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  canonicalGameHref,
  formatOddsCaptureEs,
  isLeagueActiveInWindow,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../sports";
import { decimalToAmericanInt, formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  BOOKMAKER_OPTIONS,
  computeDeVigProbs,
  computeMarketOverroundPct,
  normalizeBookKey,
  resolvePreferredBookQuote,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { setActiveSharedTransition } from "../navigation-helpers";
import {
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import type { BookQuoteItem, MatchPick, OddsFormat } from "../types";
import { partitionPriorityBookmakers } from "./account/account-helpers";
import { todayId } from "./home/home-model";
import {
  classifyOddsMovement,
  computeExpectedValuePct,
  type OddsMovementKind,
} from "./picks/BookmakerComparePill";

const INITIAL_ODDS_GAMES = 16;

const signedAmerican = (dec: number) => {
  const a = decimalToAmericanInt(dec);
  return a > 0 ? `+${a}` : `−${Math.abs(a)}`;
};

/** Ventaja en puntos de probabilidad: lo que dice el modelo menos lo que implica tu momio. */
export function edgeAgainstBook(p: number, bookDecimal: number): number {
  return Math.round((p - 1 / bookDecimal) * 1000) / 10;
}

export interface MarketDirectionBadge {
  readonly kind: Exclude<OddsMovementKind, "stable">;
  readonly label: "STEAM" | "Acortando" | "Derivando";
  readonly arrow: "↓↓" | "↓" | "↑";
  readonly pillClass: string;
  readonly deltaPct: number | null;
}

/**
 * Clasifica la dirección real de mercado para el comparador (`/app/momios`):
 * `STEAM` (caída brusca >= 6 %), `Acortando` (dinero a favor) o `Derivando` (cuota subiendo).
 */
export function describeMarketDirection(
  openingDecimal: number | null | undefined,
  currentDecimal: number | null | undefined,
  explicitDirection?: "shortening" | "drifting" | "stable" | null,
): MarketDirectionBadge | null {
  const movement = classifyOddsMovement(openingDecimal, currentDecimal, explicitDirection);
  if (!movement || movement.kind === "stable") return null;
  if (movement.kind === "steam") {
    return {
      kind: "steam",
      label: "STEAM",
      arrow: "↓↓",
      pillClass: "pl-pill--warning",
      deltaPct: movement.deltaPct,
    };
  }
  if (movement.kind === "shortening") {
    return {
      kind: "shortening",
      label: "Acortando",
      arrow: "↓",
      pillClass: "pl-pill--brand",
      deltaPct: movement.deltaPct,
    };
  }
  return {
    kind: "drifting",
    label: "Derivando",
    arrow: "↑",
    pillClass: "pl-pill--info",
    deltaPct: movement.deltaPct,
  };
}

/**
 * Licencia Bzzoiro v4.0: ninguna cuota de casa puede mostrarse sin anclaje analítico
 * a la probabilidad Spacetime v5.1 y al momio justo (`fairOdds`) de PitchLab.
 */
function hasValidSpacetimeAnchor(pk: MatchPick): boolean {
  return (
    !pk.isRedacted &&
    Number.isFinite(pk.p) &&
    pk.p > 0.01 &&
    pk.p < 0.995 &&
    Number.isFinite(pk.fairDecimal) &&
    pk.fairDecimal > 1.01
  );
}

interface ResolvedReferenceQuote {
  readonly decimal: number;
  readonly bookLabel: string;
  readonly capturedAtUtc: string | null;
  readonly openingDecimal: number | null;
  readonly movementDirection: "shortening" | "drifting" | "stable" | null;
  readonly matchedSelectedBook: boolean;
}

function resolvePickReferenceQuote(
  pk: MatchPick,
  selectedBookTag: string,
  preferredBooks: readonly string[],
): ResolvedReferenceQuote | null {
  if (selectedBookTag === "manual") return null;

  const quotes = pk.bookQuotes ?? [];
  if (selectedBookTag !== "all" && quotes.length > 0) {
    const exact = quotes.find(
      (q) => normalizeBookKey(q.book) === selectedBookTag && Number.isFinite(q.decimal) && q.decimal > 1.01,
    );
    if (exact) {
      return {
        decimal: exact.decimal,
        bookLabel: exact.bookLabel,
        capturedAtUtc: exact.capturedAtUtc || pk.marketCapturedAtUtc || null,
        openingDecimal: exact.openingDecimal ?? null,
        movementDirection: exact.movementDirection ?? null,
        matchedSelectedBook: true,
      };
    }
  }

  const preferred = resolvePreferredBookQuote(quotes, preferredBooks);
  if (preferred && Number.isFinite(preferred.decimal) && preferred.decimal > 1.01) {
    return {
      decimal: preferred.decimal,
      bookLabel: preferred.bookLabel,
      capturedAtUtc: preferred.capturedAtUtc || pk.marketCapturedAtUtc || null,
      openingDecimal: preferred.openingDecimal ?? null,
      movementDirection: preferred.movementDirection ?? null,
      matchedSelectedBook: selectedBookTag === "all",
    };
  }

  if (pk.marketDecimal !== null && Number.isFinite(pk.marketDecimal) && pk.marketDecimal > 1.01) {
    return {
      decimal: pk.marketDecimal,
      bookLabel: pk.marketBookLabel ?? "Referencia",
      capturedAtUtc: pk.marketCapturedAtUtc ?? null,
      openingDecimal: null,
      movementDirection: null,
      matchedSelectedBook: selectedBookTag === "all",
    };
  }

  return null;
}

function formatEvTag(evPct: number): string {
  return evPct >= 0 ? `EV +${evPct.toFixed(1)} %` : `EV ${evPct.toFixed(1)} %`;
}

function sortQuotesForDisplay(
  quotes: readonly BookQuoteItem[],
  preferredBooks: readonly string[],
): BookQuoteItem[] {
  const prefSet = new Set(preferredBooks.map((b) => normalizeBookKey(b)));
  return quotes
    .filter((q) => Number.isFinite(q.decimal) && q.decimal > 1.01)
    .slice()
    .sort((a, b) => {
      const aPref = prefSet.has(normalizeBookKey(a.book)) ? 1 : 0;
      const bPref = prefSet.has(normalizeBookKey(b.book)) ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;
      return b.decimal - a.decimal;
    })
    .slice(0, 3);
}

function Converter(): React.JSX.Element {
  const [raw, setRaw] = useState("");
  const [rawOpp, setRawOpp] = useState("");
  const dec = raw.trim() ? parseUserOdds(raw) : null;
  const decOpp = rawOpp.trim() ? parseUserOdds(rawOpp) : null;
  const overroundPct = dec && decOpp ? computeMarketOverroundPct([dec, decOpp]) : null;
  const devig = dec && decOpp ? computeDeVigProbs([dec, decOpp]) : null;
  const rawInvalid = Boolean(raw.trim() && !dec);
  const oppInvalid = Boolean(rawOpp.trim() && !decOpp);

  return (
    <section className="pl-odds-conv glass-card glass-ring min-w-0" aria-labelledby="conv-title">
      <h2 id="conv-title" className="m-0 text-base font-extrabold">
        Convertidor y margen real
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
        <label className="pl-finder-select min-w-0">
          <span>Lado A (tu momio)</span>
          <input
            className="glass-input num min-h-11 text-base sm:text-sm"
            inputMode="decimal"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={rawInvalid ? "true" : undefined}
            placeholder="−110, +150 o 1.91"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
        <label className="pl-finder-select min-w-0">
          <span>Lado B (opcional, ver margen)</span>
          <input
            className="glass-input num min-h-11 text-base sm:text-sm"
            inputMode="decimal"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={oppInvalid ? "true" : undefined}
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
      {rawInvalid || oppInvalid ? (
        <p className="m-0 text-xs" role="alert" style={{ color: "var(--pl-danger)" }}>
          Escribe un momio válido, como −110, +150 o 1.91.
        </p>
      ) : null}
    </section>
  );
}

/**
 * /app/momios · Compara tu momio (cumplimiento estricto Licencia Bzzoiro v4.0):
 * toda cuota de casa aparece ligada a la probabilidad Spacetime v5.1, `fairOdds`,
 * cálculo `EV+` / ventaja de PitchLab y dirección de mercado (`STEAM` / `Acortando` / `Derivando`).
 */
export function OddsCompareClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, preferredBooks, userTimezone } = usePlatformCore();
  const {
    navigateTo,
    prefetchRoute,
    addPickToParlay,
    removePickFromParlay,
    requestFullShell,
    setOddsFormat,
    pushToast,
  } = usePlatformActions();
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

  const myBooks = useMemo(() => {
    const { priorityMx, others } = partitionPriorityBookmakers(BOOKMAKER_OPTIONS);
    const orderedCatalog = [...priorityMx, ...others];
    const preferredSet = new Set(preferredBooks.map((b) => normalizeBookKey(b)));
    const matching = orderedCatalog.filter((b) => preferredSet.has(normalizeBookKey(b.id)));
    return (matching.length > 0 ? matching : priorityMx).slice(0, 6);
  }, [preferredBooks]);

  const comparedStats = useMemo(() => {
    let evaluated = 0;
    let manualCount = 0;
    let positiveEv = 0;
    for (const g of games) {
      for (const pk of g.picks) {
        if (!isPickUnlocked(pk, g.status, viewerRole) || !hasValidSpacetimeAnchor(pk)) continue;
        const raw = inputs[pk.id];
        const manualDec = raw?.trim() ? parseUserOdds(raw) : null;
        if (manualDec !== null) manualCount += 1;
        const refQuote = resolvePickReferenceQuote(pk, selectedBookTag, preferredBooks);
        const activeDec = manualDec ?? refQuote?.decimal ?? null;
        if (activeDec === null) continue;
        evaluated += 1;
        const evPct = computeExpectedValuePct(pk.p, activeDec);
        if (evPct !== null && evPct > 0) positiveEv += 1;
      }
    }
    return { evaluated, manualCount, positiveEv };
  }, [games, inputs, preferredBooks, selectedBookTag, viewerRole]);

  const visibleGames = useMemo(() => games.slice(0, visibleLimit), [games, visibleLimit]);

  const handleClearManualInputs = () => {
    const prevInputs = inputs;
    setInputs({});
    pushToast("Momios manuales limpiados.", "default", {
      actionLabel: "Deshacer",
      onAction: () => setInputs(prevInputs),
    });
  };

  return (
    <AtmosphereStage activePath="/app/momios">
      <ClubWorkspaceShell activePath="/app/momios">
        <header
          className="pl-odds-hero glass-card glass-ring min-w-0"
          data-odds-spacetime-anchored="v5.1"
        >
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Compara tu momio</h1>
              <span className="pl-pill pl-pill--brand text-[11px]">Spacetime v5.1 · EV+</span>
            </div>
            <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
              Cada cuota de casa aparece ligada a la probabilidad Spacetime v5.1, al momio justo
              (fairOdds) y al cálculo EV+ de PitchLab. Escribe el momio de tu casa para contrastarlo
              al instante.
            </p>
          </div>
          <div className="pl-odds-hero-kpis num">
            <div className="pl-odds-mini-kpi">
              <span>Partidos activos</span>
              <strong>{games.length}</strong>
            </div>
            <div className="pl-odds-mini-kpi">
              <span>Evaluados</span>
              <strong>{comparedStats.evaluated}</strong>
            </div>
            <div className="pl-odds-mini-kpi">
              <span>Con EV+</span>
              <strong
                style={{
                  color: comparedStats.positiveEv > 0 ? "var(--pl-success)" : "var(--pl-text)",
                }}
              >
                {comparedStats.positiveEv}
              </strong>
            </div>
          </div>
        </header>

        <div className="pl-odds-toolbar min-w-0">
          <div className="pl-odds-search-row">
            <div className="pl-odds-search flex-1 min-w-0">
              <MaestroIcon name="search" size={14} />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                spellCheck={false}
                className="text-base sm:text-sm min-h-11 sm:min-h-10"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLimit(INITIAL_ODDS_GAMES);
                }}
                placeholder="Buscar equipo o liga…"
                aria-label="Buscar partido o liga para comparar momios"
              />
            </div>

            <div className="seg-well shrink-0" role="group" aria-label="Formato de momios">
              {(
                [
                  { value: "american", label: "Americano" },
                  { value: "decimal", label: "Decimal" },
                ] as const satisfies ReadonlyArray<{ value: OddsFormat; label: string }>
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`seg-btn min-h-11 sm:min-h-9 px-3 text-xs ${oddsFormat === opt.value ? "is-active" : ""}`.trim()}
                  aria-pressed={oddsFormat === opt.value}
                  onClick={() => setOddsFormat(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {comparedStats.manualCount > 0 ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 sm:min-h-9 px-3.5 shrink-0 num"
                onClick={handleClearManualInputs}
              >
                Limpiar ({comparedStats.manualCount})
              </button>
            ) : null}
          </div>

          <div
            className="pl-odds-pills pl-scroll-strip-clean"
            role="group"
            aria-label="Filtrar por liga activa"
          >
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
            <div
              className="pl-odds-books-bar"
              role="group"
              aria-label="Casa de referencia vinculada a Spacetime v5.1"
            >
              <span
                className="text-xs font-semibold shrink-0"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Referencia EV+:
              </span>
              <button
                type="button"
                className={`pl-odds-book-chip min-h-11 sm:min-h-9 ${selectedBookTag === "all" ? "is-on" : ""}`.trim()}
                aria-pressed={selectedBookTag === "all"}
                onClick={() => setSelectedBookTag("all")}
              >
                Mejor MX
              </button>
              <button
                type="button"
                className={`pl-odds-book-chip min-h-11 sm:min-h-9 ${selectedBookTag === "manual" ? "is-on" : ""}`.trim()}
                aria-pressed={selectedBookTag === "manual"}
                onClick={() => setSelectedBookTag("manual")}
              >
                Solo manual
              </button>
              {myBooks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`pl-odds-book-chip min-h-11 sm:min-h-9 ${selectedBookTag === b.id ? "is-on" : ""}`.trim()}
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
                // Licencia Bzzoiro v4.0: solo se renderizan selecciones con anclaje Spacetime v5.1 válido.
                const picks = g.picks.filter(
                  (p) => isPickUnlocked(p, g.status, viewerRole) && hasValidSpacetimeAnchor(p),
                );
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
                          setActiveSharedTransition(
                            e.currentTarget.closest("section"),
                            "pl-match-hero",
                          );
                          navigateTo(matchHref);
                        }}
                        className="pl-odds-game-link no-underline min-h-11 sm:min-h-9"
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
                      <span
                        className="text-xs num shrink-0"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {g.dayLabel} · {g.kickoffLocal}
                      </span>
                    </header>

                    <div
                      className="pl-odds-table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label={`Evaluación Spacetime v5.1 y momios para ${g.home.name} vs ${g.away.name}`}
                    >
                      <table className="pl-odds-table">
                        <caption className="sr-only">
                          Comparativa de probabilidad Spacetime v5.1, momio justo y cálculo EV+ para{" "}
                          {g.home.name} vs {g.away.name}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Selección</th>
                            <th scope="col" className="is-num">
                              Spacetime v5.1
                            </th>
                            <th scope="col" className="is-num">
                              Momio justo
                            </th>
                            <th scope="col" className="is-num">
                              Tu casa
                            </th>
                            <th scope="col" className="is-num">
                              EV+ / Ventaja
                            </th>
                            <th scope="col" className="is-action">
                              <span className="sr-only">Parlay</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {picks.map((pk) => {
                            const raw = inputs[pk.id] ?? "";
                            const manualDec = raw.trim() ? parseUserOdds(raw) : null;
                            const manualInvalid = Boolean(raw.trim() && !manualDec);
                            const refQuote = resolvePickReferenceQuote(
                              pk,
                              selectedBookTag,
                              preferredBooks,
                            );
                            const activeDec = manualDec ?? refQuote?.decimal ?? null;
                            const edge = activeDec !== null ? edgeAgainstBook(pk.p, activeDec) : null;
                            const evPct =
                              activeDec !== null
                                ? computeExpectedValuePct(pk.p, activeDec)
                                : null;
                            const direction = refQuote
                              ? describeMarketDirection(
                                  refQuote.openingDecimal,
                                  refQuote.decimal,
                                  refQuote.movementDirection,
                                )
                              : null;
                            const displayQuotes =
                              selectedBookTag !== "manual" && pk.bookQuotes && pk.bookQuotes.length > 1
                                ? sortQuotesForDisplay(pk.bookQuotes, preferredBooks)
                                : [];
                            const inputId = `odds-${pk.id}`;
                            const inParlay = parlayIds.has(pk.id);
                            const fairFormatted = formatOddsValue(pk.fairDecimal, oddsFormat);
                            const refFormatted = refQuote
                              ? formatOddsValue(refQuote.decimal, oddsFormat)
                              : null;
                            const openFormatted =
                              refQuote !== null &&
                              refQuote.openingDecimal !== null &&
                              Math.abs(refQuote.openingDecimal - refQuote.decimal) >= 0.01
                                ? formatOddsValue(refQuote.openingDecimal, oddsFormat)
                                : null;
                            const hasPositiveValue =
                              evPct !== null ? evPct > 0 : edge !== null && edge >= 0;

                            return (
                              <tr
                                key={pk.id}
                                className="pl-odds-tr"
                                data-odds-pick-row={pk.id}
                              >
                                <th scope="row" className="pl-odds-cell-pick">
                                  <strong className="text-sm block truncate">{pk.label}</strong>
                                  <span
                                    className="pl-odds-cell-sub text-xs num"
                                    style={{ color: "var(--pl-text-muted)" }}
                                  >
                                    Spacetime v5.1 · {(pk.p * 100).toFixed(1)} % · justo{" "}
                                    <strong style={{ color: "var(--pl-text)" }}>
                                      {fairFormatted}
                                    </strong>
                                  </span>

                                  {refQuote && refFormatted ? (
                                    <div
                                      className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] num"
                                      data-quote-model-linked="true"
                                    >
                                      <span
                                        className="font-semibold"
                                        style={{ color: "var(--pl-text-secondary)" }}
                                      >
                                        {refQuote.bookLabel}{" "}
                                        <strong style={{ color: "var(--pl-text)" }}>
                                          {refFormatted}
                                        </strong>
                                        {openFormatted ? ` · Ap. ${openFormatted}` : ""}
                                      </span>
                                      {direction ? (
                                        <span
                                          className={`pl-pill text-[10px] num ${direction.pillClass}`}
                                          data-market-direction={direction.kind}
                                          title={
                                            openFormatted
                                              ? `Dirección de mercado (${direction.label}): apertura ${openFormatted} → actual ${refFormatted}`
                                              : `Dirección de mercado: ${direction.label}`
                                          }
                                        >
                                          {direction.kind === "steam" ? (
                                            <>
                                              <span aria-hidden="true">⚡</span> {direction.label}
                                            </>
                                          ) : (
                                            <>
                                              {direction.arrow} {direction.label}
                                            </>
                                          )}
                                        </span>
                                      ) : null}
                                      {refQuote.capturedAtUtc ? (
                                        <time
                                          dateTime={refQuote.capturedAtUtc}
                                          style={{ color: "var(--pl-text-muted)" }}
                                        >
                                          {formatOddsCaptureEs(refQuote.capturedAtUtc)}
                                        </time>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  {displayQuotes.length > 1 && manualDec === null ? (
                                    <div
                                      className="mt-1.5 flex flex-wrap gap-1"
                                      aria-label="Cuotas evaluadas contra Spacetime v5.1"
                                    >
                                      {displayQuotes.map((q) => {
                                        const qEv = computeExpectedValuePct(pk.p, q.decimal);
                                        const qPos = qEv !== null && qEv > 0;
                                        return (
                                          <span
                                            key={q.book}
                                            className={`pl-pill text-[10px] num ${qPos ? "pl-pill--success" : ""}`.trim()}
                                            data-quote-ev-bound="true"
                                          >
                                            {q.bookLabel} {formatOddsValue(q.decimal, oddsFormat)}
                                            {qEv !== null ? ` · ${formatEvTag(qEv)}` : ""}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </th>
                                <td className="pl-odds-cell-prob num" data-label="Spacetime v5.1">
                                  {(pk.p * 100).toFixed(1)} %
                                </td>
                                <td className="pl-odds-cell-fair num" data-label="Momio justo">
                                  <strong>{fairFormatted}</strong>
                                </td>
                                <td className="pl-odds-cell-input" data-label="Tu casa">
                                  <label htmlFor={inputId} className="sr-only">
                                    Tu momio para {pk.label}
                                  </label>
                                  <input
                                    id={inputId}
                                    className="glass-input num pl-odds-input text-base sm:text-sm min-h-11 sm:min-h-9"
                                    inputMode="decimal"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    aria-invalid={manualInvalid ? "true" : undefined}
                                    placeholder={
                                      refFormatted ?? (oddsFormat === "decimal" ? "1.95" : "−110")
                                    }
                                    value={raw}
                                    onChange={(e) =>
                                      setInputs((prev) => ({ ...prev, [pk.id]: e.target.value }))
                                    }
                                  />
                                </td>
                                <td className="pl-odds-cell-edge num" data-label="EV+ / Ventaja">
                                  <div
                                    className="inline-flex flex-col items-end gap-0.5"
                                    aria-live="polite"
                                  >
                                    {manualInvalid ? (
                                      <span
                                        className="text-xs font-bold"
                                        style={{ color: "var(--pl-danger)" }}
                                      >
                                        Inválido
                                      </span>
                                    ) : evPct !== null && edge !== null ? (
                                      <>
                                        <span
                                          className={`pl-pill text-[11px] num ${hasPositiveValue ? "pl-pill--success" : ""}`.trim()}
                                          data-ev-positive={hasPositiveValue ? "true" : "false"}
                                        >
                                          {formatEvTag(evPct)}
                                        </span>
                                        <span
                                          className={`pl-odds-verdict text-[11px] num ${edge >= 0 ? "is-pos" : "is-neg"}`.trim()}
                                        >
                                          {edge >= 0
                                            ? `+${edge.toFixed(1)} pts`
                                            : `${edge.toFixed(1)} pts`}
                                          {manualDec !== null ? " · Tu casa" : ""}
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        className="pl-odds-verdict num"
                                        style={{ color: "var(--pl-text-muted)" }}
                                      >
                                        —
                                      </span>
                                    )}
                                  </div>
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
            <section
              className="pl-odds-conv glass-card glass-ring min-w-0"
              aria-labelledby="odds-how"
            >
              <h2 id="odds-how" className="m-0 text-base font-extrabold">
                Cómo leerlo
              </h2>
              <ul className="pl-cortex-list">
                <li>
                  <strong>Spacetime v5.1 y Momio justo:</strong> el momio justo (fairOdds) es 1
                  entre la probabilidad calibrada del modelo, sin comisión de casa.
                </li>
                <li>
                  <MaestroIcon name="check" size={12} style={{ color: "var(--pl-success)" }} />{" "}
                  <strong>EV+ verde:</strong> la cuota de casa paga por encima del momio justo
                  (valor esperado matemático positivo).
                </li>
                <li>
                  <strong>Dirección de mercado:</strong> <strong>STEAM</strong> señala movimiento
                  rápido hacia abajo; <strong>Acortando</strong> indica flujo a favor y{" "}
                  <strong>Derivando</strong> que la cuota sube.
                </li>
                <li>
                  Cuotas de referencia ligadas exclusivamente al análisis cuantitativo de PitchLab
                  (informativo, sin enlaces de afiliado ni garantías de resultado).
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
