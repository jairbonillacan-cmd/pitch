import "../../alerts-referees.css";
import React from "react";
import type { Metadata } from "next";
import { MARKET_FAMILY_IDS, type MarketFamilyId } from "@pitchlab/contracts";
import {
  listMarketAlertsForUser,
  MAX_MARKET_ALERTS_PER_USER,
  type MarketAlertRow,
} from "@pitchlab/db/market-alerts";
import {
  AlertsClubView,
  type MarketAlertChannel,
  type MarketAlertDirection,
  type MarketAlertItem,
  type MarketAlertTrigger,
} from "@pitchlab/ui/alerts";
import { serverDb } from "../../../src/server/session-user";
import { getViewerAccess, getViewerAccountUserId } from "../../../src/server/viewer-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alertas de mercado | PitchLab",
  description:
    "Configura alertas de apertura de línea, movimiento sharp, líneas rezagadas EV+, alineaciones confirmadas y cambios de calendario.",
};

const VALID_TRIGGERS: readonly MarketAlertTrigger[] = [
  "market_opened",
  "sharp_steam",
  "stale_line_ev",
  "lineup_confirmed",
  "schedule_change",
];

const VALID_DIRECTIONS: readonly MarketAlertDirection[] = [
  "any",
  "over",
  "under",
  "home",
  "away",
  "draw",
];

const VALID_CHANNELS: readonly MarketAlertChannel[] = ["push", "in_app", "both"];

function narrowTrigger(raw: string): MarketAlertTrigger {
  return VALID_TRIGGERS.find((item) => item === raw) ?? "market_opened";
}

function narrowDirection(raw: string | null): MarketAlertDirection | null {
  if (!raw) return null;
  return VALID_DIRECTIONS.find((item) => item === raw) ?? null;
}

function narrowChannel(raw: string): MarketAlertChannel {
  return VALID_CHANNELS.find((item) => item === raw) ?? "push";
}

function narrowMarketFamily(raw: string | null): MarketFamilyId | null {
  if (!raw) return null;
  return MARKET_FAMILY_IDS.find((item) => item === raw) ?? null;
}

function serializeAlertRow(row: MarketAlertRow): MarketAlertItem {
  return {
    id: row.id,
    name: row.name,
    trigger: narrowTrigger(row.trigger),
    league: row.league,
    marketFamily: narrowMarketFamily(row.marketFamily),
    selection: row.selection,
    thresholdEvPct: row.thresholdEvPct,
    minDecimal: row.minDecimal,
    maxDecimal: row.maxDecimal,
    direction: narrowDirection(row.direction),
    bookmaker: row.bookmaker,
    cooldownMinutes: row.cooldownMinutes,
    channel: narrowChannel(row.channel),
    active: row.active,
    lastFiredAtIso: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
    lastFiredHash: row.lastFiredHash,
    firedCount: row.firedCount,
    createdAtIso: row.createdAt.toISOString(),
    updatedAtIso: row.updatedAt.toISOString(),
  };
}

export default async function ClubAlertsPage(): Promise<React.JSX.Element> {
  const access = await getViewerAccess();
  const accountReady = access.via === "account" && access.signupComplete;
  let initialAlerts: MarketAlertItem[] = [];

  if (accountReady) {
    const db = serverDb();
    const userId = await getViewerAccountUserId();
    if (db && userId) {
      try {
        const rows = await listMarketAlertsForUser(db, userId, { limit: 40 });
        initialAlerts = rows.map(serializeAlertRow);
      } catch (err) {
        void err;
        initialAlerts = [];
      }
    }
  }

  return (
    <AlertsClubView
      initialAlerts={initialAlerts}
      maxActiveAlerts={MAX_MARKET_ALERTS_PER_USER}
      accountReady={accountReady}
      hasActivePass={access.fullAccess}
    />
  );
}
