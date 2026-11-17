"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { asLeagueId } from "@pitchlab/contracts";
import { BrandLogo, ThemeToggle } from "../../primitives";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import {
  MEMBERSHIP_SPEC,
  PRECISION_BUCKETS,
  SPACETIME_METRICS_HEADLINE,
  ULTRA_LANDING_FEATURES,
} from "../spacetime-catalog";
import { LensGlowOrbs } from "../components/MaestroPrimitives";
import {
  cancelPreviewTransfer,
  createOrUpdatePreviewTransfer,
  PREVIEW_SPEI_EVENT,
  readPreviewSpeiState,
} from "../preview-spei-store";
import { CountUpNumber } from "./CountUpNumber";
import { ReferralCard3D } from "./ReferralCard3D";
import type {
  LandingFinishedResultItem,
  LandingHeroLeagueCard,
  LandingParlayDemoData,
  PrecioTransferContext,
  PrecioTransferRequestSummary,
  PublicNavPath,
} from "./PublicSiteSections";

export const PUBLIC_NAV_ITEMS: ReadonlyArray<{
  href: Exclude<PublicNavPath, "/">;
  label: string;
}> = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/motores", label: "Motores" },
  { href: "/resultados", label: "Resultados" },
  { href: "/parlays", label: "Parlays" },
  { href: "/comunidad", label: "Comunidad" },
  { href: "/precio", label: "Precio" },
];

const LANDING_NAV_ITEMS = [
  { href: "#que-obtienes", label: "Funciones" },
  { href: "#motores", label: "Motores" },
  { href: "#precio", label: "Precio" },
  { href: "#faq", label: "Preguntas" },
] as const;

export interface OddsComparisonResult {
  kind: "empty" | "invalid" | "valid";
  tone: "muted" | "positive" | "negative";
  colorVar: string;
  impliedProbability: number | null;
  diffPts: number | null;
  text: string;
}

function formatPctOneDecimal(p: number): string {
  return `${(p * 100).toFixed(1)} %`;
}

function formatMxnAmount(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Compara el momio ingresado por la persona (americano o decimal) contra la probabilidad del modelo.
 * No guarda nada en servidor ni en almacenamiento local.
 */
export function compareUserOddsInput(
  mostProbableP: number,
  rawInput: string,
): OddsComparisonResult {
  const trimmed = String(rawInput ?? "").trim();
  if (!trimmed) {
    return {
      kind: "empty",
      tone: "muted",
      colorVar: "var(--pl-text-muted)",
      impliedProbability: null,
      diffPts: null,
      text: "Escribe el momio de tu casa (americano o decimal) para compararlo.",
    };
  }

  const normalized = trimmed.replace(/^[\u2212\u2013]/, "-").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    return {
      kind: "invalid",
      tone: "muted",
      colorVar: "var(--pl-text-muted)",
      impliedProbability: null,
      diffPts: null,
      text: "Escribe un momio válido, como \u2212200, +150 o 1.50.",
    };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return {
      kind: "invalid",
      tone: "muted",
      colorVar: "var(--pl-text-muted)",
      impliedProbability: null,
      diffPts: null,
      text: "Escribe un momio válido, como \u2212200, +150 o 1.50.",
    };
  }

  const hasExplicitSign = /^[+-]/.test(normalized);
  let implied: number | null = null;

  if (hasExplicitSign) {
    if (value <= -100) {
      implied = -value / (-value + 100);
    } else if (value >= 100) {
      implied = 100 / (value + 100);
    }
  } else if (value >= 1.01 && value <= 99) {
    implied = 1 / value;
  } else if (value >= 100 && value <= 10000 && Number.isInteger(value)) {
    implied = 100 / (value + 100);
  }

  if (implied === null || !(implied > 0 && implied < 1)) {
    return {
      kind: "invalid",
      tone: "muted",
      colorVar: "var(--pl-text-muted)",
      impliedProbability: null,
      diffPts: null,
      text: "Escribe un momio válido, como \u2212200, +150 o 1.50.",
    };
  }

  const diff = (mostProbableP - implied) * 100;
  const impLabel = (implied * 100).toFixed(1);
  const absDiffLabel = Math.abs(diff).toFixed(1);

  if (diff >= 0) {
    return {
      kind: "valid",
      tone: "positive",
      colorVar: "var(--pl-success)",
      impliedProbability: implied,
      diffPts: diff,
      text: `Probabilidad implícita ${impLabel} %. Tu momio paga más que el justo: +${absDiffLabel} pts.`,
    };
  }

  return {
    kind: "valid",
    tone: "negative",
    colorVar: "var(--pl-text-secondary)",
    impliedProbability: implied,
    diffPts: diff,
    text: `Probabilidad implícita ${impLabel} %. Tu momio paga menos que el justo: \u2212${absDiffLabel} pts.`,
  };
}

