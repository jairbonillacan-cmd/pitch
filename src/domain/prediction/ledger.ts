/**
 * A28 (Ola 1 · Agente A2) — Ledger inmutable (append-only) de picks emitidos, cierres sharp y liquidaciones.
 *
 * Garantías estructurales (auditables por Red Team):
 *   1. Inmutabilidad real en memoria y en serialización JSONL: solo existen operaciones `append*`
 *      (`appendPick`, `appendClosing`, `appendSettlement`). No existen métodos de mutación, borrado
 *      ni sobrescritura; cada registro devuelto o almacenado se congela con `Object.freeze`.
 *   2. Cadena criptográfica SHA-256 determinista (`prev_hash -> entry_hash`) desde `GENESIS_HASH`
 *      usando codificación canónica IEEE-754 big-endian de 64 bits para flotantes, garantizando
 *      paridad bit a bit exacta con `services/models/clv_report.py` sin depender de `@types/node`.
 *   3. Separación estricta de eventos: la emisión original (`PickLedgerEntry`) jamás se muta al
 *      registrar la cuota de cierre (`PickClosingRecord`) ni al liquidar el resultado (`PickSettlementRecord`).
 *   4. Validación estricta de rangos finitos (`price_tomado >= 1.01`, `0 < p_modelo, p_mercado, p_final < 1`,
 *      `stake_u > 0`, `ev` finito), unicidad de `pick_id` y prohibición de cierres de casas recreativas.
 */

/** Hash génesis de 64 ceros hexadecimales para el primer eslabón de la cadena SHA-256. */
export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/** Niveles activos de clasificación de pick permitidos al crear nuevos registros en v3.2. */
export const VALID_PICK_TIERS = ["solido", "valor"] as const;
export type PickTier = (typeof VALID_PICK_TIERS)[number];

/** Niveles heredados aceptados exclusivamente al deserializar registros históricos (`fromJsonl`). */
export const LEGACY_PICK_TIERS = ["baseline_v3_0", "especulativo"] as const;
export type LegacyPickTier = (typeof LEGACY_PICK_TIERS)[number];

/** Unión completa de niveles válidos en lectura histórica de cadenas JSONL existentes. */
export const HISTORICAL_PICK_TIERS = [
  ...VALID_PICK_TIERS,
  ...LEGACY_PICK_TIERS,
] as const;
export type HistoricalPickTier = (typeof HISTORICAL_PICK_TIERS)[number];

/** Casas sharp permitidas para fijar cuota de cierre válida (jamás casas recreativas ni Betfair Exchange en histórico). */
export const ALLOWED_SHARP_CLOSING_BOOKS = ["pinnacle", "smarkets"] as const;
export type SharpClosingBook = (typeof ALLOWED_SHARP_CLOSING_BOOKS)[number];

/** Resultados posibles de liquidación de una apuesta (incluyendo medias líneas asiáticas). */
export const SETTLEMENT_OUTCOMES = [
  "win",
  "loss",
  "push",
  "void",
  "half_win",
  "half_loss",
] as const;
export type SettlementOutcome = (typeof SETTLEMENT_OUTCOMES)[number];

const VALID_TIER_SET: ReadonlySet<string> = new Set(VALID_PICK_TIERS);
const HISTORICAL_TIER_SET: ReadonlySet<string> = new Set(HISTORICAL_PICK_TIERS);
const SHARP_BOOK_SET: ReadonlySet<string> = new Set(ALLOWED_SHARP_CLOSING_BOOKS);
const SETTLEMENT_OUTCOME_SET: ReadonlySet<string> = new Set(SETTLEMENT_OUTCOMES);

/** Error de validación de esquema, rangos finitos o reglas de negocio del ledger. */
export class LedgerValidationError extends Error {
  readonly code: string;

  constructor(message: string, code = "ledger_validation_error") {
    super(message);
    this.name = "LedgerValidationError";
    this.code = code;
  }
}

/** Error lanzado al intentar insertar un `pick_id` ya existente en el ledger append-only. */
export class DuplicatePickError extends LedgerValidationError {
  constructor(pickId: string) {
    super(`pick_id duplicado rechazado por el ledger inmutable: "${pickId}"`, "duplicate_pick_id");
    this.name = "DuplicatePickError";
  }
}

