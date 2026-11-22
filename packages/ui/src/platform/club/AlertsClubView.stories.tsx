import React, { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmblemSurfaceProvider } from "../../sports";
import { useSafeEffect } from "../hooks";
import { PlatformProvider } from "../platform-provider";
import { STORY_DATASET } from "../story-fixtures";
import { AlertsClubView, type MarketAlertItem } from "./AlertsClubView";

const meta = {
  title: "Platform v4 / Club / AlertsClubView",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ACTIVE_ALERTS: readonly MarketAlertItem[] = [
  {
    id: "al-lmx-ame-ev",
    name: "Línea rezagada · América 1X2 EV+ en Liga MX",
    trigger: "stale_line_ev",
    league: "liga-mx",
    marketFamily: "1x2",
    selection: "Club América",
    thresholdEvPct: 4.5,
    minDecimal: 1.65,
    maxDecimal: 2.35,
    direction: "home",
    bookmaker: "caliente",
    cooldownMinutes: 60,
    channel: "both",
    active: true,
    lastFiredAtIso: "2026-11-21T19:40:00Z",
    lastFiredHash: "9a4e1c7b20f64d38",
    firedCount: 3,
    createdAtIso: "2026-11-10T14:00:00Z",
    updatedAtIso: "2026-11-21T19:40:00Z",
  },
  {
    id: "al-nba-tot-steam",
    name: "Steam sharp · Totales NBA >= 3.5 pp",
    trigger: "sharp_steam",
    league: "nba",
    marketFamily: "nba_totals",
    selection: "Más de 224.5 puntos",
    thresholdEvPct: 3.5,
    minDecimal: 1.8,
    maxDecimal: 2.1,
    direction: "over",
    bookmaker: "pinnacle",
    cooldownMinutes: 30,
    channel: "push",
    active: true,
    lastFiredAtIso: "2026-11-21T21:15:00Z",
    lastFiredHash: "4c8d7b1e39a05f22",
    firedCount: 5,
    createdAtIso: "2026-11-08T18:30:00Z",
    updatedAtIso: "2026-11-21T21:15:00Z",
  },
  {
    id: "al-epl-corners-open",
    name: "Apertura · Córners Premier League",
    trigger: "market_opened",
    league: "premier-league",
    marketFamily: "corners_total",
    selection: "Arsenal · Más de 9.5 córners",
    thresholdEvPct: 3.0,
    minDecimal: 1.7,
    maxDecimal: null,
    direction: "over",
    bookmaker: "bet365",
    cooldownMinutes: 180,
    channel: "in_app",
    active: true,
    lastFiredAtIso: null,
    lastFiredHash: null,
    firedCount: 0,
    createdAtIso: "2026-11-18T11:20:00Z",
    updatedAtIso: "2026-11-18T11:20:00Z",
  },
  {
    id: "al-laliga-xi",
    name: "Titular confirmado · Lamine Yamal",
    trigger: "lineup_confirmed",
    league: "laliga",
    marketFamily: "player_props_football",
    selection: "Lamine Yamal",
    thresholdEvPct: null,
    minDecimal: 1.75,
    maxDecimal: 2.6,
    direction: "over",
    bookmaker: "codere",
    cooldownMinutes: 60,
    channel: "push",
    active: true,
    lastFiredAtIso: "2026-11-20T18:05:00Z",
    lastFiredHash: "7e1b92a4c603f811",
    firedCount: 1,
    createdAtIso: "2026-11-12T10:15:00Z",
    updatedAtIso: "2026-11-20T18:05:00Z",
  },
  {
    id: "al-mlb-schedule",
    name: "Cambio de calendario · MLB",
    trigger: "schedule_change",
    league: "mlb",
    marketFamily: null,
    selection: "Los Angeles Dodgers",
    thresholdEvPct: null,
    minDecimal: null,
    maxDecimal: null,
    direction: null,
    bookmaker: null,
    cooldownMinutes: 180,
    channel: "in_app",
    active: false,
    lastFiredAtIso: null,
    lastFiredHash: null,
    firedCount: 0,
    createdAtIso: "2026-10-29T16:45:00Z",
    updatedAtIso: "2026-11-05T09:00:00Z",
  },
];

function AlertsStoryShell({
  children,
  mobile = false,
  role = "member",
}: {
  readonly children: React.ReactNode;
  readonly mobile?: boolean;
  readonly role?: "member" | "visitor";
}): React.JSX.Element {
  return (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole={role}>
        <div
          className="pl-stage"
          style={{
            minHeight: "100vh",
            padding: mobile ? 12 : 24,
          }}
        >
          <div
            style={{
              maxWidth: mobile ? 375 : 1140,
              width: "100%",
              margin: "0 auto",
            }}
          >
            {children}
          </div>
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

function CopilotNlAutoTrigger({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    const root = hostRef.current;
    if (!root) return undefined;
    let submitTimerId: number | null = null;
    const chipTimerId = window.setTimeout(() => {
      const firstChip = root.querySelector<HTMLButtonElement>(".pl-al-example-chip");
      firstChip?.click();
      submitTimerId = window.setTimeout(() => {
        const submitBtn = root.querySelector<HTMLButtonElement>(".pl-al-copilot-submit");
        submitBtn?.click();
      }, 60);
    }, 30);

    return () => {
      window.clearTimeout(chipTimerId);
      if (submitTimerId !== null) {
        window.clearTimeout(submitTimerId);
      }
    };
  }, []);

  return <div ref={hostRef}>{children}</div>;
}

function AlertsFetchErrorInterceptor({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [ready, setReady] = useState(false);

  useSafeEffect(() => {
    const originalFetch = window.fetch;
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/alerts")) {
        return new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          const timerId = window.setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  ok: false,
                  error: "No pudimos consultar tus alertas en este momento. Intenta de nuevo.",
                }),
                {
                  status: 503,
                  headers: { "content-type": "application/json" },
                },
              ),
            );
          }, 45);
          signal?.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timerId);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
      return originalFetch.call(window, input, init);
    };

    window.fetch = interceptedFetch;
    setReady(true);

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return ready ? <>{children}</> : <></>;
}

