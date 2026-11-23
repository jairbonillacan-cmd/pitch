import React from "react";
import {
  asLeagueId,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  type DataHealthReport,
  type LeagueDataHealthRow,
} from "@pitchlab/contracts";
import { AdminDataHealthSection } from "./club/AdminDataHealthSection";
import {
  AdminSecurityAbuseSection,
  type AdminSecurityAbuseResponse,
} from "./club/AdminSecurityAbuseSection";
import { TipsterPortalClubView } from "./club/SocialAndTipsterViews";
import { MatchMarketsGrid } from "./club/match/MatchMarketsGrid";
import { MatchOutlookStrip } from "./components/MatchOutlookStrip";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { MatchOutlookSummary, PlatformMarketRow } from "./types";

const STORY_DATASET = buildPlatformDataset([]);

const STORY_SECURITY_ABUSE: AdminSecurityAbuseResponse = {
  generatedAtIso: "2026-11-21T18:30:00Z",
  windowHours: 24,
  summary: {
    total24h: 14,
    critical24h: 1,
    high24h: 3,
    revocations24h: 1,
    scraping24h: 5,
    rateLimit24h: 6,
    csrf24h: 1,
    idor24h: 1,
  },
  events: [
    {
      id: "sec-evt-1",
      kind: "session_revoked",
      severity: "critical",
      route: "/api/shell/extend",
      ipHashPrefix: "a94f02c81b3e",
      userRef: "u:9f24a11c",
      summaryDetail: "cubeta shell-extend · 76 recursos · 5 min",
      createdAtIso: "2026-11-21T18:12:00Z",
    },
    {
      id: "sec-evt-2",
      kind: "scraping_velocity",
      severity: "high",
      route: "/api/live/games/liga-mx-04",
      ipHashPrefix: "a94f02c81b3e",
      userRef: "u:9f24a11c",
      summaryDetail: "cubeta live-game · 52 recursos · 5 min",
      createdAtIso: "2026-11-21T18:08:00Z",
    },
    {
      id: "sec-evt-3",
      kind: "idor_attempt",
      severity: "high",
      route: "/api/alerts",
      ipHashPrefix: "7c10e44b902d",
      userRef: "u:3e18b70d",
      summaryDetail: "cubeta market-alerts · HTTP 404",
      createdAtIso: "2026-11-21T16:45:00Z",
    },
    {
      id: "sec-evt-4",
      kind: "csrf_rejected",
      severity: "medium",
      route: "/api/parlays/sgp",
      ipHashPrefix: "5b81d9a22f10",
      userRef: null,
      summaryDetail: "cubeta parlay-sgp · HTTP 403",
      createdAtIso: "2026-11-21T15:20:00Z",
    },
    {
      id: "sec-evt-5",
      kind: "rate_limit",
      severity: "low",
      route: "/api/search/referees",
      ipHashPrefix: "31de90c418aa",
      userRef: "u:71a0c42e",
      summaryDetail: "cubeta search-referees",
      createdAtIso: "2026-11-21T14:05:00Z",
    },
  ],
};

const LEAGUES_META = [
  { id: "nfl", label: "NFL", scheduleSource: "nflverse", injuriesSource: "nflverse-cc-by-4.0", injuriesCount: 160, games: 14 },
  { id: "liga-mx", label: "Liga MX", scheduleSource: "espn", injuriesSource: "espn-public-mex.1", injuriesCount: 0, games: 9 },
  { id: "premier-league", label: "Premier League", scheduleSource: "openfootball + espn", injuriesSource: "espn-public-eng.1", injuriesCount: 0, games: 10 },
  { id: "laliga", label: "LaLiga", scheduleSource: "openfootball + espn", injuriesSource: "espn-public-esp.1", injuriesCount: 0, games: 10 },
  { id: "bundesliga", label: "Bundesliga", scheduleSource: "openfootball + espn", injuriesSource: "espn-public-ger.1", injuriesCount: 0, games: 9 },
  { id: "serie-a", label: "Serie A", scheduleSource: "openfootball + espn", injuriesSource: "espn-public-ita.1", injuriesCount: 0, games: 10 },
  { id: "ligue-1", label: "Ligue 1", scheduleSource: "openfootball + espn", injuriesSource: "espn-public-fra.1", injuriesCount: 0, games: 9 },
] as const;

