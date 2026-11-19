"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  COMPETITION_BY_ID,
  LEAGUE_REGIONS,
  type LeagueId,
  type LeagueRegionKey,
} from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import { MaestroIcon } from "./MaestroPrimitives";

export interface LeaguePickerEntry {
  league: LeagueId;
  label: string;
  logoUrl?: string;
  activeCount: number;
  dayCount?: number;
  isFavorite?: boolean;
  isActive?: boolean;
}

export interface LeagueCategorySheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  leagues: readonly LeaguePickerEntry[];
  selectedLeague: LeagueId | "all";
  onSelect: (league: LeagueId | "all") => void;
  includeAllOption?: boolean;
  allCount?: number;
  /** Permite mostrar u ocultar competencias sin partidos en los próximos 30 días. */
  allowShowInactive?: boolean;
}

/**
 * Selector escalable de competiciones agrupado por región/categoría (ADR-043).
 * En móvil se presenta como bottom-sheet nativo `<dialog closedby="any">`;
 * en escritorio como modal compacto con buscador instantáneo.
 */
export function LeagueCategorySheet({
  open,
  onClose,
  title = "Explorar ligas y copas",
  leagues,
  selectedLeague,
  onSelect,
  includeAllOption = true,
  allCount,
  allowShowInactive = false,
}: LeagueCategorySheetProps): React.JSX.Element | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      try {
        dialog.showModal();
      } catch (err) {
        void err;
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);

    const needsFallback =
      typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype);
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };
    if (needsFallback) {
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
      if (needsFallback) {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      }
    };
  }, [open]);

  const grouped = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = norm(query);

    const visible = leagues.filter((item) => {
      if (!showInactive && item.isActive === false) return false;
      if (!q) return true;
      const meta = COMPETITION_BY_ID[item.league];
      return (
        norm(item.label).includes(q) ||
        norm(item.league).includes(q) ||
        (meta ? norm(meta.country).includes(q) : false)
      );
    });

    const buckets = new Map<LeagueRegionKey, LeaguePickerEntry[]>();
    for (const item of visible) {
      const region = COMPETITION_BY_ID[item.league]?.region ?? "europe-other";
      const arr = buckets.get(region) ?? [];
      arr.push(item);
      buckets.set(region, arr);
    }

    return LEAGUE_REGIONS.map((region) => ({
      region,
      items: buckets.get(region.key) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [leagues, query, showInactive]);

  const inactiveCount = useMemo(
    () => leagues.filter((l) => l.isActive === false).length,
    [leagues],
  );

  if (!open) return null;

  const choose = (next: LeagueId | "all") => {
    onSelect(next);
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="pl-native-modal pl-sheet-modal"
      data-league-category-sheet=""
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="pl-sheet-grab" aria-hidden="true" />
      <div className="pl-native-modal-head">
        <div>
          <h2 id={titleId} className="pl-native-modal-title">
            {title}
          </h2>
          <p className="pl-native-modal-sub">
            Organizadas por región y torneo · solo competencias activas en los próximos 30 días.
          </p>
        </div>
        <button
          type="button"
          className="pl-native-modal-close"
          aria-label="Cerrar selector de ligas"
          onClick={() => dialogRef.current?.close()}
        >
          <MaestroIcon name="x" size={16} />
        </button>
      </div>

      <div className="pl-sheet-search-row">
        <div className="pl-sheet-search-box">
          <MaestroIcon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar liga, copa o país…"
            aria-label="Buscar liga, copa o país"
            autoFocus
          />
        </div>
        {allowShowInactive && inactiveCount > 0 ? (
          <button
            type="button"
            className={`pl-sheet-inactive-toggle ${showInactive ? "is-on" : ""}`.trim()}
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? "Ocultar en pausa" : `En pausa (${inactiveCount})`}
          </button>
        ) : null}
      </div>

      <div className="pl-native-modal-body pl-sheet-body">
        {includeAllOption && !query.trim() ? (
          <button
            type="button"
            className={`pl-sheet-item pl-sheet-item--all ${selectedLeague === "all" ? "is-selected" : ""}`.trim()}
            aria-pressed={selectedLeague === "all"}
            onClick={() => choose("all")}
          >
            <span className="pl-sheet-item-left">
              <MaestroIcon name="grid" size={16} />
              <strong>Todas las ligas activas</strong>
            </span>
            {typeof allCount === "number" ? (
              <span className="pl-sheet-item-count num">{allCount}</span>
            ) : null}
          </button>
        ) : null}

        {grouped.length === 0 ? (
          <p className="pl-bm-empty">No encontramos ninguna competencia con ese filtro.</p>
        ) : (
          grouped.map(({ region, items }) => (
            <section key={region.key} className="pl-sheet-group" aria-label={region.label}>
              <h3 className="pl-sheet-group-title">{region.label}</h3>
              <div className="pl-sheet-grid">
                {items.map((item) => {
                  const isSel = selectedLeague === item.league;
                  const meta = COMPETITION_BY_ID[item.league];
                  return (
                    <button
                      key={item.league}
                      type="button"
                      className={`pl-sheet-item ${isSel ? "is-selected" : ""}`.trim()}
                      aria-pressed={isSel}
                      data-sheet-league={item.league}
                      onClick={() => choose(item.league)}
                    >
                      <span className="pl-sheet-item-left">
                        <LeagueBadge
                          league={item.league}
                          label={item.label}
                          logoUrl={item.logoUrl}
                          size={22}
                        />
                        <span className="pl-sheet-item-copy">
                          <strong>{item.label}</strong>
                          {meta?.country ? <small>{meta.country}</small> : null}
                        </span>
                      </span>
                      <span className="pl-sheet-item-right">
                        {item.isFavorite ? (
                          <MaestroIcon name="star" size={12} className="pl-sheet-fav-star" />
                        ) : null}
                        <span className="pl-sheet-item-count num">
                          {item.dayCount !== undefined ? item.dayCount : item.activeCount}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </dialog>
  );
}
