import type { Brand } from "./ids.js";

export type { Brand };

const STRICT_CANONICAL_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const OPAQUE_RESOURCE_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const CANONICAL_PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMERIC_TAIL_FIVE_PLUS_RE = /(?:^|-)\d{5,}$/;
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const BOOK_LABEL_URL_OR_DOMAIN_RE =
  /(?:https?|ftp|ws|wss|file):|\/{2}|\bwww\.|[a-z0-9]\.[a-z]{2,}|[\\@?]/i;
const EXPLICIT_URL_SCHEME_RE = /(?:https?|ftp|ws|wss|file):|\/{2}|\bwww\./i;
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const STACK_FRAME_RE =
  /(?:^|\n)[ \t]*at\s+(?:async\s+)?(?:[\w.$<>]+\s*\(|(?:file:\/{2}|\/|[A-Za-z]:\\)\S+)|\bat\s+(?:async\s+)?[\w.$<>]+\s*\([^)]*:\d+/;
const JS_RUNTIME_ERROR_RE =
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|PostgresError|DrizzleQueryError|AggregateError):|\b(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EADDRINUSE)\b|\bnode:internal\b|\bnode_modules\b/;
const SQL_LEAK_RE =
  /\b(?:SELECT\s+[\s\S]+?\s+FROM|INSERT\s+INTO|UPDATE\s+[a-zA-Z_"][\w."]*\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX)|ALTER\s+TABLE|CREATE\s+TABLE|TRUNCATE\s+TABLE|UNION\s+(?:ALL\s+)?SELECT)\b|\b(?:pg_catalog|information_schema|SQLSTATE|duplicate\s+key\s+value|violates\s+(?:unique|foreign\s+key|not-null|check)\s+constraint|syntax\s+error\s+at\s+or\s+near)\b|\b(?:relation|column|table)\s+"[^"]+"\s+does\s+not\s+exist\b/i;
const INTERNAL_PATH_LEAK_RE =
  /(?:^|[\s("'])\/(?:Users|home|var|etc|opt|srv|tmp|workspace|root|usr|proc|sys)\/[^\s)"']*|(?:^|[\s("'])\/app\/(?:apps|packages|services|src|dist|build|node_modules|\.next|\.env|\S+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|json|env))|\b[A-Za-z]:\\[^\s)"']+|\\\\[A-Za-z0-9_.-]+\\[^\s)"']+|\b(?:apps|packages|services|src)\/[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|json)\b|\.(?:ts|tsx|js|jsx|mjs|cjs):\d+(?::\d+)?\b|file:\/{2}|(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|s3):\/{2}|\b(?:DATABASE_URL|BETTER_AUTH_SECRET|CRON_SECRET|BZZOIRO_API_KEY|THE_ODDS_API_KEY)\b|\bBearer\s+[A-Za-z0-9._-]{8,}\b/i;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]+/g;
