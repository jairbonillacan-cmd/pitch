"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  containsExternalLink,
  journalRecord,
  redactDatasetForVisitor,
} from "./access-guard.js";

/** Claves de almacenamiento local (versión en el nombre para poder migrar). */
const STORAGE_KEYS = {
  journal: "pl-journal-v1",
  watchlist: "pl-watchlist-v1",
  ownPosts: "pl-own-posts-v1",
} as const;

function readStoredArray<T>(key: string, isItem: (v: unknown) => v is T): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch (err) {
    void err;
    return [];
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    void err;
  }
}

function isJournalEntry(v: unknown): v is JournalEntry {
  const e = v as Partial<JournalEntry> | null;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.pickId === "string" &&
    typeof e.units === "number" &&
    typeof e.userDecimal === "number" &&
    (e.status === "pending" || e.status === "won" || e.status === "lost")
  );
}

function isOwnSocialPost(v: unknown): v is SocialPost {
  const p = v as Partial<SocialPost> | null;
  return !!p && typeof p.id === "string" && typeof p.body === "string" && !p.isExample && Array.isArray(p.comments);
}

function formatClvBadge(avgClvPct: number | null): string {
  if (avgClvPct === null) return "CLV —";
  return `CLV ${avgClvPct >= 0 ? "+" : ""}${avgClvPct.toFixed(1)} %`;
}
import {
  buildSmartAutoParlay,
  checkParlayCompatibility,
  computeParlaySummary,
} from "./parlay-engine.js";
import { INITIAL_SOCIAL_POSTS } from "./spacetime-catalog.js";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  ParlayLeg,
  ParlaySummary,
  PlatformDataset,
  PlatformGame,
  RiskBand,
  SocialPost,
  ViewerRole,
} from "./types.js";

export interface ShareTicketPayload {
  kind: "pick" | "parlay" | "tipstar";
  title: string;
  subtitle: string;
  leagueLabel: string;
  pickLabel: string;
  probability: number;
  fairDecimal: number;
  marketDecimal: number;
  units: number;
  gameStatus: "NS" | "FT" | "LIVE";
  promoCode?: string;
  tipstarHandle?: string;
  originBadge?: string;
}

export interface ToastMessage {
  id: string;
  tone: "default" | "success" | "warning" | "danger";
  text: string;
}

export interface PinUnlockResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

export interface PlatformContextValue {
  rawDataset: PlatformDataset;
  dataset: PlatformDataset;
  viewerRole: ViewerRole;
  setViewerRole: (role: ViewerRole) => void;
  allowRoleSimulation: boolean;
  oddsFormat: OddsFormat;
  setOddsFormat: (fmt: OddsFormat) => void;
  auraColors: readonly [string, string];
  setAuraFromGame: (game: PlatformGame | undefined) => void;

  parlayLegs: ParlayLeg[];
  allowSgp: boolean;
  setAllowSgp: (v: boolean) => void;
  parlayStakeUnits: number;
  setParlayStakeUnits: (u: number) => void;
  parlaySummary: ParlaySummary;
  addPickToParlay: (pick: MatchPick) => boolean;
  removePickFromParlay: (pickId: string) => void;
  clearParlay: () => void;
  generateAutoParlay: (opts: {
    leagues: readonly LeagueId[];
    risk: RiskBand;
    legCount: number;
    allowSgp: boolean;
  }) => number;

  journal: JournalEntry[];
  sealPickToJournal: (
    pick: MatchPick,
    units: number,
    userDecimal: number,
    note?: string,
  ) => void;
  sealParlayToJournal: (note?: string) => void;
  exportJournalCsv: () => string;

  socialPosts: SocialPost[];
  publishSocialPost: (payload: {
    leagueLabel: string;
    matchLabel: string;
    pickBadge: string;
    originType: "Spacetime Suite" | "Bitácora Propia";
    body: string;
  }) => { ok: boolean; error?: string };
  addSocialComment: (postId: string, body: string) => { ok: boolean; error?: string };
  toggleSocialLike: (postId: string) => void;
  blockedSpamAttempts: number;

