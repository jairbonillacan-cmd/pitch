"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import { MaestroIcon, type MaestroIconName } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { WinningTicketDialog } from "../components/WinningTicketDialog";
import {
  useAbortableJson,
  useSafeEffect,
  useUrlSearchTab,
} from "../hooks";
import {
  ownHandleFor,
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../platform-provider";
import {
  DEFAULT_RECORD_PRIVACY,
  computeRecordStats,
  normalizeRecordPrivacy,
  type RecordPrivacy,
  type RecordPrivacyBlock,
} from "../record-stats";
import type { JournalEntry, MatchPick } from "../types";
import {
  DEFAULT_STORED_PREFS_V1,
  formatUnitsAsMxn,
  readStoredPrefs,
  writeStoredPrefs,
  type StoredAccountPrefsV1,
} from "./account/account-helpers";
import {
  formatSignedPctValue,
  formatSignedUnits,
} from "./record/PublicRecordSections";
import { RecordBankStatsTab } from "./record/RecordBankStatsTab";
import { RecordPicksTab } from "./record/RecordPicksTab";
import { RecordPrivacyTab } from "./record/RecordPrivacyTab";
import { computeJournalAuditSummary } from "./record/record-audit-helpers";

export type RecordTabKey = "picks" | "banca" | "privacidad";

interface RecordTabSpec {
  readonly key: RecordTabKey;
  readonly label: string;
}

interface RecordKpiItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly tone: "default" | "positive" | "negative" | "brand";
  readonly icon: MaestroIconName;
}

const RECORD_TABS: readonly RecordTabSpec[] = [
  { key: "picks", label: "Picks" },
  { key: "banca", label: "Banca y estadísticas" },
  { key: "privacidad", label: "Privacidad" },
];

const RECORD_TAB_KEYS: readonly RecordTabKey[] = ["picks", "banca", "privacidad"];

interface ServerPreferencesEnvelope {
  readonly preferences?: {
    readonly unitMxnCentavos?: number;
    readonly showMxnBalance?: boolean;
    readonly publicRecordVisible?: boolean;
    readonly showInRanking?: boolean;
    readonly recordPrivacy?: unknown;
    readonly bankrollStartMxnCentavos?: number | null;
  };
}

type NearestScrollIntoViewOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollRecordTabIntoView(element: HTMLButtonElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") return;
  const opts: NearestScrollIntoViewOptions = {
    block: "nearest",
    inline: "nearest",
    container: "nearest",
  };
  try {
    element.scrollIntoView(opts);
  } catch (err) {
    void err;
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

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

function updatePrivacyField(
  prev: RecordPrivacy,
  block: RecordPrivacyBlock,
  field: string,
  enabled: boolean,
): RecordPrivacy {
  const updatedFields: Record<string, boolean> = Object.fromEntries(
    Object.entries(prev[block].fields),
  );
  updatedFields[field] = enabled;
  return normalizeRecordPrivacy({
    ...prev,
    [block]: {
      enabled: prev[block].enabled,
      fields: updatedFields,
    },
  });
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
    oddsFormat,
    showMxnBalance,
    unitMxn,
    userTimezone,
    viewerIdentity,
    viewerRole,
    hasAccountSessionAuth,
  } = usePlatformCore();
  const {
    setShowMxnBalance,
    setUnitMxn,
    toggleWatchlistGame,
    exportJournalCsv,
    openShareTicket,
    pushToast,
    navigateTo,
  } = usePlatformActions();
  const journal = useJournalEntries();
  const watchlistGameIds = useWatchlistGameIds();

  const canPersistServer = Boolean(hasAccountSessionAuth && !storyPrefs);

  const [tab, setTab] = useUrlSearchTab<RecordTabKey>(
    "tab",
    RECORD_TAB_KEYS,
    initialTab ?? "picks",
  );
  const [winningEntry, setWinningEntry] = useState<JournalEntry | null>(null);
  const [prefs, setPrefs] = useState<StoredAccountPrefsV1>(() =>
    mergeRecordPrefs(DEFAULT_STORED_PREFS_V1, storyPrefs),
  );
  const appliedServerPrefsRef = useRef<boolean>(false);
  const tabButtonRefs = useRef<Partial<Record<RecordTabKey, HTMLButtonElement | null>>>({});

  useSafeEffect(() => {
    setPrefs(mergeRecordPrefs(readStoredPrefs(), storyPrefs));
  }, [storyPrefs]);

  const serverPrefsQuery = useAbortableJson<ServerPreferencesEnvelope>(
    "/api/me/preferences",
    { enabled: canPersistServer },
  );

  useSafeEffect(() => {
    if (!canPersistServer || appliedServerPrefsRef.current) return;
    const p = serverPrefsQuery.data?.preferences;
    if (!p) return;
    appliedServerPrefsRef.current = true;
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
  }, [canPersistServer, serverPrefsQuery.data, setShowMxnBalance, setUnitMxn]);

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

  const auditSummary = useMemo(() => computeJournalAuditSummary(journal), [journal]);

  const pickById = useMemo(() => {
    const map = new Map<string, MatchPick>();
    for (const g of dataset.games) {
      for (const pk of g.picks) {
        map.set(pk.id, pk);
      }
      for (const cand of g.parlayCandidates ?? []) {
        if (!map.has(cand.id)) map.set(cand.id, cand);
      }
    }
    return map;
  }, [dataset.games]);

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
        const nextPrivacy = updatePrivacyField(prev.recordPrivacy, block, field, enabled);
        const next: StoredAccountPrefsV1 = { ...prev, recordPrivacy: nextPrivacy };
        writeStoredPrefs(next);
        persistServerPatch({ recordPrivacy: nextPrivacy });
        return next;
      });
    },
    [persistServerPatch],
  );

  const handleResetPrivacy = useCallback(() => {
    const freshPrivacy = normalizeRecordPrivacy(DEFAULT_RECORD_PRIVACY);
    setPrefs((prev) => {
      const next: StoredAccountPrefsV1 = {
        ...prev,
        privacy: { ...prev.privacy, publicProfile: true, showInRanking: true },
        recordPrivacy: freshPrivacy,
      };
      writeStoredPrefs(next);
      return next;
    });
    persistServerPatch({
      publicRecordVisible: true,
      showInRanking: true,
      recordPrivacy: freshPrivacy,
    });
    pushToast("Privacidad restaurada a la configuración predeterminada.", "default");
  }, [persistServerPatch, pushToast]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentKey: RecordTabKey) => {
      const idx = RECORD_TAB_KEYS.indexOf(currentKey);
      if (idx < 0) return;
      const listEl = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
      const isRtl =
        listEl !== null &&
        typeof window !== "undefined" &&
        window.getComputedStyle(listEl).direction === "rtl";
      const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
      const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

      let targetIndex = -1;
      if (event.key === nextKey) {
        targetIndex = (idx + 1) % RECORD_TAB_KEYS.length;
      } else if (event.key === prevKey) {
        targetIndex = (idx - 1 + RECORD_TAB_KEYS.length) % RECORD_TAB_KEYS.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = RECORD_TAB_KEYS.length - 1;
      }

      if (targetIndex < 0) return;
      event.preventDefault();
      const targetTab = RECORD_TAB_KEYS[targetIndex];
      if (!targetTab) return;
      const node = tabButtonRefs.current[targetTab] ?? null;
      node?.focus();
      scrollRecordTabIntoView(node);
      if (targetTab !== tab) {
        setTab(targetTab);
      }
    },
    [setTab, tab],
  );

  const streakValue =
    stats.currentStreak.kind === "won"
      ? `${stats.currentStreak.length}G seguidos`
      : stats.currentStreak.kind === "lost"
        ? `${stats.currentStreak.length}P seguidos`
        : "—";

  const performanceDelta = useMemo(() => {
    const parts: string[] = [];
    if (stats.roiPct !== null) {
      parts.push(`ROI ${formatSignedPctValue(stats.roiPct)}`);
    }
    if (auditSummary.avgClvPct !== null) {
      parts.push(`CLV ${formatSignedPctValue(auditSummary.avgClvPct)}`);
    }
    if (auditSummary.avgEvPct !== null) {
      parts.push(`EV ${formatSignedPctValue(auditSummary.avgEvPct)}`);
    }
    if (parts.length > 0) return parts.join(" · ");
    return journal.length === 0 ? "Yield y CLV auditados" : "CLV —";
  }, [auditSummary.avgClvPct, auditSummary.avgEvPct, journal.length, stats.roiPct]);

  const kpiItems = useMemo<readonly RecordKpiItem[]>(
    () => [
      {
        id: "saldo",
        label: "Saldo",
        value: formatSignedUnits(stats.netUnits),
        delta:
          journal.length === 0
            ? "Sin picks sellados"
            : `${stats.won}G–${stats.lost}P${auditSummary.pushes > 0 ? ` · ${auditSummary.pushes} Push` : ""}${stats.open > 0 ? ` · ${stats.open} pend.` : ""}`,
        tone: stats.netUnits > 0 ? "positive" : stats.netUnits < 0 ? "negative" : "default",
        icon: "bankroll-wallet",
      },
      {
        id: "acierto",
        label: "Acierto",
        value: stats.hitRatePct !== null ? `${stats.hitRatePct.toFixed(1)} %` : "—",
        delta:
          stats.settled > 0
            ? `${stats.won}/${stats.settled} cerrados`
            : journal.length > 0
              ? `${journal.length} ${journal.length === 1 ? "pendiente" : "pendientes"}`
              : "Al cerrar tu 1.er pick",
        tone:
          stats.hitRatePct !== null && stats.hitRatePct >= 55 ? "positive" : "default",
        icon: "target-picks",
      },
      {
        id: "rendimiento",
        label: "Rendimiento / ROI",
        value: stats.yieldPct !== null ? formatSignedPctValue(stats.yieldPct) : "—",
        delta: performanceDelta,
        tone:
          stats.yieldPct === null
            ? "default"
            : stats.yieldPct >= 0
              ? "positive"
              : "negative",
        icon: "verified-seal",
      },
      {
        id: "racha",
        label: "Racha",
        value: streakValue,
        delta:
          stats.bestWinStreak > 0 ? `Mejor ${stats.bestWinStreak}G` : "Sin cierres todavía",
        tone:
          stats.currentStreak.kind === "won"
            ? "positive"
            : stats.currentStreak.kind === "lost"
              ? "negative"
              : "default",
        icon: "flame",
      },
    ],
    [
      auditSummary.pushes,
      journal.length,
      performanceDelta,
      stats.bestWinStreak,
      stats.currentStreak.kind,
      stats.hitRatePct,
      stats.lost,
      stats.netUnits,
      stats.open,
      stats.settled,
      stats.won,
      stats.yieldPct,
      streakValue,
    ],
  );

  const handleOpenVerify = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigateTo("/verificacion");
    },
    [navigateTo],
  );

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/lab">
        <div className="pl-rec">
          <SofascoreCard as="section" className="pl-rec-hero-card">
            <div className="pl-rec-hero-top">
              <div className="pl-rec-hero-copy">
                <div className="pl-rec-hero-head">
                  <h1 className="pl-rec-title [text-wrap:balance]">Mi récord</h1>
                  <span className="pl-pill pl-pill--brand">
                    <MaestroIcon name="verified-seal" size={13} />
                    <span>Sellado antes del partido</span>
                  </span>
                </div>
                <p className="pl-rec-sub [text-wrap:pretty]">
                  Tus picks y parlays en unidades (0.25u–5.00u), con liquidación auditable, banca
                  privada opcional y control de tu perfil público.
                </p>
                <div className="pl-rec-sync-row">
                  <p className="pl-rec-sync" data-local-storage-note="">
                    {hasAccountSessionAuth
                      ? "Sincronizado en tu cuenta (registro inmutable)."
                      : "Guardado en este navegador; inicia sesión para sincronizar y sellar en servidor."}
                  </p>
                  <a
                    href="/verificacion"
                    className="pl-rec-verify-link"
                    onClick={handleOpenVerify}
                  >
                    <MaestroIcon name="verified-seal" size={13} />
                    <span>Verificar SHA-256</span>
                  </a>
                </div>
              </div>

              <div className="pl-rec-hero-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    openShareTicket({
                      kind: "pick",
                      title: "Mi récord · PitchLab",
                      subtitle: `@${ownHandle} · ${journal.length} picks sellados`,
                      leagueLabel: "Mi récord",
                      pickLabel: `${stats.won}G-${stats.lost}P · ${formatSignedUnits(stats.netUnits)}${
                        auditSummary.avgClvPct !== null
                          ? ` · CLV ${formatSignedPctValue(auditSummary.avgClvPct)}`
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
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportJournalCsv()}
                >
                  <MaestroIcon name="download" size={14} />
                  <span>Exportar CSV</span>
                </Button>
              </div>
            </div>

            <dl
              className="pl-sf-kpi-strip pl-rec-kpi-strip"
              data-pl-sf-kpi-strip=""
            >
              {kpiItems.map((item) => (
                <div
                  key={item.id}
                  className={`pl-sf-kpi-item is-${item.tone}`}
                  data-pl-sf-kpi-tone={item.tone}
                >
                  <dt className="pl-sf-kpi-label pl-rec-kpi-label">
                    <MaestroIcon name={item.icon} size={14} />
                    <span>{item.label}</span>
                  </dt>
                  <dd className="pl-sf-kpi-value-row num">
                    <span className="pl-sf-kpi-value">{item.value}</span>
                    <span className="pl-sf-kpi-delta">{item.delta}</span>
                  </dd>
                </div>
              ))}
            </dl>

            {effectiveShowMxn || prefs.bankrollStartMxn !== null ? (
              <p className="pl-rec-kpi-mxn num" data-bitacora-mxn-balance="">
                <MaestroIcon name="bankroll-wallet" size={14} />
                <span>
                  Saldo privado estimado: ≈ {formatUnitsAsMxn(stats.netUnits, effectiveUnitMxn)} (1u
                  = ${effectiveUnitMxn.toLocaleString("es-MX")} MXN)
                </span>
              </p>
            ) : null}
          </SofascoreCard>

          <div
            role="tablist"
            aria-label="Secciones de Mi récord"
            aria-orientation="horizontal"
            className="pl-sf-tabs is-underline pl-rec-tabs"
            data-pl-sf-tabs="underline"
          >
            {RECORD_TABS.map((item) => {
              const isSelected = tab === item.key;
              return (
                <button
                  key={item.key}
                  ref={(el) => {
                    tabButtonRefs.current[item.key] = el;
                  }}
                  id={`pl-rec-tab-${item.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  data-pl-sf-tab={item.key}
                  className="pl-sf-tab pl-rec-tab-btn"
                  onClick={(event) => {
                    scrollRecordTabIntoView(event.currentTarget);
                    if (item.key !== tab) {
                      setTab(item.key);
                    }
                  }}
                  onKeyDown={(event) => handleTabKeyDown(event, item.key)}
                >
                  <span className="pl-sf-tab-label">{item.label}</span>
                  {item.key === "picks" && journal.length > 0 ? (
                    <span className="pl-sf-tab-count num">{journal.length}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            id="pl-rec-panel-picks"
            role="tabpanel"
            aria-labelledby="pl-rec-tab-picks"
            hidden={tab !== "picks"}
          >
            {tab === "picks" ? (
              <RecordPicksTab
                journal={journal}
                oddsFormat={oddsFormat}
                watchedGames={watchedGames}
                suggestedUpcoming={suggestedUpcoming}
                onToggleWatchlist={toggleWatchlistGame}
                onNavigateHome={() => navigateTo("/app")}
                onNavigatePicks={() => navigateTo("/app/picks")}
                onNavigateParlays={() => navigateTo("/app/parlays")}
                onNavigateVerify={() => navigateTo("/verificacion")}
                onOpenWinningEntry={setWinningEntry}
                onOpenShareTicket={openShareTicket}
              />
            ) : null}
          </div>

          <div
            id="pl-rec-panel-banca"
            role="tabpanel"
            aria-labelledby="pl-rec-tab-banca"
            hidden={tab !== "banca"}
          >
            {tab === "banca" ? (
              <RecordBankStatsTab
                stats={stats}
                unitMxn={effectiveUnitMxn}
                bankrollStartMxn={prefs.bankrollStartMxn}
                oddsFormat={oddsFormat}
                onSaveBankroll={handleSaveBankroll}
                entries={journal}
                pickById={pickById}
                userTimezone={userTimezone || "America/Mexico_City"}
              />
            ) : null}
          </div>

          <div
            id="pl-rec-panel-privacidad"
            role="tabpanel"
            aria-labelledby="pl-rec-tab-privacidad"
            hidden={tab !== "privacidad"}
          >
            {tab === "privacidad" ? (
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
                onResetPrivacy={handleResetPrivacy}
              />
            ) : null}
          </div>
        </div>

        <WinningTicketDialog entry={winningEntry} onClose={() => setWinningEntry(null)} />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
