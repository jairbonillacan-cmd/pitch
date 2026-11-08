# Contratos compartidos (`packages/contracts`)

> **Propósito:** los tipos y esquemas que todos los paquetes y agentes comparten. Se implementan en F4 (y el subconjunto del pre-MVP antes). **Cambiar un contrato requiere un PR al owner de `contracts`** y actualizar este documento.
> **Consumidores:** todos.
> **Fecha:** 2026-11-08 · Fuente de verdad en código: `packages/contracts/src/**`, con esquemas Zod y los tipos inferidos.

## 1. Organización

```text
packages/contracts/src/
  ids.ts            # IDs canónicos con brand types
  data-state.ts     # DataState<T> y helpers
  sports/           # Sport, League, Season, Team, Player, Game, Result + sports/<sport>/stats.ts + sport-config.ts
  odds.ts           # Bookmaker, Market, OddsQuote, OddsSummary, funciones de probabilidad
  analysis.ts       # MarketProbability, GameAnalysis (pre-MVP y Prediction Center)
  predictions.ts    # Model, ModelVersion, Prediction, Evaluation
  social.ts         # Pick, PickMetrics, LeaderboardEntry, PublicProfile
  growth.ts         # Referral, Invite, Attribution
  billing.ts        # PlanId, FeatureKey, plan-matrix, Entitlements
  api/              # DTOs y esquemas de request y response por endpoint de /api/v1, más ApiError
  url/              # parsers de query (nuqs + Zod), SportContext, href()
  format.ts         # formatPct, formatOdds, formatDateTime (es-MX)
  freshness.ts      # SLA de frescura por fuente
  analytics.ts      # catálogo de eventos de PostHog
  brand/social.ts   # redes oficiales (plan maestro §8)
```

## 2. IDs canónicos

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type SportId   = Brand<'american-football' | 'soccer' | 'hockey' | 'baseball', 'SportId'>;
export type LeagueId  = Brand<string, 'LeagueId'>;   // 'nfl' | 'liga-mx' | 'premier-league' | 'ncaaf' | 'nhl' | 'mlb'
export type SeasonId  = Brand<string, 'SeasonId'>;   // 'nfl-2026', 'liga-mx-2026-apertura'
export type TeamId    = Brand<string, 'TeamId'>;     // '<league>.<slug>' p. ej. 'liga-mx.atlante'
export type PlayerId  = Brand<string, 'PlayerId'>;   // ULID
export type GameId    = Brand<string, 'GameId'>;     // ULID
export type BookmakerId = Brand<string, 'BookmakerId'>;
export type MarketKey = Brand<string, 'MarketKey'>;  // 'h2h' | 'spreads' | 'totals' | 'btts' | 'player_rec_yds' …
export type ModelVersionId = Brand<string, 'ModelVersionId'>;
export type PickId    = Brand<string, 'PickId'>;
```

Cada ID tiene su esquema Zod (`LeagueIdSchema`…) con el formato validado. El `TeamId` usa el prefijo de la liga (`DATA_ARCHITECTURE.md` §3.1 y `ASSET_MANIFEST.md`). El slug de liga es único globalmente, así que no hace falta prefijar el deporte.

> Nota de nombres: la interfaz de dominio `Pick` (picks de usuario) oculta la utilidad `Pick<>` de TypeScript dentro de `social.ts`. En ese archivo no se usa la utilidad.

## 3. `DataState<T>`

```ts
export type DataStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'stale' | 'locked';
export type Provenance = 'provider' | 'derived' | 'demo';

