"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TipsterVerifiedBadge, UltraTag } from "../components/MaestroPrimitives";
import {
  ACCOUNT_TAB_EVENT,
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { Avatar, TabPanel, UnderlineTabs, type TabDef } from "./community-ui";
import {
  resolveSessionIdentity,
  type ServerProfileSummary,
} from "./account/account-helpers";
import { BillingTab } from "./account/BillingTab";
import {
  InviteTab,
  type InviteTabStoryOverride,
  type ServerReferralsData,
} from "./account/InviteTab";
import {
  PlanTab,
  type PlanTabStoryOverride,
  type ServerPlanPayload,
} from "./account/PlanTab";
import { PrefsTab, type PrefsTabStoryOverride } from "./account/PrefsTab";

export type AccountTabKey = "referrals" | "plan" | "prefs" | "cfdi";

const ACCOUNT_TABS: readonly TabDef<AccountTabKey>[] = [
  { key: "referrals", label: "Invitar amigos" },
  { key: "plan", label: "Mi plan" },
  { key: "prefs", label: "Preferencias" },
  { key: "cfdi", label: "Facturación" },
];

function isAccountTabKey(value: unknown): value is AccountTabKey {
  return (
    value === "referrals" ||
    value === "plan" ||
    value === "prefs" ||
    value === "cfdi"
  );
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
    accountsEnabled: ctxAccountsEnabled,
    memberReferralsSnapshot,
    memberReferralsLoaded,
    navigateTo,
    viewerIdentity,
  } = usePlatform();
  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;

  const [accountTab, setAccountTabState] = useState<AccountTabKey>(
    initialTab ?? "referrals",
  );
  const [prefsSavedTick, setPrefsSavedTick] = useState<number>(0);

  const serverPayload = initialServerReferrals ?? memberReferralsSnapshot ?? null;
  const referralsLoading = Boolean(
    accountsEnabled &&
      !storyOverride?.invite &&
      !initialServerReferrals &&
      !memberReferralsLoaded,
  );

  const handlePrefsSaved = useCallback(() => {
    setPrefsSavedTick((n) => n + 1);
  }, []);

  const selectTab = useCallback((next: AccountTabKey) => {
    setAccountTabState(next);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (next === "referrals") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", next);
      }
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (err) {
      void err;
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      try {
        const param = new URLSearchParams(window.location.search).get("tab");
        if (isAccountTabKey(param)) {
          setAccountTabState(param);
        } else if (initialTab) {
          setAccountTabState(initialTab);
        } else {
          setAccountTabState("referrals");
        }
      } catch (err) {
        void err;
      }
    };
    syncFromUrl();

    const onAccountTabEvent = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isAccountTabKey(next)) {
        selectTab(next);
      }
    };
    window.addEventListener(ACCOUNT_TAB_EVENT, onAccountTabEvent);
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener(ACCOUNT_TAB_EVENT, onAccountTabEvent);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [initialTab, selectTab]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const activeButton = document.getElementById(`pl-acct-tab-${accountTab}`);
    activeButton?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      container: "nearest",
    } as ScrollIntoViewOptions);
  }, [accountTab]);

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
                <a
                  href={profileHref}
                  className="pl-acct-btn pl-acct-btn--ghost pl-acct-btn--sm pl-acct-hide-mobile"
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
                  Ver mi perfil
                </a>
              )}
            </div>

            <UnderlineTabs
              tabs={ACCOUNT_TABS}
              active={accountTab}
              onChange={selectTab}
              label="Secciones de mi cuenta"
              idPrefix="pl-acct"
              className="pl-acct-tabs"
            />
          </header>

          {accountTab === "referrals" ? (
            <TabPanel tabKey="referrals" idPrefix="pl-acct">
              <InviteTab
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
            </TabPanel>
          ) : null}

          {accountTab === "plan" ? (
            <TabPanel tabKey="plan" idPrefix="pl-acct">
              <PlanTab
                identity={identity}
                referralCode={serverPayload?.referralCode ?? viewerIdentity?.referralCode}
                initialServerPlan={initialServerPlan}
                checkoutNotice={checkoutNotice}
                onOpenBilling={() => selectTab("cfdi")}
                storyOverride={
                  storyOverride?.plan ??
                  (storyOverride?.accountsEnabled !== undefined
                    ? { accountsEnabled: storyOverride.accountsEnabled }
                    : undefined)
                }
              />
            </TabPanel>
          ) : null}

          {accountTab === "prefs" ? (
            <TabPanel tabKey="prefs" idPrefix="pl-acct">
              <PrefsTab
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
            </TabPanel>
          ) : null}

          {accountTab === "cfdi" ? (
            <TabPanel tabKey="cfdi" idPrefix="pl-acct">
              <BillingTab accountsEnabledOverride={storyOverride?.accountsEnabled} />
            </TabPanel>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