const HAS_CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const WHITESPACE_RUN_RE = /\s+/g;
const DIACRITICS_RE = /[\u0300-\u036f]/g;
const FD16_SEPARATOR_RE = /[\s_\-\u2013\u2014]+/g;
const FD16_WORD_SEPARATOR_RE = /[_\-\u2013\u2014]+/g;
const FD16_DOMAIN_RE =
  /(?:^|[\s([{"'/@:,])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|io|app|net|org|mx|co|tv|gg|bet|dev|ai|es|uk|de|fr|it|br|ar|cl|pe|info|biz|xyz)(?=$|[\s)\]}"'/:?#,;!.])/i;
const FD16_RAW_NUMERIC_ID_RE = /\b\d{5,}\b/;
const FD16_ALGORITHM_RE =
  /\b(?:dixon\s*coles|(?:bi)?poisson|light\s*gbm|platt|pitagor(?:as|ic[oa]s?)?|pythag(?:orean)?|venn\s*abers|cat\s*boost|xg\s*boost|(?:club|xg)?elo|brier|log\s*loss|ece|mc|monte\s*carlo|hgb|pava|log5|xg(?:a|ot)?)\b/i;
const FD16_EDITORIAL_JARGON_RE =
  /\bconfianza[\s:=]*\d|\bdatos\s+(?:completos|parciales)\b/i;

export const MAX_POSITIVE_DECIMAL_ODDS = 1000;
export const DEFAULT_UNIT_PROBABILITY_EPSILON = 0.001;
export const DEFAULT_SANITIZED_ERROR_MESSAGE = "No se pudo procesar la solicitud.";

export const FORBIDDEN_PROVIDER_TOKENS = [
  "sportmonks",
  "bzzoiro",
  "sofascore",
  "espn",
  "odds-api",
  "api-football",
  "scoutpicks",
  "astraanalisis",
] as const;

const FD16_COMPACT_PROVIDER_TOKENS: readonly string[] = [
  ...FORBIDDEN_PROVIDER_TOKENS.map((token) => token.replace(/-/g, "")),
  "theoddsapi",
  "nflverse",
  "openfootball",
  "polymarket",
  "kalshi",
  "understat",
  "betfair",
  "flashscore",
  "whoscored",
  "fbref",
];

export const QUOTE_MOVEMENTS = [
  "STEAM",
  "SHORTENING",
  "DRIFTING",
  "STABLE",
] as const;

export type QuoteMovement = (typeof QUOTE_MOVEMENTS)[number];

const QUOTE_MOVEMENT_SET: ReadonlySet<string> = new Set(QUOTE_MOVEMENTS);

export const VISITOR_RESTRICTED_KEYS = [
  "fairDecimal",
  "evPct",
  "edgePts",
  "modelProb",
  "line",
  "side",
  "playerName",
  "inPlayWinProb",
  "x12",
] as const;

export type VisitorRestrictedKey = (typeof VISITOR_RESTRICTED_KEYS)[number];

const VISITOR_RESTRICTED_KEY_SET: ReadonlySet<string> = new Set(VISITOR_RESTRICTED_KEYS);

export const CLIENT_MATCH_CONTEXT_FACTOR_LABELS = [
  "Forma local",
  "Forma visitante",
  "Posición local",
  "Posición visitante",
  "Local",
  "Visitante",
  "Descanso",
  "Tiempo extra",
  "Abridores",
] as const;

export type ClientMatchContextFactorLabel =
  (typeof CLIENT_MATCH_CONTEXT_FACTOR_LABELS)[number];

export type UnitProbability = Brand<number, "UnitProbability">;
export type PositiveDecimalOdds = Brand<number, "PositiveDecimalOdds">;
export type OpaqueResourceId = Brand<string, "OpaqueResourceId">;
export type CanonicalPublicSlug = Brand<string, "CanonicalPublicSlug">;

export interface SpacetimeAnchoredQuoteFields {
  readonly bookLabel: string;
  readonly marketKey: string;
  readonly selection: string;
  readonly line: number | null;
  readonly bookDecimal: PositiveDecimalOdds;
  readonly modelProb: UnitProbability;
  readonly fairDecimal: PositiveDecimalOdds;
  readonly edgePts: number;
  readonly evPct: number;
  readonly movement: QuoteMovement;
  readonly capturedAtIso: string;
}

export type SpacetimeAnchoredQuote = Brand<
  SpacetimeAnchoredQuoteFields,
  "SpacetimeAnchoredQuote"
>;

export interface SpacetimeAnchoredQuoteInput {
  readonly bookLabel: string;
  readonly marketKey: string;
  readonly selection: string;
  readonly line?: number | null;
  readonly bookDecimal: PositiveDecimalOdds | number | string;
  readonly modelProb: UnitProbability | number | string;
  readonly movement?: QuoteMovement;
  readonly capturedAtIso: string;
}

export type RedactedVisitorPick = {
  readonly __accessTier: "visitor_redacted";
  readonly id: string;
  readonly gameId: string;
  readonly league: string;
  readonly familyLabel: string;
  readonly locked: true;
  readonly reason: "pass_required";
} & {
  readonly [K in VisitorRestrictedKey]?: never;
};

export type RedactedVisitorPickInput = {
  readonly id: string;
  readonly gameId: string;
  readonly league: string;
  readonly familyLabel: string;
} & {
  readonly [K in VisitorRestrictedKey]?: never;
};

export interface SanitizedErrorPayloadFields {
  readonly code: string;
  readonly message: string;
  readonly requestId?: OpaqueResourceId;
}

export type SanitizedErrorPayload = Brand<
  SanitizedErrorPayloadFields,
  "SanitizedErrorPayload"
>;

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function round1(value: number): number {
  return normalizeZero(Math.round(value * 10) / 10);
}

function containsForbiddenProviderToken(raw: string): boolean {
  const normalized = raw.toLowerCase().replace(/_/g, "-");
  const compact = normalized.replace(/-/g, "");
  for (const token of FORBIDDEN_PROVIDER_TOKENS) {
    if (normalized.includes(token)) {
      return true;
    }
    const compactToken = token.replace(/-/g, "");
    if (compactToken !== token && compact.includes(compactToken)) {
      return true;
    }
  }
  return false;
}

function assertNonEmptyText(raw: unknown, fieldName: string, maxLength: number): string {
  if (typeof raw !== "string") {
    throw new RangeError(`Expected non-empty string for ${fieldName}`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new RangeError(`Expected non-empty string for ${fieldName}`);
  }
  return trimmed;
}

function assertSafeBookLabel(raw: unknown): string {
  const trimmed = assertNonEmptyText(raw, "bookLabel", 64);
  if (
    trimmed.length < 2 ||
    trimmed.includes("/") ||
    trimmed.includes("\u0023") ||
    BOOK_LABEL_URL_OR_DOMAIN_RE.test(trimmed) ||
    containsForbiddenProviderToken(trimmed)
  ) {
    throw new RangeError("bookLabel must not contain URLs, domains, or provider names");
  }
  return trimmed;
}

function assertValidIsoTimestamp(raw: unknown, fieldName: string): string {
  const trimmed = assertNonEmptyText(raw, fieldName, 64);
  if (!ISO_TIMESTAMP_RE.test(trimmed) || !Number.isFinite(Date.parse(trimmed))) {
    throw new RangeError(`Expected valid ISO-8601 timestamp for ${fieldName}`);
  }
  return trimmed;
}

export function parseStrictFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return null;
    }
    return normalizeZero(raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!STRICT_CANONICAL_NUMBER_RE.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return normalizeZero(parsed);
  }
  return null;
}

export function assertStrictFiniteNumber(raw: unknown, fieldName: string): number {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null) {
    throw new RangeError(`Expected finite number for ${fieldName}`);
  }
  return parsed;
}

export function parseUnitProbability(raw: unknown): UnitProbability | null {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || parsed <= 0 || parsed >= 1) {
    return null;
  }
  return parsed as UnitProbability;
}

export function assertUnitProbability(
  raw: unknown,
  fieldName: string = "probability",
): UnitProbability {
  const parsed = parseUnitProbability(raw);
  if (parsed === null) {
    throw new RangeError(`Expected unit probability in (0, 1) for ${fieldName}`);
  }
  return parsed;
}

export function clampToUnitProbability(
  raw: number,
  epsilon: number = DEFAULT_UNIT_PROBABILITY_EPSILON,
): UnitProbability {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new RangeError("Expected finite number for raw probability");
  }
  if (typeof epsilon !== "number" || !Number.isFinite(epsilon) || epsilon <= 0 || epsilon >= 0.5) {
    throw new RangeError("Expected epsilon in (0, 0.5)");
  }
  if (raw <= epsilon) {
    return epsilon as UnitProbability;
  }
  const upper = 1 - epsilon;
  if (raw >= upper) {
    return upper as UnitProbability;
  }
  return raw as UnitProbability;
}

export function isUnitProbability(value: unknown): value is UnitProbability {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1;
}

export function parsePositiveDecimalOdds(raw: unknown): PositiveDecimalOdds | null {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || parsed <= 1 || parsed > MAX_POSITIVE_DECIMAL_ODDS) {
    return null;
  }
  return parsed as PositiveDecimalOdds;
}

