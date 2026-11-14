"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Mismas reglas de formato que checkHandleFormat en @pitchlab/db. */
export const SIGNUP_HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

/** Misma lista reservada que RESERVED_HANDLES en @pitchlab/db (sin importar servidor). */
const SIGNUP_RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin", "administrador", "api", "app", "ayuda", "cuenta", "entrar", "help", "login",
  "me", "mod", "moderador", "null", "pitchlab", "pitch_lab", "precio", "registro", "root",
  "signup", "soporte", "staff", "support", "system", "tipstar", "tipster", "undefined", "yo",
  "andres_l", "carlos_quant", "diego_tactico", "jair_founder", "luis_f", "mariana_t",
  "paola_c", "rodrigo_p", "socio_pl", "sofia_nfl", "valeria_g",
]);

export function normalizeSignupHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function addLocalCandidate(list: string[], seen: Set<string>, raw: string): void {
  const clean = raw
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/_+$/, "")
    .slice(0, 20);
  if (!clean || seen.has(clean)) return;
  if (!SIGNUP_HANDLE_PATTERN.test(clean) || SIGNUP_RESERVED_HANDLES.has(clean)) return;
  seen.add(clean);
  list.push(clean);
}

/**
 * Sugerencias locales para vista previa o modo sin cuentas (mismas reglas de formato,
 * sin comprobar disponibilidad contra base de datos).
 */
