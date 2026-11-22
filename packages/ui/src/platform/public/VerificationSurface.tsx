"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  EditorialCard,
  EditorialEmptyState,
  EditorialFilterBar,
  EditorialTable,
  EditorialTabs,
  EditorialValueCell,
  type EditorialTabItem,
  type EditorialTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../sports";
import { DailyResultsCalendar } from "../components/DailyResultsCalendar";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { buildModelDailyCalendar } from "../record-stats";
import type { LandingFinishedResultItem } from "./PublicSiteSections";

export interface VerificationSurfaceProps {
  readonly title?: string;
  readonly className?: string;
}

export interface ReceiptStructuredFields {
  readonly league: string;
  readonly match: string;
  readonly pick: string;
  readonly units: string;
  readonly userDecimal: string;
  readonly fairDecimal: string;
  readonly kickoffUtc: string;
  readonly sealedAtUtc: string;
}

export const EXAMPLE_VERIFICATION_FIELDS: ReceiptStructuredFields = {
  league: "Liga MX",
  match: "Querétaro vs Monterrey",
  pick: "Monterrey o empate",
  units: "1.00",
  userDecimal: "1.450",
  fairDecimal: "1.380",
  kickoffUtc: "2026-11-22T01:00:00.000Z",
  sealedAtUtc: "2026-11-21T22:15:00.000Z",
};

export const EXAMPLE_VERIFICATION_EXPECTED_SHA256 =
  "7475e69602889d069734413f9aeb83cac80fa7fa2185d2778867dda121faa18f";

