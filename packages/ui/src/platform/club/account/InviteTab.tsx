"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExampleBadge, ExampleNotice } from "../../components/MaestroPrimitives";
import { usePlatform } from "../../platform-provider";
import { MEMBERSHIP_SPEC, referralEarnedDays } from "../../spacetime-catalog";
import {
  buildInviteShareMessage,
  buildWhatsAppShareHref,
  buildXShareHref,
  deriveExampleReferralCode,
  formatShortInviteDisplay,
  formatShortInviteUrl,
  type SessionAccountIdentity,
} from "./account-helpers";
import { LazyReferralCard3D, triggerReferralStoryDownload } from "./LazyReferralCard3D";

export interface ServerReferralsData {
  referralCode: string | null;
  paidFriends: number;
  pendingFriends: number;
}

export interface InviteTabStoryOverride {
  accountsEnabled?: boolean;
  referralCode?: string | null;
  paidFriends?: number;
  pendingFriends?: number;
  loading?: boolean;
}

interface ExampleFriendRow {
  id: string;
  name: string;
  handle: string;
  initials: string;
  gradVar: string;
  paid: boolean;
  statusLabel: string;
  dateLabel: string;
}

const EXAMPLE_PAID_FRIENDS_POOL: ReadonlyArray<{
  name: string;
  handle: string;
  initials: string;
  gradVar: string;
  dateLabel: string;
}> = [
  {
    name: "Mariana T.",
    handle: "@mariana_t",
    initials: "MT",
    gradVar: "var(--avatar-grad-1)",
    dateLabel: "8 nov",
  },
  {
    name: "Andrés L.",
    handle: "@andres_l",
    initials: "AL",
    gradVar: "var(--avatar-grad-3)",
    dateLabel: "3 nov",
  },
  {
    name: "Valeria G.",
    handle: "@valeria_g",
    initials: "VG",
    gradVar: "var(--avatar-grad-2)",
    dateLabel: "29 oct",
  },
  {
    name: "Rodrigo P.",
    handle: "@rodrigo_p",
    initials: "RP",
    gradVar: "var(--avatar-grad-4)",
    dateLabel: "24 oct",
  },
  {
    name: "Paola C.",
    handle: "@paola_c",
    initials: "PC",
    gradVar: "var(--avatar-grad-1)",
    dateLabel: "19 oct",
  },
];

function DownloadIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

function WhatsAppIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.4A8.5 8.5 0 1 1 21 12z" />
    </svg>
  );
}

function XBrandIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4l16 16M20 4 4 20" />
    </svg>
  );
}

function ShareSheetIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function CheckMarkIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function InviteTab({
  identity,
  serverReferrals,
  referralsLoading,
  storyOverride,
}: {
  identity: SessionAccountIdentity;
  serverReferrals: ServerReferralsData | null;
  referralsLoading: boolean;
  storyOverride?: InviteTabStoryOverride;
}): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    allowRoleSimulation,
    referralPaidFriends,
    simulateFriendFirstPayment,
  } = usePlatform();

  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const isLoading = storyOverride?.loading ?? referralsLoading;

  const [flipped, setFlipped] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"input" | "btn" | "msg" | "code" | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(max-width: 639px)");
    setIsMobileLayout(mql.matches);
    const onChange = (ev: MediaQueryListEvent) => setIsMobileLayout(ev.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const activeCode = useMemo<string | null>(() => {
    if (accountsEnabled) {
      if (storyOverride && "referralCode" in storyOverride) {
        return storyOverride.referralCode ?? null;
      }
      return serverReferrals?.referralCode ?? null;
    }
    return deriveExampleReferralCode(identity.cleanHandle);
  }, [accountsEnabled, identity.cleanHandle, serverReferrals?.referralCode, storyOverride]);

  const paidCount = useMemo<number>(() => {
    if (typeof storyOverride?.paidFriends === "number") {
      return Math.max(0, storyOverride.paidFriends);
    }
    if (accountsEnabled) {
      return Math.max(0, serverReferrals?.paidFriends ?? 0);
    }
    return 2 + Math.max(0, referralPaidFriends);
  }, [accountsEnabled, referralPaidFriends, serverReferrals?.paidFriends, storyOverride?.paidFriends]);

  const pendingCount = useMemo<number>(() => {
    if (typeof storyOverride?.pendingFriends === "number") {
      return Math.max(0, storyOverride.pendingFriends);
    }
    if (accountsEnabled) {
      return Math.max(0, serverReferrals?.pendingFriends ?? 0);
    }
    return 1;
  }, [accountsEnabled, serverReferrals?.pendingFriends, storyOverride?.pendingFriends]);

  const exampleOpensCount = useMemo(() => paidCount + 7, [paidCount]);

  const threshold = MEMBERSHIP_SPEC.referralAmbassadorThreshold;
  const bothDays = MEMBERSHIP_SPEC.referralBothRewardDays;
  const bonusDays = MEMBERSHIP_SPEC.referralAmbassadorBonusDays;
  const trialDays = MEMBERSHIP_SPEC.referralTrialDays;
  const firstMonthMxn = MEMBERSHIP_SPEC.referralFriendFirstMonthMxn;
  const regularMonthlyMxn = MEMBERSHIP_SPEC.monthlyMxn;

  const earnedDays = useMemo(() => referralEarnedDays(paidCount), [paidCount]);
  const remainingForAmbassador = Math.max(0, threshold - paidCount);
  const isAmbassador = paidCount >= threshold;
  const tierLabel = identity.isTipstar ? "ULTRA · TIPSTAR" : "ULTRA";

  const copyText = useCallback(
    async (text: string, target: "input" | "btn" | "msg" | "code", announceLabel: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch (err) {
        void err;
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      setCopiedTarget(target);
      setLiveStatus(announceLabel);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedTarget(null);
        setLiveStatus("");
        copyTimerRef.current = null;
      }, 2000);
    },
    [],
  );

  const handleNativeShare = useCallback(async () => {
    if (!activeCode || typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return;
    }
    try {
      await navigator.share({
        title: `${identity.atHandle} te invita a PitchLab`,
        text: buildInviteShareMessage(activeCode),
        url: formatShortInviteUrl(activeCode),
      });
    } catch (err) {
      void err;
    }
  }, [activeCode, identity.atHandle]);

  const handleDownloadPng = useCallback(async () => {
    if (!activeCode || downloadingPng) return;
    setDownloadingPng(true);
    try {
      await triggerReferralStoryDownload({
        code: activeCode,
        bottomLeftLabel: identity.atHandle,
        tierLabel,
      });
      setLiveStatus("Tarjeta descargada");
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setLiveStatus(""), 2000);
    } catch (err) {
      void err;
    } finally {
      setDownloadingPng(false);
    }
  }, [activeCode, downloadingPng, identity.atHandle, tierLabel]);

  const exampleRows = useMemo<ExampleFriendRow[]>(() => {
    if (accountsEnabled) return [];
    const rows: ExampleFriendRow[] = [];
    const shownPaid = Math.min(paidCount, EXAMPLE_PAID_FRIENDS_POOL.length);
    for (let i = 0; i < shownPaid; i += 1) {
      const f = EXAMPLE_PAID_FRIENDS_POOL[i]!;
      rows.push({
        id: `paid-${i}`,
        name: f.name,
        handle: f.handle,
        initials: f.initials,
        gradVar: f.gradVar,
        paid: true,
        statusLabel: `Pagó · +${bothDays} días`,
        dateLabel: f.dateLabel,
      });
    }
    rows.push({
      id: "trial-1",
      name: "Luis F.",
      handle: "@luis_f",
      initials: "LF",
      gradVar: "var(--pl-surface-hover)",
      paid: false,
      statusLabel: "En prueba · 4 días",
      dateLabel: "10 nov",
    });
    return rows;
  }, [accountsEnabled, bothDays, paidCount]);

  if (accountsEnabled && (isLoading || !activeCode)) {
    return (
      <div className="pl-acct-stack">
        <section className="pl-acct-card glass-card glass-ring" aria-live="polite">
          <p className="pl-acct-generating">Generando tu código…</p>
        </section>
      </div>
    );
  }

  const ensuredCode = activeCode!;
  const shortDisplay = formatShortInviteDisplay(ensuredCode);
  const shortUrl = formatShortInviteUrl(ensuredCode);
  const shareMessage = buildInviteShareMessage(ensuredCode);
  const whatsAppHref = buildWhatsAppShareHref(ensuredCode);
  const xHref = buildXShareHref(ensuredCode);

  const moreShareButton = canNativeShare ? (
    <button
      key="more"
      type="button"
      className={`pl-acct-btn pl-acct-btn--ghost pl-acct-share-btn ${isMobileLayout ? "pl-acct-share-btn--span2" : ""}`}
      onClick={handleNativeShare}
    >
      <ShareSheetIcon />
      <span>Más</span>
    </button>
  ) : null;

  const coreShareButtons = [
    <button
      key="copy-link"
      type="button"
      className="pl-acct-btn pl-acct-btn--ghost pl-acct-share-btn"
      onClick={() => copyText(shortUrl, "btn", "Copiado")}
    >
      <span>{copiedTarget === "btn" ? "Copiado" : "Copiar enlace"}</span>
    </button>,
    <a
      key="whatsapp"
      href={whatsAppHref}
      target="_blank"
      rel="noopener noreferrer"
      className="pl-acct-btn pl-acct-btn--ghost pl-acct-share-btn"
    >
      <WhatsAppIcon />
      <span>WhatsApp</span>
    </a>,
    <a
      key="x"
      href={xHref}
      target="_blank"
      rel="noopener noreferrer"
      className="pl-acct-btn pl-acct-btn--ghost pl-acct-share-btn"
    >
      <XBrandIcon />
      <span>X</span>
    </a>,
    <button
      key="copy-msg"
      type="button"
      className="pl-acct-btn pl-acct-btn--ghost pl-acct-share-btn"
      onClick={() => copyText(shareMessage, "msg", "Copiado")}
    >
      <span>{copiedTarget === "msg" ? "Copiado" : "Copiar mensaje"}</span>
    </button>,
  ];

  const orderedShareButtons =
    isMobileLayout && moreShareButton
      ? [moreShareButton, ...coreShareButtons]
      : [...coreShareButtons, ...(moreShareButton ? [moreShareButton] : [])];

  return (
    <div className="pl-acct-stack">
      <span role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </span>

      {!accountsEnabled ? (
        <ExampleNotice>
          Código, avance e invitaciones de muestra. Tus datos reales aparecen al activar las cuentas.
        </ExampleNotice>
      ) : null}

      {/* Hero: Tarjeta 3D + Oferta y Compartir */}
      <div className="pl-acct-hero-grid">
        <section className="pl-acct-card-stage" aria-label="Tu tarjeta de invitación">
          <div className="pl-acct-card-stage-top">
            <span className="pl-acct-card-stage-title">Tu tarjeta de invitación</span>
            <div className="pl-acct-flip-seg" role="group" aria-label="Cara de la tarjeta">
              <button
                type="button"
                aria-pressed={!flipped}
                onClick={() => setFlipped(false)}
              >
                Frente
              </button>
              <button
                type="button"
                aria-pressed={flipped}
                onClick={() => setFlipped(true)}
              >
                Reverso
              </button>
            </div>
          </div>

          <button
            type="button"
            className="pl-acct-cardbtn"
            data-referrals-card=""
            aria-label={`Tarjeta de invitación de ${identity.atHandle}, código ${ensuredCode}. Voltear`}
            onClick={() => setFlipped((prev) => !prev)}
          >
            <LazyReferralCard3D
              code={ensuredCode}
              bottomLeftLabel={identity.atHandle}
              tierLabel={tierLabel}
              flipped={flipped}
              onFlipChange={setFlipped}
              asDecorativeChild
              themeOverride="dark"
            />
          </button>

          <div className="pl-acct-card-stage-foot">
            <span className="pl-acct-card-stage-hint">
              Toca o presiona Enter para ver el {flipped ? "frente" : "reverso"}.
            </span>
            <button
              type="button"
              className="pl-acct-stage-dl"
              data-download-card=""
              disabled={downloadingPng}
              onClick={handleDownloadPng}
            >
              <DownloadIcon />
              <span>{downloadingPng ? "Generando…" : "Descargar tarjeta"}</span>
            </button>
          </div>
        </section>

        <section className="pl-acct-card glass-card glass-ring pl-acct-offer-card" aria-labelledby="pl-acct-offer-h">
          <div className="pl-acct-offer-head">
            <h2 id="pl-acct-offer-h" className="pl-acct-h2">
              Regala {trialDays} días de Ultra. Suma +{bothDays} días cuando tu amigo pague.
            </h2>
            <ul className="pl-acct-offer-lines" role="list">
              <li>
                <span>Tu amigo recibe </span>
                <strong className="num">{trialDays} días sin costo</strong>
                <span> y paga </span>
                <strong className="num">${firstMonthMxn} MXN</strong>
                <span> su primer mes en vez de </span>
                <span className="num">${regularMonthlyMxn}</span>.
              </li>
              <li>
                <span>Cuando paga su primer mes, </span>
                <strong className="num">los dos reciben +{bothDays} días</strong>.
              </li>
              <li>
                <span>Con </span>
                <strong className="num">{threshold} amigos que pagan</strong>
                <span>, recibes </span>
                <strong className="num">+{bonusDays} días extra</strong>.
              </li>
            </ul>
          </div>

          <div className="pl-acct-link-box">
            <div className="pl-acct-row-between">
              <label htmlFor="pl-acct-ref-link" className="pl-acct-field-label">
                Tu enlace
              </label>
              {!accountsEnabled ? <ExampleBadge /> : null}
            </div>
            <div className="pl-acct-link-row">
              <input
                id="pl-acct-ref-link"
                type="text"
                readOnly
                value={shortDisplay}
                className="pl-acct-input num"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="pl-acct-btn pl-acct-btn--primary"
                data-copy-short-link=""
                onClick={() => copyText(shortUrl, "input", "Copiado")}
              >
                {copiedTarget === "input" ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="pl-acct-share-grid" role="group" aria-label="Compartir invitación">
            {orderedShareButtons}
          </div>

          <div className="pl-acct-code-row">
            <span>Tu código</span>
            <div className="pl-acct-code-actions">
              {!accountsEnabled ? <ExampleBadge /> : null}
              <button
                type="button"
                className="pl-acct-code-pill num"
                onClick={() => copyText(ensuredCode, "code", "Copiado")}
              >
                {copiedTarget === "code" ? "Copiado" : ensuredCode}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Avance hacia embajador + Tus invitaciones */}
      <div className="pl-acct-bottom-grid">
        <section
          className="pl-acct-card glass-card glass-ring"
          aria-labelledby="pl-acct-avance-h"
        >
          <div className="pl-acct-row-between">
            <h3 id="pl-acct-avance-h" className="pl-acct-h3">
              Avance hacia embajador
            </h3>
            {!accountsEnabled ? <ExampleBadge /> : null}
          </div>

          <div
            className="pl-acct-slots"
            role="img"
            aria-label={`${paidCount} de ${threshold} amigos pagaron`}
          >
            {Array.from({ length: threshold }, (_, idx) => {
              const filled = idx < paidCount;
              return (
                <span
                  key={idx}
                  aria-hidden="true"
                  className={`pl-acct-slot num ${filled ? "pl-acct-slot--filled" : "pl-acct-slot--empty"}`}
                >
                  {filled ? <CheckMarkIcon /> : idx + 1}
                </span>
              );
            })}
          </div>

          <p className="pl-acct-progress-copy num" data-referral-friends="">
            {isAmbassador
              ? `Eres embajador · +${bonusDays} días`
              : `${paidCount} de ${threshold} · ${
                  remainingForAmbassador === 1
                    ? "te falta 1"
                    : `te faltan ${remainingForAmbassador}`
                } para +${bonusDays} días`}
          </p>

          <dl className="pl-acct-earned-row num">
            <div>
              <dt>Días ganados</dt>
              <dd data-referral-days="">+{earnedDays} días</dd>
            </div>
          </dl>
        </section>

        <section
          className="pl-acct-card glass-card glass-ring"
          aria-labelledby="pl-acct-invites-h"
        >
          <div className="pl-acct-row-between">
            <h3 id="pl-acct-invites-h" className="pl-acct-h3">
              Tus invitaciones
            </h3>
            {!accountsEnabled ? <ExampleBadge /> : null}
          </div>

          <dl
            className={`pl-acct-metrics num ${
              accountsEnabled ? "pl-acct-metrics--two" : "pl-acct-metrics--three"
            }`}
          >
            <div>
              <dt>Pagaron</dt>
              <dd>{paidCount}</dd>
            </div>
            <div>
              <dt>En prueba</dt>
              <dd>{pendingCount}</dd>
            </div>
            {!accountsEnabled ? (
              <div>
                <dt>Veces que abrieron tu enlace</dt>
                <dd>{exampleOpensCount}</dd>
              </div>
            ) : null}
          </dl>

          {accountsEnabled ? (
            paidCount === 0 && pendingCount === 0 ? (
              <p className="pl-acct-empty-line">
                Aún no invitas a nadie. Comparte tu enlace.
              </p>
            ) : (
              <p className="pl-acct-empty-line">Pronto verás aquí a cada amigo.</p>
            )
          ) : (
            <ul className="pl-acct-invite-list" role="list">
              {exampleRows.map((row) => (
                <li key={row.id} className="pl-acct-invite-item">
                  <span
                    className="pl-acct-invite-avatar"
                    style={{ background: row.gradVar }}
                    aria-hidden="true"
                  >
                    {row.initials}
                  </span>
                  <div className="pl-acct-invite-meta">
                    <span className="pl-acct-invite-name">
                      {row.name} <small>{row.handle}</small>
                    </span>
                    <span className="pl-acct-invite-date num">{row.dateLabel}</span>
                  </div>
                  <span
                    className={`pl-pick-status num ${
                      row.paid ? "pl-pick-status--won" : "pl-pick-status--open"
                    }`}
                  >
                    {row.statusLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="pl-acct-legal-foot">
        Los días se suman cuando tu amigo paga su primer mes; si cancela durante la prueba, no cuenta. Información para decidir, no una garantía. Solo mayores de 18.
      </p>

      {allowRoleSimulation ? (
        <aside className="pl-acct-simulator glass-card glass-ring" aria-label="Simulador">
          <div className="pl-acct-simulator-copy">
            <span className="pl-acct-sim-badge">Simulador</span>
            <span>Prueba de desarrollo para sumar un amigo con primer mes pagado.</span>
          </div>
          <button
            type="button"
            className="pl-acct-btn pl-acct-btn--ghost"
            data-simulate-referral=""
            onClick={simulateFriendFirstPayment}
          >
            Simular pago de un amigo
          </button>
        </aside>
      ) : null}
    </div>
  );
}
