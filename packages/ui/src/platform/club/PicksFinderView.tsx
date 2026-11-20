"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { canonicalGameHref } from "@pitchlab/contracts";
import { LeagueBadge, PBar } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  parseManualOddsInput,
  resolvePreferredBookQuote,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import {
  useIsPickInParlay,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  MAX_SAVED_SCREENER_VIEWS,
  sliderStepToOdds,
  smoothOddsWeight,
  type SavedScreenerView,
  type ScreenerBandFilter,
  type ScreenerKindFilter,
  type ScreenerSortKey,
  type ScreenerSportFilter,
  type ScreenerWindowFilter,
} from "../screener-views";
import type { MatchPick, PlatformGame } from "../types";
import { addDays, matchesSportFilter, todayId } from "./home/home-model";

type Band = ScreenerBandFilter;
type Kind = ScreenerKindFilter;
type Sort = ScreenerSortKey;
type QuickPreset = "todos" | "probables" | "valor" | "goles" | "conteos";

const SPORT_OPTIONS: ReadonlyArray<{ id: ScreenerSportFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "futbol", label: "Fútbol" },
  { id: "nfl", label: "NFL" },
  { id: "nba", label: "NBA" },
  { id: "nhl", label: "NHL" },
  { id: "mlb", label: "MLB" },
];

const WINDOW_OPTIONS: ReadonlyArray<{ id: ScreenerWindowFilter; label: string }> = [
  { id: "all", label: "Toda la agenda" },
  { id: "today", label: "Hoy" },
  { id: "next48h", label: "Próx. 48 h" },
];

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
 * Explorar picks: todas las selecciones de los partidos por jugar en una sola lista con
 * vistas guardadas multi-deporte, slider no lineal de momios (68 % en 1.30–3.00), chips
 * rápidos de 1 toque, mejor cuota en tus casas y comparador manual en fila (ADR-048).
 */
const INITIAL_VISIBLE_PICKS = 12;
const PICKS_PAGE_STEP = 16;