  watchlistGameIds: string[];
  toggleWatchlistGame: (gameId: string) => void;
  favoriteLeagues: LeagueId[];
  setFavoriteLeagues: (leagues: LeagueId[]) => void;
  riskPreference: RiskBand;
  setRiskPreference: (risk: RiskBand) => void;

  referralPaidFriends: number;
  simulateFriendFirstPayment: () => void;
  month1NoCardMode: boolean;
  setMonth1NoCardMode: (v: boolean) => void;
  tipstarWeeklyPickOrigin: "spacetime" | "bitacora";
  setTipstarWeeklyPickOrigin: (v: "spacetime" | "bitacora") => void;
  selectedTipstarPickId: string;
  setSelectedTipstarPickId: (id: string) => void;

  composerPick: MatchPick | null;
  openComposer: (pick: MatchPick) => void;
  closeComposer: () => void;

  shareTicket: ShareTicketPayload | null;
  openShareTicket: (payload: ShareTicketPayload) => void;
  closeShareTicket: () => void;

  alertsOpen: boolean;
  setAlertsOpen: (v: boolean) => void;
  cmdkOpen: boolean;
  setCmdkOpen: (v: boolean) => void;

  betaPinOpen: boolean;
  betaPinNextPath: string;
  openBetaPin: (nextPath?: string) => void;
  closeBetaPin: () => void;
  submitBetaPin: (code: string, nextOverride?: string) => Promise<PinUnlockResult>;
  logoutSession: () => Promise<void>;