export const EXAMPLE_VERIFICATION_RECEIPT_JSON = JSON.stringify(
  {
    payload: {
      version: "pitchlab-receipt-v1",
      league: EXAMPLE_VERIFICATION_FIELDS.league,
      match: EXAMPLE_VERIFICATION_FIELDS.match,
      pick: EXAMPLE_VERIFICATION_FIELDS.pick,
      units: EXAMPLE_VERIFICATION_FIELDS.units,
      userDecimal: EXAMPLE_VERIFICATION_FIELDS.userDecimal,
      fairDecimal: EXAMPLE_VERIFICATION_FIELDS.fairDecimal,
      kickoffUtc: EXAMPLE_VERIFICATION_FIELDS.kickoffUtc,
      sealedAtUtc: EXAMPLE_VERIFICATION_FIELDS.sealedAtUtc,
    },
    sha256: EXAMPLE_VERIFICATION_EXPECTED_SHA256,
  },
  null,
  2,
);

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const TRAILING_HASH_FOOTER_LINE_RE = /^(?:SHA-256|sha256|Hash):\s*([0-9a-fA-F]{64})$/;
const PROFILE_RECORD_PREFIX = "pitchlab-record-v1|";
const HASH_FIELD_KEYS = new Set(["sha256", "sealHash", "seal_hash", "expectedHash", "hash"]);
const MAX_CANONICAL_DEPTH = 32;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalizeReceiptValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new Error("RECEIPT_DEPTH_EXCEEDED");
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeReceiptValue(item, depth + 1));
  }
  if (isPlainRecord(value)) {
    const sortedKeys = Object.keys(value).sort();
    const out: Record<string, unknown> = Object.create(null);
    for (const key of sortedKeys) {
      if (key === "__proto__" || !Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      const entry = value[key];
      if (entry !== undefined) {
        Object.defineProperty(out, key, {
          value: canonicalizeReceiptValue(entry, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return out;
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const val = record[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

export interface ExtractedReceiptInput {
  readonly canonicalPayload: string;
  readonly embeddedHash: string | null;
  readonly formatLabel: string;
  readonly kickoffUtc: string | null;
  readonly sealedAtUtc: string | null;
}

function parseJsonReceiptInput(
  text: string,
  fallbackHash: string | null,
): ExtractedReceiptInput | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const kickoffCandidate =
        parsed.length >= 13 && typeof parsed[11] === "string" ? parsed[11] : null;
      const sealedCandidate =
        parsed.length >= 13 && typeof parsed[12] === "string" ? parsed[12] : null;
      return {
        canonicalPayload: JSON.stringify(parsed),
        embeddedHash: fallbackHash,
        formatLabel: "Tupla canónica JSON",
        kickoffUtc: kickoffCandidate,
        sealedAtUtc: sealedCandidate,
      };
    }

    if (isPlainRecord(parsed)) {
      const rawEmbeddedHash =
        readOptionalString(parsed, [
          "sha256",
          "sealHash",
          "seal_hash",
          "expectedHash",
          "hash",
        ]) ?? fallbackHash;
      const embeddedHash = rawEmbeddedHash ? rawEmbeddedHash.toLowerCase() : null;
      if ("payload" in parsed && parsed.payload !== undefined) {
        const inner = parsed.payload;
        const innerRecord = isPlainRecord(inner) ? inner : null;
        const innerVersion = innerRecord ? readOptionalString(innerRecord, ["version"]) : null;
        return {
          canonicalPayload: JSON.stringify(canonicalizeReceiptValue(inner)),
          embeddedHash,
          formatLabel:
            innerVersion === "pitchlab-profile-receipt-v1"
              ? "Recibo de perfil (pitchlab-profile-receipt-v1)"
              : "Recibo JSON con payload",
          kickoffUtc: innerRecord
            ? readOptionalString(innerRecord, ["kickoffUtc", "kickoffAt", "kickoff_at"])
            : null,
          sealedAtUtc: innerRecord
            ? readOptionalString(innerRecord, ["sealedAtUtc", "sealedAt", "sealed_at"])
            : null,
        };
      }

      const stripped: Record<string, unknown> = Object.create(null);
      for (const key of Object.keys(parsed)) {
        if (
          key === "__proto__" ||
          HASH_FIELD_KEYS.has(key) ||
          !Object.prototype.hasOwnProperty.call(parsed, key)
        ) {
          continue;
        }
        Object.defineProperty(stripped, key, {
          value: parsed[key],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      const rootVersion = readOptionalString(stripped, ["version"]);
      return {
        canonicalPayload: JSON.stringify(canonicalizeReceiptValue(stripped)),
        embeddedHash,
        formatLabel:
          rootVersion === "pitchlab-profile-receipt-v1"
            ? "Recibo de perfil (pitchlab-profile-receipt-v1)"
            : "Objeto JSON canónico",
        kickoffUtc: readOptionalString(stripped, ["kickoffUtc", "kickoffAt", "kickoff_at"]),
        sealedAtUtc: readOptionalString(stripped, ["sealedAtUtc", "sealedAt", "sealed_at"]),
      };
    }
  } catch (err) {
    void err;
  }
  return null;
}

export function extractReceiptInput(rawText: string): ExtractedReceiptInput {
  const normalized = rawText.replace(/\r\n?/g, "\n").trim();
  if (normalized.length === 0) {
    return {
      canonicalPayload: "",
      embeddedHash: null,
      formatLabel: "Vacío",
      kickoffUtc: null,
      sealedAtUtc: null,
    };
  }

  const directJson = parseJsonReceiptInput(normalized, null);
  if (directJson) {
    return directJson;
  }

  const lastNewlineIdx = normalized.lastIndexOf("\n");
  if (lastNewlineIdx !== -1) {
    const lastLine = normalized.slice(lastNewlineIdx + 1).trim();
    const footerMatch = TRAILING_HASH_FOOTER_LINE_RE.exec(lastLine);
    if (footerMatch) {
      let bodyEnd = lastNewlineIdx;
      while (bodyEnd > 0) {
        const prevNl = normalized.lastIndexOf("\n", bodyEnd - 1);
        const lineSlice = normalized.slice(prevNl + 1, bodyEnd);
        if (lineSlice.trim().length > 0) break;
        bodyEnd = prevNl === -1 ? 0 : prevNl;
      }
      const body = normalized.slice(0, bodyEnd);
      const footerHash = (footerMatch[1] ?? "").toLowerCase();
      const trimmedBody = body.trim();
      if (trimmedBody.startsWith("{") || trimmedBody.startsWith("[")) {
        const jsonWithFooter = parseJsonReceiptInput(trimmedBody, footerHash);
        if (jsonWithFooter) {
          return jsonWithFooter;
        }
      }
      return {
        canonicalPayload: body,
        embeddedHash: footerHash,
        formatLabel: body.startsWith(PROFILE_RECORD_PREFIX)
          ? "Recibo de perfil (pitchlab-record-v1)"
          : "Texto con pie SHA-256",
        kickoffUtc: null,
        sealedAtUtc: null,
      };
    }
  }

  return {
    canonicalPayload: normalized,
    embeddedHash: null,
    formatLabel: normalized.startsWith(PROFILE_RECORD_PREFIX)
      ? "Recibo de perfil (pitchlab-record-v1)"
      : "Texto UTF-8 directo",
    kickoffUtc: null,
    sealedAtUtc: null,
  };
}

function buildCanonicalFromFields(fields: ReceiptStructuredFields): {
  canonicalPayload: string;
  validationError: string | null;
} {
  const unitsVal = parseStrictFiniteNumber(fields.units);
  const userDecVal = parseStrictFiniteNumber(fields.userDecimal);
  const fairDecVal = parseStrictFiniteNumber(fields.fairDecimal);

  if (
    !fields.league.trim() ||
    !fields.match.trim() ||
    !fields.pick.trim() ||
    !fields.kickoffUtc.trim() ||
    !fields.sealedAtUtc.trim()
  ) {
    return {
      canonicalPayload: "",
      validationError: "Completa liga, partido, selección y ambas marcas horarias UTC.",
    };
  }

  if (unitsVal === null || unitsVal <= 0 || unitsVal > 5) {
    return {
      canonicalPayload: "",
      validationError: "Las unidades deben ser un número entre 0.01 y 5.00.",
    };
  }

  if (userDecVal === null || userDecVal < 1.01 || fairDecVal === null || fairDecVal < 1.01) {
    return {
      canonicalPayload: "",
      validationError: "Los momios decimales deben ser mayores o iguales a 1.01.",
    };
  }

  const payload = canonicalizeReceiptValue({
    version: "pitchlab-receipt-v1",
    league: fields.league.trim(),
    match: fields.match.trim(),
    pick: fields.pick.trim(),
    units: unitsVal.toFixed(2),
    userDecimal: userDecVal.toFixed(3),
    fairDecimal: fairDecVal.toFixed(3),
    kickoffUtc: fields.kickoffUtc.trim(),
    sealedAtUtc: fields.sealedAtUtc.trim(),
  });

  return {
    canonicalPayload: JSON.stringify(payload),
    validationError: null,
  };
}

export async function computeSha256HexClient(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("WEBCRYPTO_UNAVAILABLE");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type VerificationMode = "json" | "fields";

interface VerificationOutcome {
  readonly status: "match" | "mismatch" | "computed";
  readonly computedHash: string;
  readonly expectedHash: string | null;
  readonly canonicalPayload: string;
  readonly formatLabel: string;
  readonly preKickoffStatus: "valid" | "late" | "unknown";
}

function evaluatePreKickoffTiming(
  kickoffUtc: string | null,
  sealedAtUtc: string | null,
): "valid" | "late" | "unknown" {
  if (!kickoffUtc || !sealedAtUtc) return "unknown";
  const ko = Date.parse(kickoffUtc);
  const sealed = Date.parse(sealedAtUtc);
  if (!Number.isFinite(ko) || !Number.isFinite(sealed)) return "unknown";
  return sealed < ko ? "valid" : "late";
}

const VERIFIER_MODE_TABS: readonly EditorialTabItem[] = [
  { id: "json", label: "Recibo JSON" },
  { id: "fields", label: "Por campos" },
];

export function VerificationSurface({
  title = "Verificación Spacetime",
  className,
}: VerificationSurfaceProps = {}): React.JSX.Element {
  const baseId = useId();
  const receiptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hashInputRef = useRef<HTMLInputElement | null>(null);
  const submitPointerDownRef = useRef<boolean>(false);
  const [mode, setMode] = useState<VerificationMode>("json");
  const [rawReceipt, setRawReceipt] = useState<string>("");
  const [expectedHashInput, setExpectedHashInput] = useState<string>("");
  const [lastAutoHash, setLastAutoHash] = useState<string | null>(null);
  const [fields, setFields] = useState<ReceiptStructuredFields>(EXAMPLE_VERIFICATION_FIELDS);
  const [touchedReceipt, setTouchedReceipt] = useState<boolean>(false);
  const [touchedHash, setTouchedHash] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  const normalizedExpected = expectedHashInput.trim().toLowerCase();
  const hasExpectedInput = normalizedExpected.length > 0;
  const expectedFormatInvalid = hasExpectedInput && !SHA256_HEX_RE.test(normalizedExpected);
  const showHashError = touchedHash && expectedFormatInvalid;

  const receiptEmptyInvalid = mode === "json" && rawReceipt.trim().length === 0;
  const showReceiptError = touchedReceipt && receiptEmptyInvalid;

  const runVerification = useCallback(
    async (
      targetMode: VerificationMode,
      nextRaw: string,
      nextExpected: string,
      nextFields: ReceiptStructuredFields,
    ): Promise<void> => {
      setRuntimeError(null);
      setCopiedHash(false);

      let canonicalPayload = "";
      let formatLabel = "Recibo estructurado";
      let embeddedHash: string | null = null;
      let kickoffUtc: string | null = null;
      let sealedAtUtc: string | null = null;

      if (targetMode === "json") {
        const extracted = extractReceiptInput(nextRaw);
        if (!extracted.canonicalPayload) {
          setTouchedReceipt(true);
          const trimmedExpected = nextExpected.trim().toLowerCase();
          if (trimmedExpected.length > 0 && !SHA256_HEX_RE.test(trimmedExpected)) {
            setTouchedHash(true);
          }
          setRuntimeError("Pega un recibo JSON o carga el recibo de ejemplo para verificar.");
          setOutcome(null);
          receiptInputRef.current?.focus();
          return;
        }
        canonicalPayload = extracted.canonicalPayload;
        formatLabel = extracted.formatLabel;
        embeddedHash = extracted.embeddedHash;
        kickoffUtc = extracted.kickoffUtc;
        sealedAtUtc = extracted.sealedAtUtc;
      } else {
        const built = buildCanonicalFromFields(nextFields);
        if (built.validationError) {
          setRuntimeError(built.validationError);
          setOutcome(null);
          return;
        }
        canonicalPayload = built.canonicalPayload;
        formatLabel = "Campos canónicos pitchlab-receipt-v1";
        kickoffUtc = nextFields.kickoffUtc.trim();
        sealedAtUtc = nextFields.sealedAtUtc.trim();
      }

      const effectiveExpected = (nextExpected.trim() || embeddedHash || "").toLowerCase();
      if (effectiveExpected.length > 0 && !SHA256_HEX_RE.test(effectiveExpected)) {
        setTouchedHash(true);
        setRuntimeError("La huella SHA-256 esperada debe tener exactamente 64 caracteres hexadecimales.");
        setOutcome(null);
        hashInputRef.current?.focus();
        return;
      }

      if (!nextExpected.trim() && embeddedHash) {
        setExpectedHashInput(embeddedHash);
        setLastAutoHash(embeddedHash);
      }

      setBusy(true);
      try {
        const computedHash = await computeSha256HexClient(canonicalPayload);
        const preKickoffStatus = evaluatePreKickoffTiming(kickoffUtc, sealedAtUtc);
        const status: VerificationOutcome["status"] =
          effectiveExpected.length === 0
            ? "computed"
            : computedHash === effectiveExpected
              ? "match"
              : "mismatch";
        setOutcome({
          status,
          computedHash,
          expectedHash: effectiveExpected.length > 0 ? effectiveExpected : null,
          canonicalPayload,
          formatLabel,
          preKickoffStatus,
        });
      } catch (err) {
        void err;
        setRuntimeError(
          "Tu navegador no expuso WebCrypto (SHA-256 requiere HTTPS o entorno local seguro).",
        );
        setOutcome(null);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleLoadValidExample = (): void => {
    setMode("json");
    setRawReceipt(EXAMPLE_VERIFICATION_RECEIPT_JSON);
    setExpectedHashInput(EXAMPLE_VERIFICATION_EXPECTED_SHA256);
    setLastAutoHash(EXAMPLE_VERIFICATION_EXPECTED_SHA256);
    setFields(EXAMPLE_VERIFICATION_FIELDS);
    setTouchedReceipt(false);
    setTouchedHash(false);
    void runVerification(
      "json",
      EXAMPLE_VERIFICATION_RECEIPT_JSON,
      EXAMPLE_VERIFICATION_EXPECTED_SHA256,
      EXAMPLE_VERIFICATION_FIELDS,
    );
  };

  const handleLoadTamperedExample = (): void => {
    const tamperedJson = JSON.stringify(
      {
        payload: {
          version: "pitchlab-receipt-v1",
          league: EXAMPLE_VERIFICATION_FIELDS.league,
          match: EXAMPLE_VERIFICATION_FIELDS.match,
          pick: EXAMPLE_VERIFICATION_FIELDS.pick,
          units: EXAMPLE_VERIFICATION_FIELDS.units,
          userDecimal: "1.650",
          fairDecimal: EXAMPLE_VERIFICATION_FIELDS.fairDecimal,
          kickoffUtc: EXAMPLE_VERIFICATION_FIELDS.kickoffUtc,
          sealedAtUtc: EXAMPLE_VERIFICATION_FIELDS.sealedAtUtc,
        },
        sha256: EXAMPLE_VERIFICATION_EXPECTED_SHA256,
      },
      null,
      2,
    );
    setMode("json");
    setRawReceipt(tamperedJson);
    setExpectedHashInput(EXAMPLE_VERIFICATION_EXPECTED_SHA256);
    setLastAutoHash(EXAMPLE_VERIFICATION_EXPECTED_SHA256);
    setTouchedReceipt(false);
    setTouchedHash(false);
    void runVerification(
      "json",
      tamperedJson,
      EXAMPLE_VERIFICATION_EXPECTED_SHA256,
      EXAMPLE_VERIFICATION_FIELDS,
    );
  };

  const handleClear = (): void => {
    setRawReceipt("");
    setExpectedHashInput("");
    setLastAutoHash(null);
    setTouchedReceipt(false);
    setTouchedHash(false);
    setRuntimeError(null);
    setOutcome(null);
    setCopiedHash(false);
  };

  const handleRawReceiptChange = (nextRaw: string): void => {
    setRawReceipt(nextRaw);
    const extracted = extractReceiptInput(nextRaw);
    const currentHash = expectedHashInput.trim().toLowerCase();
    if (
      extracted.embeddedHash &&
      (currentHash.length === 0 || (lastAutoHash !== null && currentHash === lastAutoHash))
    ) {
      setExpectedHashInput(extracted.embeddedHash);
      setLastAutoHash(extracted.embeddedHash);
    } else if (
      !extracted.embeddedHash &&
      lastAutoHash !== null &&
      currentHash === lastAutoHash
    ) {
      setExpectedHashInput("");
      setLastAutoHash(null);
    }
  };

  const handleCopyComputed = async (): Promise<void> => {
    if (!outcome?.computedHash || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(outcome.computedHash);
      setCopiedHash(true);
    } catch (err) {
      void err;
    }
  };

  const updateField = (key: keyof ReceiptStructuredFields, value: string): void => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const receiptId = `${baseId}-receipt`;
  const receiptHintId = `${baseId}-receipt-hint`;
  const receiptErrorId = `${baseId}-receipt-err`;
  const hashId = `${baseId}-hash`;
  const hashHintId = `${baseId}-hash-hint`;
  const hashErrorId = `${baseId}-hash-err`;

  return (
    <div className={className ? `pl-ver-grid ${className}` : "pl-ver-grid"} data-verification-surface="">
      <EditorialCard title={title} meta="WebCrypto SHA-256 · 100 % local">
        <div className="pl-ed-stack">
          <p className="pl-ed-subcopy">
            Calcula la huella criptográfica <strong>SHA-256</strong> directamente en tu navegador
            sin enviar ningún dato al servidor. Si cambia una sola letra, cifra o segundo en el
            recibo, la huella deja de coincidir.
          </p>

          <div className="pl-ed-head-row">
            <EditorialTabs
              items={VERIFIER_MODE_TABS}
              value={mode}
              onChange={(next) => {
                setMode(next === "fields" ? "fields" : "json");
                setRuntimeError(null);
              }}
              variant="segmented"
              ariaLabel="Formato de entrada del recibo"
            />

            <div className="pl-ed-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLoadValidExample}
                data-ver-example-valid=""
              >
                Cargar ejemplo válido
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadTamperedExample}
                data-ver-example-tampered=""
              >
                Probar recibo alterado
              </Button>
            </div>
          </div>

          <form
            className="pl-ver-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void runVerification(mode, rawReceipt, expectedHashInput, fields);
            }}
          >
            {mode === "json" ? (
              <div className="pl-ver-field">
                <label htmlFor={receiptId} className="pl-ver-label">
                  Recibo JSON, tupla canónica o recibo de perfil
                </label>
                <p id={receiptHintId} className="pl-ver-hint">
                  Pega un recibo JSON (pitchlab-receipt-v1 o pitchlab-profile-receipt-v1 copiado
                  desde un perfil público) o texto plano con pie SHA-256. El cálculo corre solo en
                  memoria local.
                </p>
                <textarea
                  ref={receiptInputRef}
                  id={receiptId}
                  className="pl-ver-textarea"
                  value={rawReceipt}
                  required
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder='{"payload": {"version": "pitchlab-profile-receipt-v1", "handle": "usuario", ...}, "sha256": "..."}'
                  aria-invalid={showReceiptError ? "true" : "false"}
                  aria-describedby={
                    showReceiptError ? `${receiptHintId} ${receiptErrorId}` : receiptHintId
                  }
                  onFocus={() => {
                    submitPointerDownRef.current = false;
                  }}
                  onBlur={() => {
                    if (submitPointerDownRef.current) {
                      submitPointerDownRef.current = false;
                      return;
                    }
                    setTouchedReceipt(true);
                  }}
                  onChange={(event) => handleRawReceiptChange(event.target.value)}
                  data-ver-json-input=""
                />
                {showReceiptError ? (
                  <p id={receiptErrorId} role="alert" className="pl-ver-error">
                    Error: ingresa el contenido del recibo JSON o carga el ejemplo válido.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="pl-ver-fields-grid">
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-league`} className="pl-ver-label">
                    Liga
                  </label>
                  <input
                    id={`${baseId}-league`}
                    type="text"
                    className="pl-ver-input"
                    value={fields.league}
                    onChange={(e) => updateField("league", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-match`} className="pl-ver-label">
                    Partido
                  </label>
                  <input
                    id={`${baseId}-match`}
                    type="text"
                    className="pl-ver-input"
                    value={fields.match}
                    onChange={(e) => updateField("match", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-pick`} className="pl-ver-label">
                    Selección registrada
                  </label>
                  <input
                    id={`${baseId}-pick`}
                    type="text"
                    className="pl-ver-input"
                    value={fields.pick}
                    onChange={(e) => updateField("pick", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-units`} className="pl-ver-label">
                    Unidades (u)
                  </label>
                  <input
                    id={`${baseId}-units`}
                    type="text"
                    inputMode="decimal"
                    className="pl-ver-input num"
                    value={fields.units}
                    onChange={(e) => updateField("units", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-user-dec`} className="pl-ver-label">
                    Momio registrado (decimal)
                  </label>
                  <input
                    id={`${baseId}-user-dec`}
                    type="text"
                    inputMode="decimal"
                    className="pl-ver-input num"
                    value={fields.userDecimal}
                    onChange={(e) => updateField("userDecimal", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-fair-dec`} className="pl-ver-label">
                    Momio justo PitchLab (decimal)
                  </label>
                  <input
                    id={`${baseId}-fair-dec`}
                    type="text"
                    inputMode="decimal"
                    className="pl-ver-input num"
                    value={fields.fairDecimal}
                    onChange={(e) => updateField("fairDecimal", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-ko`} className="pl-ver-label">
                    Inicio oficial (ISO UTC)
                  </label>
                  <input
                    id={`${baseId}-ko`}
                    type="text"
                    className="pl-ver-input num"
                    value={fields.kickoffUtc}
                    onChange={(e) => updateField("kickoffUtc", e.target.value)}
                  />
                </div>
                <div className="pl-ver-field">
                  <label htmlFor={`${baseId}-sealed`} className="pl-ver-label">
                    Marca de registro previo (ISO UTC)
                  </label>
                  <input
                    id={`${baseId}-sealed`}
                    type="text"
                    className="pl-ver-input num"
                    value={fields.sealedAtUtc}
                    onChange={(e) => updateField("sealedAtUtc", e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="pl-ver-field">
              <label htmlFor={hashId} className="pl-ver-label">
                Huella SHA-256 esperada (opcional si viene dentro del JSON)
              </label>
              <p id={hashHintId} className="pl-ver-hint">
                Formato: 64 caracteres hexadecimales (0–9, a–f). Si queda vacío, solo calculamos la
                huella local.
              </p>
              <input
                ref={hashInputRef}
                id={hashId}
                type="text"
                className="pl-ver-input num"
                value={expectedHashInput}
                pattern="^[0-9a-fA-F]{64}$"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="7475e69602889d069734413f9aeb83cac80fa7fa2185d2778867dda121faa18f"
                aria-invalid={showHashError ? "true" : "false"}
                aria-describedby={showHashError ? `${hashHintId} ${hashErrorId}` : hashHintId}
                onFocus={() => {
                  submitPointerDownRef.current = false;
                }}
                onBlur={() => {
                  if (submitPointerDownRef.current) {
                    submitPointerDownRef.current = false;
                    return;
                  }
                  setTouchedHash(true);
                }}
                onChange={(event) => setExpectedHashInput(event.target.value)}
                data-ver-hash-input=""
              />
              {showHashError ? (
                <p id={hashErrorId} role="alert" className="pl-ver-error">
                  Error: escribe exactamente 64 caracteres hexadecimales (0–9 y a–f).
                </p>
              ) : null}
            </div>

            {runtimeError ? (
              <p role="alert" className="pl-ver-error">
                {runtimeError}
              </p>
            ) : null}

            <div className="pl-ed-actions">
              <Button
                type="submit"
                variant="primary"
                disabled={busy}
                data-ver-submit=""
                onPointerDown={() => {
                  submitPointerDownRef.current = true;
                }}
                onMouseDown={() => {
                  submitPointerDownRef.current = true;
                }}
                onPointerCancel={() => {
                  submitPointerDownRef.current = false;
                }}
                onClick={() => {
                  submitPointerDownRef.current = false;
                }}
              >
                <MaestroIcon name="shield" size={16} />
                <span>{busy ? "Calculando SHA-256…" : "Verificar huella SHA-256"}</span>
              </Button>
              <Button variant="ghost" onClick={handleClear} disabled={busy}>
                Limpiar
              </Button>
            </div>
          </form>

          <div role="status" aria-live="polite" data-ver-outcome={outcome?.status ?? "idle"}>
            {outcome ? (
              <div className={`pl-ver-result is-${outcome.status}`}>
                <div className="pl-ver-result-head">
                  <p className="pl-ver-result-title">
                    {outcome.status === "match"
                      ? "Coincidencia criptográfica verificada"
                      : outcome.status === "mismatch"
                        ? "La huella SHA-256 no coincide"
                        : "Huella SHA-256 calculada localmente"}
                  </p>
                  <span
                    className={`pl-ed-badge ${
                      outcome.status === "match"
                        ? "pl-ed-badge--ok"
                        : outcome.status === "mismatch"
                          ? "pl-ed-badge--miss"
                          : "pl-ed-badge--info"
                    }`}
                  >
                    {outcome.status === "match"
                      ? "Íntegro"
                      : outcome.status === "mismatch"
                        ? "Alterado"
                        : "Calculado"}
                  </span>
                </div>

                <p className="pl-ed-subcopy">
                  {outcome.status === "match"
                    ? "El contenido del recibo genera exactamente la misma huella SHA-256 esperada. No presenta alteraciones."
                    : outcome.status === "mismatch"
                      ? "Al menos un campo, cifra o espacio del recibo difiere respecto a la huella esperada."
                      : "Compara esta huella local contra el recibo publicado antes del partido."}
                </p>

                {outcome.preKickoffStatus !== "unknown" ? (
                  <p className="pl-ed-muted num">
                    {outcome.preKickoffStatus === "valid"
                      ? "Integridad horaria: marca de registro anterior al inicio oficial del partido."
                      : "Advertencia horaria: la marca de registro es igual o posterior al inicio oficial."}
                  </p>
                ) : null}

                <div className="pl-ver-hash-box">
                  <span className="pl-ed-muted">Huella calculada ({outcome.formatLabel})</span>
                  <code className="pl-ver-mono num" data-ver-computed-hash="">
                    {outcome.computedHash}
                  </code>
                  {outcome.expectedHash ? (
                    <>
                      <span className="pl-ed-muted">Huella esperada</span>
                      <code className="pl-ver-mono num">{outcome.expectedHash}</code>
                    </>
                  ) : null}
                  <div className="pl-ed-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleCopyComputed()}
                    >
                      <MaestroIcon name={copiedHash ? "check" : "copy"} size={14} />
                      <span>{copiedHash ? "Huella copiada" : "Copiar huella"}</span>
                    </Button>
                  </div>
                </div>

                <details>
                  <summary className="pl-ver-summary">
                    Ver cadena canónica exacta usada para el cálculo SHA-256
                  </summary>
                  <div className="pl-ver-hash-box" style={{ marginTop: 8 }}>
                    <code className="pl-ver-mono">{outcome.canonicalPayload}</code>
                  </div>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      </EditorialCard>

      <EditorialCard title="Cómo funciona el registro previo inmutable" meta="Sin servidor externo">
        <div className="pl-ed-stack">
          <ol className="pl-ver-steps">
            <li className="pl-ver-step">
              <span className="pl-ver-step-num num" aria-hidden="true">
                1
              </span>
              <div>
                <h3 className="pl-ed-h3">Registro antes del inicio</h3>
                <p className="pl-ed-muted">
                  Cada pick y parlay se bloquea con la hora oficial de inicio. La base de datos
                  rechaza cualquier registro con marca igual o posterior al silbatazo.
                </p>
              </div>
            </li>
            <li className="pl-ver-step">
              <span className="pl-ver-step-num num" aria-hidden="true">
                2
              </span>
              <div>
                <h3 className="pl-ed-h3">Inmutabilidad en base de datos</h3>
                <p className="pl-ed-muted">
                  Un disparador impide borrar boletos cerrados o alterar la selección, el momio y
                  las unidades después del partido. Lo que no se cumplió permanece visible.
                </p>
              </div>
            </li>
            <li className="pl-ver-step">
              <span className="pl-ver-step-num num" aria-hidden="true">
                3
              </span>
              <div>
                <h3 className="pl-ed-h3">Comprobación privada en tu navegador</h3>
                <p className="pl-ed-muted">
                  Esta herramienta ejecuta la API nativa WebCrypto de tu dispositivo. Tus recibos y
                  notas nunca viajan por red ni se almacenan aquí.
                </p>
              </div>
            </li>
          </ol>

          <div className="pl-ed-actions">
            <a href="/resultados" className="pl-ed-link-btn">
              Ver historial de resultados
            </a>
            <a href="/motores" className="pl-ed-link-btn">
              Cómo calculamos
            </a>
          </div>
        </div>
      </EditorialCard>
    </div>
  );
}

const RESULTS_PAGE_SIZE = 20;

const OUTCOME_FILTER_TABS: readonly EditorialTabItem[] = [
  { id: "all", label: "Todos" },
  { id: "hit", label: "Cumplidos" },
  { id: "miss", label: "No cumplidos" },
];

const VIEW_MODE_TABS: readonly EditorialTabItem[] = [
  { id: "list", label: "Lista" },
  { id: "calendar", label: "Calendario" },
];

function formatScoreShort(item: LandingFinishedResultItem): string {
  if (item.score) {
    return `${item.score.home}\u2013${item.score.away}`;
  }
  return item.scoreLabel;
}

const RESULTS_TABLE_COLUMNS: readonly EditorialTableColumn<LandingFinishedResultItem>[] = [
  {
    key: "match",
    header: "Partido",
    sticky: true,
    render: (item) => (
      <div className="pl-ed-match-cell">
        <span className="pl-ed-match-meta num">
          <LeagueBadge league={item.league} size={15} />
          <span>{item.metaLabel}</span>
        </span>
        <span className="pl-ed-match-teams">
          <TeamBadge
            league={item.league}
            slug={item.home.slug}
            name={item.home.name}
            size={18}
            decorative
          />
          <span>
            {item.home.name} vs {item.away.name}
          </span>
          <TeamBadge
            league={item.league}
            slug={item.away.slug}
            name={item.away.name}
            size={18}
            decorative
          />
        </span>
      </div>
    ),
  },
  {
    key: "pick",
    header: "Pick publicado",
    render: (item) => (
      <div className="pl-ed-pick-cell">
        <span className="pl-ed-pick-label">{item.pickLabel}</span>
        <span className="pl-ed-pick-meta">Publicado antes del partido</span>
      </div>
    ),
  },
  {
    key: "prob",
    header: "Prob. · Justo",
    numeric: true,
    align: "end",
    render: (item) => (
      <EditorialValueCell probPct={item.p * 100} fairLabel={item.fairAmerican} />
    ),
  },
  {
    key: "score",
    header: "Marcador",
    numeric: true,
    align: "end",
    render: (item) => <span className="pl-ed-score-val num">{formatScoreShort(item)}</span>,
  },
  {
    key: "status",
    header: "Estado",
    align: "end",
    render: (item) => (
      <span className={`pl-ed-badge ${item.hit ? "pl-ed-badge--ok" : "pl-ed-badge--miss"}`}>
        <MaestroIcon name={item.hit ? "check" : "x"} size={12} />
        <span>{item.hit ? "Se cumplió" : "No se cumplió"}</span>
      </span>
    ),
  },
];

export function ResultadosEditorialBoard({
  results,
}: {
  readonly results: readonly LandingFinishedResultItem[];
}): React.JSX.Element {
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "hit" | "miss">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState<number>(RESULTS_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  const leagues = useMemo(() => {
    const map = new Map<
      string,
      { league: LandingFinishedResultItem["league"]; label: string; count: number }
    >();
    for (const item of results) {
      const existing = map.get(item.league);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.league, { league: item.league, label: item.leagueLabel, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [results]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((item) => {
      if (selectedLeague !== "all" && item.league !== selectedLeague) return false;
      if (outcomeFilter === "hit" && !item.hit) return false;
      if (outcomeFilter === "miss" && item.hit) return false;
      if (q.length > 0) {
        const hay =
          `${item.leagueLabel} ${item.home.name} ${item.away.name} ${item.pickLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [outcomeFilter, results, searchQuery, selectedLeague]);

  const hitsCount = useMemo(() => filtered.filter((item) => item.hit).length, [filtered]);
  const missesCount = filtered.length - hitsCount;
  const visibleItems = filtered.slice(0, visibleCount);
  const remainingCount = Math.max(0, filtered.length - visibleItems.length);
  const hasCalendarDates = filtered.some((item) => Boolean(item.kickoffUtc));

  const buildPublicCalendar = useCallback(
    (ym: string) =>
      buildModelDailyCalendar(
        filtered
          .filter((item) => Boolean(item.kickoffUtc))
          .map((item) => ({
            id: item.id,
            kickoffUtc: item.kickoffUtc ?? "",
            label: item.scoreLabel,
            subtitle: `${item.leagueLabel} · ${item.pickLabel}`,
            hit: item.hit,
          })),
        ym || undefined,
      ),
    [filtered],
  );

  const selectLeague = (league: string): void => {
    setSelectedLeague(league);
    setVisibleCount(RESULTS_PAGE_SIZE);
  };

  const resetFilters = (): void => {
    setSelectedLeague("all");
    setOutcomeFilter("all");
    setSearchQuery("");
    setVisibleCount(RESULTS_PAGE_SIZE);
  };

  return (
    <div className="pl-ed-results-board" data-public-results-board="">
      {leagues.length > 0 ? (
        <div
          role="group"
          aria-label="Filtrar resultados por liga"
          className="pl-ed-league-strip"
        >
          <button
            type="button"
            className="pl-ed-league-btn num"
            aria-pressed={selectedLeague === "all"}
            onClick={() => selectLeague("all")}
          >
            Todas ({results.length})
          </button>
          {leagues.map((lg) => (
            <button
              key={lg.league}
              type="button"
              className="pl-ed-league-btn num"
              aria-pressed={selectedLeague === lg.league}
              onClick={() => selectLeague(lg.league)}
            >
              <LeagueBadge league={lg.league} size={16} />
              <span>
                {lg.label} ({lg.count})
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <EditorialFilterBar
        searchValue={searchQuery}
        onSearchChange={(next) => {
          setSearchQuery(next);
          setVisibleCount(RESULTS_PAGE_SIZE);
        }}
        searchPlaceholder="Buscar equipo, liga o pick…"
        resultCount={filtered.length}
        trailing={
          hasCalendarDates ? (
            <div data-public-results-view-toggle="">
              <EditorialTabs
                items={VIEW_MODE_TABS}
                value={viewMode}
                onChange={(next) => setViewMode(next === "calendar" ? "calendar" : "list")}
                variant="segmented"
                ariaLabel="Modo de vista de resultados"
              />
            </div>
          ) : undefined
        }
      >
        <EditorialTabs
          items={OUTCOME_FILTER_TABS}
          value={outcomeFilter}
          onChange={(next) => {
            setOutcomeFilter(next === "hit" ? "hit" : next === "miss" ? "miss" : "all");
            setVisibleCount(RESULTS_PAGE_SIZE);
          }}
          variant="segmented"
          ariaLabel="Filtrar por calificación final"
        />
      </EditorialFilterBar>

      {viewMode === "calendar" && hasCalendarDates ? (
        <EditorialCard
          title="Calendario diario de partidos FT"
          meta={`${hitsCount} cumplidos · ${missesCount} no cumplidos`}
        >
          <DailyResultsCalendar buildMonth={buildPublicCalendar} mode="model" />
        </EditorialCard>
      ) : (
        <div className="pl-ed-table-stack">
          <EditorialCard
            title="Registro público de partidos finalizados (FT)"
            meta={`${hitsCount} cumplidos · ${missesCount} no cumplidos`}
          >
            {filtered.length === 0 ? (
              <EditorialEmptyState
                title="Sin resultados para este filtro"
                description="Ajusta la liga, el texto de búsqueda o vuelve a mostrar todos los resultados publicados."
                actionLabel={
                  selectedLeague !== "all" || outcomeFilter !== "all" || searchQuery.length > 0
                    ? "Limpiar filtros"
                    : undefined
                }
                onAction={
                  selectedLeague !== "all" || outcomeFilter !== "all" || searchQuery.length > 0
                    ? resetFilters
                    : undefined
                }
              />
            ) : (
              <>
                <EditorialTable
                  caption="Partidos finalizados calificados públicamente sin omitir fallos"
                  columns={RESULTS_TABLE_COLUMNS}
                  rows={visibleItems}
                  rowKey={(item) => item.id}
                />
                <div className="pl-ed-table-foot">
                  <p className="pl-ed-muted num">
                    Mostrando {visibleItems.length} de {filtered.length} · Publicado antes del
                    partido · {hitsCount} cumplidos · {missesCount} no cumplidos
                  </p>
                  {remainingCount > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setVisibleCount((prev) => prev + RESULTS_PAGE_SIZE)}
                    >
                      Mostrar más partidos ({remainingCount} restantes)
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </EditorialCard>
        </div>
      )}
    </div>
  );
}
