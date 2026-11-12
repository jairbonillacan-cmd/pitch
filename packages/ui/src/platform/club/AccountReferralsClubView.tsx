"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TipstarVerifiedBadge, UltraTag } from "../components/MaestroPrimitives";
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
import { PlanTab, type PlanTabStoryOverride } from "./account/PlanTab";
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

interface MeReferralsPayload extends ServerReferralsData, ServerProfileSummary {}

export interface AccountReferralsClubViewProps {
  initialTab?: AccountTabKey;
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
  storyOverride,
}: AccountReferralsClubViewProps = {}): React.JSX.Element {
  const { viewerRole, accountsEnabled: ctxAccountsEnabled, navigateTo } = usePlatform();
  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;

  const [accountTab, setAccountTabState] = useState<AccountTabKey>(
    initialTab ?? "referrals",
  );
  const [serverPayload, setServerPayload] = useState<MeReferralsPayload | null>(
    null,
  );
  const [referralsLoading, setReferralsLoading] = useState<boolean>(
    Boolean(accountsEnabled && !storyOverride?.invite),
  );
  const [prefsSavedTick, setPrefsSavedTick] = useState<number>(0);

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
    if (initialTab) {
      setAccountTabState(initialTab);
      return;
    }
    const syncFromUrl = () => {
      try {
        const param = new URLSearchParams(window.location.search).get("tab");
        if (isAccountTabKey(param)) {
          setAccountTabState(param);
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

  useEffect(() => {
    if (!accountsEnabled || storyOverride?.invite) {
      setReferralsLoading(false);
      return;
    }
    let cancelled = false;
    setReferralsLoading(true);
    fetch("/api/me/referrals", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as MeReferralsPayload;
      })
      .then((json) => {
        if (cancelled) return;
        if (json) setServerPayload(json);
      })
      .catch((err) => {
        void err;
      })
      .finally(() => {
        if (!cancelled) setReferralsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, storyOverride?.invite]);

  const identity = useMemo(
    () =>
      resolveSessionIdentity(
        viewerRole,
        storyOverride?.profile ?? serverPayload,
      ),
    [serverPayload, storyOverride?.profile, viewerRole],
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
                  gradVar={identity.avatarGrad}
                  size={52}
                />
                <div className="pl-acct-identity-text">
                  <div className="pl-acct-title-row">
                    <h1 className="pl-acct-h1">Mi cuenta</h1>
                    <UltraTag />
                    {identity.isTipstar ? <TipstarVerifiedBadge /> : null}
                  </div>
                  <p className="pl-acct-subtitle">
                    <span>{identity.atHandle}</span>
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
              <BillingTab />
            </TabPanel>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
