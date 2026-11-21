import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, SofascoreCard } from "../../../components/ui/primitives";
import { oddsToSliderStep, type SavedScreenerView } from "../../screener-views";
import { SavedViewsBar } from "./SavedViewsBar";

const meta = {
  title: "Platform v4 / Picks / SavedViewsBar",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PRESET_VIEWS: readonly SavedScreenerView[] = [
  {
    id: "v-lmx-ev",
    name: "EV+ Liga MX 1.50–2.40",
    sport: "futbol",
    league: "liga-mx",
    band: "alta",
    kind: "all",
    sort: "ventaja",
    onlyPositiveEdge: true,
    minOddsStep: oddsToSliderStep(1.5),
    maxOddsStep: oddsToSliderStep(2.4),
    window: "next48h",
  },
  {
    id: "v-nba-totales",
    name: "Totales NBA hoy",
    sport: "nba",
    league: "nba",
    band: "all",
    kind: "goles",
    sort: "p",
    onlyPositiveEdge: false,
    minOddsStep: oddsToSliderStep(1.6),
    maxOddsStep: oddsToSliderStep(2.2),
    window: "today",
  },
  {
    id: "v-nfl-solidos",
    name: "NFL favoritos sólidos",
    sport: "nfl",
    league: "nfl",
    band: "alta",
    kind: "resultado",
    sort: "relevancia",
    onlyPositiveEdge: true,
    minOddsStep: oddsToSliderStep(1.3),
    maxOddsStep: oddsToSliderStep(1.95),
    window: "all",
  },
  {
    id: "v-europa-conteos",
    name: "Córners y tarjetas Europa",
    sport: "futbol",
    league: "premier-league",
    band: "media",
    kind: "conteos",
    sort: "momio",
    onlyPositiveEdge: false,
    minOddsStep: oddsToSliderStep(1.75),
    maxOddsStep: oddsToSliderStep(3.0),
    window: "next48h",
  },
];

function InteractiveSavedViewsDemo({
  initialViews,
  initialActiveId,
  maxViews = 12,
}: {
  readonly initialViews: readonly SavedScreenerView[];
  readonly initialActiveId: string | null;
  readonly maxViews?: number;
}): React.JSX.Element {
  const [views, setViews] = useState<SavedScreenerView[]>(() => [...initialViews]);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [lastDeleted, setLastDeleted] = useState<{
    view: SavedScreenerView;
    index: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeView = views.find((v) => v.id === activeId) ?? null;

  const handleSave = (cleanName: string): boolean => {
    if (cleanName.length < 2) {
      setFeedback("Escribe al menos 2 caracteres para nombrar la vista.");
      return false;
    }
    const created: SavedScreenerView = {
      id: `v-custom-${views.length + 1}`,
      name: cleanName,
      sport: "futbol",
      league: "all",
      band: "alta",
      kind: "all",
      sort: "ventaja",
      onlyPositiveEdge: true,
      minOddsStep: oddsToSliderStep(1.45),
      maxOddsStep: oddsToSliderStep(2.5),
      window: "next48h",
    };
    setViews((prev) => [...prev, created]);
    setActiveId(created.id);
    setLastDeleted(null);
    setFeedback(`Vista «${cleanName}» guardada y aplicada.`);
    return true;
  };

  const handleDelete = (viewId: string): void => {
    const idx = views.findIndex((v) => v.id === viewId);
    if (idx === -1) return;
    const removed = views[idx]!;
    setViews((prev) => prev.filter((v) => v.id !== viewId));
    if (activeId === viewId) setActiveId(null);
    setLastDeleted({ view: removed, index: idx });
    setFeedback(`Eliminaste la vista «${removed.name}».`);
  };

  const handleUndoDelete = (): void => {
    if (!lastDeleted) return;
    const { view, index } = lastDeleted;
    setViews((prev) => {
      if (prev.some((v) => v.id === view.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, view);
      return next;
    });
    setActiveId(view.id);
    setLastDeleted(null);
    setFeedback(`Vista «${view.name}» restaurada.`);
  };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 880 }}>
      <SavedViewsBar
        views={views}
        activeViewId={activeId}
        maxViews={maxViews}
        onApply={(view) => {
          setActiveId(view.id);
          setFeedback(`Vista «${view.name}» aplicada al tablero.`);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <SofascoreCard density="compact">
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{ color: "var(--pl-text-secondary)" }}
        >
          <span>
            {activeView ? (
              <>
                Vista activa: <strong style={{ color: "var(--pl-text)" }}>{activeView.name}</strong>
                {activeView.onlyPositiveEdge ? " · Solo EV+" : ""} · Orden: {activeView.sort}
              </>
            ) : (
              "Sin vista activa · usando filtros manuales"
            )}
          </span>

          {lastDeleted ? (
            <Button type="button" variant="secondary" size="sm" onClick={handleUndoDelete}>
              Deshacer
            </Button>
          ) : feedback ? (
            <span style={{ color: "var(--pl-text-muted)" }}>{feedback}</span>
          ) : null}
        </div>
      </SofascoreCard>
    </div>
  );
}

export const PresetsYVistaActivaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <InteractiveSavedViewsDemo initialViews={PRESET_VIEWS} initialActiveId="v-lmx-ev" />
  ),
};

export const PresetsYVistaActivaClaro: Story = {
  globals: { theme: "light" },
  render: PresetsYVistaActivaOscuro.render,
};

export const SinVistasGuardadasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <InteractiveSavedViewsDemo initialViews={[]} initialActiveId={null} />,
};

export const SinVistasGuardadasClaro: Story = {
  globals: { theme: "light" },
  render: SinVistasGuardadasOscuro.render,
};

export const LimiteAlcanzadoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <InteractiveSavedViewsDemo
      initialViews={PRESET_VIEWS}
      initialActiveId="v-nfl-solidos"
      maxViews={4}
    />
  ),
};

export const LimiteAlcanzadoClaro: Story = {
  globals: { theme: "light" },
  render: LimiteAlcanzadoOscuro.render,
};
