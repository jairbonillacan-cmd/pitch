"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function isStateUpdater<T>(
  next: T | ((prev: T) => T),
): next is (prev: T) => T {
  return typeof next === "function";
}

function decodeStoredValue<T>(
  raw: string,
  initialValue: T,
  parse?: (raw: unknown) => T | null,
): T | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parse) {
      return parse(parsed);
    }
    if (parsed === null || parsed === undefined) {
      return null;
    }
    if (typeof initialValue === "string" && typeof parsed === "string") {
      return parsed as T;
    }
    if (
      typeof initialValue === "number" &&
      typeof parsed === "number" &&
      Number.isFinite(parsed)
    ) {
      return parsed as T;
    }
    if (typeof initialValue === "boolean" && typeof parsed === "boolean") {
      return parsed as T;
    }
    if (Array.isArray(initialValue) && Array.isArray(parsed)) {
      return parsed as T;
    }
    if (
      typeof initialValue === "object" &&
      initialValue !== null &&
      !Array.isArray(initialValue) &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as T;
    }
    return null;
  } catch (err) {
    void err;
    return null;
  }
}

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  parse?: (raw: unknown) => T | null,
): readonly [T, (next: T | ((prev: T) => T)) => void] {
  const initialRef = useRef<T>(initialValue);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readFromStorage = () => {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored === null) return;
        const decoded = decodeStoredValue(stored, initialRef.current, parseRef.current);
        if (decoded !== null) {
          setValue(decoded);
        }
      } catch (err) {
        void err;
      }
    };

    readFromStorage();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        setValue(initialRef.current);
        return;
      }
      const decoded = decodeStoredValue(
        event.newValue,
        initialRef.current,
        parseRef.current,
      );
      if (decoded !== null) {
        setValue(decoded);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [key]);

  const setStoredValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = isStateUpdater(next) ? next(prev) : next;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch (err) {
            void err;
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setStoredValue] as const;
}
