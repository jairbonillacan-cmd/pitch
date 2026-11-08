"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { MatchAnalysis } from "@pitchlab/contracts";
import { formatPercent } from "@pitchlab/contracts";
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
} from "./sports.js";

export function FloatingNav({
  links = [
    { href: "#como", label: "Cómo funciona", sec: "como" },
    { href: "#ligas", label: "Ligas", sec: "ligas" },
    { href: "#modelo", label: "El modelo", sec: "modelo" },
    { href: "#reglas", label: "Compromiso", sec: "reglas" },
  ],
  onOpenBetaPin,
  activeAuthRoute = "landing",
}: {
  links?: ReadonlyArray<{ href: string; label: string; sec?: string }>;
  onOpenBetaPin?: () => void;
  activeAuthRoute?: "login" | "signup" | "landing";
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
    const ids = ["como", "ligas", "modelo", "reglas"];
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
          <ThemeToggle />
          <a className="btn btn-ghost" href="/login">
            Entrar
          </a>
          {onOpenBetaPin && activeAuthRoute === "landing" ? (
            <a className="btn btn-primary signup" href="/signup">
              Crear cuenta
            </a>
          ) : (
            <a className="btn btn-primary signup" href="/signup">
              Crear cuenta
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

const D1_SOCIAL: ReadonlyArray<readonly [string, string]> = [
  ["X", "https://x.com/pitchlabmx"],
  ["Instagram", "https://instagram.com/pitchlab.mx"],
  ["TikTok", "https://tiktok.com/@pitchlabmx"],
  ["YouTube", "https://youtube.com/@pitchlabmx"],
  ["Threads", "https://threads.net/@pitchlab.mx"],
  ["Facebook", "https://facebook.com/pitchlabmx"],
  ["LinkedIn", "https://linkedin.com/company/pitchlabmx"],
];

export function PublicFooter({
  onOpenBetaPin,
}: {
  onOpenBetaPin?: () => void;
}): React.JSX.Element {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="fgrid">
          <div>
            <BrandLogo variant="horizontal" width={148} height={29} alt="PitchLab" />
            <p
              className="small secondary"
              style={{ margin: "var(--space-4) 0 0" }}
            >
              Lee el juego con datos.
            </p>
          </div>
          <div>
            <h3>Producto</h3>
            <ul>
              <li>
                {onOpenBetaPin ? (
                  <a
                    href="/login#beta"
                    data-open-pin=""
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenBetaPin();
                    }}
                  >
                    Entrar a la beta
                  </a>
                ) : (
                  <a href="/login#beta">Entrar a la beta</a>
                )}
              </li>
              <li>
                <a href="/#como">Cómo funciona</a>
              </li>
              <li>
                <a href="/#ligas">Ligas</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Legal</h3>
            <ul>
              <li>
                <a href="/legal/privacidad">Aviso de privacidad</a>
              </li>
              <li>
                <a href="/legal/terminos">Términos</a>
              </li>
              <li>
                <a href="/legal/juego-responsable">Juego responsable</a>
              </li>
              <li>
                <a href="/legal/creditos">Créditos y licencias</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Redes</h3>
            <ul>
              {D1_SOCIAL.map(([name, url]) => (
                <li key={name}>
                  <a href={url} rel="noopener">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
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
  const [status, setStatus] = useState<
    "idle" | "submitting" | "error" | "success"
  >("idle");
  const [msgText, setMsgText] = useState<string>(
    "Escribe el código de 4 dígitos.",
  );
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setDigits("");
      setStatus("idle");
      setMsgText("Escribe el código de 4 dígitos.");
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
      try {
        const res = await onSubmitPin(code);
        if (res.ok) {
          setStatus("success");
          setMsgText("Listo. Bienvenido a PitchLab.");
        } else {
          setStatus("error");
          setMsgText(
            res.error ?? "Ese código no es. Revisa con quien te invitó.",
          );
          setTimeout(() => {
            setDigits("");
            setStatus("idle");
          }, 550);
        }
      } catch (err) {
        void err;
        setStatus("error");
        setMsgText("No pudimos verificar el código. Intenta de nuevo.");
        setTimeout(() => {
          setDigits("");
          setStatus("idle");
        }, 550);
      }
    },
    [onSubmitPin],
  );

  const pushDigit = useCallback(
    (d: string) => {
      if (status === "submitting" || status === "success") return;
      setPressedKey(d);
      setTimeout(() => setPressedKey(null), 120);
      setStatus("idle");
      setDigits((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + d;
        setMsgText(`${next.length} de 4 dígitos`);
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
    setDigits((prev) => {
      if (!prev) return prev;
      const next = prev.slice(0, -1);
      setMsgText(
        next.length > 0
          ? `${next.length} de 4 dígitos`
          : "Escribe el código de 4 dígitos.",
      );
      return next;
    });
  }, [status]);

  const clearDigits = useCallback(() => {
    if (status === "submitting" || status === "success") return;
    setStatus("idle");
    setDigits("");
    setMsgText("Escribe el código de 4 dígitos.");
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
        setMsgText(`${cleaned.length} de 4 dígitos`);
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

  const dlgClasses = [
    "pin",
    "pin-dialog",
    open ? "show" : "",
    status === "success" ? "ok" : "",
    status === "error" ? "err" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={dialogRef}
      className={dlgClasses}
      id="pin-dialog"
      aria-labelledby="pin-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (
          e.target === dialogRef.current ||
          (e.target as HTMLElement).classList?.contains("pin-frame")
        ) {
          onClose();
        }
      }}
    >
      <div className="pin-frame">
        <div className="pin-win" tabIndex={-1}>
          <button
            className="btn btn-ghost btn-icon pin-close"
            type="button"
            data-pin-close=""
            aria-label="Cerrar"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>

          <div className="pin-avatar" aria-hidden="true">
            <img src={getMascotPath("radar")} alt="" />
          </div>

          <p className="eyebrow" style={{ color: "var(--brand-primary)" }}>
            Beta privada
          </p>
          <h2 id="pin-title">Código de acceso</h2>
          <p
            className={`pin-msg pin-feedback ${status === "error" ? "error" : ""}`.trim()}
            id="pin-msg"
            role="status"
            aria-live="polite"
          >
            {msgText}
          </p>

          <div className="slots pin-slots" id="slots" aria-hidden="true">
            {[0, 1, 2, 3].map((idx) => {
              const isOn = idx < digits.length;
              const isCur = idx === digits.length && status !== "submitting";
              const slotCls = [
                "slot",
                "pin-slot",
                isOn ? "on filled" : "",
                isCur ? "cur active" : "",
                status === "error" ? "error" : "",
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
                data-k={n}
                data-pin-digit={n}
                onClick={() => pushDigit(n)}
              >
                {n}
              </button>
            ))}
            <button
              className="key ghost pin-key aux"
              type="button"
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
              data-k="0"
              data-pin-digit="0"
              onClick={() => pushDigit("0")}
            >
              0
            </button>
            <button
              className="key ghost pin-key aux"
              type="button"
              data-del=""
              data-pin-back=""
              aria-label="Borrar un dígito"
              onClick={popDigit}
            >
              <Icon name="backspace" className="icon-24" />
            </button>
          </div>

          <p className="pin-foot">TAMBIÉN PUEDES USAR TU TECLADO</p>
          <span className="pin-progress" aria-hidden="true" />
        </div>
      </div>
    </dialog>
  );
}

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const [phase, setPhase] = useState<"calc" | "result">("result");
  const [stepCount, setStepCount] = useState<number>(0);
  const [selectedMarketKey, setSelectedMarketKey] = useState<string>("");
  const [selectedMarketLabel, setSelectedMarketLabel] = useState<string>("");
  const [selectedMarketProb, setSelectedMarketProb] = useState<number>(0.5);

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

  const isFinished = match?.status === "FT" && match.score !== undefined;
  const nf = match?.league === "nfl";
  const draw = !nf;
  const x12 = match?.x12 ?? [0.45, draw ? 0.25 : 0, 0.3];
  const [ph, pd, pa] = x12;
  const proj = match?.projection ?? { home: 1.5, away: 1.2, total: 2.7 };
  const steps = match?.steps ?? [];

  return (
    <dialog
      ref={dialogRef}
      className={`modal analysis-dialog ${open ? "show" : ""}`.trim()}
      id="analysis-dialog"
      aria-labelledby="dlg-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (
          e.target === dialogRef.current ||
          (e.target as HTMLElement).classList?.contains("modal-frame")
        ) {
          onClose();
        }
      }}
    >
      <div className="modal-frame">
        <div className="modal-win" id="dlg-win" tabIndex={-1}>
          {match ? (
            <>
              <div className="modal-bar">
                <LeagueBadge league={match.league} size={24} />
                <div>
                  <p className="eyebrow" id="modal-league">
                    {match.leagueLabel} · {match.round}
                  </p>
                  <p className="caption muted" id="modal-round" style={{ margin: 0 }}>
                    {isFinished ? "Finalizado" : match.kickoffLocal} · {match.venue}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-icon close"
                  type="button"
                  data-close=""
                  data-modal-close=""
                  aria-label="Cerrar análisis"
                  onClick={onClose}
                >
                  <Icon name="close" />
                </button>
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
                      Calculando {match.home.name} vs {match.away.name}
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
                          seenRef.current.add(match.id);
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
                    Análisis de {match.home.name} contra {match.away.name}
                  </h2>
                  <div className="match">
                    <div className="mteam">
                      <TeamBadge
                        league={match.league}
                        slug={match.home.slug}
                        name={match.home.name}
                        size={56}
                      />
                      <div>
                        <div className="n">{match.home.name}</div>
                        <div className="c">LOCAL</div>
                      </div>
                    </div>

                    <div className="mscore">
                      <div className="caption muted">
                        {isFinished ? "Final" : "Proyección"}
                      </div>
                      <div className="numeric-hl">
                        {isFinished
                          ? `${match.score?.home} – ${match.score?.away}`
                          : `${proj.home.toFixed(nf ? 0 : 1)} – ${proj.away.toFixed(nf ? 0 : 1)}`}
                      </div>
                      <div className="split-big">
                        <ProbSplit
                          probabilities={draw ? [ph, pd, pa] : [ph, pa]}
                          labels={
                            draw
                              ? [match.home.name, "Empate", match.away.name]
                              : [match.home.name, match.away.name]
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
                        league={match.league}
                        slug={match.away.slug}
                        name={match.away.name}
                        size={56}
                      />
                      <div>
                        <div className="n">{match.away.name}</div>
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

                  <div className="rbody">
                    <MarketTable
                      groups={match.marketGroups}
                      outcomes={match.outcomes}
                      interactive
                      selectedKey={selectedMarketKey}
                      onSelectRow={(key, label, p) => {
                        setSelectedMarketKey(key);
                        setSelectedMarketLabel(label);
                        setSelectedMarketProb(p);
                      }}
                    />

                    <div className="side-col">
                      {match.mostLikelyScore ? (
                        <div className="panel likely">
                          <span className="small secondary">
                            Marcador más probable
                          </span>
                          <span>
                            <b className="num" style={{ fontSize: "1.25rem" }}>
                              {match.mostLikelyScore.home}–{match.mostLikelyScore.away}
                            </b>{" "}
                            <span className="caption muted">
                              {formatPercent(match.mostLikelyScore.p, 1)}
                            </span>
                          </span>
                        </div>
                      ) : null}

                      <OddsCompare
                        marketLabel={selectedMarketLabel}
                        modelProb={selectedMarketProb}
                      />

                      <FactorsList factors={match.factors} />
                    </div>
                  </div>

                  <div className="mfoot">
                    <span className="tag tag-model">
                      Modelo PitchLab · en validación
                    </span>
                    <span>Corte {match.updatedAt}</span>
                    <span>No garantiza resultados.</span>
                    <a href="/#como">Cómo funciona</a>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
