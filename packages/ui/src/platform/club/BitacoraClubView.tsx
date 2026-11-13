"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LensGlowOrbs, MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { WinningTicketDialog } from "../components/WinningTicketDialog";
import { ownHandleFor, usePlatform } from "../platform-provider";
import {
  computeRecordStats,
  normalizeRecordPrivacy,
  type RecordPrivacy,
  type RecordPrivacyBlock,
} from "../record-stats";
import type { JournalEntry } from "../types";
import {
  DEFAULT_STORED_PREFS_V1,
  formatUnitsAsMxn,
  readStoredPrefs,
  writeStoredPrefs,
  type StoredAccountPrefsV1,
} from "./account/account-helpers";
import { TabPanel, UnderlineTabs, useUrlTab, type TabDef } from "./community-ui";
import {
  formatSignedPctValue,
  formatSignedUnits,
} from "./record/PublicRecordSections";
import { RecordBankStatsTab } from "./record/RecordBankStatsTab";
import { RecordPicksTab } from "./record/RecordPicksTab";
import { RecordPrivacyTab } from "./record/RecordPrivacyTab";

export type RecordTabKey = "picks" | "banca" | "privacidad";

const RECORD_TABS: readonly TabDef<RecordTabKey>[] = [
  { key: "picks", label: "Picks" },
  { key: "banca", label: "Banca y estadísticas", shortLabel: "Estadísticas" },
  { key: "privacidad", label: "Privacidad" },
];
const RECORD_TAB_KEYS: readonly RecordTabKey[] = ["picks", "banca", "privacidad"];

function mergeRecordPrefs(
  base: StoredAccountPrefsV1,
  override?: Partial<StoredAccountPrefsV1>,
): StoredAccountPrefsV1 {
  if (!override) return base;
  return {
    ...base,
    ...override,
    alerts: { ...base.alerts, ...(override.alerts ?? {}) },
    privacy: { ...base.privacy, ...(override.privacy ?? {}) },
    recordPrivacy: override.recordPrivacy
      ? normalizeRecordPrivacy(override.recordPrivacy)
      : base.recordPrivacy,
    bankrollStartMxn:
      override.bankrollStartMxn !== undefined
        ? override.bankrollStartMxn
        : base.bankrollStartMxn,
  };
}

export interface BitacoraClubViewProps {
  initialTab?: RecordTabKey;
  storyPrefs?: Partial<StoredAccountPrefsV1>;
}

