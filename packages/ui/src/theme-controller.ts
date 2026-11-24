import { LIGHT_THEME_TOKENS, STAGE_DARK_TOKENS } from "@pitchlab/tokens";

export type PitchLabThemeMode = "dark" | "light" | "system";
export type ResolvedPitchLabTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "pl-theme";
export const THEME_UPDATED_AT_KEY = "pl-theme-updated-at";
export const THEME_PREFS_MIRROR_KEY = "pl-prefs-v1";
export const THEME_CHANGE_EVENT = "pl-theme-change";

const LIGHT_MEDIA_QUERY = "(prefers-color-scheme: light)";

export function isPitchLabThemeMode(value: unknown): value is PitchLabThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

export function getSystemPreferredTheme(): ResolvedPitchLabTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia(LIGHT_MEDIA_QUERY).matches ? "light" : "dark";
}

export function resolveEffectiveTheme(mode: PitchLabThemeMode): ResolvedPitchLabTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return getSystemPreferredTheme();
}

export function readStoredThemeUpdatedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(THEME_UPDATED_AT_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (err) {
    void err;
    return 0;
  }
}

export function readStoredThemeMode(): PitchLabThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  try {
    const direct = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isPitchLabThemeMode(direct)) {
      return direct;
    }
    const rawPrefs = window.localStorage.getItem(THEME_PREFS_MIRROR_KEY);
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs) as { themeMode?: unknown } | null;
      if (parsed && typeof parsed === "object" && isPitchLabThemeMode(parsed.themeMode)) {
        return parsed.themeMode;
      }
    }
  } catch (err) {
    void err;
  }
  if (typeof document !== "undefined") {
    const attrMode = document.documentElement.dataset.themeMode;
    if (isPitchLabThemeMode(attrMode)) {
      return attrMode;
    }
    if (document.documentElement.dataset.theme === "light") {
      return "light";
    }
  }
  return "dark";
}

export function hasExplicitLocalThemePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const direct = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPitchLabThemeMode(direct);
  } catch (err) {
    void err;
    return false;
  }
}

export function shouldHydrateServerThemeMode(serverUpdatedAtIso: string | null | undefined): boolean {
  if (!hasExplicitLocalThemePreference()) {
    return true;
  }
  if (!serverUpdatedAtIso) {
    return false;
  }
  const serverMs = Date.parse(serverUpdatedAtIso);
  if (!Number.isFinite(serverMs)) {
    return false;
  }
  const localUpdatedAt = readStoredThemeUpdatedAt();
  if (localUpdatedAt === 0) {
    return false;
  }
  return serverMs > localUpdatedAt;
}

function mirrorThemeToStoredPrefs(mode: PitchLabThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(THEME_PREFS_MIRROR_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    if (parsed.themeMode === mode) return;
    window.localStorage.setItem(THEME_PREFS_MIRROR_KEY, JSON.stringify({ ...parsed, themeMode: mode }));
  } catch (err) {
    void err;
  }
}

function syncThemeToServer(mode: PitchLabThemeMode): void {
  if (typeof fetch !== "function") return;
  void fetch("/api/me/preferences", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ themeMode: mode }),
  }).catch((err: unknown) => {
    void err;
  });
}

export function applyThemeMode(
  mode: PitchLabThemeMode,
  options: {
    readonly persistStorage?: boolean;
    readonly syncServer?: boolean;
    readonly recordTimestamp?: boolean;
  } = {},
): ResolvedPitchLabTheme {
  const { persistStorage = true, syncServer = false, recordTimestamp = persistStorage } = options;
  const resolved = resolveEffectiveTheme(mode);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const currentResolved: ResolvedPitchLabTheme = root.dataset.theme === "light" ? "light" : "dark";
    if (currentResolved !== resolved) {
      root.dataset.themeSwitching = "true";
      root.dataset.theme = resolved;
      void root.offsetHeight;
      delete root.dataset.themeSwitching;
    } else {
      root.dataset.theme = resolved;
    }
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolved;

    const colorSchemeMeta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (colorSchemeMeta) {
      colorSchemeMeta.content = mode === "system" ? "dark light" : resolved;
    }

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      themeColorMeta.content =
        resolved === "light"
          ? LIGHT_THEME_TOKENS["--background-elevated"]
          : STAGE_DARK_TOKENS["--pl-glass-nav"];
    }
  }

  if (persistStorage && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      if (recordTimestamp) {
        window.localStorage.setItem(THEME_UPDATED_AT_KEY, String(Date.now()));
      }
    } catch (err) {
      void err;
    }
    mirrorThemeToStoredPrefs(mode);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { mode, resolved } }),
    );
  }

  if (syncServer) {
    syncThemeToServer(mode);
  }

  return resolved;
}

export function subscribeThemeRuntime(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const syncFromStorage = () => {
    const mode = readStoredThemeMode();
    applyThemeMode(mode, { persistStorage: false, recordTimestamp: false });
  };

  syncFromStorage();

  const mq = typeof window.matchMedia === "function" ? window.matchMedia(LIGHT_MEDIA_QUERY) : null;
  const onMediaChange = () => {
    if (readStoredThemeMode() === "system") {
      applyThemeMode("system", { persistStorage: false, recordTimestamp: false });
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === THEME_STORAGE_KEY ||
      event.key === THEME_PREFS_MIRROR_KEY
    ) {
      syncFromStorage();
    }
  };

  mq?.addEventListener?.("change", onMediaChange);
  window.addEventListener("storage", onStorage);

  return () => {
    mq?.removeEventListener?.("change", onMediaChange);
    window.removeEventListener("storage", onStorage);
  };
}