export interface DataState<T> {
  status: DataStatus;
  data: T | null;
  provenance: Provenance;
  isDemo: boolean;                 // = provenance === 'demo'; redundante a propósito para la UI
  source?: string;                 // 'nflverse', 'the-odds-api', 'pitchlab-model:baseline0-nfl@1.0.0'
  observedAt?: string;             // ISO-8601; hora del dato en la fuente o del snapshot
  asOf?: string;                   // si la vista es histórica (Replay)
  staleAfter?: string;             // calculado con freshness.ts; la UI pasa a 'stale' sola
  error?: { code: ApiErrorCode; message: string };
  locked?: { feature: FeatureKey; requiredPlan: PlanId };
}
```

Helpers: `ok(data, meta)`, `empty(meta)`, `failed(error)`, `locked(feature, plan)` y `isStale(state, now)`.

**Reglas:** `status: 'success'` exige `source` y `observedAt`. `provenance: 'demo'` está prohibido en producción (gate de build).

## 4. Deportes

```ts
export interface League { id: LeagueId; sport: SportId; name: string; shortName: string; country: string; enabled: boolean; assetEdition?: string }
export interface Season { id: SeasonId; league: LeagueId; label: string; start: string; end: string; structure: SeasonStructure }
export interface Team   { id: TeamId; league: LeagueId; name: string; shortName: string; code: string }
export interface GameDTO {
  id: GameId; league: LeagueId; season: SeasonId; week?: number; round?: string; phase?: string;
  startTime: string; status: 'scheduled' | 'in_progress' | 'final' | 'postponed' | 'canceled';
  home: Team; away: Team; venue?: string; neutralSite: boolean;
  result?: { home: number; away: number; periods?: number[]; observedAt: string; source: string };
}
```

**`SportConfig`** (`sports/sport-config.ts`) parametriza el SportHub (sección 07) y sus configuraciones (08–11b):

```ts
export interface SportConfig {
  sport: SportId;
  periodLabel: 'week' | 'round';                 // NFL: semana · fútbol: jornada
  hubTabs: Array<'games' | 'standings' | 'teams' | 'players' | 'markets'>;
  gameMarkets: MarketKey[];                      // mercados de partido mostrados
  propMarkets: MarketKey[];                      // [] si no hay props
  gameLogColumns: StatColumn[];                  // columnas por posición
  positions: string[];
  standings: { columns: StatColumn[]; groupBy?: 'conference' | 'division' | 'none' };
  allowsDraw: boolean;
}
```

Las stats por deporte se definen en `sports/<sport>/stats.ts` como esquemas Zod con claves estables (por ejemplo, NFL `pass_yds`, `rush_att`, `rec`, `rec_yds`, `snaps`; fútbol `goals`, `shots`, `minutes`).

## 5. Cuotas y probabilidad

```ts
export interface OddsQuote {
  game: GameId; bookmaker: BookmakerId; market: MarketKey; selection: string; line?: number;
  priceDecimal: number; observedAt: string; capturedAt: string; source: string;
  status: 'open' | 'suspended' | 'closed';
}
export interface OddsSummary {
  game: GameId; market: MarketKey;
  selections: Array<{ selection: string; line?: number; best: OddsQuote; quotes: OddsQuote[]; impliedP: number; fairP: number }>;
  consensusFairP: Record<string, number>;
  open?: Record<string, OddsQuote>; close?: Record<string, OddsQuote> & { minutesBeforeStart: number };
}
```

Funciones puras en `odds.ts`: `implied(d)`, `noVigMultiplicative(prices)`, `fairOdds(p)`, `americanToDecimal`, `decimalToAmerican` y `clv(taken, closeFairP)`. Cada una tiene sus tests dorados.

## 6. Análisis y predicciones

```ts
export interface MarketProbability {
  market: MarketKey; selection: string; line?: number;
  p: number;              // 0..1
  fairOdds: number;       // 1/p
}
export interface GameAnalysis {
  game: GameId;
  model: { id: string; version: string; status: 'reference' | 'candidate' | 'published'; label: string }; // pre-MVP: status 'reference', label 'Modelo de referencia · en validación'
  projection: { home: number; away: number; total: number; margin?: number };
  probabilities: MarketProbability[];
  factors: Array<{ key: string; label: string; value: string; detail?: string }>;
  inputsAsOf: string; publishedAt: string; source: string;
}
export interface Prediction {
  id: string; modelVersion: ModelVersionId; kind: 'live' | 'retro';
  game: GameId; market: MarketKey; selection: string; line?: number;
  p: number; projection?: { mean: number; sd?: number };
  inputsAsOf: string; predictedAt: string;
}
export interface Evaluation { modelVersion: ModelVersionId; kind: 'live' | 'retro'; window: string; n: number; brier: number; logLoss: number; ece: number; clvMean?: number; baselineRef: string; marketRef?: string }
```

## 7. Social y crecimiento

```ts
export interface Pick {
  id: PickId; user: string; game: GameId; market: MarketKey; selection: string; line?: number; player?: PlayerId;
  oddsDecimal: number; oddsSource: 'observed' | 'user_entered'; snapshotId?: string; bookmaker?: BookmakerId;
  units: number; note?: string; createdAt: string; locksAt: string;
  status: 'open' | 'locked' | 'won' | 'lost' | 'push' | 'void';
  gradedAt?: string; closeFairP?: number; clv?: number; hidden: boolean;
}
export interface PickMetrics { n: number; w: number; l: number; p: number; roiUnits: number; roiLower95: number; roiUpper95: number; clvMean?: number; clvN: number; hitRate: { value: number; lower95: number; upper95: number } }
export interface PublicProfile { handle: string; displayName: string; avatarUrl?: string; bio?: string; favoriteLeagues: LeagueId[]; metrics: PickMetrics; followers: number; following: number; hiddenPicks: number }
export interface LeaderboardEntry { rank: number; handle: string; displayName: string; avatarUrl?: string; metrics: PickMetrics; period: string; league: LeagueId | 'all' }
export interface ReferralSummary { code: string; url: string; redemptions: { signedUp: number; trial: number; converted: number; rewarded: number }; rewardsRemainingThisYear: number }
```

Las métricas se calculan **solo** con las funciones de `packages/social/src/metrics.ts` (definiciones en `SOCIAL_ARCHITECTURE.md` §3). La UI nunca recalcula.

## 8. Billing y entitlements

```ts
export type PlanId = 'free' | 'pro' | 'elite';
export type FeatureKey =
  | 'sports.core' | 'game.center' | 'props.lab' | 'props.splits.advanced'
  | 'odds.current' | 'odds.history' | 'predictions.view' | 'models.lab'
  | 'backtest.run' | 'replay' | 'ai.queries' | 'alerts' | 'export.csv'
  | 'social.journal' | 'social.public_profile' | 'social.leaderboards';