export function PublicNavBarClient({
  activePath,
  hasSession = false,
}: {
  activePath?: PublicNavPath;
  hasSession?: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const landing = activePath === "/";
  const navItems = landing ? LANDING_NAV_ITEMS : PUBLIC_NAV_ITEMS;
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const scrollMarker = useRef<HTMLSpanElement | null>(null);
  const drawerId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

  useEffect(() => {
    if (!landing || !scrollMarker.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setScrolled(!entry.isIntersecting);
    });
    observer.observe(scrollMarker.current);
    return () => observer.disconnect();
  }, [landing]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 900) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  return (
    <>
    {landing ? <span ref={scrollMarker} className="pl-clean-scroll-marker" aria-hidden="true" /> : null}
    <header className="pl-lp-header" data-scrolled={landing ? scrolled : undefined}>
      <div className="pl-lp-wrap">
        <nav
          aria-label="Principal"
          className={landing ? "pl-lp-bar" : "pl-lp-bar glass-pill-bar glass-ring"}
        >
          <a
            href="/"
            aria-label="PitchLab, inicio"
            className="pl-lp-logo"
          >
            <BrandLogo variant="horizontal" width={133} height={26} alt="" />
          </a>

          <div className="pl-lp-nav">
            {navItems.map((item) => (
              <a
                key={item.href}
                className="pl-lp-navlink"
                href={item.href}
                aria-current={activePath === item.href ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="pl-lp-actions">
            <ThemeToggle shape="pill" />
            <a className="pl-lp-navlink pl-lp-navlink--login" href={hasSession ? "/app" : "/login"}>
              {hasSession ? "Ir a la app" : "Entrar"}
            </a>
            <a
              className="pl-lp-btn pl-lp-btn--compact pl-lp-btn-primary pl-lp-bar-cta"
              href={hasSession ? "/app" : "/signup"}
            >
              Probar 7 días
            </a>
            <button
              ref={menuBtnRef}
              type="button"
              className="pl-lp-menu-btn"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              aria-controls={drawerId}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </nav>

        {menuOpen ? (
          <div
            id={drawerId}
            className="pl-lp-mobile-menu glass-card glass-ring"
            role="region"
            aria-label="Menú principal móvil"
          >
            {navItems.map((item) => (
              <a
                key={item.href}
                className="pl-lp-navlink"
                href={item.href}
                aria-current={activePath === item.href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              className="pl-lp-btn pl-lp-btn-primary"
              href={hasSession ? "/app" : "/signup"}
              onClick={() => setMenuOpen(false)}
            >
              Probar 7 días gratis{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        ) : null}
      </div>
    </header>
    </>
  );
}

const FALLBACK_DEMO_CARD: LandingHeroLeagueCard = {
  league: asLeagueId("liga-mx"),
  leagueShort: "Liga MX",
  leagueLabel: "Liga MX",
  roundLabel: "Liga MX · Ejemplo ilustrativo",
  whenLabel: "Sáb · 17:00",
  home: { slug: "queretaro", name: "Querétaro", note: "Local" },
  away: { slug: "monterrey", name: "Monterrey", note: "Visitante" },
  splitProbabilities: [0.28, 0.25, 0.47],
  splitLabels: ["Querétaro", "Empate", "Monterrey"],
  mostProbable: {
    label: "Monterrey gana",
    p: 0.47,
    fairAmerican: "+113",
    fairDecimal: "2.13",
  },
  otherMarkets: [
    { label: "Monterrey o empate", p: 0.72, fairAmerican: "\u2212257" },
    { label: "Más de 1.5 goles", p: 0.78, fairAmerican: "\u2212355" },
    { label: "Ambos anotan", p: 0.56, fairAmerican: "\u2212127" },
  ],
};

export interface HeroMatchDemoIslandProps {
  cards: readonly LandingHeroLeagueCard[];
  inputId?: string;
  containerId?: string;
  maxLeagues?: number;
  variant?: "clean";
}

export function HeroMatchDemoIsland({
  cards,
  inputId = "tu-momio",
  containerId = "hoy",
  maxLeagues = 4,
  variant,
}: HeroMatchDemoIslandProps): React.JSX.Element {
  const visibleCards = cards.length > 0 ? cards.slice(0, maxLeagues) : [FALLBACK_DEMO_CARD];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [oddsInput, setOddsInput] = useState("-200");
  const [teamBadgeSize, setTeamBadgeSize] = useState(48);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(max-width: 720px)");
    const syncSize = () => setTeamBadgeSize(mq.matches ? 36 : 48);
    syncSize();
    mq.addEventListener("change", syncSize);
    return () => mq.removeEventListener("change", syncSize);
  }, []);

  const safeIndex = selectedIndex < visibleCards.length ? selectedIndex : 0;
  const active = visibleCards[safeIndex] ?? FALLBACK_DEMO_CARD;
  const comparison = compareUserOddsInput(active.mostProbable.p, oddsInput);
  const resultId = `${inputId}-res`;
  const resModifier =
    comparison.tone === "positive"
      ? "pl-lp-odds-res--pos"
      : comparison.tone === "negative"
        ? "pl-lp-odds-res--neg"
        : "";

  if (variant === "clean") {
    if (cards.length === 0) {
      return (
        <div id={containerId} className="pl-clean-comparator">
          <p>No hay partidos publicados para comparar en este momento.</p>
        </div>
      );
    }

    return (
      <div id={containerId} className="pl-clean-comparator">
        {visibleCards.length > 1 ? (
          <div role="group" aria-label="Elegir liga" className="pl-clean-leagues">
            {visibleCards.map((card, index) => (
              <button
                key={card.league}
                type="button"
                aria-pressed={index === safeIndex}
                onClick={() => setSelectedIndex(index)}
              >
                {card.leagueShort}
              </button>
            ))}
          </div>
        ) : null}
        <div className="pl-clean-match" key={`${active.league}-match`}>
          <p className="pl-clean-match-meta">{active.roundLabel} · {active.whenLabel}</p>
          <div className="pl-clean-teams">
            {[active.home, active.away].map((team) => (
              <div key={team.slug}>
                <TeamBadge league={active.league} slug={team.slug} name={team.name} size={36} decorative />
                <strong>{team.name}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="pl-clean-prediction" key={`${active.league}-prediction`}>
          <div>
            <p>Lo más probable</p>
            <strong>{active.mostProbable.label}</strong>
          </div>
          <div className="pl-clean-stat num">
            <strong>{formatPctOneDecimal(active.mostProbable.p)}</strong>
            <p>Justo {active.mostProbable.fairAmerican}</p>
          </div>
        </div>
        <div className="pl-clean-split" key={`${active.league}-split`}>
          <ProbSplit probabilities={active.splitProbabilities} labels={active.splitLabels} showLabels />
        </div>
        <div className="pl-clean-odds">
          <div>
            <label htmlFor={inputId}>Tu momio</label>
            <input
              id={inputId}
              className="num"
              type="text"
              inputMode="text"
              value={oddsInput}
              onChange={(event) => setOddsInput(event.target.value)}
              placeholder="−200"
              aria-describedby={resultId}
            />
          </div>
          <p id={resultId} className="num" data-tone={comparison.tone} style={{ color: comparison.colorVar }} aria-live="polite">
            {comparison.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id={containerId} className="pl-lp-hero-device-stage">
      <div className="pl-lp-hero-floating-summary glass-card glass-ring">
        <div className="pl-lp-hero-floating-head">
          <span className="pl-lp-live-dot" aria-hidden="true" />
          <span className="pl-lp-hero-floating-title">
            Pulso auditado · 5 motores
          </span>
          <span className="pl-lp-hero-floating-badge num">Ejemplo</span>
        </div>
        <div className="pl-lp-hero-floating-metrics num">
          <div>
            <span className="pl-lp-hero-floating-val pl-lp-hero-floating-val--ok">
              +12.05 u
            </span>
            <span className="pl-lp-hero-floating-sub">Saldo acumulado</span>
          </div>
          <div>
            <span className="pl-lp-hero-floating-val">61.9 %</span>
            <span className="pl-lp-hero-floating-sub">Aciertos publicados</span>
          </div>
        </div>
        <div className="pl-lp-hero-floating-chips num" aria-hidden="true">
          <span className="pl-lp-mini-chip pl-lp-mini-chip--hit">✓ +1.50 u</span>
          <span className="pl-lp-mini-chip pl-lp-mini-chip--hit">✓ +0.91 u</span>
          <span className="pl-lp-mini-chip pl-lp-mini-chip--miss">✕ −1.00 u</span>
        </div>
      </div>

      <div className="pl-lp-card pl-lp-demo-card glass-lens glass-ring glass-ring--featured">
        {visibleCards.length > 1 ? (
          <div role="group" aria-label="Elegir liga" className="pl-lp-league-tabs">
            {visibleCards.map((card, index) => (
              <button
                key={card.league}
                type="button"
                className="pl-lp-tab"
                aria-pressed={index === safeIndex}
                onClick={() => setSelectedIndex(index)}
              >
                <LeagueBadge league={card.league} size={18} />
                <span>{card.leagueShort}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="pl-lp-match-meta">
          <span>{active.roundLabel}</span>
          <span className="num">{active.whenLabel}</span>
        </div>

        <div className="pl-lp-teams">
          <div className="pl-lp-team">
            <TeamBadge
              league={active.league}
              slug={active.home.slug}
              name={active.home.name}
              size={teamBadgeSize}
              decorative
            />
            <div style={{ minWidth: 0 }}>
              <p className="pl-lp-team-name">{active.home.name}</p>
              <p className="pl-lp-team-note num">{active.home.note}</p>
            </div>
          </div>
          <span className="pl-lp-vs">vs</span>
          <div className="pl-lp-team pl-lp-team--away">
            <div style={{ minWidth: 0 }}>
              <p className="pl-lp-team-name">{active.away.name}</p>
              <p className="pl-lp-team-note num">{active.away.note}</p>
            </div>
            <TeamBadge
              league={active.league}
              slug={active.away.slug}
              name={active.away.name}
              size={teamBadgeSize}
              decorative
            />
          </div>
        </div>

        <div className="pl-lp-most-box">
          <div style={{ minWidth: 0 }}>
            <p className="pl-lp-most-kicker">Lo más probable</p>
            <p className="pl-lp-most-label">{active.mostProbable.label}</p>
            <p className="pl-lp-most-sub num">
              Momio justo{" "}
              <strong style={{ color: "var(--pl-text)" }}>
                {active.mostProbable.fairAmerican}
              </strong>{" "}
              · decimal {active.mostProbable.fairDecimal}
            </p>
          </div>
          <p className="pl-lp-most-prob num">
            {formatPctOneDecimal(active.mostProbable.p)}
          </p>
        </div>

        <div>
          <ProbSplit
            probabilities={active.splitProbabilities}
            labels={active.splitLabels}
            showLabels
          />
        </div>

        {active.otherMarkets.length > 0 ? (
          <div className="pl-lp-markets">
            <p className="pl-lp-markets-title">Otros mercados de este partido</p>
            {active.otherMarkets.map((row) => (
              <div key={row.label} className="pl-lp-market-row">
                <span style={{ fontWeight: 600, minWidth: 0 }}>{row.label}</span>
                <span className="pl-lp-market-bar" aria-hidden="true">
                  <span
                    className="pl-lp-market-fill"
                    style={{
                      width: `${Math.min(100, Math.max(4, Math.round(row.p * 100)))}%`,
                    }}
                  />
                </span>
                <span className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                  {formatPctOneDecimal(row.p)}
                </span>
                <span
                  className="num"
                  style={{ textAlign: "right", color: "var(--pl-text-muted)" }}
                >
                  {row.fairAmerican}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="pl-lp-odds-box">
          <label htmlFor={inputId} className="pl-lp-odds-label">
            Tu momio para{" "}
            <strong style={{ color: "var(--pl-text)" }}>
              {active.mostProbable.label}
            </strong>
          </label>
          <input
            id={inputId}
            className="pl-lp-odds-input num"
            type="text"
            inputMode="decimal"
            value={oddsInput}
            onChange={(event) => setOddsInput(event.target.value)}
            placeholder="−200"
            aria-describedby={resultId}
          />
          <p
            id={resultId}
            className={`pl-lp-odds-res ${resModifier} num`.trim()}
            style={{ color: comparison.colorVar }}
            aria-live="polite"
          >
            {comparison.text}
          </p>
        </div>

        <p className="pl-lp-demo-engines-foot">
          Consenso activo: Tachyon · Singularity · Minkowski · Geodesic · Cortex IA
        </p>
      </div>
    </div>
  );
}

interface ShowcasePillar {
  id: string;
  title: string;
  description: string;
  icon: "target" | "layers" | "bolt" | "shield";
}

const SHOWCASE_PILLARS: readonly ShowcasePillar[] = [
  {
    id: "momio-justo",
    title: "Probabilidad y momio justo",
    description:
      "Compara el precio de tu casa con la probabilidad del modelo.",
    icon: "target",
  },
  {
    id: "parlays-sin-choques",
    title: "Parlays sin contradicciones",
    description:
      "Combina de 2 a 6 selecciones y descubre cuáles son compatibles.",
    icon: "layers",
  },
  {
    id: "match-center-vivo",
    title: "Avisos de tus partidos",
    description:
      "Vigila un partido y recibe un aviso antes del inicio.",
    icon: "bolt",
  },
  {
    id: "historial-integro",
    title: "Bitácora verificable",
    description:
      "Revisa qué se pronosticó antes del partido y cómo se calificó.",
    icon: "shield",
  },
];

function ShowcasePillarIcon({ icon }: { icon: ShowcasePillar["icon"] }): React.JSX.Element {
  switch (icon) {
    case "target":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case "layers":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
          <path d="M4 12l8 4.5 8-4.5" />
          <path d="M4 16.5L12 21l8-4.5" />
        </svg>
      );
    case "bolt":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "shield":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5-4-1.3-7-5-7-9.5V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
  }
}

export function FeatureShowcaseIsland({
  parlayDemo,
  results = [],
  heroCard,
}: {
  parlayDemo: LandingParlayDemoData;
  results?: readonly LandingFinishedResultItem[];
  heroCard?: LandingHeroLeagueCard;
}): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const stageId = useId();
  const result = results[0];

  return (
    <section id="que-obtienes" className="pl-clean-section" aria-labelledby="pl-clean-features">
      <div className="pl-lp-wrap">
        <header className="pl-clean-heading">
          <h2 id="pl-clean-features">¿Qué obtienes?</h2>
          <p>Investiga un partido, compara el momio y sigue tus decisiones en una sola app.</p>
        </header>
        <div className="pl-clean-showcase">
          <div className="pl-clean-showcase-stage" id={stageId}>
            {activeIndex === 0 ? (
              <figure className="pl-clean-market-captures">
                <img
                  src="/landing/feature-odds.webp"
                  width={816}
                  height={491}
                  alt="Comparador de PitchLab con un momio ingresado para Tigres vs. América"
                  loading="lazy"
                  decoding="async"
                />
                <img
                  className="pl-clean-market-goals"
                  src="/landing/feature-expected-goals.webp"
                  width={502}
                  height={586}
                  alt="Goles esperados y probabilidades de Tigres vs. América"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            ) : null}
            {activeIndex === 1 ? (
              <div className="pl-clean-preview">
                <p className="pl-clean-proof">Armador de parlay</p>
                <h3>Selecciones compatibles</h3>
                <ul>
                  {parlayDemo.legs.map((leg) => (
                    <li key={leg.label}><strong>{leg.label}</strong><span>{leg.matchLabel}</span></li>
                  ))}
                  <li>
                    <strong className="pl-clean-warning">{parlayDemo.blockedLeg.label} · Bloqueada</strong>
                    <span>Contradice «{parlayDemo.blockedLeg.conflictWithLabel}».</span>
                  </li>
                </ul>
              </div>
            ) : null}
            {activeIndex === 2 ? (
              <div className="pl-clean-preview">
                <p className="pl-clean-proof">Avisos</p>
                <h3>Tu partido está por empezar</h3>
                <ul>
                  {heroCard ? (
                    <li><strong>{heroCard.home.name} vs {heroCard.away.name}</strong><span>{heroCard.leagueShort} · {heroCard.whenLabel}</span></li>
                  ) : null}
                  <li><strong>Partido vigilado</strong><span>Aviso 60 minutos antes del inicio.</span></li>
                </ul>
              </div>
            ) : null}
            {activeIndex === 3 ? (
              <div className="pl-clean-preview">
                <p className="pl-clean-proof">Bitácora</p>
                <h3>Pronóstico registrado antes del partido</h3>
                {result ? (
                  <ul>
                    <li><strong>{result.pickLabel}</strong><span>{result.metaLabel}</span></li>
                    <li><strong>Resultado registrado</strong><span>{result.scoreLabel}</span></li>
                    <li><strong>Calificación</strong><span>{result.hit ? "Se cumplió" : "No se cumplió"}</span></li>
                  </ul>
                ) : <p>Aún no hay resultados publicados para mostrar.</p>}
              </div>
            ) : null}
          </div>
          <div className="pl-clean-showcase-controls" role="group" aria-label="Herramientas incluidas">
            {SHOWCASE_PILLARS.map((pillar, index) => (
              <button
                key={pillar.id}
                type="button"
                aria-pressed={index === activeIndex}
                aria-controls={stageId}
                onClick={() => setActiveIndex(index)}
              >
                <ShowcasePillarIcon icon={pillar.icon} />
                <span><strong>{pillar.title}</strong><span>{pillar.description}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function UltraPassCardStageIsland(): React.JSX.Element {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="pl-lp-ultra-3d-stage">
      <div className="pl-referral-glass-horizon" aria-hidden="true" />
      <button
        type="button"
        className="pl-lp-ultra-3d-btn"
        aria-label={
          flipped
            ? "Tarjeta Pase PitchLab Ultra, reverso. Clic para ver el frente"
            : "Tarjeta Pase PitchLab Ultra. Arrastra para inclinar o haz clic para voltear"
        }
        onClick={() => setFlipped((prev) => !prev)}
      >
        <ReferralCard3D
          code="ACCESO TOTAL"
          tierLabel="ULTRA"
          bottomLeftLabel="Pase Ultra"
          backSubtitle="Pase PitchLab Ultra · Sin niveles"
          flipped={flipped}
          onFlipChange={setFlipped}
          asDecorativeChild
          autoRotate
        />
      </button>
    </div>
  );
}

export function PricingCardIsland({
  hasSession = false,
  animated = false,
  layout = "single",
}: {
  hasSession?: boolean;
  /** En `/precio`: conteo rodante del precio, color de marca y «Ultra» con espectro animado. */
  animated?: boolean;
  /** En `/`: comparativa lado a lado estilo ScoutPicks; en `/precio`: tarjeta individual junto al 3D. */
  layout?: "single" | "compare";
} = {}): React.JSX.Element {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const selectBilling = (next: "monthly" | "annual") => {
    setBilling(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pitchlab:pricing-cycle", { detail: next }));
    }
  };
  const isAnnual = billing === "annual";
  const amount = isAnnual ? MEMBERSHIP_SPEC.annualMxn : MEMBERSHIP_SPEC.monthlyMxn;
  const amountLabel = formatMxnAmount(amount);
  const noteLabel = isAnnual
    ? `MXN al año · equivale a $${MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn} al mes · IVA incluido`
    : "MXN al mes · IVA incluido · cancela cuando quieras";

  const planTitle =
    animated && MEMBERSHIP_SPEC.name.endsWith("Ultra") ? (
      <>
        {MEMBERSHIP_SPEC.name.slice(0, -"Ultra".length)}
        <span className="pl-lp-ultra-word">Ultra</span>
      </>
    ) : (
      MEMBERSHIP_SPEC.name
    );

  if (layout === "compare") {
    return (
      <div className="pl-lp-pricing-compare-wrap">
        <div className="pl-lp-billing-center">
          <div
            role="group"
            aria-label="Periodo de pago"
            className="pl-lp-billing-toggle pl-lp-billing-toggle--centered"
          >
            <button
              type="button"
              className="pl-lp-tab"
              aria-pressed={!isAnnual}
              onClick={() => selectBilling("monthly")}
            >
              Mensual
            </button>
            <button
              type="button"
              className="pl-lp-tab"
              aria-pressed={isAnnual}
              onClick={() => selectBilling("annual")}
            >
              Anual (Ahorras {MEMBERSHIP_SPEC.annualSavingsPct} %)
            </button>
          </div>
        </div>

        <div className="pl-lp-pricing-compare-grid">
          <article className="pl-lp-card pl-lp-pricing-card pl-lp-pricing-card--free glass-card glass-ring">
            <div className="pl-lp-pricing-plan-head">
              <h3 className="pl-lp-plan-name">Gratis</h3>
            </div>

            <div>
              <p className="pl-lp-price-figure num">
                <span className="pl-lp-price-currency">$</span>
                <span className="pl-lp-price-amount">0</span>
              </p>
              <p className="pl-lp-price-note">
                Sin registro · para probar el estándar antes de entrar al club
              </p>
            </div>

            <ul className="pl-lp-features">
              {[
                "Partido destacado por liga",
                "Probabilidades del modelo",
                "Comparador de momio justo",
                "Metodología de los cinco motores",
                "Muestra del historial público",
              ].map((item) => (
                <li key={item} className="pl-lp-row" style={{ alignItems: "flex-start" }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flex: "none", color: "var(--pl-text-muted)", marginTop: 2 }}
                  >
                    <path d="M5 12l5 5 9-10" pathLength={1} />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <a className="pl-lp-btn pl-lp-btn--full pl-lp-btn-ghost" href="#hoy">
              Explorar comparador gratis
            </a>
            <p className="pl-lp-pricing-foot">
              Acceso libre a la vista previa pública.
            </p>
          </article>

          <article className="pl-lp-card pl-lp-pricing-card pl-lp-pricing-card--featured glass-lens glass-ring glass-ring--featured">
            <div className="pl-lp-pricing-plan-head">
              <h3 className="pl-lp-plan-name">{planTitle}</h3>
              <span className="pl-lp-pill pl-lp-pill--brand">7 días gratis</span>
            </div>

            <div>
              <p className="pl-lp-price-figure num">
                <span className="pl-lp-price-currency">$</span>
                <span className="pl-lp-price-amount" key={billing}>{amountLabel}</span>
              </p>
              <p className="pl-lp-price-note num">{noteLabel}</p>
            </div>

            <ul className="pl-lp-features">
              {ULTRA_LANDING_FEATURES.map((feature) => (
                <li key={feature} className="pl-lp-row" style={{ alignItems: "flex-start" }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flex: "none", color: "var(--pl-success)", marginTop: 2 }}
                  >
                    <path d="M5 12l5 5 9-10" pathLength={1} />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
              <li className="pl-lp-row" style={{ alignItems: "flex-start" }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flex: "none", color: "var(--pl-brand)", marginTop: 2 }}
                >
                  <path d="M5 12l5 5 9-10" pathLength={1} />
                </svg>
                <span>
                  Programa de referidos: cuando un amigo activa su pase, los dos suman{" "}
                  {MEMBERSHIP_SPEC.referralBothRewardDays} días sin costo.
                </span>
              </li>
            </ul>

            <a
              className="pl-lp-btn pl-lp-btn--full pl-lp-btn-primary"
              href={hasSession ? "/app/account?tab=plan" : "/signup"}
            >
              {hasSession ? "Administrar o activar plan" : "Empezar 7 días gratis"}{" "}
              <span className="pl-lp-arr" aria-hidden="true">
                →
              </span>
            </a>
            <p className="pl-lp-pricing-foot">
              Sin tarjeta para la prueba · al terminar no se cobra nada si no eliges pagar
            </p>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-lp-card pl-lp-pricing-card glass-lens glass-ring glass-ring--featured">
      {animated ? (
        <LensGlowOrbs
          primaryColor="var(--pl-brand)"
          secondaryColor="var(--brand-accent)"
          subtle
        />
      ) : null}

      <div
        role="group"
        aria-label="Periodo de pago"
        className="pl-lp-billing-toggle"
      >
        <button
          type="button"
          className="pl-lp-tab"
          aria-pressed={!isAnnual}
          onClick={() => selectBilling("monthly")}
        >
          Mensual
        </button>
        <button
          type="button"
          className="pl-lp-tab"
          aria-pressed={isAnnual}
          onClick={() => selectBilling("annual")}
        >
          Anual · ahorras 4 meses
        </button>
      </div>

      <div>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 18 }}>
          {planTitle}
        </p>
        <p className="pl-lp-price-figure num">
          <span className="pl-lp-price-currency">$</span>
          <span className="pl-lp-price-amount">
            {animated ? (
              <CountUpNumber
                value={amount}
                decimals={0}
                delayMs={240}
                durationMs={700}
                format={formatMxnAmount}
              />
            ) : (
              amountLabel
            )}
          </span>
        </p>
        <p
          key={animated ? billing : undefined}
          className={animated ? "num pl-lp-price-note-live" : "num"}
          style={{ margin: "8px 0 0", fontSize: 14, color: "var(--pl-text-muted)" }}
        >
          {noteLabel}
        </p>
      </div>

      <ul className="pl-lp-features">
        {ULTRA_LANDING_FEATURES.map((feature) => (
          <li
            key={feature}
            className="pl-lp-row"
            style={{ alignItems: "flex-start" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flex: "none", color: "var(--pl-success)", marginTop: 2 }}
            >
              <path d="M5 12l5 5 9-10" pathLength={1} />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        className="pl-lp-btn pl-lp-btn--full pl-lp-btn-primary"
        href={hasSession ? "/app/account?tab=plan" : "/signup"}
      >
        {hasSession ? "Administrar o activar plan" : "Empezar 7 días gratis"}{" "}
        <span className="pl-lp-arr" aria-hidden="true">
          →
        </span>
      </a>
      <p className="pl-lp-pricing-foot">
        Sin tarjeta para la prueba · al terminar no se cobra nada si no eliges pagar
      </p>
    </div>
  );
}

export function ResultsFilterListIsland({
  results,
}: {
  results: readonly LandingFinishedResultItem[];
}): React.JSX.Element {
  const [selectedLeague, setSelectedLeague] = useState<string>("all");

  const leagues = React.useMemo(() => {
    const map = new Map<
      string,
      { league: LandingFinishedResultItem["league"]; label: string }
    >();
    for (const item of results) {
      if (!map.has(item.league)) {
        map.set(item.league, { league: item.league, label: item.leagueLabel });
      }
    }
    return Array.from(map.values());
  }, [results]);

  const filtered =
    selectedLeague === "all"
      ? results
      : results.filter((item) => item.league === selectedLeague);

  const hitsCount = filtered.filter((item) => item.hit).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
      {leagues.length > 0 ? (
        <div
          role="group"
          aria-label="Filtrar resultados por liga"
          className="pl-lp-league-tabs"
        >
          <button
            type="button"
            className="pl-lp-tab"
            aria-pressed={selectedLeague === "all"}
            onClick={() => setSelectedLeague("all")}
          >
            Todas ({results.length})
          </button>
          {leagues.map((lg) => (
            <button
              key={lg.league}
              type="button"
              className="pl-lp-tab"
              aria-pressed={selectedLeague === lg.league}
              onClick={() => setSelectedLeague(lg.league)}
            >
              <LeagueBadge league={lg.league} size={18} />
              <span>{lg.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="pl-lp-card pl-lp-results-card glass-card glass-ring">
        {filtered.length === 0 ? (
          <p className="pl-lp-fine" style={{ padding: "20px 0" }}>
            Aún no hay partidos finalizados para mostrar en esta liga.
          </p>
        ) : (
          <>
            {filtered.map((item) => (
              <div key={item.id} className="pl-lp-result-row">
                <div style={{ minWidth: 0 }}>
                  <p
                    className="num"
                    style={{ margin: 0, fontSize: 12, color: "var(--pl-text-muted)" }}
                  >
                    {item.metaLabel}
                  </p>
                  <div
                    className="pl-lp-row"
                    style={{ marginTop: 4, gap: 8, flexWrap: "wrap" }}
                  >
                    <TeamBadge
                      league={item.league}
                      slug={item.home.slug}
                      name={item.home.name}
                      size={20}
                      decorative
                    />
                    <p
                      className="num"
                      style={{ margin: 0, fontSize: 16, fontWeight: 700 }}
                    >
                      {item.scoreLabel}
                    </p>
                    <TeamBadge
                      league={item.league}
                      slug={item.away.slug}
                      name={item.away.name}
                      size={20}
                      decorative
                    />
                  </div>
                  <p
                    className="num"
                    style={{
                      margin: "4px 0 0",
                      fontSize: 14,
                      color: "var(--pl-text-secondary)",
                    }}
                  >
                    {item.pickLabel} · {formatPctOneDecimal(item.p)} · justo{" "}
                    {item.fairAmerican}
                  </p>
                </div>
                <span
                  className={`pl-lp-status ${
                    item.hit ? "pl-lp-status--hit" : "pl-lp-status--miss"
                  }`}
                >
                  {item.hit ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l5 5 9-10" pathLength={1} />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  )}
                  <span>{item.hit ? "Se cumplió" : "No se cumplió"}</span>
                </span>
              </div>
            ))}
            <p
              className="num"
              style={{
                margin: 0,
                padding: "16px 0",
                fontSize: 13,
                color: "var(--pl-text-muted)",
              }}
            >
              Historial publicado antes del partido · {hitsCount} de {filtered.length} cumplidos
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const SHORT_DATE_MX = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function formatIsoDateEsMx(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return SHORT_DATE_MX.format(new Date(ms)).replace(/\./g, "");
}

function formatCentavosMxnPublic(centavos: number): string {
  const pesos = centavos / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

export function AccessibleCopyButton({
  value,
  idleLabel,
  copiedLabel = "Copiado",
  announceLabel,
  dataAttr,
}: {
  value: string;
  idleLabel: string;
  copiedLabel?: string;
  announceLabel: string;
  dataAttr?: "ref" | "clabe";
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
    } catch (err) {
      void err;
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="pl-lp-btn pl-lp-btn--compact pl-lp-btn-ghost"
        style={{ minHeight: 44, padding: "8px 14px", fontSize: 13 }}
        data-copy-spei={dataAttr}
      >
        {copied ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--pl-success)" }}
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        <span>{copied ? copiedLabel : idleLabel}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${announceLabel} copiado al portapapeles` : ""}
      </span>
    </span>
  );
}

export function SpeiTransferPricingIsland({
  context,
}: {
  context: PrecioTransferContext;
}): React.JSX.Element | null {
  const [selectedInterval, setSelectedInterval] = useState<"monthly" | "annual">(
    context.activePending?.planInterval ?? "monthly",
  );
  const [speiRef, setSpeiRef] = useState<string | null>(context.speiReferenceCode);
  const [activePending, setActivePending] = useState<PrecioTransferRequestSummary | null>(
    context.activePending,
  );
  const [latestApproved, setLatestApproved] = useState<PrecioTransferRequestSummary | null>(
    context.latestApproved,
  );
  const [latestRejected, setLatestRejected] = useState<PrecioTransferRequestSummary | null>(
    context.latestRejected,
  );
  const [activePass, setActivePass] = useState<boolean>(context.activePass);

  const [originBank, setOriginBank] = useState<string>(context.activePending?.originBank ?? "");
  const [receiptReference, setReceiptReference] = useState<string>(
    context.activePending?.receiptReference ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const bankInputId = useId();
  const trackingInputId = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCycle = (ev: Event) => {
      const detail = (ev as CustomEvent<"monthly" | "annual">).detail;
      if ((detail === "monthly" || detail === "annual") && !activePending) {
        setSelectedInterval(detail);
      }
    };
    window.addEventListener("pitchlab:pricing-cycle", onCycle);
    return () => window.removeEventListener("pitchlab:pricing-cycle", onCycle);
  }, [activePending]);

  // Hidratación del almacén de vista previa cuando la app corre con PIN de beta (!accountsEnabled)
  useEffect(() => {
    if (context.viewerState !== "beta_preview" || context.accountsEnabled) return;
    const syncFromPreview = () => {
      const st = readPreviewSpeiState();
      setSpeiRef(st.speiReferenceCode);
      const pending = st.requests.find((r) => r.status === "pending_review") ?? null;
      const approved = st.requests.find((r) => r.status === "approved") ?? null;
      const rejected = st.requests.find((r) => r.status === "rejected") ?? null;
      setActivePending(pending);
      setLatestApproved(approved);
      setLatestRejected(rejected);
      setActivePass(Boolean(st.activeUntilIso && Date.parse(st.activeUntilIso) > Date.now()));
      if (pending) {
        setOriginBank(pending.originBank ?? "");
        setReceiptReference(pending.receiptReference ?? "");
      }
    };
    syncFromPreview();
    window.addEventListener(PREVIEW_SPEI_EVENT, syncFromPreview);
    return () => window.removeEventListener(PREVIEW_SPEI_EVENT, syncFromPreview);
  }, [context.accountsEnabled, context.viewerState]);

  if (context.paymentMode !== "transfer") {
    return null;
  }

  const isPreview = context.viewerState === "beta_preview" && !context.accountsEnabled;
  const canTransact = context.viewerState === "member" || isPreview;
  const effectiveInterval = activePending?.planInterval ?? selectedInterval;
  const quotedAmountCentavos = activePending
    ? activePending.amountCentavosMxn
    : effectiveInterval === "annual"
      ? context.quotes.annualCentavos
      : context.quotes.monthlyCentavos;

  const handleSubmitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canTransact) return;

    if (isPreview) {
      const saved = createOrUpdatePreviewTransfer({
        planInterval: effectiveInterval,
        amountCentavosMxn: quotedAmountCentavos,
        originBank: originBank.trim() || null,
        reportedAmountCentavosMxn: quotedAmountCentavos,
        receiptReference: receiptReference.trim() || null,
      });
      setActivePending(saved);
      setFeedback({
        kind: "ok",
        text: `Transferencia ${saved.referenceCode} registrada en revisión (modo vista previa). Al confirmar el pago en la consola del fundador se generará tu cupón de un solo uso y se enviará desde noreply@pitchlab.mx.`,
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      if (activePending) {
        const res = await fetch(`/api/me/transfers/${activePending.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            originBank: originBank.trim() || null,
            reportedAmountCentavosMxn: quotedAmountCentavos,
            receiptReference: receiptReference.trim() || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          request?: PrecioTransferRequestSummary;
          error?: string;
        } | null;
        if (!res.ok || !json?.ok) {
          setFeedback({
            kind: "error",
            text: json?.error ?? "No se pudo actualizar tu aviso de transferencia.",
          });
          return;
        }
        if (json.request) setActivePending(json.request);
        setFeedback({
          kind: "ok",
          text: "Datos actualizados. En cuanto confirmemos tu pago te enviaremos tu cupón desde noreply@pitchlab.mx.",
        });
        return;
      }

      const res = await fetch("/api/me/transfers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planInterval: effectiveInterval,
          originBank: originBank.trim() || null,
          reportedAmountCentavosMxn: quotedAmountCentavos,
          receiptReference: receiptReference.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        speiReferenceCode?: string;
        request?: PrecioTransferRequestSummary;
        activePending?: PrecioTransferRequestSummary | null;
        error?: string;
      } | null;

      if (!res.ok) {
        if (res.status === 409 && json?.activePending) {
          setActivePending(json.activePending);
          setFeedback({
            kind: "ok",
            text: "Ya tienes una transferencia en revisión con tu referencia única.",
          });
          return;
        }
        setFeedback({
          kind: "error",
          text: json?.error ?? "No pudimos registrar tu aviso de transferencia.",
        });
        return;
      }

      if (json?.speiReferenceCode) setSpeiRef(json.speiReferenceCode);
      if (json?.request) setActivePending(json.request);
      setFeedback({
        kind: "ok",
        text: "Aviso registrado en revisión. Al confirmar tu pago te enviaremos un cupón de un solo uso desde noreply@pitchlab.mx para canjearlo en /canjear.",
      });
    } catch (err) {
      void err;
      setFeedback({
        kind: "error",
        text: "Error de conexión al registrar la transferencia. Intenta de nuevo.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelPending = async () => {
    if (!activePending) return;
    if (isPreview) {
      cancelPreviewTransfer(activePending.id);
      setActivePending(null);
      setFeedback({
        kind: "ok",
        text: "Aviso cancelado. Tu referencia única sigue disponible para cuando decidas transferir.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/me/transfers/${activePending.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setFeedback({
          kind: "error",
          text: json?.error ?? "No se pudo cancelar el aviso pendiente.",
        });
        return;
      }
      setActivePending(null);
      setFeedback({
        kind: "ok",
        text: "Aviso cancelado. Conservas la misma referencia única ligada a tu cuenta.",
      });
    } catch (err) {
      void err;
      setFeedback({
        kind: "error",
        text: "No pudimos cancelar el aviso. Intenta de nuevo.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="transferencia"
      className="pl-lp-section"
      aria-labelledby="pl-lp-spei-heading"
      data-precio-spei-section=""
    >
      <div className="pl-lp-wrap pl-lp-stack">
        <div className="pl-lp-section-head">
          <p className="pl-lp-eyebrow">Activación por transferencia + cupón</p>
          <h2 id="pl-lp-spei-heading" className="pl-lp-h2">
            Paga por transferencia SPEI sin cargos automáticos.
          </h2>
          <p className="pl-lp-lede">
            Transfiere desde tu banca móvil usando tu referencia única, recibe por correo tu cupón personal desde{" "}
            <strong className="num">noreply@pitchlab.mx</strong> y activa tus días en{" "}
            <a href="/canjear" style={{ color: "var(--pl-brand)", textDecoration: "underline" }}>
              /canjear
            </a>
            .
          </p>
        </div>

        <ol className="pl-lp-steps" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <li>
            <span className="pl-lp-step-idx num">01</span>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">Copia tu referencia única</h3>
              <p style={{ margin: 0, color: "var(--pl-text-secondary)", lineHeight: 1.5, fontSize: 14 }}>
                Cada cuenta tiene un código permanente <span className="num">PL-…</span> para poner como concepto o referencia al transferir.
              </p>
            </div>
          </li>
          <li>
            <span className="pl-lp-step-idx num">02</span>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">Confirmamos tu pago</h3>
              <p style={{ margin: 0, color: "var(--pl-text-secondary)", lineHeight: 1.5, fontSize: 14 }}>
                Revisamos las transferencias pendientes con esa referencia y validamos el depósito recibido.
              </p>
            </div>
          </li>
          <li>
            <span className="pl-lp-step-idx num">03</span>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">Recibes tu cupón por correo</h3>
              <p style={{ margin: 0, color: "var(--pl-text-secondary)", lineHeight: 1.5, fontSize: 14 }}>
                Te enviamos un cupón personal de un solo uso con 30 días de vigencia desde{" "}
                <span className="num">noreply@pitchlab.mx</span>.
              </p>
            </div>
          </li>
          <li>
            <span className="pl-lp-step-idx num">04</span>
            <div className="pl-lp-step-body">
              <h3 className="pl-lp-h3">Canjéalo en /canjear</h3>
              <p style={{ margin: 0, color: "var(--pl-text-secondary)", lineHeight: 1.5, fontSize: 14 }}>
                Ingresa tu código en <span className="num">/canjear</span> y tu suscripción queda activa por el periodo pagado.
              </p>
            </div>
          </li>
        </ol>

        <div className="pl-lp-card glass-card glass-ring" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {isPreview ? (
            <div className="pl-lp-row pl-lp-row--between" style={{ flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--pl-text-secondary)" }}>
                Modo vista previa activo: referencia y avisos de demostración en esta sesión.
              </span>
              <span className="pl-lp-pill" data-example-badge="">
                Ejemplo
              </span>
            </div>
          ) : null}

          {!canTransact ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h3 className="pl-lp-h3" style={{ margin: "0 0 6px" }}>
                  {context.viewerState === "incomplete_signup"
                    ? "Termina el paso 2 de tu registro para ver tu cuenta destino y tu referencia única"
                    : "Inicia sesión para ver la cuenta destino y tu referencia única SPEI"}
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--pl-text-secondary)", lineHeight: 1.55 }}>
                  Tu código de referencia está ligado directamente a tu cuenta de PitchLab para identificar tu transferencia sin confusiones y enviarte el cupón a tu correo registrado.
                </p>
              </div>
              <div className="pl-lp-hero-ctas" style={{ marginTop: 0 }}>
                {context.viewerState === "incomplete_signup" ? (
                  <a
                    className="pl-lp-btn pl-lp-btn-primary"
                    href="/signup?paso=2&via=cuenta&next=%2Fprecio%23transferencia"
                  >
                    Completar mi registro{" "}
                    <span className="pl-lp-arr" aria-hidden="true">
                      →
                    </span>
                  </a>
                ) : (
                  <>
                    <a
                      className="pl-lp-btn pl-lp-btn-primary"
                      href="/login?next=%2Fprecio%23transferencia"
                    >
                      Iniciar sesión y ver mi referencia{" "}
                      <span className="pl-lp-arr" aria-hidden="true">
                        →
                      </span>
                    </a>
                    <a className="pl-lp-btn pl-lp-btn-ghost" href="/signup">
                      Crear cuenta (7 días sin costo)
                    </a>
                  </>
                )}
                <a className="pl-lp-btn pl-lp-btn-ghost" href="/canjear">
                  Ya tengo mi cupón · Ir a /canjear
                </a>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Banners claros para cada estado del flujo */}
              {latestApproved?.awaitingCouponRedemption ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="glass-ring"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--pl-surface-raised, var(--pl-surface))",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  data-spei-state="awaiting_redemption"
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 680 }}>
                    <strong style={{ fontSize: 14, color: "var(--pl-success)" }}>
                      Pago confirmado · Te enviamos tu cupón por correo
                    </strong>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--pl-text-secondary)", lineHeight: 1.5 }}>
                      Revisa tu bandeja (remitente <strong className="num">noreply@pitchlab.mx</strong>). Tu cupón es de un solo uso
                      {latestApproved.couponExpiresAtIso
                        ? ` y tiene vigencia hasta el ${formatIsoDateEsMx(latestApproved.couponExpiresAtIso)}`
                        : ""}
                      . Canjéalo para activar tus días pagados.
                    </p>
                  </div>
                  <a className="pl-lp-btn pl-lp-btn-primary" href="/canjear" data-spei-go-redeem="">
                    Ir a /canjear{" "}
                    <span className="pl-lp-arr" aria-hidden="true">
                      →
                    </span>
                  </a>
                </div>
              ) : latestApproved && !latestApproved.awaitingCouponRedemption && activePass ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="glass-ring"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--pl-surface-raised, var(--pl-surface))",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                  data-spei-state="redeemed_active"
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <strong style={{ fontSize: 14, color: "var(--pl-success)" }}>
                      Cupón canjeado · Tu suscripción Pase PitchLab Ultra está activa
                    </strong>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--pl-text-secondary)" }}>
                      Si decides extender otro periodo más adelante, puedes volver a usar tu misma referencia única.
                    </p>
                  </div>
                  <a className="pl-lp-btn pl-lp-btn-ghost" href="/app">
                    Abrir el tablero
                  </a>
                </div>
              ) : null}

              {!activePending && latestRejected?.rejectionReason ? (
                <div
                  role="status"
                  className="glass-ring"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--pl-surface)",
                  }}
                  data-spei-state="rejected"
                >
                  <strong style={{ display: "block", fontSize: 14, color: "var(--pl-danger)", marginBottom: 4 }}>
                    Tu aviso anterior no pudo confirmarse
                  </strong>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--pl-text-secondary)", lineHeight: 1.5 }}>
                    Motivo: {latestRejected.rejectionReason}. Verifica tu comprobante y registra un nuevo aviso abajo con tu misma referencia única.
                  </p>
                </div>
              ) : null}

              {/* Selección de periodo (sin usar la palabra "Anual" en botones para no colisionar con el selector principal de /precio) */}
              {!activePending ? (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Periodo que vas a transferir:</span>
                  <div role="group" aria-label="Duración a pagar por transferencia" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      className="pl-lp-tab num"
                      style={{ minHeight: 44 }}
                      aria-pressed={effectiveInterval === "monthly"}
                      onClick={() => setSelectedInterval("monthly")}
                      data-spei-period="monthly"
                    >
                      30 días · {formatCentavosMxnPublic(context.quotes.monthlyCentavos)}
                      {context.quotes.referralDiscountApplied ? " (-30 %)" : ""}
                    </button>
                    <button
                      type="button"
                      className="pl-lp-tab num"
                      style={{ minHeight: 44 }}
                      aria-pressed={effectiveInterval === "annual"}
                      onClick={() => setSelectedInterval("annual")}
                      data-spei-period="annual"
                    >
                      365 días · {formatCentavosMxnPublic(context.quotes.annualCentavos)}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Datos bancarios + Referencia única ligada a la cuenta */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                <div
                  className="glass-ring"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--pl-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pl-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Referencia / concepto obligatorio
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <strong
                      className="num"
                      style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em", color: "var(--pl-brand)" }}
                      data-precio-spei-ref=""
                    >
                      {speiRef ?? "PL-PENDIENTE"}
                    </strong>
                    {speiRef ? (
                      <AccessibleCopyButton
                        value={speiRef}
                        idleLabel="Copiar referencia"
                        copiedLabel="Referencia copiada"
                        announceLabel="Referencia SPEI"
                        dataAttr="ref"
                      />
                    ) : null}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--pl-text-muted)", lineHeight: 1.45 }}>
                    Código único ligado a {context.memberHandle ? `@${context.memberHandle}` : "tu cuenta"}. Escríbelo tal cual en el concepto o referencia de tu transferencia.
                  </p>
                </div>

                <div
                  className="glass-ring"
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "var(--pl-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pl-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Cuenta destino SPEI · Monto exacto {formatCentavosMxnPublic(quotedAmountCentavos)}
                  </span>

                  {context.bank?.configured && context.bank.clabe ? (
                    <>
                      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr", gap: 8, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <dt style={{ color: "var(--pl-text-muted)" }}>Banco:</dt>
                          <dd style={{ margin: 0, fontWeight: 700 }} data-precio-spei-bank="">
                            {context.bank.bank}
                          </dd>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <dt style={{ color: "var(--pl-text-muted)" }}>Beneficiario:</dt>
                          <dd style={{ margin: 0, fontWeight: 700 }} data-precio-spei-beneficiary="">
                            {context.bank.beneficiary}
                          </dd>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <dt style={{ color: "var(--pl-text-muted)", fontSize: 12 }}>CLABE (18 dígitos):</dt>
                          <dd
                            style={{
                              margin: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span className="num" style={{ fontWeight: 800, fontSize: 15 }} data-precio-spei-clabe="">
                              {context.bank.clabe}
                            </span>
                            <AccessibleCopyButton
                              value={context.bank.clabe}
                              idleLabel="Copiar CLABE"
                              copiedLabel="CLABE copiada"
                              announceLabel="CLABE interbancaria"
                              dataAttr="clabe"
                            />
                          </dd>
                        </div>
                      </dl>
                      {context.bank.instructions ? (
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--pl-text-muted)" }}>
                          {context.bank.instructions}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: "var(--pl-text-secondary)", lineHeight: 1.5 }} data-precio-spei-unconfigured="">
                      La cuenta CLABE se lee de las variables de entorno <span className="num">PITCHLAB_TRANSFER_*</span> y aún no está activa en esta instancia. Escribe a{" "}
                      <strong>{context.bank?.supportEmail ?? "soporte@pitchlab.mx"}</strong> indicando tu referencia{" "}
                      <strong className="num">{speiRef}</strong>.
                    </p>
                  )}
                </div>
              </div>

              {/* Formulario para avisar que ya transfirió / estado pendiente */}
              <form
                onSubmit={(e) => void handleSubmitNotice(e)}
                noValidate
                style={{
                  borderTop: "1px solid var(--pl-border)",
                  paddingTop: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
                data-precio-spei-form=""
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>
                      {activePending
                        ? "Tu transferencia está pendiente de confirmación"
                        : "¿Ya hiciste la transferencia? Avísanos aquí"}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--pl-text-muted)" }}>
                      {activePending
                        ? `Revisaremos en consola tu pago de ${formatCentavosMxnPublic(activePending.amountCentavosMxn)} con referencia ${activePending.referenceCode} y te enviaremos el cupón desde noreply@pitchlab.mx.`
                        : "Registrar tu aviso coloca tu transferencia en la fila de revisión del fundador."}
                    </p>
                  </div>
                  {activePending ? (
                    <span className="pl-lp-pill" data-spei-state="pending_review">
                      En revisión
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label htmlFor={bankInputId} style={{ fontSize: 13, fontWeight: 600, color: "var(--pl-text-secondary)" }}>
                      Banco desde el que transfieres (opcional)
                    </label>
                    <input
                      id={bankInputId}
                      type="text"
                      maxLength={80}
                      placeholder="Ej. BBVA, Nu, Banorte"
                      value={originBank}
                      onChange={(e) => setOriginBank(e.target.value)}
                      className="glass-input"
                      style={{ minHeight: 44, padding: "0 12px", fontSize: 16 }}
                      data-precio-origin-bank=""
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label htmlFor={trackingInputId} style={{ fontSize: 13, fontWeight: 600, color: "var(--pl-text-secondary)" }}>
                      Clave de rastreo o folio SPEI (opcional)
                    </label>
                    <input
                      id={trackingInputId}
                      type="text"
                      maxLength={120}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Folio de tu comprobante"
                      value={receiptReference}
                      onChange={(e) => setReceiptReference(e.target.value)}
                      className="glass-input num"
                      style={{ minHeight: 44, padding: "0 12px", fontSize: 16 }}
                      data-precio-tracking-key=""
                    />
                  </div>
                </div>

                {feedback ? (
                  <p
                    role={feedback.kind === "error" ? "alert" : "status"}
                    aria-live="polite"
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      color: feedback.kind === "error" ? "var(--pl-danger)" : "var(--pl-success)",
                    }}
                    data-precio-spei-feedback={feedback.kind}
                  >
                    {feedback.text}
                  </p>
                ) : null}

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <button
                      type="submit"
                      disabled={busy}
                      className="pl-lp-btn pl-lp-btn-primary"
                      style={{ minHeight: 44 }}
                      data-precio-spei-submit=""
                    >
                      {busy
                        ? "Guardando…"
                        : activePending
                          ? "Actualizar datos de mi transferencia"
                          : "Ya transferí · Registrar aviso"}
                    </button>
                    {activePending ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCancelPending()}
                        className="pl-lp-btn pl-lp-btn-ghost"
                        style={{ minHeight: 44 }}
                        data-precio-spei-cancel=""
                      >
                        Cancelar aviso
                      </button>
                    ) : null}
                  </div>
                  <a
                    href="/canjear"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--pl-text-secondary)",
                      textDecoration: "underline",
                      minHeight: 44,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    ¿Ya recibiste tu cupón? Canjéalo en /canjear
                  </a>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
