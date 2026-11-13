import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LeagueSnapshotSchema,
  snapshotToMatchAnalyses,
  type PublicMemberProfile,
} from "@pitchlab/contracts";
import {
  buildPlatformDataset,
  PlatformProvider,
  type RawLeagueInput,
} from "../src/index";
import { AnalystProfileClubView } from "../src/platform/club/AnalystProfileClubView";
import { BitacoraClubView } from "../src/platform/club/BitacoraClubView";
import {
  computeRecordStats,
  DEFAULT_RECORD_PRIVACY,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "../src/platform/record-stats";

function loadSnapshot(leagueKey: "liga-mx" | "nfl"): RawLeagueInput {
  const file = path.resolve(
    import.meta.dirname,
    "../../../data/snapshots",
    leagueKey,
    "latest.json",
  );
  const parsed = LeagueSnapshotSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const { matches } = snapshotToMatchAnalyses(parsed);
  return {
    league: parsed.league,
    leagueLabel: leagueKey === "nfl" ? "NFL" : "Liga MX",
    sport: leagueKey === "nfl" ? "american-football" : "football",
    season: parsed.seasonLabel,
    roundLabel: parsed.periodLabel,
    generatedAt: parsed.updatedAt,
    games: matches,
    standings: parsed.standings,
  };
}

const dataset = buildPlatformDataset([loadSnapshot("liga-mx"), loadSnapshot("nfl")]);

describe("Mi récord (/app/lab) y Récord público en perfil", () => {
  it("renderiza las 3 pestañas de Mi récord con banca privada, 7 estadísticas y vista previa de privacidad", () => {
    const picksHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <BitacoraClubView initialTab="picks" />
      </PlatformProvider>,
    );
    expect(picksHtml).toContain("Mi récord");
    expect(picksHtml).toContain("Picks sellados");
    expect(picksHtml).toContain("Partidos en vigilancia");
    expect(picksHtml).toContain('id="pl-rec-tab-picks"');
    expect(picksHtml).toContain('id="pl-rec-tab-banca"');
    expect(picksHtml).toContain('id="pl-rec-tab-privacidad"');
    expect(picksHtml).not.toContain("Récord Verificado");
    expect(picksHtml.toLowerCase()).not.toContain("cortex ia");

    const bancaHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <BitacoraClubView
          initialTab="banca"
          storyPrefs={{ bankrollStartMxn: 5000, unitMxn: 250, showMxnBalance: true }}
        />
      </PlatformProvider>,
    );
    expect(bancaHtml).toContain("Tu banca inicial (opcional)");
    expect(bancaHtml).toContain("Siempre privado · Nadie más ve pesos");
    expect(bancaHtml).toContain("data-bitacora-mxn-balance");
    expect(bancaHtml).toContain("Curva de saldo en el tiempo");
    expect(bancaHtml).toContain("Rendimiento y ROI");
    expect(bancaHtml).toContain("CLV y momio promedio");
    expect(bancaHtml).toContain("Rachas y meses extremos");
    expect(bancaHtml).toContain("Acierto por liga");
    expect(bancaHtml).toContain("Acierto por mercado");
    expect(bancaHtml).toContain("Acierto por tipo de pick");

    const privHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={false}>
        <BitacoraClubView
          initialTab="privacidad"
          storyPrefs={{ bankrollStartMxn: 5000, unitMxn: 250 }}
        />
      </PlatformProvider>,
    );
    expect(privHtml).toContain("Visibilidad general");
    expect(privHtml).toContain("Mostrar mi récord en mi perfil público");
    expect(privHtml).toContain("Así ven los demás tu récord");
    expect(privHtml).toContain('data-privacy-block="record"');
    expect(privHtml).toContain('data-privacy-block="performance"');
    expect(privHtml).toContain('data-privacy-block="bank"');
    expect(privHtml).toContain('data-privacy-block="history"');
    expect(privHtml).toContain('role="switch"');
    expect(privHtml).toContain('data-slot="switch-content"');
  });

  it("muestra solo los datos compartidos en el perfil público de otro socio y respeta el modo privado", () => {
    const otherMember: PublicMemberProfile = {
      displayName: "Ana López",
      handle: "ana_analiza",
      bio: "Liga MX",
      avatarUrl: null,
      xUsername: null,
      joinedAt: "2026-09-10T12:00:00Z",
      isTipster: false,
    };

    const entries: RecordEntry[] = [
      {
        status: "won",
        units: 2,
        userDecimal: 2.0,
        fairDecimal: 1.9,
        clvPct: 2.5,
        leagueLabel: "Liga MX",
        pickLabel: "América gana",
        origin: "Spacetime Suite",
        sealedAtIso: "2026-10-12T18:00:00Z",
        settledAtIso: "2026-10-12T22:00:00Z",
      },
      {
        status: "pending",
        units: 1,
        userDecimal: 1.95,
        fairDecimal: 1.88,
        clvPct: 1.0,
        leagueLabel: "NFL",
        pickLabel: "Pick secreto abierto",
        origin: "Spacetime Suite",
        sealedAtIso: "2026-11-20T18:00:00Z",
      },
    ];
    const stats = computeRecordStats(entries, 20);
    const defaultView = publicRecordView(stats, entries, DEFAULT_RECORD_PRIVACY);

    const visibleHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AnalystProfileClubView
          handle="ana_analiza"
          memberProfile={otherMember}
          publicRecord={{ hidden: false, settled: stats.settled, view: defaultView }}
        />
      </PlatformProvider>,
    );
    expect(visibleHtml).toContain("Récord público de @ana_analiza");
    expect(visibleHtml).toContain("1G – 0P");
    expect(visibleHtml).toContain("América gana");
    // Ni el pick abierto ni el saldo (oculto por defecto) ni montos en pesos aparecen.
    expect(visibleHtml).not.toContain("Pick secreto abierto");
    expect(visibleHtml).not.toContain("MXN");
    expect(visibleHtml).not.toContain("+2.00u</dd>");

    // Si apaga el historial de picks, la pestaña Picks tampoco los muestra.
    const noHistoryView = publicRecordView(
      stats,
      entries,
      normalizeRecordPrivacy({ history: { enabled: false } }),
    );
    const noHistoryHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AnalystProfileClubView
          handle="ana_analiza"
          memberProfile={otherMember}
          publicRecord={{ hidden: false, settled: stats.settled, view: noHistoryView }}
        />
      </PlatformProvider>,
    );
    expect(noHistoryHtml).not.toContain("América gana");
    expect(noHistoryHtml).toContain("mantiene su historial de picks en privado");

    // Si apaga el récord completo, muestra Récord privado.
    const hiddenHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member" accountsEnabled={true}>
        <AnalystProfileClubView
          handle="ana_analiza"
          memberProfile={otherMember}
          publicRecord={{ hidden: true }}
        />
      </PlatformProvider>,
    );
    expect(hiddenHtml).toContain("Récord privado");
    expect(hiddenHtml).toContain("@ana_analiza eligió mantener su récord en privado");
  });
});
