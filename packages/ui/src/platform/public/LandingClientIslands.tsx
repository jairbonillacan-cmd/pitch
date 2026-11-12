"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { asLeagueId } from "@pitchlab/contracts";
import { BrandLogo, ThemeToggle } from "../../primitives";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports";
import { MEMBERSHIP_SPEC, ULTRA_LANDING_FEATURES } from "../spacetime-catalog";
import type {
  LandingFinishedResultItem,
  LandingHeroLeagueCard,
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
}: {
  activePath: PublicNavPath;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerId = useId();

  useEffect(() => {
    setMenuOpen(false);
  }, [activePath]);

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
    <header className="pl-lp-header">
      <div className="pl-lp-wrap">
        <nav
          aria-label="Principal"
          className="pl-lp-bar glass-pill-bar glass-ring"
        >
          <a
            href="/"
            aria-label="PitchLab, inicio"
            className="pl-lp-logo"
          >
            <BrandLogo variant="horizontal" width={133} height={26} alt="" />
          </a>

          <div className="pl-lp-nav">
            {PUBLIC_NAV_ITEMS.map((item) => (
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
            <a className="pl-lp-navlink pl-lp-navlink--login" href="/login">
              Entrar
            </a>
            <a
              className="pl-lp-btn pl-lp-btn--compact pl-lp-btn-primary pl-lp-bar-cta"
              href="/signup"
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
            {PUBLIC_NAV_ITEMS.map((item) => (
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
              href="/signup"
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
}

export function HeroMatchDemoIsland({
  cards,
  inputId = "tu-momio",
  containerId = "hoy",
  maxLeagues = 4,
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

  return (
    <div
      id={containerId}
      className="pl-lp-card pl-lp-demo-card glass-lens glass-ring glass-ring--featured"
    >
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
    </div>
  );
}

export function PricingCardIsland(): React.JSX.Element {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const isAnnual = billing === "annual";
  const amountLabel = isAnnual
    ? formatMxnAmount(MEMBERSHIP_SPEC.annualMxn)
    : formatMxnAmount(MEMBERSHIP_SPEC.monthlyMxn);
  const noteLabel = isAnnual
    ? `MXN al año · equivale a $${MEMBERSHIP_SPEC.annualMonthlyEquivalentMxn} al mes · IVA incluido`
    : "MXN al mes · IVA incluido · cancela cuando quieras";

  return (
    <div className="pl-lp-card pl-lp-pricing-card glass-lens glass-ring glass-ring--featured">
      <div
        role="group"
        aria-label="Periodo de pago"
        className="pl-lp-billing-toggle"
      >
        <button
          type="button"
          className="pl-lp-tab"
          aria-pressed={!isAnnual}
          onClick={() => setBilling("monthly")}
        >
          Mensual
        </button>
        <button
          type="button"
          className="pl-lp-tab"
          aria-pressed={isAnnual}
          onClick={() => setBilling("annual")}
        >
          Anual · ahorras 4 meses
        </button>
      </div>

      <div>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 18 }}>
          {MEMBERSHIP_SPEC.name}
        </p>
        <p className="pl-lp-price-figure num">
          <span className="pl-lp-price-currency">$</span>
          <span className="pl-lp-price-amount">{amountLabel}</span>
        </p>
        <p
          className="num"
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
              <path d="M5 12l5 5 9-10" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        className="pl-lp-btn pl-lp-btn--full pl-lp-btn-primary"
        href="/signup"
      >
        Empezar 7 días gratis{" "}
        <span className="pl-lp-arr" aria-hidden="true">
          →
        </span>
      </a>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--pl-text-muted)",
          textAlign: "center",
        }}
      >
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
                      <path d="M5 12l5 5 9-10" />
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
