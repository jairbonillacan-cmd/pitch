import { z } from "zod";

export type DataStatus = "idle" | "loading" | "success" | "empty" | "error" | "stale" | "locked";
export type Provenance = "provider" | "derived" | "demo";

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "NOT_ENTITLED"
  | "NOT_FOUND"
  | "LOCKED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "UPSTREAM"
  | "INTERNAL";

export type PlanId = "free" | "pro" | "elite";

export type FeatureKey =
  | "sports.core"
  | "game.center"
  | "props.lab"
  | "props.splits.advanced"
  | "odds.current"
  | "odds.history"
  | "predictions.view"
  | "models.lab"
  | "backtest.run"
  | "replay"
  | "ai.queries"
  | "alerts"
  | "export.csv"
  | "social.journal"
  | "social.public_profile"
  | "social.leaderboards";

export interface DataState<T> {
  status: DataStatus;
  data: T | null;
  provenance: Provenance;
  isDemo: boolean;
  source?: string;
  observedAt?: string;
  asOf?: string;
  staleAfter?: string;
  error?: { code: ApiErrorCode; message: string };
  locked?: { feature: FeatureKey; requiredPlan: PlanId };
}

export interface DataMeta {
  provenance?: Provenance;
  source: string;
  observedAt: string;
  asOf?: string;
  staleAfter?: string;
}

export function assertNotDemoInProduction(provenance: Provenance): void {
  if (provenance === "demo" && process.env.NODE_ENV === "production") {
    throw new Error("Datos demo prohibidos en producción (NODE_ENV=production).");
  }
}

export function ok<T>(data: T, meta: DataMeta): DataState<T> {
  const provenance = meta.provenance ?? "derived";
  assertNotDemoInProduction(provenance);
  return {
    status: "success",
    data,
    provenance,
    isDemo: provenance === "demo",
    source: meta.source,
    observedAt: meta.observedAt,
    asOf: meta.asOf,
    staleAfter: meta.staleAfter,
  };
}

export function empty<T>(meta: Partial<DataMeta> = {}): DataState<T> {
  const provenance = meta.provenance ?? "derived";
  assertNotDemoInProduction(provenance);
  return {
    status: "empty",
    data: null,
    provenance,
    isDemo: provenance === "demo",
    source: meta.source,
    observedAt: meta.observedAt,
    asOf: meta.asOf,
    staleAfter: meta.staleAfter,
  };
}

export function failed<T>(error: { code: ApiErrorCode; message: string }): DataState<T> {
  return {
    status: "error",
    data: null,
    provenance: "derived",
    isDemo: false,
    error,
  };
}

export function locked<T>(feature: FeatureKey, requiredPlan: PlanId): DataState<T> {
  return {
    status: "locked",
    data: null,
    provenance: "derived",
    isDemo: false,
    locked: { feature, requiredPlan },
  };
}

export function isStale<T>(state: DataState<T>, now: Date = new Date()): boolean {
  if (state.status === "stale") return true;
  if (!state.staleAfter) return false;
  return new Date(state.staleAfter).getTime() < now.getTime();
}

export const DataStatusSchema = z.enum([
  "idle",
  "loading",
  "success",
  "empty",
  "error",
  "stale",
  "locked",
]);

export const ProvenanceSchema = z.enum(["provider", "derived", "demo"]);
