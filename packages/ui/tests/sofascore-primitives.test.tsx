import fs from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PROVIDER_TOKENS } from "@pitchlab/contracts";
import {
  Button,
  buttonVariants,
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
} from "../src/components/ui/primitives";
import {
  useAbortableJson,
  useDebouncedValue,
  useLocalStorageState,
  useMediaQuery,
  usePwaInstallAndPush,
  useSafeEffect,
  useUrlSearchTab,
  useVisibilityPolling,
} from "../src/platform/hooks/index";
import { PropsLabClubView as DirectPropsLabClubView } from "../src/platform/club/PropsLabClubView";
import { PropsLabClubView as ReExportedPropsLabClubView } from "../src/platform/club/ParlayAndQuantViews";
import { AlertsClubView } from "../src/platform/club/AlertsClubView";
import { RefereesClubView } from "../src/platform/club/RefereesClubView";
import { StandingsBracketsSection } from "../src/platform/club/StandingsBracketsSection";
import { VerificationSurface } from "../src/platform/public/VerificationSurface";

const FORBIDDEN_DOM_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["sofascore", /sofascore/i],
  ["Confianza N", /\bconfianza\s+\d+/i],
  ["Datos completos/parciales", /\bdatos\s+(?:completos|parciales)\b/i],
  ...FORBIDDEN_PROVIDER_TOKENS.map(
    (token) => [token, new RegExp(token.replace(/-/g, "[-_]?"), "i")] as const,
  ),
];

function assertFd16Clean(html: string, label: string): void {
  expect(html.length, `${label} debe producir HTML`).toBeGreaterThan(0);
  for (const [name, regex] of FORBIDDEN_DOM_PATTERNS) {
    expect(html, `${label} no debe exponer "${name}"`).not.toMatch(regex);
  }
}

interface SampleMarketRow {
  readonly id: string;
  readonly market: string;
  readonly probPct: number;
  readonly fairLabel: string;
  readonly evPct: number;
}

function HooksSmokeHarness(): React.JSX.Element {
  useSafeEffect(() => undefined, []);
  const isCompactViewport = useMediaQuery("(max-width: 767px)", true);
  useVisibilityPolling(() => undefined, 30000, false);
  const debounced = useDebouncedValue("liga-mx", 200);
  const [stored] = useLocalStorageState("pl-sf-test-key", "decimal");
  const jsonState = useAbortableJson<{ ok: boolean }>("/api/health", {
    enabled: false,
    initialData: { ok: true },
  });
  const [activeTab] = useUrlSearchTab("tab", ["resumen", "cuotas"] as const, "resumen");
  const pwaState = usePwaInstallAndPush({
    enabled: false,
    overrideState: { configured: true, subscribed: true, installAvailable: true },
  });

  return (
    <div
      data-hooks-smoke=""
      data-media={String(isCompactViewport)}
      data-debounced={debounced}
      data-stored={stored}
      data-json={String(jsonState.data?.ok ?? false)}
      data-loading={String(jsonState.loading)}
      data-tab={activeTab}
      data-push={String(pwaState.isSubscribed)}
      data-install={String(pwaState.canInstall)}
    >
      {typeof jsonState.reload === "function" ? "ready" : "missing"}
    </div>
  );
}

