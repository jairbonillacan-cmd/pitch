"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MatchTabKey } from "../../types";
import { normalizeMatchTab, VALID_MATCH_TABS } from "./match-tab";

export interface MatchTabDef {
  readonly key: MatchTabKey;
  readonly label: string;
  readonly count?: number;
}

/**
 * Sincroniza la pestaña activa de la ficha con el parámetro `?tab=` en la URL sin recargar.
 */
export function useMatchUrlTab(
  initialTab: MatchTabKey = "resumen",
): [MatchTabKey, (next: MatchTabKey) => void] {
  const [active, setActive] = useState<MatchTabKey>(initialTab);

  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromLocation = () => {
      const raw = new URLSearchParams(window.location.search).get("tab");
      if (raw !== null) {
        const normalized = normalizeMatchTab(raw);
        if ((VALID_MATCH_TABS as readonly string[]).includes(normalized)) {
          setActive(normalized);
        }
      } else {
        setActive("resumen");
      }
    };
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param !== null) {
      setActive(normalizeMatchTab(param));
    }
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const selectTab = useCallback((next: MatchTabKey) => {
    setActive(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  return [active, selectTab];
}

/**
 * Barra de 5 pestañas accesibles de la ficha («Resumen», «Análisis IA», «Números», «¿Dónde está el dinero?», «Contexto»).
 * Usa selección por activación para no reescribir la URL al recorrerlas con flechas,
 * evita `aria-controls` y mantiene las 5 pestañas en una sola fila desplazable en móvil.
 */
export function MatchTabs({
  idPrefix,
  tabs,
  active,
  onSelect,
}: {
  readonly idPrefix: string;
  readonly tabs: readonly MatchTabDef[];
  readonly active: MatchTabKey;
  readonly onSelect: (key: MatchTabKey) => void;
}): React.JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(() =>
    Math.max(
      0,
      tabs.findIndex((t) => t.key === active),
    ),
  );

  useEffect(() => {
    const idx = tabs.findIndex((t) => t.key === active);
    if (idx >= 0) setFocusedIndex(idx);
    // Solo resincronizar el foco roving cuando cambia la pestaña activa; evitar
    // depender de la referencia de `tabs` que cambia en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const moveFocus = (nextIdx: number) => {
    setFocusedIndex(nextIdx);
    refs.current[nextIdx]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus((index + 1) % tabs.length);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus((index - 1 + tabs.length) % tabs.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveFocus(tabs.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = tabs[index];
      if (target) {
        setFocusedIndex(index);
        onSelect(target.key);
      }
    }
  };

  return (
    <div
      className="pl-match-tabs"
      role="tablist"
      aria-label="Secciones del partido"
    >
      {tabs.map((tab, index) => {
        const isSelected = tab.key === active;
        const isFocusable = index === focusedIndex;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${idPrefix}-tab-${tab.key}`}
            type="button"
            role="tab"
            data-section-tab={tab.key}
            aria-selected={isSelected}
            tabIndex={isFocusable ? 0 : -1}
            onFocus={() => setFocusedIndex(index)}
            onClick={(e) => {
              setFocusedIndex(index);
              e.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
              onSelect(tab.key);
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className="pl-match-tab"
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span className="pl-match-tab-count num">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Contenedor de panel de pestaña: mantiene los 3 paneles en HTML con `hidden`
 * cuando están inactivos y coloca espaciado visual en un wrapper interior.
 */
export function MatchTabPanel({
  idPrefix,
  tabKey,
  active,
  children,
}: {
  readonly idPrefix: string;
  readonly tabKey: MatchTabKey;
  readonly active: MatchTabKey;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const isActive = active === tabKey;
  return (
    <div
      id={`${idPrefix}-panel-${tabKey}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      tabIndex={isActive ? 0 : -1}
      hidden={!isActive}
      className="pl-match-panel"
    >
      <div className="pl-match-panel-body">{children}</div>
    </div>
  );
}
