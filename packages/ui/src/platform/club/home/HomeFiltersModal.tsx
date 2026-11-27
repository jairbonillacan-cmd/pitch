"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { useSafeEffect } from "../../hooks";
import type {
  HomeFilterModalOptionLeague,
  MatchStatusFilter,
  ModelSignalFilter,
} from "./home-view-helpers";

export interface HomeFiltersModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly statusFilter: MatchStatusFilter;
  readonly signalFilter: ModelSignalFilter;
  readonly selectedCountries: readonly string[];
  readonly selectedLeagues: readonly LeagueId[];
  readonly countryOptions: ReadonlyArray<{ name: string; count: number }>;
  readonly leagueOptions: readonly HomeFilterModalOptionLeague[];
  readonly onApply: (next: {
    status: MatchStatusFilter;
    signal: ModelSignalFilter;
    countries: string[];
    leagues: LeagueId[];
  }) => void;
}

export function HomeFiltersModal({
  open,
  onClose,
  statusFilter,
  signalFilter,
  selectedCountries,
  selectedLeagues,
  countryOptions,
  leagueOptions,
  onApply,
}: HomeFiltersModalProps): React.JSX.Element | null {
  const titleId = useId();
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const [draftStatus, setDraftStatus] = useState<MatchStatusFilter>(statusFilter);
  const [draftSignal, setDraftSignal] = useState<ModelSignalFilter>(signalFilter);
  const [draftCountries, setDraftCountries] = useState<string[]>([...selectedCountries]);
  const [draftLeagues, setDraftLeagues] = useState<LeagueId[]>([...selectedLeagues]);
  const [search, setSearch] = useState<string>("");

  useSafeEffect(() => {
    if (!open) return;
    setDraftStatus(statusFilter);
    setDraftSignal(signalFilter);
    setDraftCountries([...selectedCountries]);
    setDraftLeagues([...selectedLeagues]);
    setSearch("");
  }, [open, statusFilter, signalFilter, selectedCountries, selectedLeagues]);

  const q = search.trim().toLowerCase();
  const filteredCountries = useMemo(
    () => (q ? countryOptions.filter((c) => c.name.toLowerCase().includes(q)) : countryOptions),
    [countryOptions, q],
  );
  const filteredLeagues = useMemo(
    () =>
      q
        ? leagueOptions.filter(
            (l) => l.label.toLowerCase().includes(q) || l.region.toLowerCase().includes(q),
          )
        : leagueOptions,
    [leagueOptions, q],
  );

  const draftCount =
    (draftStatus !== "all" ? 1 : 0) +
    (draftSignal !== "all" ? 1 : 0) +
    draftCountries.length +
    draftLeagues.length;

  const toggleCountry = (name: string) => {
    setDraftCountries((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const toggleLeague = (id: LeagueId) => {
    setDraftLeagues((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const clearDraft = () => {
    setDraftStatus("all");
    setDraftSignal("all");
    setDraftCountries([]);
    setDraftLeagues([]);
  };

  const applyAndClose = () => {
    onApply({
      status: draftStatus,
      signal: draftSignal,
      countries: draftCountries,
      leagues: draftLeagues,
    });
    onClose();
  };

  return (
    <TopLayerModalDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      maxWidth="28rem"
      dialogClassName="pl-home-fmodal-dialog"
      scrollContainerRef={bodyScrollRef}
    >
      <div className="pl-home-fmodal">
        <header className="pl-home-fmodal-head pl-sheet-drag-zone">
          <div>
            <span className="pl-bottom-sheet-handle sm:hidden mb-2" aria-hidden="true" />
            <h2 id={titleId} className="pl-home-fmodal-title">
              Filtros
            </h2>
            <p className="pl-home-fmodal-sub">Filtra los partidos de este día.</p>
          </div>
          <button
            type="button"
            className="pl-home-fmodal-close"
            aria-label="Cerrar filtros"
            onClick={onClose}
          >
            <MaestroIcon name="x" size={16} />
          </button>
        </header>

        <div ref={bodyScrollRef} className="pl-home-fmodal-body">
          <section className="pl-home-fmodal-section" aria-label="Estado del partido">
            <h3 className="pl-home-fmodal-h3">Estado del partido</h3>
            <div className="pl-home-fmodal-pills" role="group" aria-label="Elegir estado">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "live", label: "En vivo" },
                  { id: "upcoming", label: "Próximos" },
                  { id: "finished", label: "Finalizados" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pl-home-fmodal-pill ${draftStatus === opt.id ? "is-on" : ""}`.trim()}
                  aria-pressed={draftStatus === opt.id}
                  onClick={() => setDraftStatus(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="pl-home-fmodal-section" aria-label="Señal de inteligencia">
            <h3 className="pl-home-fmodal-h3">Señal del modelo</h3>
            <div className="pl-home-fmodal-pills" role="group" aria-label="Elegir señal del modelo">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "high_confidence", label: "Alta probabilidad" },
                  { id: "value", label: "Ventaja vs casa" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pl-home-fmodal-pill ${draftSignal === opt.id ? "is-on" : ""}`.trim()}
                  aria-pressed={draftSignal === opt.id}
                  onClick={() => setDraftSignal(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="pl-home-fmodal-section" aria-label="Países y competiciones">
            <h3 className="pl-home-fmodal-h3">Países y competiciones</h3>
            <label className="pl-home-fmodal-search">
              <MaestroIcon name="search" size={15} />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoCorrect="off"
                spellCheck={false}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar países o ligas..."
                aria-label="Buscar países o ligas"
              />
            </label>

            <div className="pl-home-fmodal-checklist">
              {filteredCountries.length === 0 && filteredLeagues.length === 0 ? (
                <p className="pl-home-fmodal-empty">Sin coincidencias para «{search.trim()}».</p>
              ) : (
                <>
                  {filteredCountries.length > 0 ? (
                    <div className="pl-home-fmodal-group">
                      <span className="pl-home-fmodal-eyebrow">Países</span>
                      {filteredCountries.map((country) => {
                        const checked = draftCountries.includes(country.name);
                        return (
                          <label key={country.name} className="pl-home-fmodal-checkrow">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCountry(country.name)}
                            />
                            <span className="pl-home-fmodal-box" aria-hidden="true">
                              {checked ? <MaestroIcon name="check" size={12} /> : null}
                            </span>
                            <span className="pl-home-fmodal-checkname">{country.name}</span>
                            {country.count > 0 ? (
                              <span className="pl-home-fmodal-checkcount num">{country.count}</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {filteredLeagues.length > 0 ? (
                    <div className="pl-home-fmodal-group">
                      <span className="pl-home-fmodal-eyebrow">Competiciones del día</span>
                      {filteredLeagues.map((lg) => {
                        const checked = draftLeagues.includes(lg.id);
                        return (
                          <label key={lg.id} className="pl-home-fmodal-checkrow">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLeague(lg.id)}
                            />
                            <span className="pl-home-fmodal-box" aria-hidden="true">
                              {checked ? <MaestroIcon name="check" size={12} /> : null}
                            </span>
                            <LeagueBadge league={lg.id} label={lg.label} logoUrl={lg.logoUrl} size={18} />
                            <span className="pl-home-fmodal-checkname">{lg.label}</span>
                            <span className="pl-home-fmodal-checkcount num">{lg.count}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <footer className="pl-home-fmodal-foot">
          <p className="pl-home-fmodal-selected num">
            {draftCount} {draftCount === 1 ? "filtro seleccionado" : "filtros seleccionados"}
          </p>
          <div className="pl-home-fmodal-actions">
            <button type="button" className="pl-home-fmodal-clear" onClick={clearDraft}>
              Borrar todo
            </button>
            <button type="button" className="pl-home-fmodal-apply" onClick={applyAndClose}>
              Aplicar filtros
            </button>
          </div>
        </footer>
      </div>
    </TopLayerModalDialog>
  );
}