function buildStoryLeagues(mode: "healthy" | "degraded"): LeagueDataHealthRow[] {
  return LEAGUES_META.map((lg) => {
    const isStaleLigaMx = mode === "degraded" && lg.id === "liga-mx";
    const isWarnEpl = mode === "degraded" && lg.id === "premier-league";
    return {
      league: asLeagueId(lg.id),
      leagueLabel: lg.label,
      cells: {
        calendario: {
          dataType: "calendario",
          status: "ok",
          updatedAtUtc: "2026-11-14T16:00:00Z",
          ageHours: 2.4,
          maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
          sourceLabel: lg.scheduleSource,
          recordsCount: lg.games,
          lastError: null,
        },
        bajas: {
          dataType: "bajas",
          status: "ok",
          updatedAtUtc: "2026-11-14T16:30:00Z",
          ageHours: 1.9,
          maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.bajas.staleHours,
          sourceLabel: lg.injuriesSource,
          recordsCount: lg.injuriesCount,
          ...(lg.injuriesCount === 0
            ? { note: "Sin bajas públicas reportadas" }
            : { note: `${lg.injuriesCount} jugadores en reporte oficial` }),
          lastError: null,
        },
        momios: isStaleLigaMx
          ? {
              dataType: "momios",
              status: "stale",
              updatedAtUtc: "2026-11-12T20:15:00Z",
              ageHours: 46.2,
              maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
              sourceLabel: "the_odds_api (Pinnacle)",
              recordsCount: 18,
              lastError: {
                message: "The Odds API devolvió HTTP 429 (cuota mensual agotada); se conserva snapshot previo.",
                failingSinceUtc: "2026-11-14T12:00:00Z",
                source: "the_odds_api",
              },
            }
          : {
              dataType: "momios",
              status: isWarnEpl ? "warning" : "ok",
              updatedAtUtc: isWarnEpl ? "2026-11-13T21:00:00Z" : "2026-11-14T17:45:00Z",
              ageHours: isWarnEpl ? 21.4 : 0.7,
              maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.momios.staleHours,
              sourceLabel: lg.id === "nfl" ? "the_odds_api (DraftKings)" : "betfair_exchange",
              recordsCount: lg.games * 3,
              lastError: null,
            },
        alineaciones: {
          dataType: "alineaciones",
          status: "disabled",
          updatedAtUtc: null,
          ageHours: null,
          maxHours: DATA_FRESHNESS_THRESHOLDS_HOURS.alineaciones.staleHours,
          sourceLabel: "Apagado (sin fuente verificada)",
          recordsCount: 0,
          note: "Ranura lista; apagada hasta contar con fuente oficial verificada.",
          lastError: null,
        },
      },
    };
  });
}

