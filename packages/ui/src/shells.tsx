"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { AnalysisPick, MarketPulseSide, MatchAnalysis } from "@pitchlab/contracts";
import { formatPercent, marketPulseLean } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";
import { BrandLogo, ThemeToggle } from "./primitives.js";
import {
  TeamBadge,
  LeagueBadge,
  ProbSplit,
  FactorsList,
  MarketTable,
  OddsCompare,
  PicksPanel,
  WhyList,
  HeadToHead,
  effectiveFeaturedPick,
} from "./sports.js";
import { usePinSound } from "./pin-sounds.js";
import { FooterSocial } from "./footer-social.js";
import { Button } from "./components/ui/button.js";
import { Dialog, DialogOverlay, DialogPopup, DialogPortal } from "./components/ui/dialog.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.js";
import { MarketPulseGuide, MarketPulsePanel } from "./market-pulse.js";

export function FloatingNav({
  links = [
    { href: "#modelos", label: "Modelos", sec: "modelos" },
    { href: "#como", label: "Cómo funciona", sec: "como" },
    { href: "#ligas", label: "Ligas", sec: "ligas" },
  ],
  onOpenBetaPin,
  activeAuthRoute = "landing",
}: {
  links?: ReadonlyArray<{ href: string; label: string; sec?: string }>;
  onOpenBetaPin?: () => void;
  activeAuthRoute?: "login" | "signup" | "landing" | "legal";
}): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const [activeSec, setActiveSec] = useState<string>("");
  const onLanding = activeAuthRoute === "landing";

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!onLanding || typeof IntersectionObserver === "undefined") return;
    const ids = ["modelos", "como", "ligas"];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSec(entry.target.id);
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [onLanding]);

  const resolveLink = (href: string) => {
    if (!href.startsWith("#")) return href;
    return onLanding ? href : `/${href}`;
  };

  return (
    <header
      className={`fnav ${scrolled ? "scrolled" : ""}`.trim()}
      id="fnav"
    >
      <div className="bar">
        <a className="logo" href="/" aria-label="PitchLab · Inicio">
          <BrandLogo variant="horizontal" width={133} height={26} />
        </a>

        <nav className="links" aria-label="Principal">
          {links.map((link) => {
            const secId = link.sec ?? link.href.replace(/^\/?#/, "");
            return (
              <a
                key={link.href}
                href={resolveLink(link.href)}
                data-sec={secId}
                className={activeSec === secId ? "active" : ""}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="right">
          <ThemeToggle shape="pill" />
          {onOpenBetaPin ? (
            <Button
              shape="pill"
              appearance="d1"
              className="beta-access px-5 max-[480px]:px-3 max-[360px]:px-2 max-[360px]:text-xs"
              type="button"
              onClick={onOpenBetaPin}
            >
              Entrar con código
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                shape="pill"
                appearance="d1"
                render={<a href="/login" />}
                nativeButton={false}
              >
                Entrar
              </Button>
              <Button
                shape="pill"
                appearance="d1"
                className="signup hidden px-5 min-[480px]:inline-flex"
                render={<a href="/signup" />}
                nativeButton={false}
              >
                Crear cuenta
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({
  onOpenBetaPin,
}: {
  onOpenBetaPin?: () => void;
}): React.JSX.Element {
  return (
    <footer className="site-foot">
      <div className="footer-field fieldgrid" aria-hidden="true" />
      <div className="wrap">
        <div className="fgrid">
          <div className="footer-brand">
            <a href="/" aria-label="PitchLab · Inicio">
              <BrandLogo variant="horizontal" width={210} height={41} />
            </a>
            <p>Probabilidades deportivas</p>
          </div>
          <nav aria-labelledby="footer-product">
            <h2 id="footer-product">PitchLab</h2>
            <ul className="footer-links">
              <li><a href="/">Inicio</a></li>
              <li><a href="/#modelos">Modelos</a></li>
              <li><a href="/#como">Cómo funciona</a></li>
              <li><a href="/#ligas">Ligas</a></li>
              <li>
                <a
                  href="/login#beta"
                  data-open-pin={onOpenBetaPin ? "" : undefined}
                  onClick={onOpenBetaPin ? (event) => {
                    event.preventDefault();
                    onOpenBetaPin();
                  } : undefined}
                >
                  Entrar a la beta
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal">Legal</h2>
            <ul className="footer-links">
              <li><a href="/legal/privacidad">Aviso de privacidad</a></li>
              <li><a href="/legal/terminos">Términos</a></li>
              <li><a href="/legal/juego-responsable">Juego responsable</a></li>
              <li><a href="/legal/creditos">Créditos y licencias</a></li>
            </ul>
          </nav>
        </div>
        <div className="footer-meta">
          <p>© PitchLab</p>
          <div className="footer-networks">
            <span>Redes</span>
            <FooterSocial />
          </div>
        </div>
        <p className="legal">
          PitchLab no acepta apuestas ni administra fondos. Solo mayores de 18
          años. Las probabilidades son estimaciones y no garantizan resultados.
          Emblemas y mascota: ilustraciones de PitchLab.
        </p>
      </div>
    </footer>
  );
}

const PIN_PROMPT = "Escribe el código de 4 dígitos.";

export type PinSubmission = {
  ok: boolean;
  error?: string;
  continueToApp?: () => void;
};

export function PinPad({
  open,
  onClose,
  onSubmitPin,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitPin: (code: string) => Promise<PinSubmission>;
}): React.JSX.Element {
  const pinWinRef = useRef<HTMLDivElement | null>(null);
  const digitsRef = useRef("");
  const busyRef = useRef(false);
  const attemptRef = useRef(0);
  const pressTimer = useRef<number>(undefined);
  const bumpTimer = useRef<number>(undefined);
  const handoffTimer = useRef<number>(undefined);
  const playSound = usePinSound();

  const [digits, setDigits] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [msgText, setMsgText] = useState(PIN_PROMPT);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [avatarBump, setAvatarBump] = useState(false);
  const [slotAnim, setSlotAnim] = useState<{ index: number; type: "fill" | "clear" } | null>(null);
  const busy = status === "submitting" || status === "success";

  const cancelPending = useCallback(() => {
    attemptRef.current += 1;
    window.clearTimeout(pressTimer.current);
    window.clearTimeout(bumpTimer.current);
    window.clearTimeout(handoffTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    digitsRef.current = "";
    busyRef.current = false;
    setDigits("");
    setStatus("idle");
    setMsgText(PIN_PROMPT);
    setPressedKey(null);
    setAvatarBump(false);
    setSlotAnim(null);
    return cancelPending;
  }, [open, cancelPending]);

  const dismiss = () => {
    cancelPending();
    onClose();
  };

  const verifyCode = useCallback(
    async (code: string) => {
      busyRef.current = true;
      const attempt = ++attemptRef.current;
      setStatus("submitting");
      setMsgText("Comprobando código…");
      let result: PinSubmission;
      try {
        result = await onSubmitPin(code);
      } catch {
        result = { ok: false, error: "No pudimos verificar el código. Intenta de nuevo." };
      }
      if (attempt !== attemptRef.current) return;

      if (result.ok) {
        playSound("success");
        setStatus("success");
        setMsgText("Comprobando acceso · Cargando panel…");
        if (result.continueToApp) {
          const reduced =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          const waitMs = reduced ? 120 : 900;
          const go = result.continueToApp;
          handoffTimer.current = window.setTimeout(() => {
            if (attempt !== attemptRef.current) return;
            playSound("handoff");
            go();
          }, waitMs);
        }
      } else {
        playSound("error");
        busyRef.current = false;
        digitsRef.current = "";
        setDigits("");
        setStatus("error");
        setMsgText(result.error ?? "Ese código no es. Revisa con quien te invitó.");
      }
    },
    [onSubmitPin, playSound],
  );

  const editDigits = useCallback((next: string) => {
    digitsRef.current = next;
    setDigits(next);
    setStatus("idle");
    setMsgText(next ? next.length + " de 4 dígitos" : PIN_PROMPT);
    if (next.length === 4) void verifyCode(next);
  }, [verifyCode]);

  const triggerKeyFeedback = useCallback((keyId: string) => {
    setPressedKey(keyId);
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setPressedKey(null), 130);
  }, []);

  const pushDigit = useCallback((digit: string) => {
    if (busyRef.current || digitsRef.current.length >= 4) return;
    const stepIdx = digitsRef.current.length;
    playSound("key", stepIdx);
    triggerKeyFeedback(digit);
    setSlotAnim({ index: stepIdx, type: "fill" });
    setAvatarBump(true);
    window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => setAvatarBump(false), 220);
    editDigits(digitsRef.current + digit);
  }, [editDigits, playSound, triggerKeyFeedback]);

  const popDigit = useCallback(() => {
    if (busyRef.current || digitsRef.current.length === 0) return;
    const clearedIdx = digitsRef.current.length - 1;
    playSound("back");
    triggerKeyFeedback("back");
    setSlotAnim({ index: clearedIdx, type: "clear" });
    editDigits(digitsRef.current.slice(0, -1));
  }, [editDigits, playSound, triggerKeyFeedback]);

  const clearDigits = () => {
    if (busyRef.current) return;
    playSound("back");
    triggerKeyFeedback("clear");
    setSlotAnim({ index: 0, type: "clear" });
    editDigits("");
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        popDigit();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const cleaned = (e.clipboardData?.getData("text") ?? "").replace(/\D/g, "").slice(0, 4);
      if (!cleaned || busyRef.current) return;
      e.preventDefault();
      playSound("key", cleaned.length - 1);
      setSlotAnim({ index: cleaned.length - 1, type: "fill" });
      editDigits(cleaned);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, pushDigit, popDigit, editDigits, playSound]);

  const dlgClasses = [
    "pin",
    "pin-dialog",
    status === "submitting" ? "checking" : "",
    status === "success" ? "ok" : "",
    status === "error" ? "err" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-[var(--backdrop-pin)] backdrop-blur-[6px]" />
        <DialogPopup
          className={dlgClasses}
          id="pin-dialog"
          data-pin-state={status}
          aria-labelledby="pin-title"
          initialFocus={pinWinRef}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList?.contains("pin-frame")) dismiss();
          }}
        >
      <div className="pin-frame">
        <div className="pin-win" tabIndex={-1} ref={pinWinRef}>
          <Button
            variant="ghost"
            size="icon"
            className="pin-close"
            data-pin-close=""
            aria-label="Cerrar"
            onClick={dismiss}
          >
            <Icon name="close" />
          </Button>

          <div
            className={`pin-avatar ${avatarBump ? "typing-bump" : ""}`.trim()}
            aria-hidden="true"
          >
            <img src={getMascotPath("radar")} alt="" />
          </div>

          <p className="eyebrow" style={{ color: status === "success" ? "var(--success)" : "var(--brand-primary)" }}>
            Beta privada
          </p>
          <h2 id="pin-title">Código de acceso</h2>
          <p
            className={`pin-msg pin-feedback ${status === "error" ? "error" : ""}`.trim()}
            id="pin-msg"
            role="status"
            aria-live="polite"
          >
            {(status === "submitting" || status === "success") && (
              <span className="pin-spinner" aria-hidden="true" />
            )}
            <span>{msgText}</span>
          </p>

          <div className="slots pin-slots" id="slots" aria-hidden="true">
            {[0, 1, 2, 3].map((idx) => {
              const isOn = idx < digits.length;
              const isCur = idx === digits.length && status === "idle";
              const animCls =
                slotAnim?.index === idx
                  ? slotAnim.type === "fill"
                    ? "just-filled"
                    : "just-cleared"
                  : "";
              const slotCls = [
                "slot",
                "pin-slot",
                isOn ? "on filled" : "",
                isCur ? "cur active" : "",
                status === "error" ? "error" : "",
                animCls,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <span key={idx} className={slotCls}>
                  <i />
                </span>
              );
            })}
          </div>

          <div className="pad pin-keypad" role="group" aria-label="Teclado numérico">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                className={`key pin-key ${pressedKey === n ? "press" : ""}`.trim()}
                type="button"
                disabled={busy}
                data-k={n}
                data-pin-digit={n}
                onClick={() => pushDigit(n)}
              >
                {n}
              </button>
            ))}
            <button
              className={`key ghost pin-key aux ${pressedKey === "clear" ? "press" : ""}`.trim()}
              type="button"
              disabled={busy}
              data-clear=""
              data-pin-clear=""
              aria-label="Borrar todo"
              onClick={clearDigits}
            >
              <Icon name="close" />
            </button>
            <button
              className={`key pin-key ${pressedKey === "0" ? "press" : ""}`.trim()}
              type="button"
              disabled={busy}
              data-k="0"
              data-pin-digit="0"
              onClick={() => pushDigit("0")}
            >
              0
            </button>
            <button
              className={`key ghost pin-key aux ${pressedKey === "back" ? "press" : ""}`.trim()}
              type="button"
              disabled={busy}
              data-del=""
              data-pin-back=""
              aria-label="Borrar un dígito"
              onClick={popDigit}
            >
              <Icon name="backspace" className="icon-24" />
            </button>
          </div>

          <p className="pin-foot">
            {status === "success" ? "PREPARANDO JORNADA…" : "TAMBIÉN PUEDES USAR TU TECLADO"}
          </p>
          <span className="pin-progress" aria-hidden="true" />
        </div>
      </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}

type AnalysisSection = "picks" | "mercados" | "dinero" | "contexto";

export function AnalysisDialog({
  match,
  open,
  onClose,
  skipTrace = false,
}: {
  match: MatchAnalysis | null;
  open: boolean;
  onClose: () => void;
  skipTrace?: boolean;
}): React.JSX.Element {
  const winRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  // Conserva el último partido para que la animación de salida no muestre una ventana vacía.
  const lastMatchRef = useRef<MatchAnalysis | null>(null);
  if (match) lastMatchRef.current = match;
  const [phase, setPhase] = useState<"calc" | "result">("result");
  const [stepCount, setStepCount] = useState<number>(0);
  const [selectedMarketKey, setSelectedMarketKey] = useState<string>("");
  const [selectedMarketLabel, setSelectedMarketLabel] = useState<string>("");
  const [selectedMarketProb, setSelectedMarketProb] = useState<number>(0.5);
  const [section, setSection] = useState<AnalysisSection>("picks");

  useEffect(() => {
    if (!open || !match) return;
    const firstGroup = match.marketGroups?.[0];
    const firstRow = firstGroup?.rows?.[0];
    if (firstGroup && firstRow) {
      setSelectedMarketKey(`${firstGroup.group}:${firstRow.label}`);
      setSelectedMarketLabel(firstRow.label);
      setSelectedMarketProb(firstRow.p);
    } else if (match.outcomes[0]) {
      setSelectedMarketKey(`Resultado:${match.outcomes[0].label}`);
      setSelectedMarketLabel(match.outcomes[0].label);
      setSelectedMarketProb(match.outcomes[0].probability);
    }

    setSection("mercados");

    const isFin = match.status === "FT" && match.score !== undefined;
    const isReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const steps = match.steps ?? [];

    if (skipTrace || isFin || isReduced || steps.length === 0) {
      seenRef.current.add(match.id);
      setPhase("result");
      return;
    }

    const alreadySeen = seenRef.current.has(match.id);
    const ms = alreadySeen ? 50 : 120;
    setPhase("calc");
    setStepCount(1);

    let current = 1;
    const interval = window.setInterval(() => {
      current += 1;
      if (current <= steps.length) {
        setStepCount(current);
      } else {
        window.clearInterval(interval);
        seenRef.current.add(match.id);
        setPhase("result");
      }
    }, ms);

    return () => window.clearInterval(interval);
  }, [open, match, skipTrace]);

  const shown = match ?? lastMatchRef.current;
  const isFinished = shown?.status === "FT" && shown.score !== undefined;
  const nf = shown?.league === "nfl";
  const draw = !nf;
  const x12 = shown?.x12 ?? [0.45, draw ? 0.25 : 0, 0.3];
  const [ph, pd, pa] = x12;
  const proj = shown?.projection ?? { home: 1.5, away: 1.2, total: 2.7 };
  const steps = shown?.steps ?? [];
  const sideLabels: Record<MarketPulseSide, string> = {
    home: shown?.home.name ?? "Local",
    draw: "Empate",
    away: shown?.away.name ?? "Visitante",
  };
  const sideModel: Partial<Record<MarketPulseSide, number>> = draw
    ? { home: ph, draw: pd, away: pa }
    : { home: ph, away: pa };
  const pulseLean = shown?.marketPulse ? marketPulseLean(shown.marketPulse, sideModel) : null;
  const hasContext =
    (shown?.headToHead?.length ?? 0) > 0 ||
    shown?.restDays?.home !== undefined ||
    shown?.restDays?.away !== undefined ||
    (shown?.factors.length ?? 0) > 0;
  const sections: Array<{ id: AnalysisSection; label: string; flag?: boolean }> = [
    { id: "mercados", label: "Mercados" },
    { id: "dinero", label: "Dinero", flag: pulseLean !== null },
    { id: "contexto", label: "Contexto" },
    { id: "picks", label: "Picks" },
  ];
  // Resumen de las pestañas anteriores para explicar de dónde salen los picks.
  const favorite = [...(shown?.outcomes ?? [])].sort((a, b) => b.probability - a.probability)[0];
  const pulseTop = shown?.marketPulse
    ? [...shown.marketPulse.sides].sort((a, b) => b.share - a.share)[0]
    : undefined;
  const contextParts = [
    (shown?.factors ?? []).some((f) => f.label.startsWith("Forma")) ? "forma" : null,
    (shown?.factors ?? []).some((f) => f.label.startsWith("Posición")) ? "posición" : null,
    (shown?.headToHead?.length ?? 0) > 0
      ? `${shown?.headToHead?.length} cruces recientes`
      : null,
    shown?.restDays?.home !== undefined || shown?.restDays?.away !== undefined ? "descanso" : null,
  ].filter((p): p is string => p !== null);
  const basis: Array<{ id: AnalysisSection; label: string; role?: string; value: string }> = [
    {
      id: "mercados",
      label: "Mercados",
      value: favorite
        ? `${favorite.label} ${formatPercent(favorite.probability, 0)}`
        : "Probabilidades del modelo",
    },
    {
      id: "contexto",
      label: "Contexto",
      value:
        contextParts.length > 0
          ? contextParts.join(", ").replace(/^./, (c) => c.toUpperCase())
          : "Sin datos adicionales",
    },
    {
      id: "dinero",
      label: "Dinero",
      role: "para contrastar",
      value: !shown?.marketPulse
        ? "Sin mercado abierto"
        : shown.marketPulse.thin
          ? "Poco volumen todavía"
          : pulseTop
            ? `${formatPercent(pulseTop.share, 0)} a ${sideLabels[pulseTop.side]}`
            : "—",
    },
  ];

  return (
    <Dialog
      open={open && match !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPopup
          className="modal analysis-dialog"
          id="analysis-dialog"
          aria-labelledby="dlg-title"
          initialFocus={winRef}
          onClick={(e) => {
            if ((e.target as HTMLElement).classList?.contains("modal-frame")) onClose();
          }}
        >
      <div className="modal-frame">
        <div className="modal-win" id="dlg-win" tabIndex={-1} ref={winRef}>
          {shown ? (
            <>
              <div className="modal-bar">
                <LeagueBadge league={shown.league} size={24} />
                <div>
                  <p className="eyebrow" id="modal-league">
                    {shown.leagueLabel} · {shown.round}
                  </p>
                  <p className="caption muted" id="modal-round" style={{ margin: 0 }}>
                    {isFinished ? "Finalizado" : shown.kickoffLocal} · {shown.venue}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="close"
                  data-close=""
                  data-modal-close=""
                  aria-label="Cerrar análisis"
                  onClick={onClose}
                >
                  <Icon name="close" />
                </Button>
              </div>

              {phase === "calc" ? (
                <div className="calc" role="status" aria-live="polite">
                  <div className="mascot" aria-hidden="true">
                    <img
                      src={getMascotPath("radar")}
                      alt=""
                      width={220}
                      height={220}
                    />
                  </div>
                  <div>
                    <h2 className="h3" id="dlg-title">
                      Calculando {shown.home.name} vs {shown.away.name}
                    </h2>
                    <div className="progress" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, (stepCount / Math.max(1, steps.length)) * 100)}%`,
                        }}
                      />
                    </div>
                    <ol className="steps">
                      {steps.slice(0, stepCount).map((s, idx) => {
                        const isDone = idx < stepCount - 1;
                        return (
                          <li key={idx} className={isDone ? "done" : ""}>
                            <span className="st">
                              {isDone ? (
                                <Icon name="check" />
                              ) : (
                                <span className="spin" />
                              )}
                            </span>
                            <span>{s}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="sk" aria-hidden="true">
                      <div className="skeleton" style={{ width: "92%" }} />
                      <div className="skeleton" style={{ width: "78%" }} />
                      <div className="skeleton" style={{ width: "85%" }} />
                    </div>
                    <div className="skip-row">
                      <span className="caption muted">
                        Modelo PitchLab · en validación
                      </span>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        data-skip=""
                        onClick={() => {
                          seenRef.current.add(shown.id);
                          setPhase("result");
                        }}
                      >
                        Saltar <Icon name="arrow" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="result">
                  <h2 className="sr-only" id="dlg-title">
                    Análisis de {shown.home.name} contra {shown.away.name}
                  </h2>
                  <div className="match">
                    <div className="mteam">
                      <TeamBadge
                        league={shown.league}
                        slug={shown.home.slug}
                        name={shown.home.name}
                        size={56}
                      />
                      <div>
                        <div className="n">{shown.home.name}</div>
                        <div className="c">LOCAL</div>
                      </div>
                    </div>

                    <div className="mscore">
                      <div className="caption muted">
                        {isFinished
                          ? "Final"
                          : !nf && shown.projectedScore
                            ? "Marcador proyectado"
                            : "Proyección"}
                      </div>
                      <div className="numeric-hl">
                        {isFinished
                          ? `${shown.score?.home} – ${shown.score?.away}`
                          : !nf && shown.projectedScore
                            ? `${shown.projectedScore.home} – ${shown.projectedScore.away}`
                            : `${proj.home.toFixed(nf ? 0 : 1)} – ${proj.away.toFixed(nf ? 0 : 1)}`}
                      </div>
                      {!isFinished && !nf && shown.projectedScore ? (
                        <div className="caption muted xg-line" title="Promedio de goles; el marcador más probable suele ser más bajo">
                          Goles esperados {proj.home.toFixed(1)} – {proj.away.toFixed(1)}
                        </div>
                      ) : null}
                      <div className="split-big">
                        <ProbSplit
                          probabilities={draw ? [ph, pd, pa] : [ph, pa]}
                          labels={
                            draw
                              ? [shown.home.name, "Empate", shown.away.name]
                              : [shown.home.name, shown.away.name]
                          }
                        />
                      </div>
                      {isFinished ? (
                        <div className="caption muted" style={{ marginTop: 6 }}>
                          Proyección previa {proj.home.toFixed(1)}–{proj.away.toFixed(1)}
                        </div>
                      ) : null}
                    </div>

                    <div className="mteam away">
                      <TeamBadge
                        league={shown.league}
                        slug={shown.away.slug}
                        name={shown.away.name}
                        size={56}
                      />
                      <div>
                        <div className="n">{shown.away.name}</div>
                        <div className="c">VISITANTE</div>
                      </div>
                    </div>
                  </div>

                  {isFinished ? (
                    <div style={{ padding: "var(--space-4) var(--space-8) 0" }}>
                      <span className="tag tag-info">
                        <span className="dot" />
                        Análisis publicado antes del partido · sin cambios
                      </span>
                    </div>
                  ) : null}

                  <Tabs
                    value={section}
                    onValueChange={(v) => setSection(v as AnalysisSection)}
                    className="rtabs gap-0"
                  >
                    <div className="rtabs-bar">
                      <TabsList variant="chips" aria-label="Secciones del análisis">
                        {sections.map((sec) => (
                          <TabsTrigger
                            key={sec.id}
                            value={sec.id}
                            data-section-tab={sec.id}
                            className="min-h-11 px-4 max-md:px-3"
                          >
                            {sec.label}
                            {sec.flag ? (
                              <span className="tab-flag" role="img" aria-label="mercado cargado" />
                            ) : null}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    <TabsContent value="picks" className="rbody rbody-split">
                      <section className="basis" aria-labelledby="basis-title">
                        <p className="eyebrow" id="basis-title">
                          De dónde salen los picks
                        </p>
                        <p className="small secondary basis-lead">
                          Los picks se eligen con las probabilidades de Mercados y los datos de
                          Contexto. El dinero no entra en el cálculo: sirve para contrastar.
                        </p>
                        <ul className="basis-list">
                          {basis.map((b) => (
                            <li key={b.id}>
                              <button
                                type="button"
                                className="basis-item"
                                data-basis={b.id}
                                onClick={() => {
                                  setSection(b.id);
                                  winRef.current?.scrollTo({ top: 0 });
                                }}
                              >
                                <span className="caption muted">
                                  {b.label}
                                  {b.role ? ` · ${b.role}` : ""}
                                </span>
                                <span className="small basis-value">{b.value}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <div className="side-col">
                        {(() => {
                          const modalPicks: readonly AnalysisPick[] =
                            shown.picks && shown.picks.length > 0
                              ? shown.picks
                              : isFinished
                                ? [effectiveFeaturedPick(shown)].filter(
                                    (p): p is AnalysisPick => p !== undefined,
                                  )
                                : [];
                          return modalPicks.length > 0 ? (
                            <PicksPanel
                              picks={modalPicks}
                              confidence={isFinished ? undefined : shown.confidence}
                              score={isFinished ? shown.score : undefined}
                            />
                          ) : null;
                        })()}
                        {!isFinished && !(shown.picks && shown.picks.length > 0) ? (
                          <p className="caption muted no-picks" data-no-picks="">
                            Sin picks: este análisis se calculó con el partido ya iniciado. Los
                            picks solo se publican antes del inicio.
                          </p>
                        ) : null}
                        {shown.why && shown.why.length > 0 ? (
                          <WhyList
                            why={shown.why}
                            title={
                              shown.picks && shown.picks.length > 0
                                ? "Por qué este pick"
                                : "Lectura del modelo"
                            }
                          />
                        ) : null}
                        {!shown.picks && shown.mostLikelyScore ? (
                          <div className="panel likely">
                            <span className="small secondary">Marcador más probable</span>
                            <span>
                              <b className="num" style={{ fontSize: "1.25rem" }}>
                                {shown.mostLikelyScore.home}–{shown.mostLikelyScore.away}
                              </b>{" "}
                              <span className="caption muted">
                                {formatPercent(shown.mostLikelyScore.p, 1)}
                              </span>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </TabsContent>

                    <TabsContent value="mercados" className="rbody">
                      <MarketTable
                        groups={shown.marketGroups}
                        outcomes={shown.outcomes}
                        interactive
                        selectedKey={selectedMarketKey}
                        onSelectRow={(key, label, p) => {
                          setSelectedMarketKey(key);
                          setSelectedMarketLabel(label);
                          setSelectedMarketProb(p);
                        }}
                      />
                      <div className="side-col sticky-col">
                        <OddsCompare
                          marketLabel={selectedMarketLabel}
                          modelProb={selectedMarketProb}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="dinero" className="rbody">
                      <MarketPulsePanel
                        pulse={shown.marketPulse}
                        labels={sideLabels}
                        model={sideModel}
                      />
                      <MarketPulseGuide />
                    </TabsContent>

                    <TabsContent value="contexto" className="rbody rbody-split">
                      <HeadToHead
                        rows={shown.headToHead}
                        restDays={shown.restDays}
                        homeName={shown.home.shortName}
                        awayName={shown.away.shortName}
                      />
                      {shown.factors.length > 0 ? (
                        <FactorsList title="Contexto del partido" factors={shown.factors} />
                      ) : null}
                      {!hasContext ? (
                        <p className="caption muted">Sin contexto adicional para este partido.</p>
                      ) : null}
                    </TabsContent>
                  </Tabs>

                  <div className="mfoot">
                    <span className="tag tag-model">
                      Modelo PitchLab · en validación
                    </span>
                    <span>Corte {shown.updatedAt}</span>
                    <span>No garantiza resultados.</span>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
