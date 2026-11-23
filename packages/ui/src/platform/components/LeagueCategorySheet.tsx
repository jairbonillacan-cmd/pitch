"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import {
  COMPETITION_BY_ID,
  LEAGUE_REGIONS,
  type LeagueId,
  type LeagueRegionKey,
} from "@pitchlab/contracts";
import { LeagueBadge } from "../../sports";
import { useSafeEffect } from "../hooks";
import { MaestroIcon } from "./MaestroPrimitives";
import { useSheetSwipeDismiss } from "./use-sheet-swipe-dismiss";

export interface LeaguePickerEntry {
  league: LeagueId;
  label: string;
  logoUrl?: string | null;
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
  allowShowInactive?: boolean;
}

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
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => {
      dialogRef.current?.close();
    },
    disabled: !open,
    scrollContainerRef: bodyRef,
  });

  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useSafeEffect(() => {
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

  useSafeEffect(() => {
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
      if (e.target !== dialog) return false;
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

  const { playingToday, grouped } = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = norm(query);

    const sortEntries = (list: LeaguePickerEntry[]): LeaguePickerEntry[] =>
      [...list].sort((a, b) => {
        const aToday = (a.dayCount ?? 0) > 0 ? 1 : 0;
        const bToday = (b.dayCount ?? 0) > 0 ? 1 : 0;
        if (aToday !== bToday) return bToday - aToday;
        if (aToday === 1 && (a.dayCount ?? 0) !== (b.dayCount ?? 0)) {
          return (b.dayCount ?? 0) - (a.dayCount ?? 0);
        }
        const aFav = a.isFavorite ? 1 : 0;
        const bFav = b.isFavorite ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
        return a.label.localeCompare(b.label, "es-MX");
      });

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

    const todayItems = !q
      ? sortEntries(visible.filter((item) => (item.dayCount ?? 0) > 0))
      : [];

    const buckets = new Map<LeagueRegionKey, LeaguePickerEntry[]>();
    for (const item of visible) {
      const region = COMPETITION_BY_ID[item.league]?.region ?? "europe-other";
      const arr = buckets.get(region) ?? [];
      arr.push(item);
      buckets.set(region, arr);
    }

    return {
      playingToday: todayItems,
      grouped: LEAGUE_REGIONS.map((region) => ({
        region,
        items: sortEntries(buckets.get(region.key) ?? []),
      })).filter((g) => g.items.length > 0),
    };
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
      style={sheetSwipe.sheetStyle}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="pl-sheet-drag-zone" {...sheetSwipe.handleProps}>
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

      <div ref={bodyRef} tabIndex={0} className="pl-native-modal-body pl-sheet-body" aria-label="Lista de competiciones">
        {includeAllOption && !query.trim() ? (
          <button
            type="button"
            className={`pl-sheet-item pl-sheet-item--all ${selectedLeague === "all" ? "is-selected" : ""}`.trim()}
            aria-pressed={selectedLeague === "all"}
            onClick={() => choose("all")}
          >
            <span className="pl-sheet-item-left">
              <MaestroIcon name="all-leagues" size={16} />
              <strong>Todas las ligas activas</strong>
            </span>
            {typeof allCount === "number" ? (
              <span className="pl-sheet-item-count num">{allCount}</span>
            ) : null}
          </button>
        ) : null}

        {playingToday.length > 0 ? (
          <section
            className="pl-sheet-group pl-sheet-group--today"
            aria-label="Con partidos en esta fecha"
            data-sheet-playing-today=""
          >
            <h3 className="pl-sheet-group-title">Con partidos en esta fecha</h3>
            <div className="pl-sheet-grid">
              {playingToday.map((item) => {
                const isSel = selectedLeague === item.league;
                const meta = COMPETITION_BY_ID[item.league];
                return (
                  <button
                    key={`today-${item.league}`}
                    type="button"
                    className={`pl-sheet-item pl-sheet-item--active-day ${isSel ? "is-selected" : ""}`.trim()}
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
                        decorative
                        eager
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
                      <span className="pl-sheet-item-count pl-sheet-item-count--live num">
                        {item.dayCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
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
                  const hasDayGames = (item.dayCount ?? 0) > 0;
                  const countVal = item.dayCount !== undefined ? item.dayCount : item.activeCount;
                  return (
                    <button
                      key={item.league}
                      type="button"
                      className={`pl-sheet-item ${isSel ? "is-selected" : ""} ${item.dayCount === 0 ? "is-zero-day" : ""}`.trim()}
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
                          decorative
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
                        <span
                          className={`pl-sheet-item-count num ${hasDayGames ? "pl-sheet-item-count--live" : ""}`.trim()}
                          title={
                            item.dayCount !== undefined
                              ? `${item.dayCount} hoy · ${item.activeCount} en catálogo`
                              : `${item.activeCount} partidos activos`
                          }
                        >
                          {countVal}
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