  toasts: ToastMessage[];
  pushToast: (text: string, tone?: ToastMessage["tone"]) => void;
  navigateTo: (href: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({
  dataset: rawDataset,
  initialRole = "visitor",
  allowRoleSimulation = false,
  onNavigate,
  onSubmitPinOverride,
  onLogoutOverride,
  children,
}: {
  dataset: PlatformDataset;
  initialRole?: ViewerRole;
  allowRoleSimulation?: boolean;
  onNavigate?: (href: string) => void;
  onSubmitPinOverride?: (code: string, nextPath: string) => Promise<PinUnlockResult>;
  onLogoutOverride?: () => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [viewerRole, setViewerRoleState] = useState<ViewerRole>(initialRole);
  const [oddsFormat, setOddsFormatState] = useState<OddsFormat>("american");
  const [parlayLegs, setParlayLegs] = useState<ParlayLeg[]>([]);
  const [allowSgp, setAllowSgp] = useState<boolean>(false);
  const [parlayStakeUnits, setParlayStakeUnits] = useState<number>(1.0);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>(() => [
    ...INITIAL_SOCIAL_POSTS,
  ]);
  const [blockedSpamAttempts, setBlockedSpamAttempts] = useState<number>(0);
  const [watchlistGameIds, setWatchlistGameIds] = useState<string[]>([]);
  const [favoriteLeagues, setFavoriteLeaguesState] = useState<LeagueId[]>(() =>
    rawDataset.leagues.slice(0, 3).map((l) => l.league),
  );
  const [riskPreference, setRiskPreferenceState] = useState<RiskBand>("medio");
  const [referralPaidFriends, setReferralPaidFriends] = useState<number>(0);
  const [month1NoCardMode, setMonth1NoCardMode] = useState<boolean>(true);
  const [tipstarWeeklyPickOrigin, setTipstarWeeklyPickOrigin] = useState<
    "spacetime" | "bitacora"
  >("spacetime");
  const [selectedTipstarPickId, setSelectedTipstarPickId] = useState<string>(
    rawDataset.tipstarWeeklyPickId || rawDataset.dailyPromoPickId,
  );

  const [composerPick, setComposerPick] = useState<MatchPick | null>(null);
  const [shareTicket, setShareTicket] = useState<ShareTicketPayload | null>(null);
  const [alertsOpen, setAlertsOpen] = useState<boolean>(false);
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(false);
  const [betaPinOpen, setBetaPinOpen] = useState<boolean>(false);
  const [betaPinNextPath, setBetaPinNextPath] = useState<string>("/app");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const defaultGame = useMemo(
    () => rawDataset.games.find((g) => g.status !== "FT") ?? rawDataset.games[0],
    [rawDataset.games],
  );

  const resolveColorsForGame = useCallback(
    (game: PlatformGame | undefined): readonly [string, string] => {
      if (!game) {
        return ["var(--pl-aura-default-home)", "var(--pl-aura-default-away)"];
      }
      const homePair = getTeamColors(game.league, game.home.slug);
      const awayPair = getTeamColors(game.league, game.away.slug);
      return [
        homePair?.[0] ?? "var(--pl-aura-default-home)",
        awayPair?.[0] ?? "var(--pl-aura-default-away)",
      ];
    },
    [],
  );

  const [auraColors, setAuraColors] = useState<readonly [string, string]>(() =>
    resolveColorsForGame(defaultGame),
  );

  const setAuraFromGame = useCallback(
    (game: PlatformGame | undefined) => {
      setAuraColors(resolveColorsForGame(game));
    },
    [resolveColorsForGame],
  );

  // Hidratar preferencias persistidas en cliente
  useEffect(() => {
    try {
      const savedFmt = window.localStorage.getItem("pl-odds-fmt");
      if (savedFmt === "decimal" || savedFmt === "american") {
        setOddsFormatState(savedFmt);
      }
      const savedRisk = window.localStorage.getItem("pl-risk-pref");
      if (
        savedRisk === "conservador" ||
        savedRisk === "medio" ||
        savedRisk === "arriesgado"
      ) {
        setRiskPreferenceState(savedRisk);
      }
      const savedNoCard = window.localStorage.getItem("pl-month1-nocard");
      if (savedNoCard === "0") {
        setMonth1NoCardMode(false);
      }
      if (allowRoleSimulation) {
        const savedRole = window.localStorage.getItem("pl-sim-role");
        if (
          savedRole === "visitor" ||
          savedRole === "member" ||
          savedRole === "tipstar" ||
          savedRole === "admin"
        ) {
          setViewerRoleState(savedRole);
        }
      }
    } catch (err) {
      void err;
    }
  }, [allowRoleSimulation]);

  // Datos del socio en este navegador (hasta que exista la base de datos de F4).
  const [userDataLoaded, setUserDataLoaded] = useState<boolean>(false);
  useEffect(() => {
    const savedJournal = readStoredArray<JournalEntry>(STORAGE_KEYS.journal, isJournalEntry);
    if (savedJournal.length > 0) setJournal(savedJournal);
    const savedWatch = readStoredArray<string>(STORAGE_KEYS.watchlist, (v): v is string => typeof v === "string");
    if (savedWatch.length > 0) setWatchlistGameIds(savedWatch);
    const ownPosts = readStoredArray<SocialPost>(STORAGE_KEYS.ownPosts, isOwnSocialPost);
    if (ownPosts.length > 0) {
      setSocialPosts((prev) => [...ownPosts, ...prev.filter((p) => !ownPosts.some((o) => o.id === p.id))]);
    }
    setUserDataLoaded(true);
  }, []);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.journal, journal.slice(0, 500));
  }, [journal, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) writeStored(STORAGE_KEYS.watchlist, watchlistGameIds);
  }, [watchlistGameIds, userDataLoaded]);
  useEffect(() => {
    if (userDataLoaded) {
      writeStored(
        STORAGE_KEYS.ownPosts,
        socialPosts.filter((p) => !p.isExample).slice(0, 100),
      );
    }
  }, [socialPosts, userDataLoaded]);

  // Atajo global Cmd+K / Ctrl+K y Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCmdkOpen((prev) => !prev);
      } else if (event.key === "Escape") {
        setCmdkOpen(false);
        setAlertsOpen(false);
        setComposerPick(null);
        setShareTicket(null);
        setBetaPinOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pushToast = useCallback(
    (text: string, tone: ToastMessage["tone"] = "default") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    [],
  );

  const setViewerRole = useCallback(
    (role: ViewerRole) => {
      setViewerRoleState(role);
      try {
        window.localStorage.setItem("pl-sim-role", role);
      } catch (err) {
        void err;
      }
    },
    [],
  );

  const setOddsFormat = useCallback((fmt: OddsFormat) => {
    setOddsFormatState(fmt);
    try {
      window.localStorage.setItem("pl-odds-fmt", fmt);
    } catch (err) {
      void err;
    }
  }, []);

  const setFavoriteLeagues = useCallback((leagues: LeagueId[]) => {
    setFavoriteLeaguesState(leagues);
    try {
      window.localStorage.setItem("pl-fav-leagues", JSON.stringify(leagues));
    } catch (err) {
      void err;
    }
  }, []);

  const setRiskPreference = useCallback((risk: RiskBand) => {
    setRiskPreferenceState(risk);
    try {
      window.localStorage.setItem("pl-risk-pref", risk);
    } catch (err) {
      void err;
    }
  }, []);

  const handleSetMonth1NoCard = useCallback(
    (v: boolean) => {
      setMonth1NoCardMode(v);
      try {
        window.localStorage.setItem("pl-month1-nocard", v ? "1" : "0");
      } catch (err) {
        void err;
      }
      pushToast(
        v
          ? "Modo Lanzamiento Mes 1 activo: registro gratis sin pedir tarjeta."
          : "Modo Mes 2 activo: prueba gratis con verificación de tarjeta $0 MXN.",
        "success",
      );
    },
    [pushToast],
  );

  const dataset = useMemo(() => {
    if (viewerRole === "visitor") {
      return rawDataset.isServerRedactedForVisitor
        ? rawDataset
        : redactDatasetForVisitor(rawDataset);
    }
    return rawDataset;
  }, [rawDataset, viewerRole]);

  const parlaySummary = useMemo(
    () => computeParlaySummary(parlayLegs, parlayStakeUnits),
    [parlayLegs, parlayStakeUnits],
  );

  const addPickToParlay = useCallback(
    (pick: MatchPick): boolean => {
      const check = checkParlayCompatibility(parlayLegs, pick, allowSgp);
      if (!check.allowed) {
        pushToast(check.reason ?? "Selección no compatible.", "warning");
        return false;
      }
      setParlayLegs((prev) => [...prev, { pick }]);
      pushToast(`Agregado al Parlay: ${pick.label}`, "success");
      return true;
    },
    [parlayLegs, allowSgp, pushToast],
  );

  const removePickFromParlay = useCallback((pickId: string) => {
    setParlayLegs((prev) => prev.filter((l) => l.pick.id !== pickId));
  }, []);

  const clearParlay = useCallback(() => {
    setParlayLegs([]);
  }, []);

  const generateAutoParlay = useCallback(
    (opts: {
      leagues: readonly LeagueId[];
      risk: RiskBand;
      legCount: number;
      allowSgp: boolean;
    }): number => {
      setAllowSgp(opts.allowSgp);
      const built = buildSmartAutoParlay(dataset.games, {
        ...opts,
        viewerRole,
      });
      setParlayLegs(built);
      if (built.length > 0) {
        pushToast(
          `Parlay ${opts.risk} generado con ${built.length} selecciones compatibles.`,
          "success",
        );
      } else {
        pushToast(
          "No hay suficientes partidos abiertos con esos filtros.",
          "warning",
        );
      }
      return built.length;
    },
    [dataset.games, viewerRole, pushToast],
  );

  const sealPickToJournal = useCallback(
    (pick: MatchPick, units: number, userDecimal: number, note?: string) => {
      const pFair = 1 / Math.max(1.04, pick.fairDecimal);
      const pUser = 1 / Math.max(1.04, userDecimal);
      const clvPct = Math.round((pFair - pUser) * 1000) / 10;
      const entry: JournalEntry = {
        id: `j-${Date.now()}`,
        pickId: pick.id,
        gameId: pick.gameId,
        leagueLabel: pick.leagueLabel,
        matchLabel: pick.matchLabel,
        pickLabel: pick.label,
        origin: "Spacetime Suite",
        units: Math.max(0.25, Math.min(5, units)),
        userDecimal,
        fairDecimal: pick.fairDecimal,
        clvPct,
        status:
          pick.gameStatus === "FT"
            ? pick.result === "miss"
              ? "lost"
              : "won"
            : "pending",
        sealedAt: "Sellado ahora",
        note,
      };
      setJournal((prev) => [entry, ...prev]);
      setComposerPick(null);
      pushToast(`Pick sellado en Bitácora (${entry.units}u).`, "success");
    },
    [pushToast],
  );

  const sealParlayToJournal = useCallback(
    (note?: string) => {
      if (parlaySummary.legs.length < 2) {
        pushToast("Agrega al menos 2 selecciones para sellar un Parlay.", "warning");
        return;
      }
      const entry: JournalEntry = {
        id: `j-parlay-${Date.now()}`,
        pickId: parlaySummary.legs.map((l) => l.pick.id).join("+"),
        gameId: parlaySummary.legs[0]!.pick.gameId,
        leagueLabel: "Combinada Multi-Liga",
        matchLabel: `${parlaySummary.legs.length} selecciones${parlaySummary.hasSgpCorrelation ? " · SGP" : ""}`,
        pickLabel: parlaySummary.legs.map((l) => l.pick.label).join(" + "),
        origin: "Parlay Combinado",
        units: parlaySummary.stakeUnits,
        userDecimal: parlaySummary.bookDecimal,
        fairDecimal: parlaySummary.fairDecimal,
        clvPct: parlaySummary.edgePts,
        status: "pending",
        sealedAt: "Sellado ahora",
        note: note ?? "Armador Inteligente Geodesic v2.0",
      };
      setJournal((prev) => [entry, ...prev]);
      pushToast(
        `Boleto combinado de ${parlaySummary.legs.length} selecciones sellado en Bitácora.`,
        "success",
      );
    },
    [parlaySummary, pushToast],
  );

  const exportJournalCsv = useCallback((): string => {
    const header =
      "Fecha,Liga,Partido,Seleccion,Origen,Unidades,CuotaUsuario,CuotaJusta,CLV_Pts,Estado";
    const lines = journal.map((j) =>
      [
        `"${j.sealedAt}"`,
        `"${j.leagueLabel}"`,
        `"${j.matchLabel}"`,
        `"${j.pickLabel.replace(/"/g, '""')}"`,
        `"${j.origin}"`,
        j.units.toFixed(2),
        j.userDecimal.toFixed(2),
        j.fairDecimal.toFixed(2),
        j.clvPct.toFixed(1),
        j.status,
      ].join(","),
    );
    const csv = [header, ...lines].join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pitchlab-bitacora-verificada.csv";
      a.click();
      URL.revokeObjectURL(url);
      pushToast("Bitácora exportada en CSV auditado.", "success");
    } catch (err) {
      void err;
    }
    return csv;
  }, [journal, pushToast]);

  const publishSocialPost = useCallback(
    (payload: {
      leagueLabel: string;
      matchLabel: string;
      pickBadge: string;
      originType: "Spacetime Suite" | "Bitácora Propia";
      body: string;
    }): { ok: boolean; error?: string } => {
      if (viewerRole === "visitor") {
        return {
          ok: false,
          error: "La Comunidad VIP es exclusiva para suscriptores con Pase Total activo.",
        };
      }
      const trimmed = payload.body.trim();
      if (trimmed.length < 8) {
        return { ok: false, error: "Escribe al menos una breve tesis deportiva." };
      }
      if (containsExternalLink(trimmed)) {
        setBlockedSpamAttempts((n) => n + 1);
        pushToast(
          "Enlace externo bloqueado: por seguridad anti-spam no se permiten links ni grupos externos.",
          "danger",
        );
        return {
          ok: false,
          error: "Enlaces externos (Telegram, WhatsApp, URLs) bloqueados automáticamente.",
        };
      }
      const newPost: SocialPost = {
        id: `sp-${Date.now()}`,
        authorHandle: viewerRole === "tipstar" ? "sofia_nfl" : "socio_pl",
        authorName: viewerRole === "tipstar" ? "Sofía Méndez" : "Socio Pase Total",
        roleBadge:
          viewerRole === "tipstar" ? "Tipstar Oficial" : "Socio Pase Total",
        avatarGradVar:
          viewerRole === "tipstar" ? "var(--avatar-grad-1)" : "var(--avatar-grad-4)",
        verifiedRecord:
          viewerRole === "tipstar" ? "+18.4u · 142 picks" : journalRecord(journal).label,
        clvBadge:
          viewerRole === "tipstar"
            ? "CLV +4.2 %"
            : formatClvBadge(journalRecord(journal).avgClvPct),
        // Publicar como tipstar usa el perfil de ejemplo @sofia_nfl.
        isExample: viewerRole === "tipstar",
        leagueLabel: payload.leagueLabel,
        matchLabel: payload.matchLabel,
        pickBadge: payload.pickBadge,
        originType: payload.originType,
        createdAt: "Ahora mismo",
        body: trimmed,
        likes: 1,
        likedByMe: true,
        comments: [],
      };
      setSocialPosts((prev) => [newPost, ...prev]);
      pushToast("Análisis publicado en la Comunidad VIP.", "success");
      return { ok: true };
    },
    [viewerRole, pushToast, journal],
  );

  const addSocialComment = useCallback(
    (postId: string, body: string): { ok: boolean; error?: string } => {
      if (viewerRole === "visitor") {
        return { ok: false, error: "Activa Pase Total para comentar." };
      }
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: "Escribe un comentario." };
      }
      if (containsExternalLink(trimmed)) {
        setBlockedSpamAttempts((n) => n + 1);
        pushToast("Enlace externo bloqueado por el filtro anti-spam.", "danger");
        return { ok: false, error: "No se permiten enlaces externos." };
      }
      setSocialPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [
                  ...post.comments,
                  {
                    id: `sc-${Date.now()}`,
                    authorHandle: viewerRole === "tipstar" ? "sofia_nfl" : "socio_pl",
                    authorName:
                      viewerRole === "tipstar" ? "Sofía Méndez" : "Socio Pase Total",
                    verifiedBadge:
                      viewerRole === "tipstar"
                        ? "Perfil de ejemplo"
                        : journalRecord(journal).label,
                    createdAt: "Ahora",
                    body: trimmed,
                  },
                ],
              }
            : post,
        ),
      );
      pushToast("Respuesta agregada al hilo.", "success");
      return { ok: true };
    },
    [viewerRole, pushToast, journal],
  );

  const toggleSocialLike = useCallback((postId: string) => {
    setSocialPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likes: p.likedByMe ? Math.max(0, p.likes - 1) : p.likes + 1,
            }
          : p,
      ),
    );
  }, []);

  const toggleWatchlistGame = useCallback(
    (gameId: string) => {
      setWatchlistGameIds((prev) => {
        const exists = prev.includes(gameId);
        pushToast(
          exists
            ? "Partido retirado de tu vigilancia."
            : "Partido en vigilancia: te avisaremos si aparece valor nuevo.",
          "default",
        );
        return exists ? prev.filter((id) => id !== gameId) : [...prev, gameId];
      });
    },
    [pushToast],
  );

  const simulateFriendFirstPayment = useCallback(() => {
    setReferralPaidFriends((prev) => {
      const next = prev + 1;
      pushToast(
        next === 5
          ? "¡Insignia Embajador desbloqueada! +15 días por tu amigo y +30 días extra acumulados."
          : "¡Referido verificado! Ambos recibieron +15 días gratis en su Pase Total.",
        "success",
      );
      return next;
    });
  }, [pushToast]);

  const navigateTo = useCallback(
    (href: string) => {
      if (onNavigate) {
        onNavigate(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [onNavigate],
  );

  const openBetaPin = useCallback((nextPath: string = "/app") => {
    setBetaPinNextPath(nextPath);
    setBetaPinOpen(true);
  }, []);

  const closeBetaPin = useCallback(() => {
    setBetaPinOpen(false);
  }, []);

  const submitBetaPin = useCallback(
    async (code: string, nextOverride?: string): Promise<PinUnlockResult> => {
      const targetNext = nextOverride ?? betaPinNextPath ?? "/app";
      if (onSubmitPinOverride) {
        return onSubmitPinOverride(code, targetNext);
      }
      try {
        const res = await fetch("/api/beta/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, next: targetNext }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          redirectTo?: string;
        };
        if (res.ok && data.ok) {
          const redirectTo = data.redirectTo ?? targetNext;
          setBetaPinOpen(false);
          navigateTo(redirectTo);
          return { ok: true, redirectTo };
        }
        return {
          ok: false,
          error:
            data.error ?? "Código incorrecto. Si tienes invitación, escríbenos.",
        };
      } catch (err) {
        void err;
        return {
          ok: false,
          error: "No pudimos verificar el código. Intenta de nuevo.",
        };
      }
    },
    [betaPinNextPath, navigateTo, onSubmitPinOverride],
  );

  const logoutSession = useCallback(async () => {
    if (onLogoutOverride) {
      await onLogoutOverride();
      return;
    }
    try {
      await fetch("/api/beta/logout", { method: "POST" });
    } catch (err) {
      void err;
    }
    navigateTo("/");
  }, [navigateTo, onLogoutOverride]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      oddsFormat,
      setOddsFormat,
      auraColors,
      setAuraFromGame,
      parlayLegs,
      allowSgp,
      setAllowSgp,
      parlayStakeUnits,
      setParlayStakeUnits,
      parlaySummary,
      addPickToParlay,
      removePickFromParlay,
      clearParlay,
      generateAutoParlay,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      toggleSocialLike,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      referralPaidFriends,
      simulateFriendFirstPayment,
      month1NoCardMode,
      setMonth1NoCardMode: handleSetMonth1NoCard,
      tipstarWeeklyPickOrigin,
      setTipstarWeeklyPickOrigin,
      selectedTipstarPickId,
      setSelectedTipstarPickId,
      composerPick,
      openComposer: setComposerPick,
      closeComposer: () => setComposerPick(null),
      shareTicket,
      openShareTicket: setShareTicket,
      closeShareTicket: () => setShareTicket(null),
      alertsOpen,
      setAlertsOpen,
      cmdkOpen,
      setCmdkOpen,
      betaPinOpen,
      betaPinNextPath,
      openBetaPin,
      closeBetaPin,
      submitBetaPin,
      logoutSession,
      toasts,
      pushToast,
      navigateTo,
    }),
    [
      rawDataset,
      dataset,
      viewerRole,
      setViewerRole,
      allowRoleSimulation,
      oddsFormat,
      setOddsFormat,
      auraColors,
      setAuraFromGame,
      parlayLegs,
      allowSgp,
      parlayStakeUnits,
      parlaySummary,
      addPickToParlay,
      removePickFromParlay,
      clearParlay,
      generateAutoParlay,
      journal,
      sealPickToJournal,
      sealParlayToJournal,
      exportJournalCsv,
      socialPosts,
      publishSocialPost,
      addSocialComment,
      toggleSocialLike,
      blockedSpamAttempts,
      watchlistGameIds,
      toggleWatchlistGame,
      favoriteLeagues,
      setFavoriteLeagues,
      riskPreference,
      setRiskPreference,
      referralPaidFriends,
      simulateFriendFirstPayment,
      month1NoCardMode,
      handleSetMonth1NoCard,
      tipstarWeeklyPickOrigin,
      selectedTipstarPickId,
      composerPick,
      shareTicket,
      alertsOpen,
      cmdkOpen,
      betaPinOpen,
      betaPinNextPath,
      openBetaPin,
      closeBetaPin,
      submitBetaPin,
      logoutSession,
      toasts,
      pushToast,
      navigateTo,
    ],
  );

  return (
    <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform debe usarse dentro de <PlatformProvider>.");
  }
  return ctx;
}