describe("Kit Base de Primitivas Neutrales (.pl-sf-*) y Botón 3 Jerarquías", () => {
  it("renderiza Button con 3 jerarquías canónicas, tone danger, alias retrocompatibles y >= 44px en móvil", () => {
    const html = renderToStaticMarkup(
      <div>
        <Button>Primario por defecto</Button>
        <Button variant="primary">Primario explícito</Button>
        <Button variant="primary" tone="danger">
          Primario peligro
        </Button>
        <Button variant="secondary" size="sm">
          Secundario compacto
        </Button>
        <Button variant="outline">Alias outline</Button>
        <Button variant="destructive">Alias destructive</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar">
          ×
        </Button>
        <Button variant="link">Alias link</Button>
        <Button
          variant="secondary"
          render={<a href="/app/picks" />}
          nativeButton={false}
        >
          Ver picks
        </Button>
        <Button disabled focusableWhenDisabled>
          Enfocable deshabilitado
        </Button>
      </div>,
    );

    expect(html).toContain('data-slot="button"');
    expect(html).toContain("bg-primary");
    expect(html).toContain('data-hierarchy="primary"');
    expect(html).toContain('data-hierarchy="secondary"');
    expect(html).toContain('data-hierarchy="ghost"');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("min-h-11");
    expect(html).toContain('href="/app/picks"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("hover:shadow");

    expect(buttonVariants({ variant: "default" })).toContain("bg-primary");
    expect(buttonVariants({ variant: "outline" })).toContain("bg-secondary");
    expect(buttonVariants({ variant: "destructive" })).toContain("text-destructive");
    expect(buttonVariants({ variant: "link" })).toContain("bg-transparent");
    expect(buttonVariants({ size: "icon-sm" })).toContain("min-h-11");

    assertFd16Clean(html, "Button");
  });

  it("renderiza todas las primitivas Sofascore* y SettingsGroup/SettingsRow con 0 fugas FD-16", () => {
    const rows: readonly SampleMarketRow[] = [
      { id: "r1", market: "América gana", probPct: 56.4, fairLabel: "1.77", evPct: 5.8 },
      { id: "r2", market: "Más de 2.5 goles", probPct: 61.2, fairLabel: "1.63", evPct: -1.4 },
    ];

    const html = renderToStaticMarkup(
      <div>
        <SofascoreCard title="Mercados principales" meta="Jornada 15" as="article">
          <SofascoreKpiStrip
            items={[
              { id: "k1", label: "Probabilidad", value: "56.4%", delta: "+2.1%", tone: "brand" },
              { id: "k2", label: "Ventaja", value: "+5.8%", tone: "positive" },
              { id: "k3", label: "Riesgo", value: "-1.4%", tone: "negative" },
            ]}
          />

          <SofascoreTabs
            ariaLabel="Secciones del mercado"
            variant="underline"
            value="mercados"
            onChange={() => undefined}
            items={[
              { id: "mercados", label: "Mercados", count: 12 },
              { id: "movimiento", label: "Movimiento" },
              { id: "cerrado", label: "Cerrado", disabled: true },
            ]}
          />

          <SofascoreTabs
            ariaLabel="Vista de cuotas"
            variant="segmented"
            value="decimal"
            onChange={() => undefined}
            items={[
              { id: "decimal", label: "Decimal" },
              { id: "americano", label: "Americano" },
            ]}
          />

          <SofascoreFilterBar
            searchValue="América"
            onSearchChange={() => undefined}
            searchPlaceholder="Filtrar mercado"
            resultCount={2}
            trailing={<span>Actualizado</span>}
          >
            <span>Solo EV+</span>
          </SofascoreFilterBar>

          <SofascoreTable
            caption="Tabla de mercados calibrados"
            density="compact"
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={() => undefined}
            columns={[
              {
                key: "market",
                header: "Mercado",
                sticky: true,
                render: (row) => row.market,
              },
              {
                key: "value",
                header: "Valor",
                numeric: true,
                render: (row) => (
                  <SofascoreValueCell
                    probPct={row.probPct}
                    fairLabel={row.fairLabel}
                    bestBookLabel="Pinnacle"
                    bestOddsLabel="1.88"
                    evPct={row.evPct}
                  />
                ),
              },
              {
                key: "signals",
                header: "Señales",
                align: "end",
                render: (row) => (
                  <SofascoreSignalPair
                    evPct={row.evPct}
                    movement={row.evPct > 0 ? "steam" : "drifting"}
                  />
                ),
              },
            ]}
          />

          <SofascoreTable
            caption="Tabla vacía"
            rows={[]}
            rowKey={(_, idx) => String(idx)}
            columns={[{ key: "c1", header: "Columna", render: () => null }]}
          />

          <SofascoreEmptyState
            title="Sin picks en este filtro"
            description="Ajusta tus criterios para ver resultados."
            actionLabel="Restablecer"
            onAction={() => undefined}
          />
        </SofascoreCard>

        <SettingsGroup title="Preferencias" footnote="Se sincroniza con tu cuenta.">
          <SettingsRow
            title="Formato de momios"
            subtitle="Decimal o americano"
            value="Decimal"
            href="/app/account"
          />
          <SettingsRow
            title="Activar alertas"
            tone="accent"
            onClick={() => undefined}
            trailing={<span>Activo</span>}
          />
          <SettingsRow title="Eliminar sesión" tone="danger" onClick={() => undefined} />
        </SettingsGroup>
      </div>,
    );

    expect(html).toContain("pl-sf-card");
    expect(html).toContain("pl-sf-kpi-strip");
    expect(html).toContain("<dl");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain("aria-controls=");
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Limpiar búsqueda"');
    expect(html).toContain('role="status"');
    expect(html).toContain("<table");
    expect(html).toContain('<caption');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("is-sticky-col");
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Justo 1.77");
    expect(html).toContain("Pinnacle");
    expect(html).toContain("↓↓ Steam");
    expect(html).toContain("↑ Subiendo");
    expect(html).toContain("pl-sf-settings-group");
    expect(html).toContain("pl-sf-settings-row");

    const emptySignals = renderToStaticMarkup(
      <SofascoreSignalPair movement="stable" />,
    );
    expect(emptySignals).toBe("");

    assertFd16Clean(html, "SofascorePrimitives");
  });

  it("ejecuta hooks auditados en SSR de forma determinista y mantiene paridad de PropsLabClubView y stubs", () => {
    expect(ReExportedPropsLabClubView).toBe(DirectPropsLabClubView);

    const hooksHtml = renderToStaticMarkup(<HooksSmokeHarness />);
    expect(hooksHtml).toContain('data-media="true"');
    expect(hooksHtml).toContain('data-debounced="liga-mx"');
    expect(hooksHtml).toContain('data-stored="decimal"');
    expect(hooksHtml).toContain('data-json="true"');
    expect(hooksHtml).toContain('data-loading="false"');
    expect(hooksHtml).toContain('data-tab="resumen"');
    expect(hooksHtml).toContain('data-push="true"');
    expect(hooksHtml).toContain('data-install="true"');
    expect(hooksHtml).toContain(">ready<");
    assertFd16Clean(hooksHtml, "HooksSmokeHarness");

    const stubsHtml = renderToStaticMarkup(
      <div>
        <VerificationSurface />
        <AlertsClubView />
        <RefereesClubView />
        <StandingsBracketsSection />
      </div>,
    );
    expect(stubsHtml).toContain("Verificación Spacetime");
    expect(stubsHtml).toContain("Alertas de mercado");
    expect(stubsHtml).toContain("Árbitros");
    expect(stubsHtml).toContain("Tabla y llaves");
    assertFd16Clean(stubsHtml, "RouteStubs");
  });

  it("valida presupuesto CSS, tokens --pl-* y regla FD-16 en sofascore-kit.css", () => {
    const cssPath = fileURLToPath(
      new URL("../../../apps/web/app/sofascore-kit.css", import.meta.url),
    );
    const css = fs.readFileSync(cssPath, "utf8");

    expect(css).toContain("@layer components");
    expect(css).toContain(".pl-sf-card");
    expect(css).toContain(".pl-sf-table");
    expect(css).toContain(".pl-sf-tabs");
    expect(css).toContain("min-block-size: 44px");
    expect(css).toContain("font-size: 16px");
    expect(css).not.toMatch(/sofascore/i);
    expect(css).not.toMatch(/backdrop-filter/i);
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