export function buildLocalHandleSuggestions(bases: readonly string[], count = 3): string[] {
  const target = Math.max(0, Math.min(10, Math.floor(count)));
  if (target === 0) return [];
  const primary: string[] = [];
  const seen = new Set<string>();
  const fallbackStems: string[] = [];

  for (const rawBase of bases) {
    const trimmed = rawBase.trim();
    if (!trimmed) continue;
    const local = trimmed.includes("@") ? (trimmed.split("@")[0] ?? "").split("+")[0] ?? "" : trimmed;
    const ascii = local.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const tokens = ascii
      .split(/[^a-z0-9]+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const first = tokens[0] ?? "";
    const last = tokens[tokens.length - 1] ?? "";
    const letterFirst = first.replace(/^[^a-z]+/, "");
    const letterLast = last.replace(/^[^a-z]+/, "");

    if (tokens.length >= 2 && letterFirst.length > 0 && letterLast.length > 0) {
      addLocalCandidate(primary, seen, `${letterFirst}_${letterLast}`);
      if (letterFirst.length >= 3) addLocalCandidate(primary, seen, letterFirst);
      addLocalCandidate(primary, seen, `${letterFirst[0]}_${letterLast}`);
      addLocalCandidate(primary, seen, `${letterFirst}${letterLast}`);
      addLocalCandidate(primary, seen, `${letterFirst[0]}${letterLast}`);
      addLocalCandidate(primary, seen, `${letterFirst}_${letterLast[0]}`);
    } else if (tokens.length === 1) {
      if (letterFirst.length >= 3) {
        addLocalCandidate(primary, seen, letterFirst);
      } else {
        fallbackStems.push(`socio${tokens[0] ?? ""}`);
      }
    } else {
      const joined = tokens.join("_").replace(/^[^a-z]+/, "");
      fallbackStems.push(joined.length >= 3 ? joined : `socio${tokens.join("")}`);
    }
    if (primary.length >= target * 4) break;
  }

  if (primary.length === 0) {
    for (const stem of fallbackStems) {
      if (primary.length >= target * 4) break;
      addLocalCandidate(primary, seen, stem);
    }
  }
  if (primary.length === 0) {
    addLocalCandidate(primary, seen, "socio");
  }

  const result = [...primary];
  const suffixBases = primary.slice(0, 4);
  for (let num = 2; num <= 25 && result.length < target; num += 1) {
    const suffix = String(num);
    for (const stem of suffixBases) {
      if (result.length >= target) break;
      const head = stem.slice(0, 20 - suffix.length).replace(/_+$/, "");
      addLocalCandidate(result, seen, `${head}${suffix}`);
    }
  }

  return result.slice(0, target);
}

/**
 * Extrae una pista segura para `?name=` sin poner `@dominio` ni correos completos en la URL.
 */
export function handleSuggestionQueryFromBases(displayName: string, email: string): string {
  const cleanName = displayName.trim();
  if (cleanName) return cleanName.slice(0, 60);
  const trimmedEmail = email.trim();
  if (!trimmedEmail.includes("@")) return "";
  const local = (trimmedEmail.split("@")[0] ?? "").split("+")[0] ?? "";
  return local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export type HandleStatus = "idle" | "checking" | "free" | "taken" | "reserved" | "invalid";

export function useHandleAvailability(raw: string, accountsEnabled: boolean, ownHandle?: string): HandleStatus {
  const handle = normalizeSignupHandle(raw);
  const valid = SIGNUP_HANDLE_PATTERN.test(handle);
  const needsLookup = accountsEnabled && valid && handle !== ownHandle;
  const [result, setResult] = useState<{ handle: string; status: HandleStatus } | null>(null);

  useEffect(() => {
    if (!needsLookup) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      let status: HandleStatus = "idle";
      try {
        const response = await fetch("/api/handles/check?h=" + encodeURIComponent(handle), {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { ok: boolean; reason?: string };
          status = data.ok ? "free" : data.reason === "reservado" ? "reserved" :
            data.reason === "ocupado" ? "taken" : "invalid";
        }
      } catch {
        // The server will validate the handle again on submit.
      }
      if (!controller.signal.aborted) setResult({ handle, status });
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [handle, needsLookup]);

  if (!handle) return "idle";
  if (!valid) return "invalid";
  if (!needsLookup) return "free";
  return result?.handle === handle ? result.status : "checking";
}

export interface HandleSuggestionsState {
  suggestions: string[];
  verified: boolean;
  loading: boolean;
  error: boolean;
}

export function useHandleSuggestions({
  name,
  email,
  accountsEnabled,
  enabled,
}: {
  name: string;
  email: string;
  accountsEnabled: boolean;
  enabled: boolean;
}): HandleSuggestionsState {
  const localSuggestions = useMemo(
    () => buildLocalHandleSuggestions([name, email], 3),
    [name, email],
  );
  const queryName = useMemo(
    () => handleSuggestionQueryFromBases(name, email),
    [name, email],
  );
  const hasFetchedRef = useRef(false);
  const [serverState, setServerState] = useState<{
    queryKey: string;
    suggestions: string[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !accountsEnabled) return;
    const controller = new AbortController();
    const delayMs = hasFetchedRef.current ? 380 : 100;
    const timer = window.setTimeout(async () => {
      try {
        const url = queryName
          ? `/api/handles/suggest?name=${encodeURIComponent(queryName)}`
          : "/api/handles/suggest";
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) {
            hasFetchedRef.current = true;
            setServerState({ queryKey: queryName, suggestions: [], failed: true });
          }
          return;
        }
        const data = (await response.json()) as { suggestions?: unknown };
        const clean = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter((item): item is string => typeof item === "string" && SIGNUP_HANDLE_PATTERN.test(item))
              .slice(0, 3)
          : [];
        if (!controller.signal.aborted) {
          hasFetchedRef.current = true;
          setServerState({ queryKey: queryName, suggestions: clean, failed: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          hasFetchedRef.current = true;
          setServerState({ queryKey: queryName, suggestions: [], failed: true });
        }
      }
    }, delayMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountsEnabled, enabled, queryName]);

  if (!enabled) {
    return { suggestions: [], verified: false, loading: false, error: false };
  }
  if (!accountsEnabled) {
    return { suggestions: localSuggestions, verified: false, loading: false, error: false };
  }
  if (serverState?.queryKey === queryName) {
    if (serverState.failed) {
      return { suggestions: localSuggestions, verified: false, loading: false, error: true };
    }
    return { suggestions: serverState.suggestions, verified: true, loading: false, error: false };
  }
  // Mientras llega la consulta nueva, conservamos las sugerencias previas si ya había unas libres.
  if (serverState && !serverState.failed && serverState.suggestions.length > 0) {
    return { suggestions: serverState.suggestions, verified: true, loading: true, error: false };
  }
  return { suggestions: [], verified: false, loading: true, error: false };
}