/** Error lanzado cuando la cadena SHA-256 (`prev_hash -> entry_hash`) presenta alteración retroactiva. */
export class LedgerIntegrityError extends Error {
  readonly code = "ledger_integrity_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

/** Campos de entrada requeridos para registrar la emisión de un pick en `appendPick`. */
export interface PickLedgerInput {
  readonly pick_id: string;
  readonly ts_emitido: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line?: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_tomado: number;
  readonly p_modelo: number;
  readonly p_mercado: number;
  readonly p_final: number;
  readonly ev: number;
  readonly stake_u: number;
  readonly tier: PickTier;
  readonly version_modelo: string;
  readonly features_hash: string;
}

/** Opciones internas de lectura histórica al reconstruir un ledger desde JSONL. */
export interface AppendPickOptions {
  /** Solo para deserialización de registros históricos (`fromJsonl`). Prohibido al emitir picks nuevos. */
  readonly allowLegacyTiers?: boolean;
}

/** Entrada histórica aceptada únicamente cuando `allowLegacyTiers === true`. */
export interface HistoricalPickLedgerInput extends Omit<PickLedgerInput, "tier"> {
  readonly tier: HistoricalPickTier;
}

/** Registro inmutable de emisión de pick almacenado en el ledger. */
export interface PickLedgerEntry {
  readonly record_type: "pick";
  readonly pick_id: string;
  readonly ts_emitido: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_tomado: number;
  readonly p_modelo: number;
  readonly p_mercado: number;
  readonly p_final: number;
  readonly ev: number;
  readonly stake_u: number;
  readonly tier: HistoricalPickTier;
  readonly version_modelo: string;
  readonly features_hash: string;
  readonly prev_hash: string;
  readonly entry_hash: string;
}

/** Entrada para adjuntar un registro inmutable de cierre sharp vinculado por `pick_id`. */
export interface PickClosingInput {
  readonly pick_id: string;
  readonly ts_recorded: string;
  readonly closing_missing: boolean;
  readonly closing_book?: string | null;
  readonly closing_source?: string | null;
  readonly ts_closing_captured?: string | null;
  readonly price_cierre_bruto?: number | null;
  readonly price_cierre_sin_margen?: number | null;
  readonly p_cierre_sin_margen?: number | null;
}

/** Registro inmutable de cierre vinculado a un `pick_id` sin mutar `PickLedgerEntry`. */
export interface PickClosingRecord {
  readonly record_type: "closing";
  readonly pick_id: string;
  readonly ts_recorded: string;
  readonly closing_missing: boolean;
  readonly closing_book: string | null;
  readonly closing_source: string | null;
  readonly ts_closing_captured: string | null;
  readonly price_cierre_bruto: number | null;
  readonly price_cierre_sin_margen: number | null;
  readonly p_cierre_sin_margen: number | null;
  readonly prev_hash: string;
  readonly entry_hash: string;
}

/** Entrada para adjuntar la liquidación oficial de un pick vinculado por `pick_id`. */
export interface PickSettlementInput {
  readonly pick_id: string;
  readonly ts_liquidado: string;
  readonly outcome: SettlementOutcome;
}

/** Registro inmutable de liquidación vinculado a un `pick_id` sin mutar `PickLedgerEntry`. */
export interface PickSettlementRecord {
  readonly record_type: "settlement";
  readonly pick_id: string;
  readonly ts_liquidado: string;
  readonly outcome: SettlementOutcome;
  readonly pnl_u: number;
  readonly prev_hash: string;
  readonly entry_hash: string;
}

/** Unión discriminada de eslabones válidos en la cadena JSONL del ledger. */
export type LedgerRecord = PickLedgerEntry | PickClosingRecord | PickSettlementRecord;

/** Vista proyectada de solo lectura que combina emisión + cierre opcional + liquidación opcional. */
export interface ResolvedPickRecord {
  readonly pick: PickLedgerEntry;
  readonly closing: PickClosingRecord | null;
  readonly settlement: PickSettlementRecord | null;
}

// ---------------------------------------------------------------------------
// SHA-256 puro (FIPS 180-4) sin dependencias externas ni `@types/node`
// ---------------------------------------------------------------------------

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Calcula el digest SHA-256 hexadecimal en minúsculas (64 caracteres) sobre los bytes UTF-8 de `input`.
 * Paridad exacta con `hashlib.sha256(input.encode("utf-8")).hexdigest()` en Python.
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  const totalLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLen = len * 8;
  const highBits = Math.floor(bitLen / 4294967296);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits >>> 0, false);
  view.setUint32(totalLen - 4, lowBits, false);

  let h0 = SHA256_H0[0]!;
  let h1 = SHA256_H0[1]!;
  let h2 = SHA256_H0[2]!;
  let h3 = SHA256_H0[3]!;
  let h4 = SHA256_H0[4]!;
  let h5 = SHA256_H0[5]!;
  let h6 = SHA256_H0[6]!;
  let h7 = SHA256_H0[7]!;

  const w = new Int32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getInt32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (SHA256_K[i]! | 0) + w[i]!) | 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return (
    (h0 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h3 >>> 0).toString(16).padStart(8, "0") +
    (h4 >>> 0).toString(16).padStart(8, "0") +
    (h5 >>> 0).toString(16).padStart(8, "0") +
    (h6 >>> 0).toString(16).padStart(8, "0") +
    (h7 >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * Codifica cualquier flotante IEEE-754 finito como 16 dígitos hexadecimales big-endian
 * (normalizando `-0` a `+0`). Idéntico a `struct.pack(">d", 0.0 if x == 0 else float(x)).hex()` en Python.
 */
export function float64ToCanonicalHex(value: number): string {
  if (!Number.isFinite(value)) {
    throw new LedgerValidationError(`se esperaba un número finito para hash canónico; recibido ${String(value)}`);
  }
  const normalized = value === 0 ? 0 : value;
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, normalized, false);
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += view.getUint8(i).toString(16).padStart(2, "0");
  }
  return hex;
}