export function assertPositiveDecimalOdds(
  raw: unknown,
  fieldName: string = "decimalOdds",
): PositiveDecimalOdds {
  const parsed = parsePositiveDecimalOdds(raw);
  if (parsed === null) {
    throw new RangeError(
      `Expected decimal odds in (1, ${MAX_POSITIVE_DECIMAL_ODDS}] for ${fieldName}`,
    );
  }
  return parsed;
}

export function isPositiveDecimalOdds(value: unknown): value is PositiveDecimalOdds {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 1 &&
    value <= MAX_POSITIVE_DECIMAL_ODDS
  );
}

export function probabilityToFairDecimal(p: UnitProbability): PositiveDecimalOdds {
  const validProb = assertUnitProbability(p, "modelProb");
  const rawOdds = 1 / validProb;
  if (rawOdds >= MAX_POSITIVE_DECIMAL_ODDS) {
    return MAX_POSITIVE_DECIMAL_ODDS as PositiveDecimalOdds;
  }
  if (rawOdds <= 1) {
    return (1 + Number.EPSILON) as PositiveDecimalOdds;
  }
  return rawOdds as PositiveDecimalOdds;
}

export function createSpacetimeAnchoredQuote(
  input: SpacetimeAnchoredQuoteInput,
): SpacetimeAnchoredQuote {
  if (!input || typeof input !== "object") {
    throw new RangeError("Expected SpacetimeAnchoredQuoteInput object");
  }
  const bookLabel = assertSafeBookLabel(input.bookLabel);
  const marketKey = assertNonEmptyText(input.marketKey, "marketKey", 128);
  const selection = assertNonEmptyText(input.selection, "selection", 128);
  if (
    EXPLICIT_URL_SCHEME_RE.test(marketKey) ||
    EXPLICIT_URL_SCHEME_RE.test(selection) ||
    containsForbiddenProviderToken(marketKey) ||
    containsForbiddenProviderToken(selection)
  ) {
    throw new RangeError("marketKey and selection must not contain URLs or provider tokens");
  }
  const line =
    input.line === undefined || input.line === null
      ? null
      : assertStrictFiniteNumber(input.line, "line");
  const modelProb = assertUnitProbability(input.modelProb, "modelProb");
  const bookDecimal = assertPositiveDecimalOdds(input.bookDecimal, "bookDecimal");
  const movementRaw = input.movement ?? "STABLE";
  if (typeof movementRaw !== "string" || !QUOTE_MOVEMENT_SET.has(movementRaw)) {
    throw new RangeError("Expected valid quote movement");
  }
  const movement = movementRaw as QuoteMovement;
  const capturedAtIso = assertValidIsoTimestamp(input.capturedAtIso, "capturedAtIso");
  const fairDecimal = probabilityToFairDecimal(modelProb);
  const edgePts = round1((modelProb - 1 / bookDecimal) * 100);
  const evPct = round1((modelProb * bookDecimal - 1) * 100);
  const quote: SpacetimeAnchoredQuoteFields = Object.freeze({
    bookLabel,
    marketKey,
    selection,
    line,
    bookDecimal,
    modelProb,
    fairDecimal,
    edgePts,
    evPct,
    movement,
    capturedAtIso,
  });
  return quote as SpacetimeAnchoredQuote;
}