export const AlertasActivasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <AlertsStoryShell>
      <AlertsClubView
        initialAlerts={ACTIVE_ALERTS}
        maxActiveAlerts={40}
        accountReady
        hasActivePass
        defaultLeague="liga-mx"
      />
    </AlertsStoryShell>
  ),
};

export const AlertasActivasClaro: Story = {
  globals: { theme: "light" },
  render: AlertasActivasOscuro.render,
};

export const EstadoVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <AlertsStoryShell>
      <AlertsClubView
        initialAlerts={[]}
        maxActiveAlerts={40}
        accountReady
        hasActivePass
        defaultLeague="liga-mx"
      />
    </AlertsStoryShell>
  ),
};

export const EstadoVacioClaro: Story = {
  globals: { theme: "light" },
  render: EstadoVacioOscuro.render,
};

export const CopilotoNlBorradorOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <AlertsStoryShell>
      <CopilotNlAutoTrigger>
        <AlertsClubView
          initialAlerts={ACTIVE_ALERTS.slice(0, 2)}
          maxActiveAlerts={40}
          accountReady
          hasActivePass={false}
          defaultLeague="liga-mx"
        />
      </CopilotNlAutoTrigger>
    </AlertsStoryShell>
  ),
};

export const CopilotoNlBorradorClaro: Story = {
  globals: { theme: "light" },
  render: CopilotoNlBorradorOscuro.render,
};

export const ErrorHonestoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <AlertsStoryShell>
      <AlertsFetchErrorInterceptor>
        <AlertsClubView
          maxActiveAlerts={40}
          accountReady
          hasActivePass
          defaultLeague="liga-mx"
        />
      </AlertsFetchErrorInterceptor>
    </AlertsStoryShell>
  ),
};

export const ErrorHonestoClaro: Story = {
  globals: { theme: "light" },
  render: ErrorHonestoOscuro.render,
};

export const VisitanteVistaPreviaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <AlertsStoryShell role="visitor">
      <AlertsClubView
        initialAlerts={[]}
        maxActiveAlerts={40}
        accountReady={false}
        hasActivePass={false}
        defaultLeague="liga-mx"
      />
    </AlertsStoryShell>
  ),
};

export const VisitanteVistaPreviaClaro: Story = {
  globals: { theme: "light" },
  render: VisitanteVistaPreviaOscuro.render,
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <AlertsStoryShell mobile>
      <AlertsClubView
        initialAlerts={ACTIVE_ALERTS}
        maxActiveAlerts={40}
        accountReady
        hasActivePass
        defaultLeague="liga-mx"
      />
    </AlertsStoryShell>
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: MovilOscuro.render,
};