function canonicalizeForFeaturesHash(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NaN_or_Inf";
    return float64ToCanonicalHex(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForFeaturesHash(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs: Array<[string, unknown]> = [];
    for (const k of sortedKeys) {
      pairs.push([k, canonicalizeForFeaturesHash(obj[k])]);
    }
    return pairs;
  }
  return String(value);
}

/**
 * Calcula un `features_hash` SHA-256 determinista sobre un vector o mapa de features,
 * con paridad exacta entre TypeScript y Python (`compute_features_hash`).
 */
export function computeFeaturesHash(features: unknown): string {
  const canonical = JSON.stringify(canonicalizeForFeaturesHash(features));
  return sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// Validación de casas sharp y liquidación exacta de PnL
// ---------------------------------------------------------------------------

/**
 * Verifica si una casa de apuestas es elegible como referencia sharp de cierre:
 *   - En `historical_fd`: ÚNICAMENTE `"pinnacle"` (nunca `open`, nunca `bfe`, nunca recreativas).
 *   - En `scraped_ws` o general: `"pinnacle"` o `"smarkets"` (jamás recreativas como `caliente`, `codere`, `b365`).
 */
export function isValidSharpClosingBook(
  book: string | null | undefined,
  source?: string | null,
): boolean {
  if (book === null || book === undefined) return false;
  const normBook = String(book).trim().toLowerCase();
  if (!SHARP_BOOK_SET.has(normBook)) return false;
  const normSource = source ? String(source).trim().toLowerCase() : "";
  if (normSource === "historical_fd") {
    return normBook === "pinnacle";
  }
  return true;
}

/**
 * Liquidación exacta de PnL en unidades (`pnl_u`) para victorias completas, derrotas,
 * push (`push` / `void`) y medias líneas asiáticas (`half_win`, `half_loss`).
 */
export function settlePickPnl(
  stakeU: number,
  priceTomado: number,
  outcome: SettlementOutcome,
): number {
  if (!Number.isFinite(stakeU) || stakeU <= 0) {
    throw new LedgerValidationError(`stake_u inválido en liquidación: ${String(stakeU)}`);
  }
  if (!Number.isFinite(priceTomado) || priceTomado < 1.01) {
    throw new LedgerValidationError(`price_tomado inválido en liquidación: ${String(priceTomado)}`);
  }
  if (!SETTLEMENT_OUTCOME_SET.has(outcome)) {
    throw new LedgerValidationError(`outcome de liquidación desconocido: ${String(outcome)}`);
  }

  switch (outcome) {
    case "win":
      return stakeU * (priceTomado - 1);
    case "loss":
      return -stakeU;
    case "push":
    case "void":
      return 0;
    case "half_win":
      return 0.5 * stakeU * (priceTomado - 1);
    case "half_loss":
      return -0.5 * stakeU;
  }
}

// ---------------------------------------------------------------------------
// Hash canónico encadenado de registros del ledger
// ---------------------------------------------------------------------------

type HashableLedgerRecord =
  | Omit<PickLedgerEntry, "entry_hash">
  | Omit<PickClosingRecord, "entry_hash">
  | Omit<PickSettlementRecord, "entry_hash">;

/**
 * Calcula `entry_hash` SHA-256 determinista sobre la tupla canónica ordenada del registro
 * incluyendo `prev_hash`. Idéntico bit a bit a `compute_entry_hash` en Python.
 */
export function computeLedgerEntryHash(record: HashableLedgerRecord): string {
  let canonicalTuple: ReadonlyArray<string | boolean | null>;

  if (record.record_type === "pick") {
    canonicalTuple = [
      "pick",
      record.prev_hash,
      record.pick_id,
      record.ts_emitido,
      record.event_id,
      record.sport,
      record.league,
      record.market,
      record.line === null ? null : float64ToCanonicalHex(record.line),
      record.selection,
      record.book,
      float64ToCanonicalHex(record.price_tomado),
      float64ToCanonicalHex(record.p_modelo),
      float64ToCanonicalHex(record.p_mercado),
      float64ToCanonicalHex(record.p_final),
      float64ToCanonicalHex(record.ev),
      float64ToCanonicalHex(record.stake_u),
      record.tier,
      record.version_modelo,
      record.features_hash,
    ];
  } else if (record.record_type === "closing") {
    canonicalTuple = [
      "closing",
      record.prev_hash,
      record.pick_id,
      record.ts_recorded,
      record.closing_missing,
      record.closing_book,
      record.closing_source,
      record.ts_closing_captured,
      record.price_cierre_bruto === null ? null : float64ToCanonicalHex(record.price_cierre_bruto),
      record.price_cierre_sin_margen === null
        ? null
        : float64ToCanonicalHex(record.price_cierre_sin_margen),
      record.p_cierre_sin_margen === null ? null : float64ToCanonicalHex(record.p_cierre_sin_margen),
    ];
  } else if (record.record_type === "settlement") {
    canonicalTuple = [
      "settlement",
      record.prev_hash,
      record.pick_id,
      record.ts_liquidado,
      record.outcome,
      float64ToCanonicalHex(record.pnl_u),
    ];
  } else {
    throw new LedgerValidationError("record_type inválido al calcular entry_hash");
  }

  return sha256Hex(JSON.stringify(canonicalTuple));
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new LedgerValidationError(`el campo "${fieldName}" debe ser string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new LedgerValidationError(`el campo "${fieldName}" no puede estar vacío`);
  }
  return trimmed;
}

function requireIsoTimestamp(value: unknown, fieldName: string): string {
  const s = requireNonEmptyString(value, fieldName);
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) {
    throw new LedgerValidationError(`timestamp ISO inválido en "${fieldName}": "${s}"`);
  }
  return s;
}

function requireFiniteProbabilityOpen01(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new LedgerValidationError(
      `el campo "${fieldName}" debe cumplir 0 < ${fieldName} < 1 finito; recibido ${String(value)}`,
    );
  }
  return value;
}

function requireSha256Hex64(value: unknown, fieldName: string): string {
  const s = requireNonEmptyString(value, fieldName);
  if (!/^[0-9a-f]{64}$/.test(s)) {
    throw new LedgerIntegrityError(
      `hash SHA-256 inválido en "${fieldName}": se esperaban 64 caracteres hex en minúsculas`,
    );
  }
  return s;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Verifica la integridad criptográfica y secuencial completa de una lista de registros del ledger:
 *   1. `records[0].prev_hash === GENESIS_HASH` y `records[i].prev_hash === records[i - 1].entry_hash`.
 *   2. `computeLedgerEntryHash(records[i]) === records[i].entry_hash` para cada eslabón.
 *   3. Sin `pick_id` duplicados ni cierres/liquidaciones huérfanas o repetidas.
 */
export function verifyLedgerIntegrity(records: readonly LedgerRecord[]): boolean {
  let expectedPrevHash = GENESIS_HASH;
  const seenPicks = new Map<string, PickLedgerEntry>();
  const seenClosings = new Set<string>();
  const seenSettlements = new Set<string>();

  for (let idx = 0; idx < records.length; idx += 1) {
    const rec = records[idx];
    if (!rec || typeof rec !== "object") {
      throw new LedgerIntegrityError(`registro nulo o inválido en posición ${idx}`);
    }
    const prevHash = requireSha256Hex64(rec.prev_hash, `records[${idx}].prev_hash`);
    const entryHash = requireSha256Hex64(rec.entry_hash, `records[${idx}].entry_hash`);

    if (prevHash !== expectedPrevHash) {
      throw new LedgerIntegrityError(
        `cadena rota en posición ${idx}: prev_hash=${prevHash} != esperado=${expectedPrevHash}`,
      );
    }

    const recomputed = computeLedgerEntryHash(rec);
    if (recomputed !== entryHash) {
      throw new LedgerIntegrityError(
        `entry_hash alterado en posición ${idx} (pick_id="${rec.pick_id}"): esperado=${recomputed}, encontrado=${entryHash}`,
      );
    }

    if (rec.record_type === "pick") {
      if (!HISTORICAL_TIER_SET.has(rec.tier)) {
        throw new LedgerIntegrityError(
          `tier inválido detectado en cadena en posición ${idx}: "${String(rec.tier)}"`,
        );
      }
      if (seenPicks.has(rec.pick_id)) {
        throw new LedgerIntegrityError(`pick_id duplicado detectado en cadena en posición ${idx}: "${rec.pick_id}"`);
      }
      seenPicks.set(rec.pick_id, rec);
    } else if (rec.record_type === "closing") {
      if (!seenPicks.has(rec.pick_id)) {
        throw new LedgerIntegrityError(
          `cierre huérfano en posición ${idx} para pick_id inexistente "${rec.pick_id}"`,
        );
      }
      if (seenClosings.has(rec.pick_id)) {
        throw new LedgerIntegrityError(
          `cierre duplicado en posición ${idx} para pick_id "${rec.pick_id}"`,
        );
      }
      seenClosings.add(rec.pick_id);
    } else if (rec.record_type === "settlement") {
      const parentPick = seenPicks.get(rec.pick_id);
      if (!parentPick) {
        throw new LedgerIntegrityError(
          `liquidación huérfana en posición ${idx} para pick_id inexistente "${rec.pick_id}"`,
        );
      }
      if (seenSettlements.has(rec.pick_id)) {
        throw new LedgerIntegrityError(
          `liquidación duplicada en posición ${idx} para pick_id "${rec.pick_id}"`,
        );
      }
      const expectedPnl = settlePickPnl(parentPick.stake_u, parentPick.price_tomado, rec.outcome);
      if (Math.abs(rec.pnl_u - expectedPnl) > 1e-12) {
        throw new LedgerIntegrityError(
          `pnl_u inconsistente en posición ${idx} (pick_id="${rec.pick_id}"): esperado=${expectedPnl}, encontrado=${rec.pnl_u}`,
        );
      }
      seenSettlements.add(rec.pick_id);
    }

    expectedPrevHash = entryHash;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Clase principal Append-Only `PickLedger`
// ---------------------------------------------------------------------------

/**
 * Ledger estrictamente append-only de emisiones de picks, cierres sharp y liquidaciones.
 * Los campos privados `#records`, `#picksById`, `#closingsById` y `#settlementsById` impiden
 * cualquier mutación externa directa, y cada registro retornado está congelado (`Object.freeze`).
 */
export class PickLedger {
  readonly #records: LedgerRecord[] = [];
  readonly #picks: PickLedgerEntry[] = [];
  readonly #picksById = new Map<string, PickLedgerEntry>();
  readonly #closingsById = new Map<string, PickClosingRecord>();
  readonly #settlementsById = new Map<string, PickSettlementRecord>();
  #headHash: string = GENESIS_HASH;

  /** Hash SHA-256 del último registro del ledger (`GENESIS_HASH` si está vacío). */
  get headHash(): string {
    return this.#headHash;
  }

  /** Número de picks únicos emitidos en el ledger. */
  get size(): number {
    return this.#picks.length;
  }

  /** Número total de registros encadenados (`pick` + `closing` + `settlement`). */
  get recordCount(): number {
    return this.#records.length;
  }

  /**
   * Añade un nuevo `PickLedgerEntry` inmutable al final del ledger.
   * Por defecto en v3.2 acepta ÚNICAMENTE `tier` `"solido"` o `"valor"`; los niveles heredados
   * (`"baseline_v3_0"`, `"especulativo"`) solo se permiten en deserialización histórica (`fromJsonl`
   * o `{ allowLegacyTiers: true }`).
   */
  appendPick(input: PickLedgerInput): PickLedgerEntry;
  appendPick(input: HistoricalPickLedgerInput, options: AppendPickOptions): PickLedgerEntry;
  appendPick(
    input: PickLedgerInput | HistoricalPickLedgerInput,
    options?: AppendPickOptions,
  ): PickLedgerEntry {
    if (!input || typeof input !== "object") {
      throw new LedgerValidationError("entrada de pick inválida");
    }

    const pick_id = requireNonEmptyString(input.pick_id, "pick_id");
    if (this.#picksById.has(pick_id)) {
      throw new DuplicatePickError(pick_id);
    }

    const ts_emitido = requireIsoTimestamp(input.ts_emitido, "ts_emitido");
    const event_id = requireNonEmptyString(input.event_id, "event_id");
    const sport = requireNonEmptyString(input.sport, "sport");
    const league = requireNonEmptyString(input.league, "league");
    const market = requireNonEmptyString(input.market, "market");

    let line: number | null = null;
    if (input.line !== undefined && input.line !== null) {
      if (typeof input.line !== "number" || !Number.isFinite(input.line)) {
        throw new LedgerValidationError(
          `el campo "line" debe ser número finito o null; recibido ${String(input.line)}`,
        );
      }
      line = input.line === 0 ? 0 : input.line;
    }

    const selection = requireNonEmptyString(input.selection, "selection");
    const book = requireNonEmptyString(input.book, "book");

    if (typeof input.price_tomado !== "number" || !Number.isFinite(input.price_tomado) || input.price_tomado < 1.01) {
      throw new LedgerValidationError(
        `el campo "price_tomado" debe ser finito y >= 1.01; recibido ${String(input.price_tomado)}`,
      );
    }
    const price_tomado = input.price_tomado;

    const p_modelo = requireFiniteProbabilityOpen01(input.p_modelo, "p_modelo");
    const p_mercado = requireFiniteProbabilityOpen01(input.p_mercado, "p_mercado");
    const p_final = requireFiniteProbabilityOpen01(input.p_final, "p_final");

    if (typeof input.ev !== "number" || !Number.isFinite(input.ev)) {
      throw new LedgerValidationError(`el campo "ev" debe ser finito; recibido ${String(input.ev)}`);
    }
    const ev = input.ev === 0 ? 0 : input.ev;

    if (typeof input.stake_u !== "number" || !Number.isFinite(input.stake_u) || input.stake_u <= 0) {
      throw new LedgerValidationError(
        `el campo "stake_u" debe ser finito y > 0; recibido ${String(input.stake_u)}`,
      );
    }
    const stake_u = input.stake_u;

    const tierRaw = requireNonEmptyString(input.tier, "tier");
    const allowLegacy = options?.allowLegacyTiers === true;
    const allowedTierSet = allowLegacy ? HISTORICAL_TIER_SET : VALID_TIER_SET;
    if (!allowedTierSet.has(tierRaw)) {
      const allowedList = allowLegacy ? HISTORICAL_PICK_TIERS : VALID_PICK_TIERS;
      throw new LedgerValidationError(
        `tier inválido "${tierRaw}"; valores permitidos: ${allowedList.join(", ")}`,
        "invalid_pick_tier",
      );
    }
    const tier = tierRaw as HistoricalPickTier;

    const version_modelo = requireNonEmptyString(input.version_modelo, "version_modelo");
    const features_hash = requireNonEmptyString(input.features_hash, "features_hash");

    const draft: Omit<PickLedgerEntry, "entry_hash"> = {
      record_type: "pick",
      pick_id,
      ts_emitido,
      event_id,
      sport,
      league,
      market,
      line,
      selection,
      book,
      price_tomado,
      p_modelo,
      p_mercado,
      p_final,
      ev,
      stake_u,
      tier,
      version_modelo,
      features_hash,
      prev_hash: this.#headHash,
    };

    const entry_hash = computeLedgerEntryHash(draft);
    const entry: PickLedgerEntry = Object.freeze({
      ...draft,
      entry_hash,
    });

    this.#records.push(entry);
    this.#picks.push(entry);
    this.#picksById.set(pick_id, entry);
    this.#headHash = entry_hash;
    return entry;
  }

  /**
   * Registra la información de cierre sharp de un pick ya emitido en un eslabón separado,
   * sin mutar el `PickLedgerEntry` original.
   * Si `closing_missing === false`, exige casa sharp válida (`pinnacle` o `smarkets`, y solo
   * `pinnacle` en `historical_fd`) y `price_cierre_sin_margen > 1.0`.
   */
  appendClosing(input: PickClosingInput): PickClosingRecord {
    if (!input || typeof input !== "object") {
      throw new LedgerValidationError("entrada de cierre inválida");
    }

    const pick_id = requireNonEmptyString(input.pick_id, "pick_id");
    if (!this.#picksById.has(pick_id)) {
      throw new LedgerValidationError(
        `no se puede adjuntar cierre a pick_id inexistente: "${pick_id}"`,
        "unknown_pick_id",
      );
    }
    if (this.#closingsById.has(pick_id)) {
      throw new LedgerValidationError(
        `el pick_id "${pick_id}" ya tiene un registro de cierre inmutable`,
        "duplicate_closing",
      );
    }

    const ts_recorded = requireIsoTimestamp(input.ts_recorded, "ts_recorded");
    if (typeof input.closing_missing !== "boolean") {
      throw new LedgerValidationError(`el campo "closing_missing" debe ser booleano`);
    }

    const closing_source = normalizeOptionalString(input.closing_source);
    const ts_closing_captured =
      input.ts_closing_captured !== null && input.ts_closing_captured !== undefined
        ? requireIsoTimestamp(input.ts_closing_captured, "ts_closing_captured")
        : null;

    let closing_book = normalizeOptionalString(input.closing_book);
    if (closing_book !== null) {
      closing_book = closing_book.toLowerCase();
    }

    let price_cierre_bruto: number | null = null;
    let price_cierre_sin_margen: number | null = null;
    let p_cierre_sin_margen: number | null = null;

    if (input.closing_missing) {
      closing_book = null;
      price_cierre_bruto = null;
      price_cierre_sin_margen = null;
      p_cierre_sin_margen = null;
    } else {
      if (closing_book === null || !isValidSharpClosingBook(closing_book, closing_source)) {
        throw new LedgerValidationError(
          `cierre rechazado para pick_id="${pick_id}": casa "${String(input.closing_book)}" no es un cierre sharp válido (jamás se rellena con casas recreativas)`,
          "invalid_closing_book",
        );
      }

      if (input.price_cierre_bruto !== undefined && input.price_cierre_bruto !== null) {
        if (
          typeof input.price_cierre_bruto !== "number" ||
          !Number.isFinite(input.price_cierre_bruto) ||
          input.price_cierre_bruto < 1.01
        ) {
          throw new LedgerValidationError(
            `price_cierre_bruto inválido: ${String(input.price_cierre_bruto)}`,
          );
        }
        price_cierre_bruto = input.price_cierre_bruto;
      }

      const rawPriceNoVig = input.price_cierre_sin_margen;
      const rawProbNoVig = input.p_cierre_sin_margen;

      if (rawPriceNoVig !== undefined && rawPriceNoVig !== null) {
        if (typeof rawPriceNoVig !== "number" || !Number.isFinite(rawPriceNoVig) || rawPriceNoVig <= 1) {
          throw new LedgerValidationError(
            `price_cierre_sin_margen debe ser finito y > 1.0; recibido ${String(rawPriceNoVig)}`,
          );
        }
        price_cierre_sin_margen = rawPriceNoVig;
        p_cierre_sin_margen = 1 / rawPriceNoVig;
        if (rawProbNoVig !== undefined && rawProbNoVig !== null) {
          if (
            typeof rawProbNoVig !== "number" ||
            !Number.isFinite(rawProbNoVig) ||
            Math.abs(rawProbNoVig - p_cierre_sin_margen) > 1e-6
          ) {
            throw new LedgerValidationError(
              `p_cierre_sin_margen (${String(rawProbNoVig)}) inconsistente con 1 / price_cierre_sin_margen (${p_cierre_sin_margen})`,
            );
          }
        }
      } else if (rawProbNoVig !== undefined && rawProbNoVig !== null) {
        if (typeof rawProbNoVig !== "number" || !Number.isFinite(rawProbNoVig) || rawProbNoVig <= 0 || rawProbNoVig >= 1) {
          throw new LedgerValidationError(
            `p_cierre_sin_margen debe cumplir 0 < p < 1; recibido ${String(rawProbNoVig)}`,
          );
        }
        p_cierre_sin_margen = rawProbNoVig;
        price_cierre_sin_margen = 1 / rawProbNoVig;
      } else {
        throw new LedgerValidationError(
          `cuando closing_missing=false se requiere price_cierre_sin_margen o p_cierre_sin_margen`,
        );
      }
    }

    const draft: Omit<PickClosingRecord, "entry_hash"> = {
      record_type: "closing",
      pick_id,
      ts_recorded,
      closing_missing: input.closing_missing,
      closing_book,
      closing_source,
      ts_closing_captured,
      price_cierre_bruto,
      price_cierre_sin_margen,
      p_cierre_sin_margen,
      prev_hash: this.#headHash,
    };

    const entry_hash = computeLedgerEntryHash(draft);
    const closingRecord: PickClosingRecord = Object.freeze({
      ...draft,
      entry_hash,
    });

    this.#records.push(closingRecord);
    this.#closingsById.set(pick_id, closingRecord);
    this.#headHash = entry_hash;
    return closingRecord;
  }

  /**
   * Registra la liquidación oficial (`outcome` y `pnl_u` exacto) de un pick ya emitido
   * en un eslabón separado, sin mutar el `PickLedgerEntry` original.
   */
  appendSettlement(input: PickSettlementInput): PickSettlementRecord {
    if (!input || typeof input !== "object") {
      throw new LedgerValidationError("entrada de liquidación inválida");
    }

    const pick_id = requireNonEmptyString(input.pick_id, "pick_id");
    const parentPick = this.#picksById.get(pick_id);
    if (!parentPick) {
      throw new LedgerValidationError(
        `no se puede liquidar un pick_id inexistente: "${pick_id}"`,
        "unknown_pick_id",
      );
    }
    if (this.#settlementsById.has(pick_id)) {
      throw new LedgerValidationError(
        `el pick_id "${pick_id}" ya tiene un registro de liquidación inmutable`,
        "duplicate_settlement",
      );
    }

    const ts_liquidado = requireIsoTimestamp(input.ts_liquidado, "ts_liquidado");
    const outcomeRaw = requireNonEmptyString(input.outcome, "outcome") as SettlementOutcome;
    const pnlRaw = settlePickPnl(parentPick.stake_u, parentPick.price_tomado, outcomeRaw);
    const pnl_u = pnlRaw === 0 ? 0 : pnlRaw;

    const draft: Omit<PickSettlementRecord, "entry_hash"> = {
      record_type: "settlement",
      pick_id,
      ts_liquidado,
      outcome: outcomeRaw,
      pnl_u,
      prev_hash: this.#headHash,
    };

    const entry_hash = computeLedgerEntryHash(draft);
    const settlementRecord: PickSettlementRecord = Object.freeze({
      ...draft,
      entry_hash,
    });

    this.#records.push(settlementRecord);
    this.#settlementsById.set(pick_id, settlementRecord);
    this.#headHash = entry_hash;
    return settlementRecord;
  }

  getPick(pickId: string): PickLedgerEntry | undefined {
    return this.#picksById.get(pickId);
  }

  getClosing(pickId: string): PickClosingRecord | undefined {
    return this.#closingsById.get(pickId);
  }

  getSettlement(pickId: string): PickSettlementRecord | undefined {
    return this.#settlementsById.get(pickId);
  }

  /** Devuelve una copia superficial congelada de todos los picks emitidos en orden de inserción. */
  getPicks(): readonly PickLedgerEntry[] {
    return Object.freeze([...this.#picks]);
  }

  /** Devuelve una copia superficial congelada de todos los registros de cierre. */
  getClosings(): readonly PickClosingRecord[] {
    return Object.freeze(Array.from(this.#closingsById.values()));
  }

  /** Devuelve una copia superficial congelada de todos los registros de liquidación. */
  getSettlements(): readonly PickSettlementRecord[] {
    return Object.freeze(Array.from(this.#settlementsById.values()));
  }

  /** Devuelve una copia superficial congelada de la cadena completa de registros. */
  getRecords(): readonly LedgerRecord[] {
    return Object.freeze([...this.#records]);
  }

  /** Devuelve vistas proyectadas congeladas `(pick, closing, settlement)` sin mutar registros base. */
  getResolvedPicks(): readonly ResolvedPickRecord[] {
    const resolved = this.#picks.map((pick) =>
      Object.freeze({
        pick,
        closing: this.#closingsById.get(pick.pick_id) ?? null,
        settlement: this.#settlementsById.get(pick.pick_id) ?? null,
      }),
    );
    return Object.freeze(resolved);
  }

  /** Verifica la integridad criptográfica SHA-256 de toda la cadena en memoria. */
  verifyIntegrity(): boolean {
    return verifyLedgerIntegrity(this.#records);
  }

  /** Serializa la cadena completa a JSON Lines (`.jsonl`), 1 eslabón por línea. */
  toJsonl(): string {
    if (this.#records.length === 0) return "";
    return this.#records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  }

  /**
   * Reconstruye y verifica criptográficamente un `PickLedger` desde contenido JSONL.
   * Lanza `LedgerValidationError` o `LedgerIntegrityError` ante cualquier corrupción,
   * reordenamiento, borrado de línea o alteración retroactiva de campos.
   */
  static fromJsonl(jsonl: string): PickLedger {
    const ledger = new PickLedger();
    const lines = jsonl.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx += 1) {
      const trimmed = (lines[idx] ?? "").trim();
      if (trimmed.length === 0) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch (err) {
        throw new LedgerValidationError(
          `JSON inválido en línea ${idx + 1}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!parsed || typeof parsed !== "object") {
        throw new LedgerValidationError(`objeto JSON inválido en línea ${idx + 1}`);
      }

      const filePrevHash = requireSha256Hex64(parsed.prev_hash, `line[${idx + 1}].prev_hash`);
      const fileEntryHash = requireSha256Hex64(parsed.entry_hash, `line[${idx + 1}].entry_hash`);

      if (filePrevHash !== ledger.headHash) {
        throw new LedgerIntegrityError(
          `cadena SHA-256 rota en línea ${idx + 1}: prev_hash=${filePrevHash} != esperado=${ledger.headHash}`,
        );
      }

      const recType = parsed.record_type ?? "pick";
      let appended: LedgerRecord;

      if (recType === "pick") {
        appended = ledger.appendPick(
          {
            pick_id: parsed.pick_id as string,
            ts_emitido: parsed.ts_emitido as string,
            event_id: parsed.event_id as string,
            sport: parsed.sport as string,
            league: parsed.league as string,
            market: parsed.market as string,
            line: (parsed.line as number | null | undefined) ?? null,
            selection: parsed.selection as string,
            book: parsed.book as string,
            price_tomado: parsed.price_tomado as number,
            p_modelo: parsed.p_modelo as number,
            p_mercado: parsed.p_mercado as number,
            p_final: parsed.p_final as number,
            ev: parsed.ev as number,
            stake_u: parsed.stake_u as number,
            tier: parsed.tier as HistoricalPickTier,
            version_modelo: parsed.version_modelo as string,
            features_hash: parsed.features_hash as string,
          },
          { allowLegacyTiers: true },
        );
      } else if (recType === "closing") {
        appended = ledger.appendClosing({
          pick_id: parsed.pick_id as string,
          ts_recorded: parsed.ts_recorded as string,
          closing_missing: parsed.closing_missing as boolean,
          closing_book: (parsed.closing_book as string | null | undefined) ?? null,
          closing_source: (parsed.closing_source as string | null | undefined) ?? null,
          ts_closing_captured: (parsed.ts_closing_captured as string | null | undefined) ?? null,
          price_cierre_bruto: (parsed.price_cierre_bruto as number | null | undefined) ?? null,
          price_cierre_sin_margen: (parsed.price_cierre_sin_margen as number | null | undefined) ?? null,
          p_cierre_sin_margen: (parsed.p_cierre_sin_margen as number | null | undefined) ?? null,
        });
      } else if (recType === "settlement") {
        appended = ledger.appendSettlement({
          pick_id: parsed.pick_id as string,
          ts_liquidado: parsed.ts_liquidado as string,
          outcome: parsed.outcome as SettlementOutcome,
        });
        if (typeof parsed.pnl_u === "number" && Math.abs(parsed.pnl_u - appended.pnl_u) > 1e-12) {
          throw new LedgerIntegrityError(
            `pnl_u alterado en línea ${idx + 1}: archivo=${parsed.pnl_u}, recalculado=${appended.pnl_u}`,
          );
        }
      } else {
        throw new LedgerValidationError(`record_type desconocido en línea ${idx + 1}: ${String(recType)}`);
      }

      if (appended.entry_hash !== fileEntryHash) {
        throw new LedgerIntegrityError(
          `entry_hash alterado en línea ${idx + 1} (pick_id="${appended.pick_id}"): esperado=${appended.entry_hash}, archivo=${fileEntryHash}`,
        );
      }
    }

    return ledger;
  }
}