export function createRedactedVisitorPick(
  input: RedactedVisitorPickInput,
): RedactedVisitorPick {
  if (!input || typeof input !== "object") {
    throw new RangeError("Expected RedactedVisitorPickInput object");
  }
  const id = assertNonEmptyText(input.id, "id", 128);
  const gameId = assertNonEmptyText(input.gameId, "gameId", 128);
  const league = assertNonEmptyText(input.league, "league", 64);
  const familyLabel = assertNonEmptyText(input.familyLabel, "familyLabel", 128);
  return Object.freeze({
    __accessTier: "visitor_redacted" as const,
    id,
    gameId,
    league,
    familyLabel,
    locked: true as const,
    reason: "pass_required" as const,
  });
}

function scanVisitorPayloadNode(node: unknown, path: string, seen: WeakSet<object>): void {
  if (node === null || node === undefined || typeof node !== "object") {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      scanVisitorPayloadNode(node[i], `${path}[${i}]`, seen);
    }
    return;
  }
  if (node instanceof Set) {
    let idx = 0;
    for (const item of node as ReadonlySet<unknown>) {
      scanVisitorPayloadNode(item, `${path}[set:${idx}]`, seen);
      idx += 1;
    }
    return;
  }
  if (node instanceof Map) {
    for (const [key, value] of (node as ReadonlyMap<unknown, unknown>).entries()) {
      const keyLabel = typeof key === "string" ? key : String(key);
      if (typeof key === "string" && VISITOR_RESTRICTED_KEY_SET.has(key)) {
        throw new RangeError(
          `Restricted visitor payload key "${key}" detected at ${path}.${keyLabel}`,
        );
      }
      scanVisitorPayloadNode(value, `${path}.${keyLabel}`, seen);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (VISITOR_RESTRICTED_KEY_SET.has(key)) {
      throw new RangeError(
        `Restricted visitor payload key "${key}" detected at ${path}.${key}`,
      );
    }
    scanVisitorPayloadNode(record[key], `${path}.${key}`, seen);
  }
}

export function assertNoRestrictedKeysInVisitorPayload(payload: unknown): void {
  scanVisitorPayloadNode(payload, "$", new WeakSet<object>());
}

export function parseOpaqueResourceId(raw: unknown): OpaqueResourceId | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (!OPAQUE_RESOURCE_ID_RE.test(raw)) {
    return null;
  }
  if (containsForbiddenProviderToken(raw)) {
    return null;
  }
  return raw as OpaqueResourceId;
}