export function BitacoraClubView({
  initialTab,
  storyPrefs,
}: BitacoraClubViewProps = {}): React.JSX.Element {
  const {
    dataset,
    journal,
    oddsFormat,
    showMxnBalance,
    setShowMxnBalance,
    unitMxn,
    setUnitMxn,
    watchlistGameIds,
    toggleWatchlistGame,
    exportJournalCsv,
    openShareTicket,
    pushToast,
    navigateTo,
    viewerIdentity,
    viewerRole,
    hasAccountSessionAuth,
  } = usePlatform();

  const canPersistServer = Boolean(hasAccountSessionAuth && !storyPrefs);

  const [tab, setTab] = useUrlTab<RecordTabKey>(
    RECORD_TAB_KEYS,
    initialTab ?? "picks",
  );
  const [winningEntry, setWinningEntry] = useState<JournalEntry | null>(null);
  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() =>
    mergeRecordPrefs(DEFAULT_STORED_PREFS_V1, storyPrefs),
  );

  // Hidrata desde localStorage en cliente (y respeta overrides de Storybook/tests).
  useEffect(() => {
    setPrefs(mergeRecordPrefs(readStoredPrefs(), storyPrefs));
  }, [storyPrefs]);

  // Con cuenta real autenticada: hidrata desde PostgreSQL (`/api/me/preferences`).
  useEffect(() => {
    if (!canPersistServer) return;
    let cancelled = false;
    void fetch("/api/me/preferences", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) =>
        res.ok
          ? ((await res.json().catch(() => null)) as {
              preferences?: {
                unitMxnCentavos?: number;
                showMxnBalance?: boolean;
                publicRecordVisible?: boolean;
                showInRanking?: boolean;
                recordPrivacy?: unknown;
                bankrollStartMxnCentavos?: number | null;
              };
            } | null)
          : null,
      )
      .then((data) => {
        if (cancelled || !data?.preferences) return;
        const p = data.preferences;
        const serverUnit =
          typeof p.unitMxnCentavos === "number" && Number.isFinite(p.unitMxnCentavos)
            ? Math.max(10, Math.min(100_000, Math.round(p.unitMxnCentavos / 100)))
            : undefined;
        if (serverUnit !== undefined) setUnitMxn(serverUnit);
        if (typeof p.showMxnBalance === "boolean") setShowMxnBalance(p.showMxnBalance);

        setPrefs((prev) => {
          const next: StoredAccountPrefsV1 = {
            ...prev,
            unitMxn: serverUnit ?? prev.unitMxn,
            showMxnBalance:
              typeof p.showMxnBalance === "boolean" ? p.showMxnBalance : prev.showMxnBalance,
            privacy: {
              ...prev.privacy,
              publicProfile:
                typeof p.publicRecordVisible === "boolean"
                  ? p.publicRecordVisible
                  : prev.privacy.publicProfile,
              showInRanking:
                typeof p.showInRanking === "boolean"
                  ? p.showInRanking
                  : prev.privacy.showInRanking,
            },
            recordPrivacy:
              p.recordPrivacy !== undefined
                ? normalizeRecordPrivacy(p.recordPrivacy)
                : prev.recordPrivacy,
            bankrollStartMxn:
              p.bankrollStartMxnCentavos === null
                ? null
                : typeof p.bankrollStartMxnCentavos === "number" &&
                    Number.isFinite(p.bankrollStartMxnCentavos)
                  ? Math.round(p.bankrollStartMxnCentavos / 100)
                  : prev.bankrollStartMxn,
          };
          writeStoredPrefs(next);
          return next;
        });
      })
      .catch((err) => {
        void err;
      });
    return () => {
      cancelled = true;
    };
  }, [canPersistServer, setShowMxnBalance, setUnitMxn]);

  const persistServerPatch = useCallback(
    (body: Record<string, unknown>) => {
      if (!canPersistServer) return;
      void fetch("/api/me/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch((err) => {
        void err;
      });
    },
    [canPersistServer],
  );

  const effectiveUnitMxn = storyPrefs?.unitMxn ?? unitMxn;
  const effectiveShowMxn = storyPrefs?.showMxnBalance ?? showMxnBalance;
  const startingUnits = useMemo(
    () =>
      prefs.bankrollStartMxn !== null && prefs.bankrollStartMxn > 0 && effectiveUnitMxn > 0
        ? prefs.bankrollStartMxn / effectiveUnitMxn
        : null,
    [effectiveUnitMxn, prefs.bankrollStartMxn],
  );

  const stats = useMemo(
    () => computeRecordStats(journal, startingUnits),
    [journal, startingUnits],
  );

  const watchedGames = useMemo(
    () => dataset.games.filter((g) => watchlistGameIds.includes(g.id)),
    [dataset.games, watchlistGameIds],
  );

  const suggestedUpcoming = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status !== "FT" && !watchlistGameIds.includes(g.id))
        .slice(0, 3),
    [dataset.games, watchlistGameIds],
  );

  const ownHandle = ownHandleFor(viewerIdentity, viewerRole);

  const handleSaveBankroll = useCallback(
    (nextMxn: number | null) => {
      setPrefs((prev) => {
        const next: StoredAccountPrefsV1 = { ...prev, bankrollStartMxn: nextMxn };
        writeStoredPrefs(next);
        return next;
      });
      persistServerPatch({ bankrollStartMxn: nextMxn });
      pushToast(
        nextMxn !== null
          ? "Banca inicial guardada (siempre privada)."
          : "Se quitó tu banca inicial.",
        "default",
      );
    },
    [persistServerPatch, pushToast],
  );

  const handleTogglePublicRecord = useCallback(
    (nextVisible: boolean) => {
      setPrefs((prev) => {
        const next: StoredAccountPrefsV1 = {
          ...prev,
          privacy: { ...prev.privacy, publicProfile: nextVisible },
        };
        writeStoredPrefs(next);
        return next;
      });
      persistServerPatch({ publicRecordVisible: nextVisible });
      pushToast(
        nextVisible
          ? "Tu récord vuelve a mostrarse en tu perfil público."
          : "Tu récord pasó a modo privado.",
        "default",
      );
    },
    [persistServerPatch, pushToast],
  );

  const handleToggleShowInRanking = useCallback(
    (nextRanking: boolean) => {
      setPrefs((prev) => {
        const next: StoredAccountPrefsV1 = {
          ...prev,
          privacy: { ...prev.privacy, showInRanking: nextRanking },
        };
        writeStoredPrefs(next);
        return next;
      });
      persistServerPatch({ showInRanking: nextRanking });
    },
    [persistServerPatch],
  );

  const handleToggleBlock = useCallback(
    (block: RecordPrivacyBlock, enabled: boolean) => {
      setPrefs((prev) => {
        const nextPrivacy: RecordPrivacy = {
          ...prev.recordPrivacy,
          [block]: { ...prev.recordPrivacy[block], enabled },
        };
        const next: StoredAccountPrefsV1 = { ...prev, recordPrivacy: nextPrivacy };
        writeStoredPrefs(next);
        persistServerPatch({ recordPrivacy: nextPrivacy });
        return next;
      });
    },
    [persistServerPatch],
  );

  const handleToggleField = useCallback(
    (block: RecordPrivacyBlock, field: string, enabled: boolean) => {
      setPrefs((prev) => {
        const nextPrivacy: RecordPrivacy = {
          ...prev.recordPrivacy,
          [block]: {
            ...prev.recordPrivacy[block],
            fields: {
              ...(prev.recordPrivacy[block].fields as Record<string, boolean>),
              [field]: enabled,
            } as RecordPrivacy[typeof block]["fields"],
          },
        };
        const next: StoredAccountPrefsV1 = { ...prev, recordPrivacy: nextPrivacy };
        writeStoredPrefs(next);
        persistServerPatch({ recordPrivacy: nextPrivacy });
        return next;
      });
    },
    [persistServerPatch],
  );

  const streakValue =
    stats.currentStreak.kind === "won"
      ? `${stats.currentStreak.length}G seguidos`
      : stats.currentStreak.kind === "lost"
        ? `${stats.currentStreak.length}P seguidos`
        : "Sin cierres";

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/lab">
        <div className="pl-rec">
          {/* Hero y 4 indicadores clave */}
          <header className="pl-rec-hero glass-lens glass-ring">
            <LensGlowOrbs subtle />
            <div className="pl-rec-hero-top">
              <div className="pl-rec-hero-copy">
                <div>
                  <span className="pl-pill pl-pill--brand">
                    <MaestroIcon name="ticket" size={13} />
                    <span>Sellado antes del partido · CLV automático</span>
                  </span>
                </div>
                <h1 className="pl-rec-title">Mi récord</h1>
                <p className="pl-rec-sub">
                  Tus picks individuales y parlays en unidades (0.25u–5.00u), con banca privada
                  opcional y control de lo que ven otros socios.
                </p>
                <p className="pl-rec-sync" data-local-storage-note="">
                  {hasAccountSessionAuth
                    ? "Sincronizado y sellado en tu cuenta de socio."
                    : "Guardado en este navegador. Cuando entres con tu cuenta se sincroniza y queda sellado en el servidor."}
                </p>
              </div>

              <div className="pl-rec-hero-actions">
                <button
                  type="button"
                  className="pl-btn-primary text-xs"
                  onClick={() =>
                    openShareTicket({
                      kind: "pick",
                      title: "Mi récord · PitchLab",
                      subtitle: `@${ownHandle} · ${journal.length} picks sellados`,
                      leagueLabel: "Mi récord",
                      pickLabel: `${stats.won}G-${stats.lost}P · ${formatSignedUnits(stats.netUnits)}${
                        stats.avgClvPct !== null
                          ? ` · CLV ${formatSignedPctValue(stats.avgClvPct)}`
                          : ""
                      }`,
                      probability: Math.max(
                        0.5,
                        stats.hitRatePct !== null ? stats.hitRatePct / 100 : 0.5,
                      ),
                      fairDecimal: 1.72,
                      marketDecimal: stats.avgOddsDecimal ?? 1.91,
                      units: Math.max(1, Math.abs(stats.netUnits)),
                      gameStatus: "FT",
                      pickSlug: journal[0]?.pickId,
                    })
                  }
                >
                  <MaestroIcon name="share" size={14} />
                  <span>Compartir récord</span>
                </button>

                <button
                  type="button"
                  className="pl-btn-glass text-xs"
                  onClick={() => exportJournalCsv()}
                >
                  <MaestroIcon name="download" size={14} />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            <div className="pl-rec-kpis num">
              <div className="pl-rec-kpi glass-ring">
                <div className="pl-rec-kpi-head">
                  <span>Saldo</span>
                  <MaestroIcon
                    name="chart"
                    size={15}
                    style={{
                      color:
                        stats.netUnits >= 0 ? "var(--pl-success)" : "var(--pl-danger)",
                    }}
                  />
                </div>
                <strong
                  className={`pl-rec-kpi-val ${stats.netUnits >= 0 ? "pl-rec-pos" : "pl-rec-neg"}`}
                >
                  {formatSignedUnits(stats.netUnits)}
                </strong>
                {effectiveShowMxn || prefs.bankrollStartMxn !== null ? (
                  <span className="pl-rec-kpi-mxn" data-bitacora-mxn-balance="">
                    ≈ {formatUnitsAsMxn(stats.netUnits, effectiveUnitMxn)} (1u = $
                    {effectiveUnitMxn.toLocaleString("es-MX")})
                  </span>
                ) : null}
                <span className="pl-rec-kpi-sub">
                  {stats.won}G – {stats.lost}P cerrados · {stats.open}{" "}
                  {stats.open === 1 ? "abierto" : "abiertos"}
                </span>
              </div>

              <div className="pl-rec-kpi glass-ring">
                <div className="pl-rec-kpi-head">
                  <span>Acierto</span>
                  <MaestroIcon
                    name="check"
                    size={15}
                    style={{ color: "var(--pl-info)" }}
                  />
                </div>
                <strong className="pl-rec-kpi-val">
                  {stats.hitRatePct !== null ? `${stats.hitRatePct.toFixed(1)} %` : "—"}
                </strong>
                <span className="pl-rec-kpi-sub">
                  {stats.settled > 0
                    ? `${stats.won} de ${stats.settled} cerrados`
                    : `${journal.length} picks registrados`}
                </span>
              </div>

              <div className="pl-rec-kpi glass-ring">
                <div className="pl-rec-kpi-head">
                  <span>Rendimiento y CLV</span>
                  <MaestroIcon
                    name="bolt"
                    size={15}
                    style={{ color: "var(--pl-brand)" }}
                  />
                </div>
                <strong
                  className={`pl-rec-kpi-val ${
                    stats.yieldPct === null
                      ? ""
                      : stats.yieldPct >= 0
                        ? "pl-rec-pos"
                        : "pl-rec-neg"
                  }`}
                >
                  {stats.yieldPct !== null ? formatSignedPctValue(stats.yieldPct) : "—"}
                </strong>
                <span className="pl-rec-kpi-sub">
                  CLV {stats.avgClvPct !== null ? formatSignedPctValue(stats.avgClvPct) : "—"}
                  {stats.roiPct !== null ? ` · ROI ${formatSignedPctValue(stats.roiPct)}` : ""}
                </span>
              </div>

              <div className="pl-rec-kpi glass-ring">
                <div className="pl-rec-kpi-head">
                  <span>Racha actual</span>
                  <MaestroIcon
                    name="bell"
                    size={15}
                    style={{ color: "var(--pl-accent)" }}
                  />
                </div>
                <strong
                  className={`pl-rec-kpi-val ${
                    stats.currentStreak.kind === "won"
                      ? "pl-rec-pos"
                      : stats.currentStreak.kind === "lost"
                        ? "pl-rec-neg"
                        : ""
                  }`}
                >
                  {streakValue}
                </strong>
                <span className="pl-rec-kpi-sub">
                  Mejor racha: {stats.bestWinStreak}G · {watchlistGameIds.length} en vigilancia
                </span>
              </div>
            </div>
          </header>

          {/* 3 pestañas WAI-ARIA sincronizadas con ?tab= */}
          <UnderlineTabs
            tabs={RECORD_TABS}
            active={tab}
            onChange={setTab}
            label="Secciones de Mi récord"
            idPrefix="pl-rec"
            className="pl-rec-tabs"
          />

          <TabPanel tabKey="picks" idPrefix="pl-rec" active={tab}>
            <RecordPicksTab
              journal={journal}
              oddsFormat={oddsFormat}
              watchedGames={watchedGames}
              suggestedUpcoming={suggestedUpcoming}
              onToggleWatchlist={toggleWatchlistGame}
              onNavigateHome={() => navigateTo("/app")}
              onOpenWinningEntry={setWinningEntry}
              onOpenShareTicket={openShareTicket}
            />
          </TabPanel>

          <TabPanel tabKey="banca" idPrefix="pl-rec" active={tab}>
            <RecordBankStatsTab
              stats={stats}
              unitMxn={effectiveUnitMxn}
              bankrollStartMxn={prefs.bankrollStartMxn}
              oddsFormat={oddsFormat}
              onSaveBankroll={handleSaveBankroll}
            />
          </TabPanel>

          <TabPanel tabKey="privacidad" idPrefix="pl-rec" active={tab}>
            <RecordPrivacyTab
              handle={ownHandle}
              stats={stats}
              entries={journal}
              oddsFormat={oddsFormat}
              publicRecordVisible={prefs.privacy.publicProfile}
              showInRanking={prefs.privacy.showInRanking}
              privacy={prefs.recordPrivacy}
              onTogglePublicRecord={handleTogglePublicRecord}
              onToggleShowInRanking={handleToggleShowInRanking}
              onToggleBlock={handleToggleBlock}
              onToggleField={handleToggleField}
            />
          </TabPanel>
        </div>

        <WinningTicketDialog entry={winningEntry} onClose={() => setWinningEntry(null)} />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
