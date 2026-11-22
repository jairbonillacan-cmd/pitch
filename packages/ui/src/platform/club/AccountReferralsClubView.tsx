"use client";

import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { Button, SofascoreCard } from "../../components/ui/primitives";
import { TipsterVerifiedBadge, UltraTag } from "../components/MaestroPrimitives";
import {
  ACCOUNT_TAB_EVENT,
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import { useSafeEffect } from "../hooks";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import { Avatar } from "./community-ui";
import {
  resolveSessionIdentity,
  type ServerProfileSummary,
} from "./account/account-helpers";
import type {
  InviteTabStoryOverride,
  ServerReferralsData,
} from "./account/InviteTab";
import {
  PlanTab,
  type PlanTabStoryOverride,
  type ServerPlanPayload,
} from "./account/PlanTab";
import type { PrefsTabStoryOverride } from "./account/PrefsTab";

const loadBillingTab = () =>
  import("./account/BillingTab").then((mod) => ({ default: mod.BillingTab }));
const LazyBillingTab = lazy(loadBillingTab);

const loadInviteTab = () =>
  import("./account/InviteTab").then((mod) => ({ default: mod.InviteTab }));
const LazyInviteTab = lazy(loadInviteTab);

const loadPrefsTab = () =>
  import("./account/PrefsTab").then((mod) => ({ default: mod.PrefsTab }));
const LazyPrefsTab = lazy(loadPrefsTab);

function prefetchAccountTab(key: AccountTabKey): void {
  if (key === "referrals") {
    void loadInviteTab();
  } else if (key === "prefs") {
    void loadPrefsTab();
  } else if (key === "cfdi" && BILLING_TAB_ENABLED) {
    void loadBillingTab();
  }
}

function AccountTabFallback({
  label,
  minBlockSize,
}: {
  readonly label: string;
  readonly minBlockSize: string;
}): React.JSX.Element {
  return (
    <div
      className="pl-skel-card rounded-2xl p-5 space-y-4"
      style={{ minBlockSize }}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="pl-skel-bar h-5 w-44 rounded-lg" />
        <div className="pl-skel-bar h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="pl-skel-bar h-32 rounded-xl" />
        <div className="pl-skel-bar h-32 rounded-xl" />
      </div>
      <div className="pl-skel-bar h-20 rounded-xl" />
    </div>
  );
}

export type AccountTabKey = "referrals" | "plan" | "prefs" | "cfdi";

export const BILLING_TAB_ENABLED = false;

interface AccountTabSpec {
  readonly key: AccountTabKey;
  readonly label: string;
}

const ACCOUNT_TABS: readonly AccountTabSpec[] = [
  { key: "plan", label: "Mi plan" },
  { key: "referrals", label: "Invitar amigos" },
  { key: "prefs", label: "Preferencias" },
  ...(BILLING_TAB_ENABLED ? [{ key: "cfdi" as const, label: "Facturación" }] : []),
];

function isAccountTabKey(value: unknown): value is AccountTabKey {
  return (
    value === "referrals" ||
    value === "plan" ||
    value === "prefs" ||
    (BILLING_TAB_ENABLED && value === "cfdi")
  );
}

export function resolveAccountTab(value: unknown): AccountTabKey | null {
  if (value === "preferencias") return "prefs";
  if (isAccountTabKey(value)) return value;
  return value === "cfdi" ? "plan" : null;
}

type NearestScrollIntoViewOptions = ScrollIntoViewOptions & {
  readonly container?: "all" | "nearest";
};

function scrollAccountTabIntoView(element: HTMLElement | null): void {
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

export interface MeReferralsPayload extends ServerReferralsData, ServerProfileSummary {}

export interface AccountReferralsClubViewProps {
  initialTab?: AccountTabKey;
  initialServerReferrals?: MeReferralsPayload | null;
  initialServerPlan?: ServerPlanPayload | null;
  checkoutNotice?: "success" | "cancelled" | null;
  storyOverride?: {
    accountsEnabled?: boolean;
    profile?: ServerProfileSummary;
    invite?: InviteTabStoryOverride;
    plan?: PlanTabStoryOverride;
    prefs?: PrefsTabStoryOverride;
  };
}

export function AccountReferralsClubView({
  initialTab,
  initialServerReferrals,
  initialServerPlan,
  checkoutNotice = null,
  storyOverride,
}: AccountReferralsClubViewProps = {}): React.JSX.Element {
  const {
    viewerRole,
    hasAccountSessionAuth,
    memberReferralsSnapshot,
    viewerIdentity,
  } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const accountsEnabled = storyOverride?.accountsEnabled ?? hasAccountSessionAuth;

  const [accountTab, setAccountTabState] = useState<AccountTabKey>(
    resolveAccountTab(initialTab) ?? "plan",
  );
  const [prefsSavedTick, setPrefsSavedTick] = useState<number>(0);
  const tabButtonRefs = useRef<Partial<Record<AccountTabKey, HTMLButtonElement | null>>>({});

  const serverPayload = initialServerReferrals ?? memberReferralsSnapshot ?? null;
  const referralsLoading = Boolean(
    accountsEnabled &&
      !storyOverride?.invite &&
      !initialServerReferrals &&
      !memberReferralsSnapshot &&
      !viewerIdentity?.referralCode,
  );

  const handlePrefsSaved = useCallback(() => {
    setPrefsSavedTick((n) => n + 1);
  }, []);

  const selectTab = useCallback((next: AccountTabKey) => {
    setAccountTabState(next);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (next === "plan") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", next);
      }
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (err) {
      void err;
    }
  }, []);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromUrl = () => {
      try {
        const param = resolveAccountTab(new URLSearchParams(window.location.search).get("tab"));
        if (param) {
          setAccountTabState(param);
        } else if (initialTab) {
          setAccountTabState(resolveAccountTab(initialTab) ?? "plan");
        } else {
          setAccountTabState("plan");
        }
      } catch (err) {
        void err;
      }
    };
    syncFromUrl();

    const onAccountTabEvent = (event: Event) => {
      if ("detail" in event) {
        const detail = (event as CustomEvent<unknown>).detail;
        if (isAccountTabKey(detail)) {
          selectTab(detail);
        }
      }
    };
    window.addEventListener(ACCOUNT_TAB_EVENT, onAccountTabEvent);
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener(ACCOUNT_TAB_EVENT, onAccountTabEvent);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [initialTab, selectTab]);

  useSafeEffect(() => {
    if (typeof document === "undefined") return;
    const activeButton =
      tabButtonRefs.current[accountTab] ?? document.getElementById(`pl-acct-tab-${accountTab}`);
    scrollAccountTabIntoView(activeButton);

    if (typeof window !== "undefined" && accountTab === "prefs") {
      const hash = window.location.hash.slice(1);
      if (hash.startsWith("pl-prefs-")) {
        const target = document.getElementById(hash);
        target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      }
    }
  }, [accountTab]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentKey: AccountTabKey) => {
      const currentIndex = ACCOUNT_TABS.findIndex((item) => item.key === currentKey);
      if (currentIndex < 0) return;

      const listEl = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
      const isRtl =
        listEl !== null &&
        typeof window !== "undefined" &&
        window.getComputedStyle(listEl).direction === "rtl";
      const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";
      const prevKey = isRtl ? "ArrowRight" : "ArrowLeft";

      let targetIndex = -1;
      if (event.key === nextKey) {
        targetIndex = (currentIndex + 1) % ACCOUNT_TABS.length;
      } else if (event.key === prevKey) {
        targetIndex = (currentIndex - 1 + ACCOUNT_TABS.length) % ACCOUNT_TABS.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = ACCOUNT_TABS.length - 1;
      }

      if (targetIndex < 0) return;
      event.preventDefault();
      const target = ACCOUNT_TABS[targetIndex];
      if (!target) return;
      const nextBtn = tabButtonRefs.current[target.key] ?? null;
      nextBtn?.focus();
      scrollAccountTabIntoView(nextBtn);
      selectTab(target.key);
    },
    [selectTab],
  );

  const identity = useMemo(
    () =>
      resolveSessionIdentity(
        viewerRole,
        storyOverride?.profile ??
          (viewerIdentity ? { ...serverPayload, ...viewerIdentity } : serverPayload),
      ),
    [serverPayload, storyOverride?.profile, viewerIdentity, viewerRole],
  );

  const profileHref = `/app/u/${identity.cleanHandle}`;

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/account">
        <div className="pl-acct">
          <SofascoreCard as="section" className="pl-acct-header-card">
            <header className="pl-acct-header">
              <div className="pl-acct-header-top">
                <div className="pl-acct-identity">
                  <Avatar
                    initials={identity.initials}
                    avatarUrl={identity.avatarUrl}
                    gradVar={identity.avatarGrad}
                    size={52}
                  />
                  <div className="pl-acct-identity-text">
                    <div className="pl-acct-title-row">
                      <h1 className="pl-acct-h1">Mi cuenta</h1>
                      <UltraTag />
                      {identity.isTipster ? <TipsterVerifiedBadge /> : null}
                    </div>
                    <p className="pl-acct-subtitle">
                      <a
                        href={profileHref}
                        className="pl-acct-handle-link"
                        onClick={(e) => {
                          if (
                            e.button !== 0 ||
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.altKey
                          ) {
                            return;
                          }
                          e.preventDefault();
                          navigateTo(profileHref);
                        }}
                      >
                        {identity.atHandle}
                      </a>
                      <span aria-hidden="true">·</span>
                      <span>Pase PitchLab Ultra</span>
                    </p>
                  </div>
                </div>

                {accountTab === "prefs" ? (
                  <span
                    role="status"
                    aria-live="polite"
                    className="pl-acct-autosave"
                    data-prefs-autosave=""
                  >
                    <span className="pl-acct-autosave-dot" aria-hidden="true" />
                    <span>
                      {prefsSavedTick > 0 ? "Guardado" : "Los cambios se guardan solos"}
                    </span>
                  </span>
                ) : (
                  <div className="pl-acct-hide-mobile">
                    <Button
                      variant="secondary"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={profileHref}
                          onClick={(e) => {
                            if (
                              e.button !== 0 ||
                              e.metaKey ||
                              e.ctrlKey ||
                              e.shiftKey ||
                              e.altKey
                            ) {
                              return;
                            }
                            e.preventDefault();
                            navigateTo(profileHref);
                          }}
                        />
                      }
                    >
                      Ver mi perfil
                    </Button>
                  </div>
                )}
              </div>

              <div
                role="tablist"
                aria-label="Secciones de mi cuenta"
                aria-orientation="horizontal"
                className="pl-sf-tabs is-underline pl-acct-tabs"
                data-pl-sf-tabs="underline"
              >
                {ACCOUNT_TABS.map((item) => {
                  const isSelected = accountTab === item.key;
                  return (
                    <button
                      key={item.key}
                      ref={(el) => {
                        tabButtonRefs.current[item.key] = el;
                      }}
                      id={`pl-acct-tab-${item.key}`}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      data-pl-sf-tab={item.key}
                      className="pl-sf-tab pl-acct-tab-btn"
                      onPointerEnter={() => prefetchAccountTab(item.key)}
                      onFocus={() => prefetchAccountTab(item.key)}
                      onClick={(event) => {
                        scrollAccountTabIntoView(event.currentTarget);
                        if (item.key !== accountTab) {
                          selectTab(item.key);
                        }
                      }}
                      onKeyDown={(event) => handleTabKeyDown(event, item.key)}
                    >
                      <span className="pl-sf-tab-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </header>
          </SofascoreCard>

          {accountTab === "referrals" ? (
            <div
              id="pl-acct-panel-referrals"
              role="tabpanel"
              aria-labelledby="pl-acct-tab-referrals"
            >
              <Suspense
                fallback={
                  <AccountTabFallback
                    label="Cargando programa de referidos"
                    minBlockSize="360px"
                  />
                }
              >
                <LazyInviteTab
                  identity={identity}
                  serverReferrals={serverPayload}
                  referralsLoading={referralsLoading}
                  storyOverride={
                    storyOverride?.invite ??
                    (storyOverride?.accountsEnabled !== undefined
                      ? { accountsEnabled: storyOverride.accountsEnabled }
                      : undefined)
                  }
                />
              </Suspense>
            </div>
          ) : null}

          {accountTab === "plan" ? (
            <div
              id="pl-acct-panel-plan"
              role="tabpanel"
              aria-labelledby="pl-acct-tab-plan"
            >
              <PlanTab
                identity={identity}
                referralCode={serverPayload?.referralCode ?? viewerIdentity?.referralCode}
                initialServerPlan={initialServerPlan}
                checkoutNotice={checkoutNotice}
                onOpenBilling={BILLING_TAB_ENABLED ? () => selectTab("cfdi") : undefined}
                storyOverride={
                  storyOverride?.plan ??
                  (storyOverride?.accountsEnabled !== undefined
                    ? { accountsEnabled: storyOverride.accountsEnabled }
                    : undefined)
                }
              />
            </div>
          ) : null}

          {accountTab === "prefs" ? (
            <div
              id="pl-acct-panel-prefs"
              role="tabpanel"
              aria-labelledby="pl-acct-tab-prefs"
            >
              <Suspense
                fallback={
                  <AccountTabFallback
                    label="Cargando preferencias de cuenta"
                    minBlockSize="420px"
                  />
                }
              >
                <LazyPrefsTab
                  identity={identity}
                  serverEmail={storyOverride?.profile?.email ?? serverPayload?.email}
                  onSaved={handlePrefsSaved}
                  storyOverride={
                    storyOverride?.prefs ??
                    (storyOverride?.accountsEnabled !== undefined
                      ? { accountsEnabled: storyOverride.accountsEnabled }
                      : undefined)
                  }
                />
              </Suspense>
            </div>
          ) : null}

          {BILLING_TAB_ENABLED && accountTab === "cfdi" ? (
            <div
              id="pl-acct-panel-cfdi"
              role="tabpanel"
              aria-labelledby="pl-acct-tab-cfdi"
            >
              <Suspense
                fallback={
                  <AccountTabFallback
                    label="Cargando facturación"
                    minBlockSize="320px"
                  />
                }
              >
                <LazyBillingTab accountsEnabledOverride={storyOverride?.accountsEnabled} />
              </Suspense>
            </div>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