export function assertOpaqueResourceId(
  raw: unknown,
  fieldName: string = "resourceId",
): OpaqueResourceId {
  const parsed = parseOpaqueResourceId(raw);
  if (parsed === null) {
    throw new RangeError(`Expected opaque resource id for ${fieldName}`);
  }
  return parsed;
}

export function isOpaqueResourceId(value: unknown): value is OpaqueResourceId {
  return parseOpaqueResourceId(value) !== null;
}

export function parseCanonicalPublicSlug(raw: unknown): CanonicalPublicSlug | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (raw.length < 2 || raw.length > 96) {
    return null;
  }
  if (!CANONICAL_PUBLIC_SLUG_RE.test(raw)) {
    return null;
  }
  if (NUMERIC_TAIL_FIVE_PLUS_RE.test(raw)) {
    return null;
  }
  if (containsForbiddenProviderToken(raw)) {
    return null;
  }
  return raw as CanonicalPublicSlug;
}

export function assertCanonicalPublicSlug(
  raw: unknown,
  fieldName: string = "slug",
): CanonicalPublicSlug {
  const parsed = parseCanonicalPublicSlug(raw);
  if (parsed === null) {
    throw new RangeError(`Expected canonical public slug for ${fieldName}`);
  }
  return parsed;
}

export function isCanonicalPublicSlug(value: unknown): value is CanonicalPublicSlug {
  return parseCanonicalPublicSlug(value) !== null;
}

function sanitizeErrorCode(rawCode: unknown): string {
  if (typeof rawCode !== "string") {
    return "INTERNAL_ERROR";
  }
  const normalized = rawCode.trim().toUpperCase().replace(/-/g, "_");
  if (!ERROR_CODE_RE.test(normalized) || containsForbiddenProviderToken(normalized)) {
    return "INTERNAL_ERROR";
  }
  return normalized;
}

function sanitizeErrorMessage(rawMessage: unknown): string {
  if (typeof rawMessage !== "string") {
    return DEFAULT_SANITIZED_ERROR_MESSAGE;
  }
  if (
    STACK_FRAME_RE.test(rawMessage) ||
    JS_RUNTIME_ERROR_RE.test(rawMessage) ||
    SQL_LEAK_RE.test(rawMessage) ||
    INTERNAL_PATH_LEAK_RE.test(rawMessage) ||
    containsForbiddenProviderToken(rawMessage)
  ) {
    return DEFAULT_SANITIZED_ERROR_MESSAGE;
  }
  const cleaned = rawMessage
    .replace(CONTROL_CHARS_RE, " ")
    .replace(WHITESPACE_RUN_RE, " ")
    .trim();
  if (cleaned.length === 0) {
    return DEFAULT_SANITIZED_ERROR_MESSAGE;
  }
  return cleaned.length > 240 ? cleaned.slice(0, 240).trimEnd() : cleaned;
}

export function createSanitizedErrorPayload(
  code: string,
  message: string,
  requestId?: string,
): SanitizedErrorPayload {
  const safeCode = sanitizeErrorCode(code);
  const safeMessage = sanitizeErrorMessage(message);
  const safeRequestId = requestId === undefined ? null : parseOpaqueResourceId(requestId);
  const payload: SanitizedErrorPayloadFields =
    safeRequestId === null
      ? Object.freeze({ code: safeCode, message: safeMessage })
      : Object.freeze({ code: safeCode, message: safeMessage, requestId: safeRequestId });
  return payload as SanitizedErrorPayload;
}

function foldFd16Text(raw: string): string {
  return raw.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

export function containsForbiddenFd16Term(text: string): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (EXPLICIT_URL_SCHEME_RE.test(trimmed) || FD16_DOMAIN_RE.test(trimmed)) {
    return true;
  }
  const folded = foldFd16Text(trimmed);
  const compact = folded.replace(FD16_SEPARATOR_RE, "");
  for (const token of FD16_COMPACT_PROVIDER_TOKENS) {
    if (compact.includes(token)) {
      return true;
    }
  }
  const spaced = folded.replace(FD16_WORD_SEPARATOR_RE, " ");
  if (
    FD16_ALGORITHM_RE.test(spaced) ||
    FD16_RAW_NUMERIC_ID_RE.test(spaced) ||
    FD16_EDITORIAL_JARGON_RE.test(spaced)
  ) {
    return true;
  }
  return false;
}

export function isSafePublicLabel(text: string): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0 || HAS_CONTROL_CHAR_RE.test(trimmed)) {
    return false;
  }
  return !containsForbiddenFd16Term(trimmed);
}
