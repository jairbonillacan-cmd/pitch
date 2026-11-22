"use client";

import React, { useState } from "react";
import { Button } from "../../../components/ui/primitives";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  MAX_SAVED_SCREENER_VIEWS,
  type SavedScreenerView,
} from "../../screener-views";

export interface SavedViewsBarProps {
  readonly views: readonly SavedScreenerView[];
  readonly activeViewId: string | null;
  readonly maxViews?: number;
  readonly compact?: boolean;
  readonly onApply: (view: SavedScreenerView) => void;
  readonly onSave: (cleanName: string) => boolean;
  readonly onDelete: (viewId: string) => void;
}

export function SavedViewsBar({
  views,
  activeViewId,
  maxViews = MAX_SAVED_SCREENER_VIEWS,
  compact = false,
  onApply,
  onSave,
  onDelete,
}: SavedViewsBarProps): React.JSX.Element {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = saveName.trim().slice(0, 40);
    const saved = onSave(clean);
    if (saved) {
      setSaveName("");
      setSaveOpen(false);
    }
  };

  const canAddMore = views.length < maxViews;

  return (
    <section
      className={`pl-scr-saved-bar ${compact ? "is-compact" : ""}`.trim()}
      aria-label="Vistas guardadas de filtros"
      data-saved-views-bar=""
    >
      <div className="pl-scr-saved-scroll">
        <span className="pl-scr-saved-eyebrow">
          <MaestroIcon name="bookmark" size={13} />
          <span>Vistas</span>
        </span>

        {views.map((view) => {
          const isSelected = activeViewId === view.id;
          return (
            <div
              key={view.id}
              className={`pl-scr-view-chip ${isSelected ? "is-on" : ""}`.trim()}
              data-saved-view-id={view.id}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                className="pl-scr-view-apply"
                onClick={() => onApply(view)}
              >
                <span className="truncate max-w-[180px]">{view.name}</span>
                {view.onlyPositiveEdge ? (
                  <span className="pl-scr-view-ev-dot" aria-label="Solo con valor EV+" />
                ) : null}
              </button>
              <button
                type="button"
                className="pl-scr-view-del"
                aria-label={`Eliminar vista ${view.name}`}
                onClick={() => onDelete(view.id)}
              >
                <MaestroIcon name="x" size={12} />
              </button>
            </div>
          );
        })}

        {!saveOpen ? (
          <button
            type="button"
            className="pl-scr-save-trigger"
            data-open-save-view=""
            disabled={!canAddMore}
            title={
              canAddMore
                ? "Guardar combinación actual de filtros"
                : `Límite de ${maxViews} vistas alcanzado`
            }
            onClick={() => setSaveOpen(true)}
          >
            <MaestroIcon name="plus" size={13} />
            <span>Guardar vista</span>
            {views.length > 0 ? (
              <span className="pl-scr-save-count num">
                {views.length}/{maxViews}
              </span>
            ) : null}
          </button>
        ) : (
          <form className="pl-scr-save-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSaveOpen(false);
                  setSaveName("");
                }
              }}
              placeholder="Ej. EV+ Fútbol 1.50–2.40"
              aria-label="Nombre de la vista guardada"
              maxLength={40}
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
              className="pl-scr-save-input"
            />
            <Button type="submit" variant="primary" size="sm">
              Guardar
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label="Cancelar guardado de vista"
              onClick={() => {
                setSaveOpen(false);
                setSaveName("");
              }}
            >
              <MaestroIcon name="x" size={14} />
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