export function PicksFinderClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, preferredBooks, userTimezone, savedScreenerViews } = usePlatformCore();
  const { setSavedScreenerViews, pushToast, openComposer, navigateTo, prefetchRoute, requestFullShell } = usePlatformActions();
  const minSliderId = useId();
  const maxSliderId = useId();
  const minSliderRef = useRef<HTMLInputElement | null>(null);
  const maxSliderRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const [preset, setPreset] = useState<QuickPreset>("todos");
  const [sport, setSport] = useState<ScreenerSportFilter>("all");
  const [windowFilter, setWindowFilter] = useState<ScreenerWindowFilter>("all");
  const [band, setBand] = useState<Band>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(false);
  const [league, setLeague] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("p");
  const [minOddsStep, setMinOddsStep] = useState<number>(0);
  const [maxOddsStep, setMaxOddsStep] = useState<number>(100);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [shown, setShown] = useState(INITIAL_VISIBLE_PICKS);
  const [manualOddsByPick, setManualOddsByPick] = useState<Record<string, string>>({});
  const [openManualPickId, setOpenManualPickId] = useState<string | null>(null);

  const today = useMemo(() => todayId(userTimezone || "America/Mexico_City"), [userTimezone]);
  const plus2Days = useMemo(() => addDays(today, 2), [today]);

  const minOddsVal = useMemo(() => sliderStepToOdds(minOddsStep) ?? 1.01, [minOddsStep]);
  const maxOddsVal = useMemo(() => sliderStepToOdds(maxOddsStep), [maxOddsStep]);

  useEffect(() => {
    if (minSliderRef.current) {
      minSliderRef.current.style.setProperty("--attr-min", "0");
      minSliderRef.current.style.setProperty("--attr-max", "99");
      minSliderRef.current.style.setProperty("--control-value", String(minOddsStep));
    }
  }, [minOddsStep, mobileFiltersOpen]);

  useEffect(() => {
    if (maxSliderRef.current) {
      maxSliderRef.current.style.setProperty("--attr-min", "1");
      maxSliderRef.current.style.setProperty("--attr-max", "100");
      maxSliderRef.current.style.setProperty("--control-value", String(maxOddsStep));
    }
  }, [maxOddsStep, mobileFiltersOpen]);

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
    for (const { game } of all) {
      if (sport !== "all" && !matchesSportFilter(game, sport)) continue;
      seen.set(game.league, game.leagueLabel);
    }
    return Array.from(seen.entries());
  }, [all, sport]);

  const applyQuickPreset = (next: QuickPreset) => {
    setActiveViewId(null);
    setPreset(next);
    setShown(INITIAL_VISIBLE_PICKS);
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

  const applySavedView = (view: SavedScreenerView) => {
    setActiveViewId(view.id);
    setPreset("todos");
    setSport(view.sport);
    setLeague(view.league);
    setBand(view.band);
    setKind(view.kind);
    setSort(view.sort);
    setOnlyPositiveEdge(view.onlyPositiveEdge);
    setMinOddsStep(view.minOddsStep);
    setMaxOddsStep(view.maxOddsStep);
    setWindowFilter(view.window);
    setShown(INITIAL_VISIBLE_PICKS);
  };

  const handleSaveCurrentView = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = saveName.trim().slice(0, 40);
    if (cleanName.length < 2) {
      pushToast("Escribe un nombre corto para tu vista (mínimo 2 caracteres).", "warning");
      return;
    }
    if (savedScreenerViews.length >= MAX_SAVED_SCREENER_VIEWS) {
      pushToast(`Puedes guardar hasta ${MAX_SAVED_SCREENER_VIEWS} vistas personalizadas.`, "warning");
      return;
    }
    const newView: SavedScreenerView = {
      id: `sv-${Date.now().toString(36)}`,
      name: cleanName,
      sport,
      league,
      band,
      kind,
      sort,
      onlyPositiveEdge,
      minOddsStep,
      maxOddsStep,
      window: windowFilter,
    };
    const nextViews = [newView, ...savedScreenerViews];
    setSavedScreenerViews(nextViews);
    setActiveViewId(newView.id);
    setSaveName("");
    setSaveOpen(false);
    pushToast(`Vista «${cleanName}» guardada.`, "success");
  };

  const handleDeleteSavedView = (viewId: string) => {
    const prevViews = savedScreenerViews;
    const removed = prevViews.find((v) => v.id === viewId);
    const nextViews = prevViews.filter((v) => v.id !== viewId);
    setSavedScreenerViews(nextViews);
    if (activeViewId === viewId) setActiveViewId(null);
    pushToast(
      removed ? `Vista «${removed.name}» eliminada.` : "Vista guardada eliminada.",
      "default",
      removed
        ? {
            actionLabel: "Deshacer",
            onAction: () => {
              setSavedScreenerViews(prevViews);
              setActiveViewId(removed.id);
            },
          }
        : undefined,
    );
  };

  const resetAllFilters = () => {
    setActiveViewId(null);
    setPreset("todos");
    setSport("all");
    setWindowFilter("all");
    setBand("all");
    setKind("all");
    setOnlyPositiveEdge(false);
    setLeague("all");
    setSort("p");
    setMinOddsStep(0);
    setMaxOddsStep(100);
    setShown(INITIAL_VISIBLE_PICKS);
  };

  const activeAdvancedCount =
    (sport !== "all" ? 1 : 0) +
    (league !== "all" ? 1 : 0) +
    (windowFilter !== "all" ? 1 : 0) +
    (band !== "all" ? 1 : 0) +
    (kind !== "all" ? 1 : 0) +
    (onlyPositiveEdge ? 1 : 0) +
    (minOddsStep > 0 || maxOddsStep < 100 ? 1 : 0);

  const matchesWindow = (game: PlatformGame): boolean => {
    if (windowFilter === "all") return true;
    if (windowFilter === "today") return game.dayId === today;
    return game.dayId >= today && game.dayId <= plus2Days;
  };

  const matchesOddsRange = (effectiveDec: number): boolean => {
    if (minOddsStep > 0 && effectiveDec < minOddsVal - 0.001) return false;
    if (maxOddsVal !== null && effectiveDec > maxOddsVal + 0.001) return false;
    return true;
  };

  const rows = useMemo(() => {
    const filtered = all.filter(({ game, pick, houseDecimal, edgePts }) => {
      if (sport !== "all" && !matchesSportFilter(game, sport)) return false;
      if (league !== "all" && game.league !== league) return false;
      if (!matchesWindow(game)) return false;
      if (band !== "all" && bandOf(pick.p) !== band) return false;
      if (kind !== "all" && kindOf(pick) !== kind) return false;
      if (onlyPositiveEdge && (edgePts === null || edgePts <= 0)) return false;
      const effectiveDec = houseDecimal ?? pick.fairDecimal;
      if (!matchesOddsRange(effectiveDec)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "ventaja") {
        return (b.edgePts ?? -999) - (a.edgePts ?? -999) || b.pick.p - a.pick.p;
      }
      if (sort === "relevancia") {
        const aScore =
          a.pick.p * 0.55 +
          smoothOddsWeight(a.houseDecimal ?? a.pick.fairDecimal) * 0.25 +
          Math.max(0, (a.edgePts ?? 0) / 100) * 0.2;
        const bScore =
          b.pick.p * 0.55 +
          smoothOddsWeight(b.houseDecimal ?? b.pick.fairDecimal) * 0.25 +
          Math.max(0, (b.edgePts ?? 0) / 100) * 0.2;
        return bScore - aScore;
      }
      if (sort === "momio") {
        return (b.houseDecimal ?? b.pick.fairDecimal) - (a.houseDecimal ?? a.pick.fairDecimal);
      }
      if (sort === "hora") {
        return Date.parse(a.game.kickoffUtc) - Date.parse(b.game.kickoffUtc);
      }
      return b.pick.p - a.pick.p;
    });
  }, [
    all,
    band,
    kind,
    league,
    maxOddsStep,
    maxOddsVal,
    minOddsStep,
    minOddsVal,
    onlyPositiveEdge,
    plus2Days,
    sort,
    sport,
    today,
    windowFilter,
  ]);

  const counts = useMemo(() => {
    const c = { all: 0, alta: 0, media: 0, baja: 0 } as Record<Band, number>;
    for (const { game, pick, houseDecimal, edgePts } of all) {
      if (sport !== "all" && !matchesSportFilter(game, sport)) continue;
      if (league !== "all" && game.league !== league) continue;
      if (!matchesWindow(game)) continue;
      if (kind !== "all" && kindOf(pick) !== kind) continue;
      if (onlyPositiveEdge && (edgePts === null || edgePts <= 0)) continue;
      const effectiveDec = houseDecimal ?? pick.fairDecimal;
      if (!matchesOddsRange(effectiveDec)) continue;
      c.all += 1;
      c[bandOf(pick.p)] += 1;
    }
    return c;
  }, [
    all,
    kind,
    league,
    maxOddsStep,
    maxOddsVal,
    minOddsStep,
    minOddsVal,
    onlyPositiveEdge,
    plus2Days,
    sport,
    today,
    windowFilter,
  ]);

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

        {/* Vistas guardadas del socio (multi-deporte · sincronizadas con cuenta) */}
        <section
          className="pl-saved-views-bar"
          aria-label="Mis vistas guardadas"
          data-saved-views-bar=""
        >
          <div className="pl-saved-views-scroll">
            {savedScreenerViews.map((view) => {
              const isSelected = activeViewId === view.id;
              return (
                <div
                  key={view.id}
                  className={`pl-saved-view-chip ${isSelected ? "is-on" : ""}`.trim()}
                  data-saved-view-id={view.id}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className="pl-saved-view-apply"
                    onClick={() => applySavedView(view)}
                  >
                    <MaestroIcon name="bookmark" size={12} />
                    <span>{view.name}</span>
                  </button>
                  <button
                    type="button"
                    className="pl-saved-view-del"
                    aria-label={`Eliminar vista ${view.name}`}
                    onClick={() => handleDeleteSavedView(view.id)}
                  >
                    <MaestroIcon name="x" size={12} />
                  </button>
                </div>
              );
            })}

            {!saveOpen ? (
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-11 px-3 shrink-0 inline-flex items-center gap-1.5"
                data-open-save-view=""
                onClick={() => setSaveOpen(true)}
              >
                <MaestroIcon name="plus" size={13} />
                <span>Guardar vista</span>
              </button>
            ) : (
              <form className="pl-save-view-form" onSubmit={handleSaveCurrentView}>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Ej. Valor Fútbol 1.50–2.40"
                  aria-label="Nombre de la vista guardada"
                  maxLength={40}
                  autoFocus
                  className="glass-input text-base sm:text-xs min-h-11 px-3 rounded-xl"
                />
                <button type="submit" className="pl-btn-primary text-xs min-h-11 px-3.5 shrink-0">
                  Guardar
                </button>
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-11 px-2.5 shrink-0"
                  aria-label="Cancelar"
                  onClick={() => {
                    setSaveOpen(false);
                    setSaveName("");
                  }}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Tira de filtros de 1 toque + botón colapsable de filtros en móvil */}
        <div className="flex items-center gap-2">
          <div
            className="pl-scroll-strip-clean flex flex-1 min-w-0 items-center gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label="Atajos de exploración"
            data-finder-quick-chips=""
          >
            {QUICK_CHIPS.map((chip) => {
              const active = preset === chip.id && activeViewId === null;
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
          <button
            type="button"
            className="sm:hidden pl-btn-glass text-xs min-h-11 px-3 shrink-0 inline-flex items-center gap-1.5"
            aria-expanded={mobileFiltersOpen}
            aria-controls="pl-finder-advanced-panel"
            data-mobile-filters-toggle=""
            onClick={() => setMobileFiltersOpen((v) => !v)}
          >
            <MaestroIcon name="sliders" size={14} />
            <span>Filtros{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}</span>
          </button>
        </div>

        <section
          id="pl-finder-advanced-panel"
          className={`pl-finder-filters glass-card glass-ring ${mobileFiltersOpen ? "is-open-mobile" : ""}`.trim()}
          aria-label="Filtros"
        >
          <div className="seg-well" role="group" aria-label="Qué tan probable">
            {BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className="seg-btn text-xs min-h-11 sm:min-h-10"
                aria-pressed={band === b.id}
                title={b.hint || undefined}
                onClick={() => {
                  setActiveViewId(null);
                  setPreset("todos");
                  setOnlyPositiveEdge(false);
                  setBand(b.id);
                  setShown(INITIAL_VISIBLE_PICKS);
                }}
              >
                {b.label} <span className="num opacity-70">{counts[b.id]}</span>
              </button>
            ))}
          </div>

          <div className="pl-finder-selects pl-finder-selects--wide">
            <label className="pl-finder-select">
              <span>Deporte</span>
              <select
                value={sport}
                onChange={(e) => {
                  setActiveViewId(null);
                  setSport(e.target.value as ScreenerSportFilter);
                  setLeague("all");
                }}
                className="glass-input min-h-11 sm:min-h-10"
              >
                {SPORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-finder-select">
              <span>Mercado</span>
              <select
                value={kind}
                onChange={(e) => {
                  setActiveViewId(null);
                  setPreset("todos");
                  setKind(e.target.value as Kind);
                }}
                className="glass-input min-h-11 sm:min-h-10"
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
              <select
                value={league}
                onChange={(e) => {
                  setActiveViewId(null);
                  setLeague(e.target.value);
                }}
                className="glass-input min-h-11 sm:min-h-10"
              >
                <option value="all">Todas</option>
                {leagues.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-finder-select">
              <span>Ventana</span>
              <select
                value={windowFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setWindowFilter(e.target.value as ScreenerWindowFilter);
                }}
                className="glass-input min-h-11 sm:min-h-10"
              >
                {WINDOW_OPTIONS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pl-finder-select">
              <span>Ordenar</span>
              <select
                value={sort}
                onChange={(e) => {
                  setActiveViewId(null);
                  setSort(e.target.value as Sort);
                }}
                className="glass-input min-h-11 sm:min-h-10"
              >
                <option value="p">Más probable primero</option>
                <option value="relevancia">Balance probabilidad y momio</option>
                <option value="ventaja">Mayor ventaja vs casa</option>
                <option value="momio">Mayor momio</option>
                <option value="hora">Más pronto primero</option>
              </select>
            </label>
          </div>

          {/* Slider no lineal de momios (68 % del recorrido dedicado al tramo fino 1.30–3.00) */}
          <div className="pl-odds-range-box" data-odds-range-slider="">
            <div className="pl-odds-range-head">
              <span className="text-xs font-bold">Rango de momios (escala de precisión)</span>
              <span className="pl-pill text-[11px] num">
                {formatOddsValue(minOddsVal, oddsFormat)} —{" "}
                {maxOddsVal === null ? "25.00+" : formatOddsValue(maxOddsVal, oddsFormat)}
              </span>
            </div>
            <div className="pl-odds-range-grid">
              <div className="pl-prop-slider-wrap">
                <div className="pl-prop-slider-label-row">
                  <label htmlFor={minSliderId} className="text-[11px] font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                    Mínimo
                  </label>
                  <strong className="text-xs num">{formatOddsValue(minOddsVal, oddsFormat)}</strong>
                </div>
                <input
                  ref={minSliderRef}
                  id={minSliderId}
                  type="range"
                  className="pl-range-slider"
                  min={0}
                  max={99}
                  step={1}
                  value={minOddsStep}
                  aria-valuetext={`Momio mínimo ${formatOddsValue(minOddsVal, oddsFormat)}`}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setActiveViewId(null);
                    setMinOddsStep(Math.min(next, maxOddsStep - 1));
                  }}
                />
              </div>
              <div className="pl-prop-slider-wrap">
                <div className="pl-prop-slider-label-row">
                  <label htmlFor={maxSliderId} className="text-[11px] font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                    Máximo
                  </label>
                  <strong className="text-xs num">
                    {maxOddsVal === null ? "Sin tope (25.00+)" : formatOddsValue(maxOddsVal, oddsFormat)}
                  </strong>
                </div>
                <input
                  ref={maxSliderRef}
                  id={maxSliderId}
                  type="range"
                  className="pl-range-slider"
                  min={1}
                  max={100}
                  step={1}
                  value={maxOddsStep}
                  aria-valuetext={`Momio máximo ${maxOddsVal === null ? "sin tope" : formatOddsValue(maxOddsVal, oddsFormat)}`}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setActiveViewId(null);
                    setMaxOddsStep(Math.max(next, minOddsStep + 1));
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="glass-card glass-ring rounded-2xl p-6 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            No hay picks con esos filtros en este momento.{" "}
            <button
              type="button"
              className="pl-acct-text-link"
              onClick={resetAllFilters}
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <ul className="pl-finder-list" aria-label={`${rows.length} picks`}>
            {rows.slice(0, shown).map(({ game, pick, houseDecimal, houseLabel, edgePts }) => {
              const unlocked = isPickUnlocked(pick, game.status, viewerRole);
              const href = canonicalGameHref(game.league, game);
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
                      onPointerEnter={() => prefetchRoute(href)}
                      onTouchStart={() => prefetchRoute(href)}
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
            <button type="button" className="pl-btn-glass text-sm min-h-11 px-5" onClick={() => setShown((n) => n + PICKS_PAGE_STEP)}>
              Ver más ({rows.length - shown})
            </button>
          </div>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
