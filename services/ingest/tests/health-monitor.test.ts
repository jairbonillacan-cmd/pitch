import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeDataAgeHours,
  DATA_FRESHNESS_THRESHOLDS_HOURS,
  evaluateFreshnessStatus,
} from "@pitchlab/contracts";
import {
  collectAndWriteLeagueInjuries,
  parseEspnInjuriesPayload,
  parseNflverseInjuriesCsv,
} from "../src/adapters/injuries.js";
import { evaluatePreparedLineupsSlot } from "../src/adapters/lineups.js";
import {
  evaluateAndReportDataHealth,
  type AlertEmailPayload,
} from "../src/health/health-monitor.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Parte 2 y Parte 4 · Bajas grabadas, alineaciones apagadas, frescura y alertas sin repetición", () => {
  it("parsea bajas grabadas de nflverse CSV y ESPN JSON, y conserva injuries.json previo ante fallas HTTP 500", async () => {
    const observedAt = "2026-11-14T16:30:00Z";
    const csvSample = [
      "season,week,team,full_name,position,report_primary_injury,report_status,date_modified",
      "2026,10,BUF,Dalton Kincaid,TE,Knee,Out,2026-11-14T15:00:00Z",
      "2026,10,MIN,Justin Jefferson,WR,Hamstring,Questionable,2026-11-14T15:10:00Z",
    ].join("\n");

    const parsedNfl = parseNflverseInjuriesCsv({
      csvText: csvSample,
      targetWeek: 10,
      observedAtIso: observedAt,
    });
    expect(parsedNfl).toHaveLength(2);
    expect(parsedNfl[0]?.teamId).toBe("nfl.buffalo-bills");
    expect(parsedNfl[0]?.status).toBe("Baja");
    expect(parsedNfl[0]?.detail).toBe("Rodilla");
    expect(parsedNfl[1]?.teamId).toBe("nfl.minnesota-vikings");
    expect(parsedNfl[1]?.status).toBe("Duda");
    expect(parsedNfl[1]?.detail).toBe("Isquiotibiales");

    const parsedEspn = parseEspnInjuriesPayload({
      league: "premier-league",
      observedAtIso: observedAt,
      payload: {
        injuries: [
          {
            displayName: "Arsenal",
            injuries: [
              {
                athlete: { displayName: "Martin Odegaard", position: { abbreviation: "MID" } },
                status: "Out",
                details: { type: "Ankle" },
                date: "2026-11-14T12:00:00Z",
              },
            ],
          },
        ],
      },
    });
    expect(parsedEspn).toHaveLength(1);
    expect(parsedEspn[0]?.teamId).toBe("premier-league.arsenal");
    expect(parsedEspn[0]?.detail).toBe("Tobillo");

    // Prueba de preservación: escribe primero un archivo válido y luego simula HTTP 500
    const tmp = mkdtempSync(join(tmpdir(), "pl-inj-"));
    tempDirs.push(tmp);
    cpSync(resolve(REPO_ROOT, "data/snapshots/nfl"), join(tmp, "nfl"), { recursive: true });
    rmSync(join(tmp, "nfl", "injuries.json"), { force: true });

    const nflSnap = JSON.parse(readFileSync(join(tmp, "nfl", "latest.json"), "utf8")) as {
      games?: Array<{ status?: string; week?: number }>;
    };
    const activeWeek =
      nflSnap.games?.find((g) => g.status !== "final" && typeof g.week === "number")?.week ??
      nflSnap.games?.[0]?.week ??
      10;
    const csvForActiveWeek = csvSample.replaceAll("2026,10,", `2026,${activeWeek},`);

    const firstWrite = await collectAndWriteLeagueInjuries({
      snapshotsRoot: tmp,
      league: "nfl",
      observedAtIso: observedAt,
      fetcher: {
        async fetchText() {
          return { status: 200, body: csvForActiveWeek };
        },
      },
    });
    expect(firstWrite.ok).toBe(true);
    expect(firstWrite.wroteFile).toBe(true);
    expect(firstWrite.entriesCount).toBe(2);

    const savedJson = readFileSync(join(tmp, "nfl", "injuries.json"), "utf8");

    const failedSecond = await collectAndWriteLeagueInjuries({
      snapshotsRoot: tmp,
      league: "nfl",
      observedAtIso: "2026-11-14T18:00:00Z",
      fetcher: {
        async fetchText() {
          return { status: 503, body: "Service Unavailable" };
        },
      },
    });
    expect(failedSecond.ok).toBe(false);
    expect(failedSecond.wroteFile).toBe(false);
    expect(readFileSync(join(tmp, "nfl", "injuries.json"), "utf8")).toBe(savedJson);
  });

  it("mantiene la ranura de alineaciones estrictamente apagada sin llamadas ni escritura", () => {
    const slot = evaluatePreparedLineupsSlot("liga-mx", "2026-11-14T18:00:00Z");
    expect(slot.enabled).toBe(false);
    expect(slot.wroteFile).toBe(false);
    expect(slot.payload.enabled).toBe(false);
    expect(slot.payload.entries).toEqual([]);
  });

  it("calcula frescura exacta contra los umbrales X por tipo de dato", () => {
    const nowMs = Date.parse("2026-11-14T18:00:00Z");
    expect(computeDataAgeHours("2026-11-14T12:00:00Z", nowMs)).toBe(6);
    expect(
      evaluateFreshnessStatus({
        ageHours: 6,
        warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours,
        staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      }),
    ).toBe("ok");

    expect(
      evaluateFreshnessStatus({
        ageHours: 26,
        warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours,
        staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      }),
    ).toBe("warning");

    expect(
      evaluateFreshnessStatus({
        ageHours: 32,
        warningHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.warningHours,
        staleHours: DATA_FRESHNESS_THRESHOLDS_HOURS.calendario.staleHours,
      }),
    ).toBe("stale");

    expect(
      evaluateFreshnessStatus({
        ageHours: null,
        warningHours: null,
        staleHours: null,
        disabled: true,
      }),
    ).toBe("disabled");
  });

  it("envía correo al fundador en la primera falla, NO lo repite en corridas consecutivas y vuelve a avisar solo tras recuperarse y volver a fallar", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "pl-health-"));
    tempDirs.push(tmp);

    // Preparamos una liga aislada (liga-mx) con datos al día (calendario, bajas y momios frescos)
    const snapDir = join(tmp, "data", "snapshots", "liga-mx");
    mkdirSync(snapDir, { recursive: true });
    cpSync(resolve(REPO_ROOT, "data/snapshots/liga-mx/latest.json"), join(snapDir, "latest.json"));

    const snap = JSON.parse(readFileSync(join(snapDir, "latest.json"), "utf8")) as {
      updatedAt: string;
      games: Array<{ status: string }>;
    };
    snap.updatedAt = "2026-11-14T16:00:00Z";
    snap.games = snap.games.map((g) => ({ ...g, status: "final" }));
    writeFileSync(join(snapDir, "latest.json"), JSON.stringify(snap, null, 2), "utf8");

    writeFileSync(
      join(snapDir, "injuries.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          league: "liga-mx",
          observedAt: "2026-11-14T16:30:00Z",
          source: "espn-public-mex.1",
          coverageStatus: "no_public_feed",
          entries: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const oddsDir = join(tmp, "data", "odds_timeseries");
    mkdirSync(oddsDir, { recursive: true });
    writeFileSync(
      join(oddsDir, "quotes_latest.json"),
      JSON.stringify(
        {
          schema_version: "quotes_latest_v1.0.0",
          updated_at_utc: "2026-11-14T17:00:00Z",
          max_quote_age_hours: 72,
          active_sources: ["the_odds_api"],
          ticks: [
            {
              event_id: "ws:football:liga-mx:20261115:queretaro:monterrey",
              sport: "football",
              league: "MEX",
              market: "1x2",
              line: null,
              selection: "home",
              book: "pinnacle",
              price_decimal: 2.45,
              ts_captured: "2026-11-14T17:00:00Z",
              ts_event_start: "2026-11-15T23:00:00Z",
              source: "scraped_ws",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const sentEmails: AlertEmailPayload[] = [];
    const mockSendEmail = async (payload: AlertEmailPayload) => {
      sentEmails.push(payload);
      return { sent: true, id: `email-${sentEmails.length}` };
    };

    const mockEnv = {
      RESEND_API_KEY: "re_test_offline_fixture",
      EMAIL_FROM: "PitchLab <hola@pitchlab.mx>",
      PITCHLAB_ADMIN_EMAILS: "fundador@pitchlab.mx",
      THE_ODDS_API_KEY: "odds_test_key",
    };

    // Corrida 1: falla el workflow odds-refresh -> manda 1 correo con qué falló y desde cuándo
    const run1 = await evaluateAndReportDataHealth({
      rootDir: tmp,
      leagues: ["liga-mx"],
      nowIso: "2026-11-14T18:00:00Z",
      env: mockEnv,
      sendEmailFn: mockSendEmail,
      workflowUpdate: {
        workflowId: "odds-refresh",
        status: "failed",
        runAtUtc: "2026-11-14T18:00:00Z",
        durationMs: 1200,
        errorMessage: "The Odds API respondió HTTP 429 (límite alcanzado).",
        errorSource: "the_odds_api",
      },
    });

    expect(run1.emailSent).toBe(true);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toEqual(["fundador@pitchlab.mx"]);
    expect(sentEmails[0]?.text).toContain("HTTP 429");
    expect(run1.newlyNotifiedIncidents).toHaveLength(1);

    // Corrida 2 (30 min después): sigue la MISMA falla -> NO repite el correo
    const run2 = await evaluateAndReportDataHealth({
      rootDir: tmp,
      leagues: ["liga-mx"],
      nowIso: "2026-11-14T18:30:00Z",
      env: mockEnv,
      sendEmailFn: mockSendEmail,
      workflowUpdate: {
        workflowId: "odds-refresh",
        status: "failed",
        runAtUtc: "2026-11-14T18:30:00Z",
        durationMs: 950,
        errorMessage: "The Odds API respondió HTTP 429 (límite alcanzado).",
        errorSource: "the_odds_api",
      },
    });

    expect(run2.emailSent).toBe(false);
    expect(sentEmails).toHaveLength(1);
    expect(run2.ledger.openIncidents["workflow::odds-refresh"]?.occurrences).toBe(2);
    // Conserva el failingSinceUtc original de cuando empezó la falla
    expect(run2.ledger.openIncidents["workflow::odds-refresh"]?.failingSinceUtc).toBe(
      "2026-11-14T18:00:00Z",
    );

    // Corrida 3: el workflow se recupera -> limpia la incidencia abierta sin enviar correo
    const run3 = await evaluateAndReportDataHealth({
      rootDir: tmp,
      leagues: ["liga-mx"],
      nowIso: "2026-11-14T19:00:00Z",
      env: mockEnv,
      sendEmailFn: mockSendEmail,
      clearTransientScopes: ["odds"],
      workflowUpdate: {
        workflowId: "odds-refresh",
        status: "ok",
        runAtUtc: "2026-11-14T19:00:00Z",
        durationMs: 880,
      },
    });

    expect(run3.emailSent).toBe(false);
    expect(run3.report.overallStatus).toBe("ok");
    expect(Object.keys(run3.ledger.openIncidents)).toHaveLength(0);

    // Corrida 4 (2 días después sin actualizar calendario -> supera umbral X = 30 h) -> envía nuevo aviso
    const run4 = await evaluateAndReportDataHealth({
      rootDir: tmp,
      leagues: ["liga-mx"],
      nowIso: "2026-11-16T02:00:00Z",
      env: mockEnv,
      sendEmailFn: mockSendEmail,
    });

    expect(run4.emailSent).toBe(true);
    expect(sentEmails).toHaveLength(2);
    expect(run4.report.leagues[0]?.cells.calendario.status).toBe("stale");
  });
});