export interface Entitlements { plan: PlanId; source: 'subscription' | 'grant' | 'free'; trialEndsAt?: string; features: Record<FeatureKey, { allowed: boolean; quota?: { limit: number; used: number; period: 'day' | 'month' } }> }
```

`plan-matrix.ts` codifica la tabla de `INFORMATION_ARCHITECTURE.md` §4 (fuente única: si cambia uno, cambia el otro en el mismo PR).

## 9. API

```ts
export type ApiErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'NOT_ENTITLED' | 'NOT_FOUND' | 'LOCKED' | 'RATE_LIMITED' | 'CONFLICT' | 'UPSTREAM' | 'INTERNAL';
export interface ApiError { error: { code: ApiErrorCode; message: string; details?: unknown } }
```

Cada endpoint de `SYSTEM_ARCHITECTURE.md` §4 tiene `XRequest` y `XResponse` (Zod) en `api/<recurso>.ts`. Los handlers y los clientes de TanStack Query importan los mismos esquemas.

## 10. Contexto y URLs

```ts
export interface SportContext { league?: LeagueId; season?: SeasonId; week?: number; round?: string; game?: GameId; team?: TeamId; player?: PlayerId; market?: MarketKey; line?: number; side?: string; window?: 'l5' | 'l10' | 'l20' | 'season' | 'h2h'; split?: string; books?: BookmakerId[]; asOf?: string; tab?: string }
export function href<R extends RouteKey>(route: R, ctx: RouteParams<R> & Partial<SportContext>): string;
```

`RouteKey` enumera las rutas de `ROUTE_MAP.md`. `href()` solo propaga los parámetros que la ruta destino acepta.

## 11. Subconjunto del pre-MVP

`ids` (League, Team y Game), `data-state`, `sports` (League, Team, GameDTO y SportConfig parcial), `analysis` (MarketProbability y GameAnalysis), `format`, `freshness` y `brand/social`. El resto se agrega en F4 sin romper estos tipos.

## 12. Versionado

- Los cambios **aditivos** (campos opcionales nuevos) se hacen con un PR normal al owner de contracts.
- Los cambios **que rompen** requieren:
  1. un PR con la etiqueta `contract-breaking`;
  2. la lista de consumidores afectados (que lista el script `pnpm contracts:consumers`);
  3. actualizar este documento;
  4. migrar a todos los consumidores en el mismo PR o detrás de un tipo deprecado con fecha de retiro.
