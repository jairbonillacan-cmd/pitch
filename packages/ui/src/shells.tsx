"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { MatchAnalysis } from "@pitchlab/contracts";
import { SOCIAL_PROFILES } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";
import { BrandLogo, ThemeToggle } from "./primitives.js";
import {
  TeamBadge,
  ProbSplit,
  FactorsList,
  MarketTable,
  CalcTrace,
} from "./sports.js";

export function FloatingNav({
  links = [],
  onOpenBetaPin,
  activeAuthRoute,
}: {
  links?: ReadonlyArray<{ href: string; label: string }>;
  onOpenBetaPin?: () => void;
  activeAuthRoute?: "login" | "signup" | "landing";
}): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`floating-nav ${scrolled ? "is-scrolled" : ""}`.trim()}>
      <div className="floating-nav-inner">
        <a className="brand-mark" href="/" aria-label="PitchLab — Inicio">
          <BrandLogo variant="horizontal" width={133} height={26} />
        </a>

        {links.length > 0 ? (
          <nav className="nav-links" aria-label="Secciones principales">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="nav-actions">
          <ThemeToggle />
          {activeAuthRoute === "login" ? (
            <>
              <a className="btn btn-ghost hide-sm" href="/">
                Inicio
              </a>
              <a className="btn btn-secondary" href="/signup">
                Crear cuenta
              </a>
            </>
          ) : activeAuthRoute === "signup" ? (
            <>
              <a className="btn btn-ghost hide-sm" href="/">
                Inicio
              </a>
              <a className="btn btn-secondary" href="/login">
                Entrar
              </a>
            </>
          ) : (
            <>
              <a className="btn btn-ghost hide-sm" href="/login">
                Entrar
              </a>
              <button
                className="btn btn-primary"
                type="button"
                data-open-pin=""
                onClick={onOpenBetaPin}
              >
                <span>Entrar a la beta</span>
                <Icon name="arrow" />
              </button>
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
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="brand-mark" href="/" aria-label="PitchLab">
              <BrandLogo variant="horizontal" width={133} height={26} />
            </a>
            <p className="body-s">
              Probabilidades deportivas calculadas con modelos estadísticos abiertos.
              Hecho en México.
            </p>
          </div>
          <div className="footer-col">
            <h4>Producto</h4>
            <a href="/#partidos">Demo en vivo</a>
            <a href="/#ligas">Ligas</a>
            <a href="/#metodo">Cómo calculamos</a>
            {onOpenBetaPin ? (
              <a
                href="#beta"
                data-open-pin=""
                onClick={(e) => {
                  e.preventDefault();
                  onOpenBetaPin();
                }}
              >
                Acceso beta
              </a>
            ) : (
              <a href="/login">Acceso beta</a>
            )}
          </div>
          <div className="footer-col">
            <h4>Cuenta</h4>
            <a href="/login">Iniciar sesión</a>
            <a href="/signup">Crear cuenta</a>
            <a href="/app">Panel de análisis</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="/legal/terminos">Términos de uso</a>
            <a href="/legal/privacidad">Aviso de privacidad</a>
            <a href="/legal/juego-responsable">Juego responsable (+18)</a>
            <a href="/legal/creditos">Créditos de datos</a>
          </div>
        </div>

        <div className="footer-social" aria-label="Comunidad y redes sociales">
          {SOCIAL_PROFILES.map((s) => (
            <span
              key={s.platform}
              className="tag"
              title={`${s.label} (${s.handle})`}
            >
              <span>{s.label}</span>
              {s.status === "soon" ? (
                <span className="muted">· Pronto</span>
              ) : null}
            </span>
          ))}
        </div>

        <div className="footer-legal">
          <span>
            PitchLab es una herramienta de información y análisis estadístico. No somos
            casa de apuestas, no aceptamos dinero ni procesamos jugadas. Contenido para
            mayores de 18 años.
          </span>
          <span>© 2026 PitchLab · Hecho en México</span>
        </div>
      </div>
    </footer>
  );
}

export function PinPad({
  open,
  onClose,
  onSubmitPin,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitPin: (code: string) => Promise<{ ok: boolean; error?: string }>;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [digits, setDigits] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setDigits("");
      setStatus("idle");
      setErrorMessage("");
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [open]);

  const verifyCode = useCallback(
    async (code: string) => {
      setStatus("submitting");
      setErrorMessage("");
      try {
        const res = await onSubmitPin(code);
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(
            res.error ?? "Código incorrecto. Si tienes invitación, escríbenos.",
          );
          setTimeout(() => {
            setDigits("");
          }, 420);
        }
      } catch (err) {
        void err;
        setStatus("error");
        setErrorMessage("No pudimos verificar el código. Intenta de nuevo.");
        setTimeout(() => {
          setDigits("");
        }, 420);
      }
    },
    [onSubmitPin],
  );

  const pushDigit = useCallback(
    (d: string) => {
      if (status === "submitting" || status === "success") return;
      setStatus("idle");
      setErrorMessage("");
      setDigits((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + d;
        if (next.length === 4) {
          void verifyCode(next);
        }
        return next;
      });
    },
    [status, verifyCode],
  );

  const popDigit = useCallback(() => {
    if (status === "submitting" || status === "success") return;
    setStatus("idle");
    setErrorMessage("");
    setDigits((prev) => prev.slice(0, -1));
  }, [status]);

  const clearDigits = useCallback(() => {
    if (status === "submitting" || status === "success") return;
    setStatus("idle");
    setErrorMessage("");
    setDigits("");
  }, [status]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        popDigit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      const cleaned = text.replace(/\D/g, "").slice(0, 4);
      if (cleaned.length > 0) {
        e.preventDefault();
        setDigits(cleaned);
        if (cleaned.length === 4) {
          void verifyCode(cleaned);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, pushDigit, popDigit, onClose, verifyCode]);

  return (
    <dialog
      ref={dialogRef}
      className="pin-dialog"
      id="pin-dialog"
      aria-labelledby="pin-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="pin-box">
        <div className="pin-top">
          <span className="tag tag-info">
            <span className="dot" />
            Beta privada
          </span>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            data-pin-close=""
            aria-label="Cerrar"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="pin-head">
          <div className="mascot" aria-hidden="true">
            <img
              src={getMascotPath("tactico")}
              alt=""
              width={64}
              height={64}
              loading="lazy"
            />
          </div>
          <div>
            <h2 id="pin-title">Código de acceso</h2>
            <p>Ingresa el PIN de 4 dígitos de tu invitación.</p>
          </div>
        </div>

        <div className="pin-slots" role="group" aria-label="4 dígitos del código">
          {[0, 1, 2, 3].map((idx) => {
            const char = digits[idx] ?? "";
            const isActive = idx === digits.length && digits.length < 4;
            const slotClasses = [
              "pin-slot",
              char ? "filled" : "",
              isActive ? "active" : "",
              status === "error" ? "error" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={idx} className={slotClasses} aria-hidden="true">
                {char ? "•" : ""}
              </div>
            );
          })}
        </div>

        <div
          className={`pin-feedback ${status === "error" ? "error" : ""}`.trim()}
          role="status"
          aria-live="polite"
        >
          {status === "error"
            ? errorMessage
            : status === "success"
              ? "Acceso concedido. Abriendo el panel…"
              : status === "submitting"
                ? "Verificando código…"
                : ""}
        </div>

        <div className="pin-keypad" role="group" aria-label="Teclado numérico">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              className="pin-key"
              data-pin-digit={d}
              onClick={() => pushDigit(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="pin-key aux"
            data-pin-clear=""
            onClick={clearDigits}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="pin-key"
            data-pin-digit="0"
            onClick={() => pushDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="pin-key aux"
            data-pin-back=""
            aria-label="Borrar último dígito"
            onClick={popDigit}
          >
            <Icon name="backspace" />
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function AnalysisDialog({
  match,
  open,
  onClose,
}: {
  match: MatchAnalysis | null;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && match) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }, [open, match]);

  const isFinished = match?.status === "FT" && match.score !== undefined;

  return (
    <dialog
      ref={dialogRef}
      className="analysis-dialog"
      id="analysis-dialog"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      {match ? (
        <>
          <div className="modal-head">
            <div className="modal-meta">
              <span className="tag tag-model" id="modal-league">
                {match.leagueLabel}
              </span>
              <span className="caption num" id="modal-round">
                {match.round} ·{" "}
                {isFinished
                  ? `Final ${match.score?.home}-${match.score?.away}`
                  : `${match.dayLabel} ${match.kickoffLocal}`}
              </span>
            </div>
            <button
              className="btn btn-ghost btn-icon"
              type="button"
              data-modal-close=""
              aria-label="Cerrar análisis"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="modal-body">
            <h2 className="sr-only" id="modal-title">
              {match.home.name} vs {match.away.name}
            </h2>

            <div className="modal-matchup">
              <div className="modal-team">
                <TeamBadge
                  league={match.league}
                  slug={match.home.slug}
                  name={match.home.name}
                  size={36}
                />
                <div>
                  <div className="name">{match.home.name}</div>
                  <div className="sub">Local · {match.home.record}</div>
                </div>
              </div>
              <div className="modal-vs">
                <div>VS</div>
                <div className="num">{match.venue}</div>
              </div>
              <div className="modal-team away">
                <TeamBadge
                  league={match.league}
                  slug={match.away.slug}
                  name={match.away.name}
                  size={36}
                />
                <div>
                  <div className="name">{match.away.name}</div>
                  <div className="sub">Visita · {match.away.record}</div>
                </div>
              </div>
            </div>

            <ProbSplit outcomes={match.outcomes} />

            <div className="modal-section">
              <h3>
                <Icon name="probability" />
                Factores del partido
              </h3>
              <FactorsList factors={match.factors} />
            </div>

            <div className="modal-section">
              <h3>
                <Icon name="compare" />
                Mercados principales y momio justo
              </h3>
              <MarketTable outcomes={match.outcomes} />
            </div>

            <div className="modal-section">
              <h3>
                <Icon name="model" />
                Traza del cálculo
              </h3>
              <CalcTrace trace={match.trace} />
            </div>
          </div>

          <div className="modal-foot">
            <span>Análisis informativo · No procesamos apuestas · +18</span>
            <button
              className="btn btn-secondary"
              type="button"
              data-modal-close=""
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
