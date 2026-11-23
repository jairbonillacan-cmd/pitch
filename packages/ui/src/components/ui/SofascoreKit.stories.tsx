import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  SettingsGroup,
  SettingsRow,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "./primitives";

interface MarketPickRow {
  readonly id: string;
  readonly league: string;
  readonly match: string;
  readonly selection: string;
  readonly probPct: number;
  readonly fairLabel: string;
  readonly bestBookLabel: string | null;
  readonly bestOddsLabel: string | null;
  readonly evPct: number | null;
  readonly movement: "steam" | "shortening" | "drifting" | "stable" | null;
}

const SAMPLE_KPIS: readonly SofascoreKpiItem[] = [
  {
    id: "picks-ev",
    label: "Selecciones EV+",
    value: "18",
    delta: "+4 hoy",
    tone: "brand",
  },
  {
    id: "yield-30d",
    label: "Rendimiento 30d",
    value: "+6.4 %",
    delta: "+1.2 pp",
    tone: "positive",
  },
  {
    id: "clv-avg",
    label: "CLV promedio",
    value: "+2.8 %",
    delta: "142 sellados",
    tone: "default",
  },
  {
    id: "drawdown",
    label: "Retroceso máximo",
    value: "-3.1 u",
    delta: "Controlado",
    tone: "negative",
  },
];

const SAMPLE_TABS: readonly SofascoreTabItem[] = [
  { id: "todos", label: "Todos", count: 4 },
  { id: "ev", label: "Solo EV+", count: 3 },
  { id: "steam", label: "Movimiento fuerte", count: 1 },
  { id: "archivados", label: "Archivados", disabled: true },
];

const DENSITY_TABS: readonly SofascoreTabItem[] = [
  { id: "default", label: "Estándar" },
  { id: "compact", label: "Compacta" },
];

const SAMPLE_ROWS: readonly MarketPickRow[] = [
  {
    id: "row-ame-1x2",
    league: "Liga MX",
    match: "América vs Cruz Azul",
    selection: "América gana",
    probPct: 58.4,
    fairLabel: "1.71",
    bestBookLabel: "Caliente",
    bestOddsLabel: "1.94",
    evPct: 13.3,
    movement: "steam",
  },
  {
    id: "row-ars-ou",
    league: "Premier League",
    match: "Arsenal vs Chelsea",
    selection: "Más de 2.5 goles",
    probPct: 56.2,
    fairLabel: "1.78",
    bestBookLabel: "Bet365",
    bestOddsLabel: "1.88",
    evPct: 5.7,
    movement: "shortening",
  },
  {
    id: "row-bos-ml",
    league: "NBA",
    match: "Celtics vs Knicks",
    selection: "Celtics -4.5",
    probPct: 54.1,
    fairLabel: "1.85",
    bestBookLabel: "Codere",
    bestOddsLabel: "1.91",
    evPct: 3.3,
    movement: "drifting",
  },
  {
    id: "row-tig-btts",
    league: "Liga MX",
    match: "Tigres vs Monterrey",
    selection: "Ambos anotan · Sí",
    probPct: 51.8,
    fairLabel: "1.93",
    bestBookLabel: null,
    bestOddsLabel: null,
    evPct: null,
    movement: "stable",
  },
];

const MARKET_COLUMNS: readonly SofascoreTableColumn<MarketPickRow>[] = [
  {
    key: "selection",
    header: "Selección",
    sticky: true,
    render: (row) => (
      <div style={{ display: "grid", gap: 2 }}>
        <strong>{row.selection}</strong>
        <span style={{ fontSize: 12, color: "var(--pl-text-muted)" }}>
          {row.match} · {row.league}
        </span>
      </div>
    ),
  },
  {
    key: "value",
    header: "Valor y momio",
    align: "end",
    numeric: true,
    render: (row) => (
      <SofascoreValueCell
        probPct={row.probPct}
        fairLabel={row.fairLabel}
        bestBookLabel={row.bestBookLabel}
        bestOddsLabel={row.bestOddsLabel}
        evPct={row.evPct}
      />
    ),
  },
  {
    key: "signals",
    header: "Señales",
    align: "end",
    render: (row) => <SofascoreSignalPair evPct={row.evPct} movement={row.movement} />,
  },
];

function PlusIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function EditorialKitShowcase(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>("todos");
  const [density, setDensity] = useState<"default" | "compact">("default");
  const [query, setQuery] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(SAMPLE_ROWS[0]?.id ?? null);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = SAMPLE_ROWS.filter((row) => {
    if (activeTab === "ev" && (row.evPct === null || row.evPct <= 0)) {
      return false;
    }
    if (activeTab === "steam" && row.movement !== "steam") {
      return false;
    }
    if (normalizedQuery.length > 0) {
      const haystack = `${row.selection} ${row.match} ${row.league}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    }
    return true;
  });

  const selectedRow = SAMPLE_ROWS.find((row) => row.id === selectedId) ?? null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 960 }}>
      <SofascoreKpiStrip items={SAMPLE_KPIS} />

      <SofascoreCard
        title="Explorador de valor editorial"
        meta={
          <span className="num" style={{ fontSize: 12, color: "var(--pl-text-muted)" }}>
            {selectedRow ? `Activa: ${selectedRow.selection}` : "Sin selección"}
          </span>
        }
        density={density}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <SofascoreTabs
            items={SAMPLE_TABS}
            value={activeTab}
            onChange={setActiveTab}
            variant="underline"
            ariaLabel="Filtrar selecciones del tablero"
          />

          <SofascoreFilterBar
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar equipo, liga o mercado..."
            resultCount={visibleRows.length}
            trailing={
              <Button variant="primary" size="sm" onClick={() => setQuery("")}>
                Agregar al boleto
              </Button>
            }
          >
            <SofascoreTabs
              items={DENSITY_TABS}
              value={density}
              onChange={(next) => setDensity(next === "compact" ? "compact" : "default")}
              variant="segmented"
              ariaLabel="Densidad de la tabla"
            />
          </SofascoreFilterBar>

          <SofascoreTable
            caption="Selecciones con probabilidad calibrada y mejor cuota de casa"
            columns={MARKET_COLUMNS}
            rows={visibleRows}
            rowKey={(row) => row.id}
            density={density}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyState={
              <SofascoreEmptyState
                title="Sin selecciones para este filtro"
                description="Ajusta la búsqueda o cambia la pestaña activa para volver a ver las cuotas."
                actionLabel="Limpiar filtros"
                onAction={() => {
                  setQuery("");
                  setActiveTab("todos");
                }}
              />
            }
          />
        </div>
      </SofascoreCard>
    </div>
  );
}

function ButtonsHierarchyShowcase(): React.JSX.Element {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <SofascoreCard title="Jerarquías de acción · Tono estándar" meta="3 variantes + 5 tamaños">
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <Button variant="primary" size="lg">
              Sellar selección
            </Button>
            <Button variant="primary" size="default">
              Guardar alerta
            </Button>
            <Button variant="primary" size="sm">
              Añadir
            </Button>
            <Button variant="primary" size="icon" aria-label="Agregar elemento">
              <PlusIcon />
            </Button>
            <Button variant="primary" size="icon-sm" aria-label="Agregar compacto">
              <PlusIcon />
            </Button>
            <Button variant="primary" disabled>
              Deshabilitado
            </Button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <Button variant="secondary" size="lg">
              Comparar casas
            </Button>
            <Button variant="secondary" size="default">
              Exportar CSV
            </Button>
            <Button variant="secondary" size="sm">
              Filtros
            </Button>
            <Button variant="secondary" size="icon" aria-label="Nueva regla">
              <PlusIcon />
            </Button>
            <Button variant="secondary" size="icon-sm" aria-label="Nueva regla compacta">
              <PlusIcon />
            </Button>
            <Button variant="secondary" disabled>
              Deshabilitado
            </Button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <Button variant="ghost" size="lg">
              Ver historial
            </Button>
            <Button variant="ghost" size="default">
              Restablecer
            </Button>
            <Button variant="ghost" size="sm">
              Omitir
            </Button>
            <Button variant="ghost" size="icon" aria-label="Cerrar panel">
              <CloseIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar aviso">
              <CloseIcon />
            </Button>
            <Button variant="ghost" disabled>
              Deshabilitado
            </Button>
          </div>
        </div>
      </SofascoreCard>

      <SofascoreCard title="Acciones destructivas · Tono peligro" density="compact" meta="tone = danger">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <Button variant="primary" tone="danger">
            Revocar sesión
          </Button>
          <Button variant="secondary" tone="danger">
            Eliminar alerta
          </Button>
          <Button variant="ghost" tone="danger">
            Vaciar boleto
          </Button>
          <Button variant="ghost" tone="danger" size="icon-sm" aria-label="Quitar pierna">
            <CloseIcon />
          </Button>
        </div>
      </SofascoreCard>
    </div>
  );
}

function TableSignalsAndEmptyShowcase(): React.JSX.Element {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
      <SofascoreCard title="Señales compactas y celdas de valor" density="compact" meta="Máximo 2 indicadores">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <SofascoreSignalPair evPct={9.4} movement="steam" />
            <SofascoreSignalPair evPct={4.2} movement="shortening" />
            <SofascoreSignalPair evPct={-1.8} movement="drifting" />
            <SofascoreSignalPair evPct={2.5} movement="stable" compact />
          </div>

          <SofascoreTable
            caption="Tabla compacta de comparación de momios"
            columns={MARKET_COLUMNS}
            rows={SAMPLE_ROWS}
            rowKey={(row) => row.id}
            density="compact"
          />
        </div>
      </SofascoreCard>

      <SofascoreCard title="Estado vacío editorial" meta="Acción de recuperación">
        <SofascoreEmptyState
          title="Aún no tienes alertas activas en esta liga"
          description="Crea una regla de movimiento fuerte o valor positivo para recibir notificaciones antes del arranque."
          actionLabel="Crear primera alerta"
          onAction={() => {}}
        />
      </SofascoreCard>
    </div>
  );
}

function SettingsGroupsShowcase(): React.JSX.Element {
  const [oddsMode, setOddsMode] = useState<"Decimal" | "Americano">("Decimal");
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <SettingsGroup
        title="Preferencias de lectura"
        footnote="Los cambios se aplican en todas las tablas de picks, parlays y comparativas."
      >
        <SettingsRow
          title="Formato de momios"
          subtitle="Aplica al momio justo y cuotas de casas"
          value={<span className="num">{oddsMode}</span>}
          onClick={() => setOddsMode((prev) => (prev === "Decimal" ? "Americano" : "Decimal"))}
        />
        <SettingsRow
          title="Notificaciones de hitos en vivo"
          subtitle="Avisos cuando cambia el estado de tus picks sellados"
          value={pushEnabled ? "Activas" : "Pausadas"}
          trailing={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPushEnabled((prev) => !prev)}
            >
              {pushEnabled ? "Pausar" : "Activar"}
            </Button>
          }
        />
        <SettingsRow
          title="Renovar Pase del Club"
          subtitle="Acceso completo a props, alertas y herramientas cuantitativas"
          tone="accent"
          value="Vigente"
          onClick={() => {}}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Seguridad y cuenta"
        footnote="Las acciones críticas siempre solicitan confirmación explícita."
      >
        <SettingsRow
          title="Cerrar todas las sesiones activas"
          subtitle="Desconecta otros navegadores y dispositivos vinculados"
          tone="danger"
          trailing={
            <Button variant="ghost" tone="danger" size="sm">
              Revocar
            </Button>
          }
        />
      </SettingsGroup>
    </div>
  );
}

const meta = {
  title: "Platform v4 / Editorial Kit / Base",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const KitCompletoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <EditorialKitShowcase />,
};

export const KitCompletoClaro: Story = {
  globals: { theme: "light" },
  render: () => <EditorialKitShowcase />,
};

export const BotonesJerarquiasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <ButtonsHierarchyShowcase />,
};

export const BotonesJerarquiasClaro: Story = {
  globals: { theme: "light" },
  render: () => <ButtonsHierarchyShowcase />,
};

export const TablaSenalesYVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <TableSignalsAndEmptyShowcase />,
};

export const TablaSenalesYVacioClaro: Story = {
  globals: { theme: "light" },
  render: () => <TableSignalsAndEmptyShowcase />,
};

export const AjustesYPreferenciasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <SettingsGroupsShowcase />,
};

export const AjustesYPreferenciasClaro: Story = {
  globals: { theme: "light" },
  render: () => <SettingsGroupsShowcase />,
};