const REPORT_HEALTHY: DataHealthReport = {
  schemaVersion: 1,
  generatedAtUtc: "2026-11-14T18:25:00Z",
  overallStatus: "ok",
  thresholdsHours: {
    calendario: 30,
    calendarioMatchday: 12,
    bajas: 36,
    momios: 36,
    momiosHardExpire: 72,
    alineaciones: null,
  },
  workflows: [
    {
      workflowId: "odds-refresh",
      label: "Actualización continua de momios",
      workflowFile: ".github/workflows/odds-refresh.yml",
      status: "ok",
      lastRunAtUtc: "2026-11-14T17:45:00Z",
      lastSuccessAtUtc: "2026-11-14T17:45:00Z",
      durationMs: 3820,
      cadenceLabel: "Cada 90–120 min en jornada y pre-partido · 3×/día entre semana",
      lastError: null,
    },
    {
      workflowId: "pre-mvp-snapshot",
      label: "Calendario, resultados y bajas",
      workflowFile: ".github/workflows/pre-mvp-snapshot.yml",
      status: "ok",
      lastRunAtUtc: "2026-11-14T16:30:00Z",
      lastSuccessAtUtc: "2026-11-14T16:30:00Z",
      durationMs: 11400,
      cadenceLabel: "Diario 11:00 UTC + 4 cortes extra en días de partido",
      lastError: null,
    },
  ],
  leagues: buildStoryLeagues("healthy"),
  activeIncidents: [],
};

const REPORT_WITH_INCIDENTS: DataHealthReport = {
  ...REPORT_HEALTHY,
  overallStatus: "critical",
  workflows: [
    {
      workflowId: "odds-refresh",
      label: "Actualización continua de momios",
      workflowFile: ".github/workflows/odds-refresh.yml",
      status: "failed",
      lastRunAtUtc: "2026-11-14T18:00:00Z",
      lastSuccessAtUtc: "2026-11-12T20:15:00Z",
      durationMs: 1920,
      cadenceLabel: "Cada 90–120 min en jornada y pre-partido · 3×/día entre semana",
      lastError: {
        message: "The Odds API devolvió HTTP 429; se conservó el snapshot anterior sin publicar cambios.",
        failingSinceUtc: "2026-11-14T12:00:00Z",
        source: "the_odds_api",
      },
    },
    REPORT_HEALTHY.workflows[1]!,
  ],
  leagues: buildStoryLeagues("degraded"),
  activeIncidents: [
    {
      incidentKey: "workflow:odds-refresh",
      kind: "workflow_failure",
      severity: "critical",
      targetLabel: "Workflow odds-refresh",
      workflowId: "odds-refresh",
      message: "The Odds API devolvió HTTP 429; se conservó el snapshot anterior.",
      failingSinceUtc: "2026-11-14T12:00:00Z",
      lastSeenAtUtc: "2026-11-14T18:00:00Z",
      emailedAtUtc: "2026-11-14T12:00:08Z",
      occurrences: 4,
    },
    {
      incidentKey: "stale:liga-mx:momios",
      kind: "stale_data",
      severity: "critical",
      targetLabel: "Liga MX · Momios",
      league: asLeagueId("liga-mx"),
      dataType: "momios",
      message: "Antigüedad de 46.2 h supera el umbral de 36 h.",
      failingSinceUtc: "2026-11-14T08:15:00Z",
      lastSeenAtUtc: "2026-11-14T18:00:00Z",
      emailedAtUtc: "2026-11-14T08:15:04Z",
      occurrences: 5,
    },
  ],
};

const STORY_OUTLOOK_WITH_QUOTE: MatchOutlookSummary = {
  generatedAtUtc: "2026-11-14T18:30:00Z",
  mostLikely: { label: "Gana Rayados de Monterrey", p: 0.482, fairDecimal: 2.07 },
  scorelines: [
    { home: 2, away: 1, p: 0.114, fairDecimal: 8.77 },
    { home: 1, away: 1, p: 0.102, fairDecimal: 9.8 },
    { home: 1, away: 0, p: 0.091, fairDecimal: 10.99 },
  ],
  quality: { flag: "ok", coveragePct: 94 },
  hasRecentQuote: true,
  latestQuote: {
    bookLabel: "Pinnacle",
    capturedAtUtc: "2026-11-14T18:30:00Z",
  },
};

