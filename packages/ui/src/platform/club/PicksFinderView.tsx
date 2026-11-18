"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge, PBar } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  parseManualOddsInput,
  resolvePreferredBookQuote,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useIsPickInParlay, usePlatform, usePlatformActions } from "../platform-provider";
import type { MatchPick, PlatformGame } from "../types";

type Band = "all" | "alta" | "media" | "baja";
type Kind = "all" | "resultado" | "goles" | "conteos" | "ambos" | "handicap";
type Sort = "p" | "hora" | "momio" | "ventaja";
type QuickPreset = "todos" | "probables" | "valor" | "goles" | "conteos";

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
  { id: "conteos", label: "Córners y conteos" },
  { id: "ambos", label: "Ambos anotan" },
  { id: "handicap", label: "Hándicap" },
];

const QUICK_CHIPS: ReadonlyArray<{ id: QuickPreset; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "probables", label: "Muy probables (≥ 70 %)" },
  { id: "valor", label: "Casa paga más" },
  { id: "goles", label: "Goles y puntos" },
  { id: "conteos", label: "Córners y conteos" },
];

function kindOf(pick: MatchPick): Kind {
  const g = `${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`.toLowerCase();
  if (
    g.includes("corner") ||
    g.includes("córner") ||
    g.includes("tarjeta") ||
    g.includes("falta") ||
    g.includes("foul") ||
    g.includes("yellow")
  ) {
    return "conteos";
  }
  if (g.includes("ambos")) return "ambos";
  if (
    g.includes("hándicap") ||
    g.includes("handicap") ||
    g.includes("spread") ||
    /[+-]\d/.test(pick.label)
  ) {
    return "handicap";
  }
  if (
    g.includes("total") ||
    g.includes("goles") ||
    g.includes("puntos") ||
    g.includes("más de") ||
    g.includes("menos de")
  ) {
    return "goles";
  }
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
      className={`pl-home-parlay-btn min-h-11 ${on ? "is-on" : ""}`.trim()}
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
 * Explorar picks: todas las selecciones de los partidos por jugar en una sola lista con chips
 * rápidos de 1 toque, mejor cuota vigente en tus casas de referencia y comparador manual en fila.
 */
export function PicksFinderClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, preferredBooks, openComposer, navigateTo } = usePlatform();
  const [preset, setPreset] = useState<QuickPreset>("todos");
  const [band, setBand] = useState<Band>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(false);
  const [league, setLeague] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("p");
  const [shown, setShown] = useState(30);
  const [manualOddsByPick, setManualOddsByPick] = useState<Record<string, string>>({});
  const [openManualPickId, setOpenManualPickId] = useState<string | null>(null);

  const all = useMemo(() => {
    const out: Array<{
      game: PlatformGame;
      pick: MatchPick;
      houseDecimal: number | null;
      houseLabel: string | null;
      edgePts: number | null;
    }> = [];
    for (const game of dataset.games) {
      if (game.status === "FT") continue;
      for (const pick of game.picks) {
        const prefQuote = resolvePreferredBookQuote(pick.bookQuotes, preferredBooks);
        const houseDecimal = prefQuote?.decimal ?? pick.marketDecimal;
        const houseLabel = prefQuote?.bookLabel ?? pick.marketBookLabel ?? null;
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
            : pick.edgePts;
        out.push({ game, pick, houseDecimal, houseLabel, edgePts });
      }
      // Incluir líneas de conteos si vienen en mercados del partido y no estaban en los 5 picks principales
      for (const m of game.markets) {
        if (
          m.market !== "corners_total" &&
          m.market !== "fouls_total" &&
          m.market !== "yellow_total"
        ) {
          continue;
        }
        const syntheticId = `${game.id}__cnt__${m.market}__${m.selection}`;
        if (game.picks.some((pk) => pk.id === syntheticId || pk.label === m.label)) continue;
        const syntheticPick: MatchPick = {
          id: syntheticId,
          gameId: game.id,
          league: game.league,
          leagueLabel: game.leagueLabel,
          matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
          kickoffLocal: game.kickoffLocal,
          gameStatus: game.status,
          slotIndex: 30,
          category: "tactico",
          categoryLabel: m.group,
          risk: m.p >= 0.7 ? "conservador" : m.p >= 0.55 ? "medio" : "arriesgado",
          engineKey: "tachyon",
          engineName: "PitchLab Tachyon v3.0",
          marketGroup: m.group,
          selectionKey: m.selection,
          market: m.market,
          ...(typeof m.line === "number" ? { line: m.line } : {}),
          conflictGroup: m.selection.includes("under") ? "under_total" : "over_total",
          label: m.label,
          rationale: `Conteo proyectado del modelo (${m.group}).`,
          p: m.p,
          fairDecimal: m.fairDecimal,
          fairAmerican: m.fairAmerican,
          marketDecimal: m.currentDecimal,
          marketAmerican: null,
          marketBookLabel: m.quoteBookLabel ?? null,
          marketCapturedAtUtc: m.quoteCapturedAtUtc ?? null,
          bookQuotes: m.bookQuotes,
          edgePts: m.edgePts,
          confidenceScore: game.confidenceScore,
          suggestedUnits: 1.0,
          result: null,
        };
        const prefQuote = resolvePreferredBookQuote(m.bookQuotes, preferredBooks);
        const houseDecimal = prefQuote?.decimal ?? m.currentDecimal;
        const houseLabel = prefQuote?.bookLabel ?? m.quoteBookLabel ?? null;
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? Math.round((m.p - 1 / houseDecimal) * 1000) / 10
            : m.edgePts;
        out.push({ game, pick: syntheticPick, houseDecimal, houseLabel, edgePts });
      }
    }
    return out;
  }, [dataset.games, preferredBooks]);

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { game } of all) seen.set(game.league, game.leagueLabel);
    return Array.from(seen.entries());
  }, [all]);

  const applyQuickPreset = (next: QuickPreset) => {
    setPreset(next);
    setShown(30);
    if (next === "todos") {
      setBand("all");
      setKind("all");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "probables") {
      setBand("alta");
      setKind("all");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "valor") {
      setBand("all");
      setKind("all");
      setOnlyPositiveEdge(true);
      setSort("ventaja");
    } else if (next === "goles") {
      setBand("all");
      setKind("goles");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "conteos") {
      setBand("all");
      setKind("conteos");
      setOnlyPositiveEdge(false);
      setSort("p");
    }
  };

  const rows = useMemo(() => {
    const filtered = all.filter(({ game, pick, edgePts }) => {
      if (league !== "all" && game.league !== league) return false;
      if (band !== "all" && bandOf(pick.p) !== band) return false;
      if (kind !== "all" && kindOf(pick) !== kind) return false;
      if (onlyPositiveEdge && (edgePts === null || edgePts <= 0)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "ventaja") {
        return (b.edgePts ?? -999) - (a.edgePts ?? -999) || b.pick.p - a.pick.p;
      }
      if (sort === "momio") {
        return b.pick.fairDecimal - a.pick.fairDecimal;
      }
      if (sort === "hora") {
        return Date.parse(a.game.kickoffUtc) - Date.parse(b.game.kickoffUtc);
      }
      return b.pick.p - a.pick.p;
    });
  }, [all, band, kind, league, onlyPositiveEdge, sort]);

  const counts = useMemo(() => {
    const c = { all: 0, alta: 0, media: 0, baja: 0 } as Record<Band, number>;
    for (const { game, pick, edgePts } of all) {
      if (league !== "all" && game.league !== league) continue;
      if (kind !== "all" && kindOf(pick) !== kind) continue;
      if (onlyPositiveEdge && (edgePts === null || edgePts <= 0)) continue;
      c.all += 1;
      c[bandOf(pick.p)] += 1;
    }
    return c;
  }, [all, kind, league, onlyPositiveEdge]);

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Explorar picks</h1>
            <a
              href="/app/account?tab=prefs#pl-prefs-picks"
              className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/account?tab=prefs#pl-prefs-picks");
              }}
            >
              <MaestroIcon name="sliders" size={13} />
              <span>Mis casas ({preferredBooks.length})</span>
            </a>
          </div>
          <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
            Selecciones calibradas de la jornada ordenadas por probabilidad o ventaja frente a tus
            casas de referencia. Si un mercado aún no tiene corte capturado, escribe tu momio en fila.
          </p>
        </header>

        {/* Tira de filtros de 1 toque */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Atajos de exploración"
          data-finder-quick-chips=""
        >
          {QUICK_CHIPS.map((chip) => {
            const active = preset === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                data-finder-chip={chip.id}
                aria-pressed={active}
                onClick={() => applyQuickPreset(chip.id)}
                className={`shrink-0 rounded-full px-3.5 min-h-11 text-xs font-bold transition-colors border ${
                  active ? "pl-pill--brand" : "pl-btn-glass"
                }`}
                style={
                  active
                    ? {
                        background: "var(--pl-brand)",
                        color: "var(--pl-on-primary)",
                        borderColor: "var(--pl-brand)",
                      }
                    : undefined
                }
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <section className="pl-finder-filters glass-card glass-ring" aria-label="Filtros">
          <div className="seg-well" role="group" aria-label="Qué tan probable">
            {BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className="seg-btn text-xs min-h-11 sm:min-h-10"
                aria-pressed={band === b.id}
                title={b.hint || undefined}
                onClick={() => {
                  setPreset("todos");
                  setOnlyPositiveEdge(false);
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
              <select
                value={kind}
                onChange={(e) => {
                  setPreset("todos");
                  setKind(e.target.value as Kind);
                }}
                className="glass-input"
              >
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
                <option value="ventaja">Mayor ventaja vs casa</option>
                <option value="momio">Mayor momio justo</option>
                <option value="hora">Más pronto primero</option>
              </select>
            </label>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="glass-card glass-ring rounded-2xl p-6 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            No hay picks con esos filtros en este momento.{" "}
            <button
              type="button"
              className="pl-acct-text-link"
              onClick={() => {
                setPreset("todos");
                setBand("all");
                setKind("all");
                setOnlyPositiveEdge(false);
                setLeague("all");
              }}
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <ul className="pl-finder-list" aria-label={`${rows.length} picks`}>
            {rows.slice(0, shown).map(({ game, pick, houseDecimal, houseLabel, edgePts }) => {
              const unlocked = isPickUnlocked(pick, game.status, viewerRole);
              const href = `/app/${game.league}/games/${game.id}`;
              const manualRaw = manualOddsByPick[pick.id] ?? "";
              const manualDec = parseManualOddsInput(manualRaw);
              const effectiveDec = manualDec ?? houseDecimal;
              const effectiveEdge =
                effectiveDec !== null && effectiveDec > 1
                  ? Math.round((pick.p - 1 / effectiveDec) * 1000) / 10
                  : edgePts;
              const isManualOpen = openManualPickId === pick.id;

              return (
                <li key={pick.id} className="pl-finder-row glass-card glass-ring">
                  <div className="pl-finder-main">
                    <span className="pl-finder-meta text-xs">
                      <LeagueBadge league={game.league} label={game.leagueLabel} logoUrl={game.leagueLogoUrl} size={14} />
                      <span className="truncate">
                        {game.home.shortName} vs {game.away.shortName} · {game.dayLabel} {game.kickoffLocal}
                      </span>
                    </span>
                    <strong className={`text-[15px] leading-snug ${unlocked ? "" : "locked-redact"}`}>
                      {unlocked ? pick.label : "Pick con Pase Ultra"}
                    </strong>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      <span>{pick.categoryLabel}</span>
                      {unlocked && effectiveDec !== null ? (
                        <span className="pl-pill text-[11px] num">
                          {manualDec !== null ? "Tu momio" : (houseLabel ?? "Casa")}{" "}
                          {formatOddsValue(effectiveDec, oddsFormat)}
                        </span>
                      ) : null}
                      {unlocked && effectiveEdge !== null ? (
                        <span
                          className={`pl-pill text-[11px] num ${effectiveEdge > 0 ? "pl-pill--success" : ""}`.trim()}
                        >
                          {effectiveEdge > 0 ? `+${effectiveEdge.toFixed(1)}` : effectiveEdge.toFixed(1)} pts
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="pl-finder-prob num">
                    <strong>{unlocked ? `${(pick.p * 100).toFixed(1)} %` : "—"}</strong>
                    {unlocked ? <PBar p={pick.p} lead={pick.p >= 0.7} /> : null}
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      justo {unlocked ? formatOddsValue(pick.fairDecimal, oddsFormat) : "—"}
                    </span>
                  </div>
                  <div className="pl-finder-actions flex-wrap">
                    {unlocked ? (
                      <>
                        {isManualOpen ? (
                          <label className="inline-flex items-center gap-1.5 text-xs">
                            <span className="sr-only">Momio de tu casa para {pick.label}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                              value={manualRaw}
                              onChange={(e) =>
                                setManualOddsByPick((prev) => ({
                                  ...prev,
                                  [pick.id]: e.target.value,
                                }))
                              }
                              data-manual-odds-input={pick.id}
                              className="glass-input num text-base sm:text-xs px-2.5 min-h-11 w-24 rounded-lg"
                            />
                          </label>
                        ) : (
                          <button
                            type="button"
                            className="pl-btn-glass text-xs min-h-11 px-2.5"
                            data-open-manual-odds={pick.id}
                            onClick={() => setOpenManualPickId(pick.id)}
                          >
                            Mi momio
                          </button>
                        )}
                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-11 px-2.5"
                          onClick={() => openComposer(pick)}
                        >
                          Sellar
                        </button>
                        <ParlayToggle pick={pick} />
                      </>
                    ) : null}
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