const STORY_MARKET_ROWS: PlatformMarketRow[] = [
  {
    group: "Resultado 1X2",
    market: "1x2",
    selection: "home",
    label: "Monterrey gana",
    p: 0.482,
    fairDecimal: 2.07,
    fairAmerican: 107,
    openDecimal: null,
    currentDecimal: 2.18,
    quoteBookLabel: "Pinnacle",
    quoteCapturedAtUtc: "2026-11-14T18:30:00Z",
    edgePts: null,
    cardCategory: "resultado",
    cardTitle: "Resultado 1X2",
    isMostLikely: true,
  },
  {
    group: "Resultado 1X2",
    market: "1x2",
    selection: "draw",
    label: "Empate",
    p: 0.268,
    fairDecimal: 3.73,
    fairAmerican: 273,
    openDecimal: null,
    currentDecimal: 3.55,
    quoteBookLabel: "Pinnacle",
    quoteCapturedAtUtc: "2026-11-14T18:30:00Z",
    edgePts: null,
    cardCategory: "resultado",
    cardTitle: "Resultado 1X2",
  },
  {
    group: "Resultado 1X2",
    market: "1x2",
    selection: "away",
    label: "Querétaro gana",
    p: 0.25,
    fairDecimal: 4.0,
    fairAmerican: 300,
    openDecimal: null,
    currentDecimal: 3.9,
    quoteBookLabel: "Pinnacle",
    quoteCapturedAtUtc: "2026-11-14T18:30:00Z",
    edgePts: null,
    cardCategory: "resultado",
    cardTitle: "Resultado 1X2",
  },
];

function HealthStoryFrame({ report }: { report: DataHealthReport }): React.JSX.Element {
  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: 16 }}>
      <AdminDataHealthSection dataset={STORY_DATASET} storyReport={report} />
    </div>
  );
}

function OddsStampStoryFrame(): React.JSX.Element {
  return (
    <div className="space-y-4" style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <MatchOutlookStrip outlook={STORY_OUTLOOK_WITH_QUOTE} oddsFormat="decimal" />
      <MatchMarketsGrid
        sport="football"
        markets={STORY_MARKET_ROWS}
        oddsFormat="decimal"
        watermark="PL-STORY"
      />
    </div>
  );
}

export default {
  title: "Platform v4 / Salud de datos y captura de momios",
};

export const SaludAlDia = {
  render: () => <HealthStoryFrame report={REPORT_HEALTHY} />,
};
export const SaludAlDiaClaro = {
  ...SaludAlDia,
  globals: { theme: "light" },
};

export const SaludConIncidentes = {
  render: () => <HealthStoryFrame report={REPORT_WITH_INCIDENTS} />,
};
export const SaludConIncidentesClaro = {
  ...SaludConIncidentes,
  globals: { theme: "light" },
};

export const SaludMovil375 = {
  render: () => <HealthStoryFrame report={REPORT_WITH_INCIDENTS} />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const SaludMovil375Claro = {
  ...SaludMovil375,
  globals: { theme: "light" },
};

export const MercadosConHoraDeCaptura = {
  render: () => <OddsStampStoryFrame />,
};
export const MercadosConHoraDeCapturaClaro = {
  ...MercadosConHoraDeCaptura,
  globals: { theme: "light" },
};

function SecurityStoryFrame(): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="admin" accountsEnabled={true}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: 16 }}>
        <AdminSecurityAbuseSection storyData={STORY_SECURITY_ABUSE} enableLiveFetch={false} />
      </div>
    </PlatformProvider>
  );
}

export const SeguridadAntiScrapingOscuro = {
  render: () => <SecurityStoryFrame />,
};
export const SeguridadAntiScrapingClaro = {
  ...SeguridadAntiScrapingOscuro,
  globals: { theme: "light" },
};

export const PortalTipsterOscuro = {
  render: () => (
    <PlatformProvider dataset={STORY_DATASET} initialRole="tipster" accountsEnabled={false}>
      <TipsterPortalClubView />
    </PlatformProvider>
  ),
};
export const PortalTipsterClaro = {
  ...PortalTipsterOscuro,
  globals: { theme: "light" },
};
