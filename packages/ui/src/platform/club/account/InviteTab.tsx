"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  SofascoreTable,
  type SofascoreKpiItem,
  type SofascoreTableColumn,
} from "../../../components/ui/primitives";
import { ExampleBadge, ExampleNotice, MaestroIcon } from "../../components/MaestroPrimitives";
import { useMediaQuery, useSafeEffect } from "../../hooks";
import { triggerHaptic } from "../../navigation-helpers";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
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
import { LazyReferralCard3D } from "./LazyReferralCard3D";

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
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly initials: string;
  readonly gradVar: string;
  readonly paid: boolean;
  readonly statusLabel: string;
  readonly dateLabel: string;
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

function WhatsAppIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="text-[var(--social-whatsapp)]"
    >
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function XBrandIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
      />
    </svg>
  );
}

function ShareSheetIcon(): React.JSX.Element {
  return <MaestroIcon name="share" size={15} />;
}

function CheckMarkIcon(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

const EXAMPLE_FRIEND_COLUMNS: readonly SofascoreTableColumn<ExampleFriendRow>[] = [
  {
    key: "friend",
    header: "Amigo",
    render: (row) => (
      <div className="pl-acct-invite-cell">
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
      </div>
    ),
  },
  {
    key: "status",
    header: "Estado",
    align: "end",
    render: (row) => (
      <span
        className={`pl-pick-status num ${
          row.paid ? "pl-pick-status--won" : "pl-pick-status--open"
        }`}
      >
        {row.statusLabel}
      </span>
    ),
  },
];

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
    hasAccountSessionAuth,
    allowRoleSimulation,
    referralPaidFriends,
    viewerIdentity,
  } = usePlatformCore();
  const { simulateFriendFirstPayment } = usePlatformActions();

  const accountsEnabled = storyOverride?.accountsEnabled ?? hasAccountSessionAuth;
  const isLoading = storyOverride?.loading ?? referralsLoading;
  const isMobileLayout = useMediaQuery("(max-width: 639px)");

  const [flipped, setFlipped] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"input" | "msg" | "code" | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useSafeEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
    return () => {
      if (copyTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const activeCode = useMemo<string | null>(() => {
    if (accountsEnabled) {
      if (storyOverride && "referralCode" in storyOverride) {
        return storyOverride.referralCode ?? null;
      }
      return serverReferrals?.referralCode ?? viewerIdentity?.referralCode ?? null;
    }
    return deriveExampleReferralCode(identity.cleanHandle);
  }, [
    accountsEnabled,
    identity.cleanHandle,
    serverReferrals?.referralCode,
    storyOverride,
    viewerIdentity?.referralCode,
  ]);

  const paidCount = useMemo<number>(() => {
    if (typeof storyOverride?.paidFriends === "number") {
      return Math.max(0, storyOverride.paidFriends);
    }
    if (accountsEnabled) {
      return Math.max(0, serverReferrals?.paidFriends ?? 0);
    }
    return 2 + Math.max(0, referralPaidFriends);
  }, [
    accountsEnabled,
    referralPaidFriends,
    serverReferrals?.paidFriends,
    storyOverride?.paidFriends,
  ]);

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
  const tierLabel = identity.isTipster ? "ULTRA · TIPSTER" : "ULTRA";

  const rewardKpis = useMemo<readonly SofascoreKpiItem[]>(
    () => [
      {
        id: "friend",
        label: "Para tu amigo",
        value: `${trialDays} días + $${firstMonthMxn}`,
        tone: "default",
      },
      {
        id: "both",
        label: "Cuando paga",
        value: `+${bothDays} días c/u`,
        tone: "positive",
      },
      {
        id: "ambassador",
        label: `Meta ${threshold} amigos`,
        value: `+${bonusDays} días extra`,
        tone: "brand",
      },
    ],
    [bonusDays, bothDays, firstMonthMxn, threshold, trialDays],
  );

  const inviteMetrics = useMemo<readonly SofascoreKpiItem[]>(() => {
    const items: SofascoreKpiItem[] = [
      { id: "paid", label: "Pagaron", value: String(paidCount), tone: "positive" },
      { id: "pending", label: "En prueba", value: String(pendingCount), tone: "default" },
    ];
    if (!accountsEnabled) {
      items.push({
        id: "opens",
        label: "Veces que abrieron tu enlace",
        value: String(exampleOpensCount),
        tone: "brand",
      });
    }
    return items;
  }, [accountsEnabled, exampleOpensCount, paidCount, pendingCount]);

  const copyText = useCallback(
    async (text: string, target: "input" | "msg" | "code", announceLabel: string) => {
      let copied = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          triggerHaptic(8);
          copied = true;
        }
      } catch (err) {
        void err;
      }
      if (!copied && typeof document !== "undefined") {
        try {
          const fallbackEl = document.createElement("textarea");
          fallbackEl.value = text;
          fallbackEl.setAttribute("readonly", "");
          fallbackEl.style.position = "fixed";
          fallbackEl.style.opacity = "0";
          document.body.appendChild(fallbackEl);
          fallbackEl.select();
          copied = Boolean(document.execCommand?.("copy"));
          document.body.removeChild(fallbackEl);
        } catch (err) {
          void err;
        }
      }
      if (copyTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(copyTimerRef.current);
      }
      if (copied) {
        setCopiedTarget(target);
        setLiveStatus(announceLabel);
      } else {
        setCopiedTarget(null);
        setLiveStatus("No se pudo copiar automáticamente; selecciona el enlace para copiarlo.");
      }
      if (typeof window !== "undefined") {
        copyTimerRef.current = window.setTimeout(() => {
          setCopiedTarget(null);
          setLiveStatus("");
          copyTimerRef.current = null;
        }, 2000);
      }
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
        <SofascoreCard as="section">
          <p className="pl-acct-generating" aria-live="polite">
            Generando tu código…
          </p>
        </SofascoreCard>
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
    <Button
      key="more"
      type="button"
      variant="secondary"
      size="sm"
      className="pl-acct-share-btn"
      onClick={handleNativeShare}
    >
      <ShareSheetIcon />
      <span>Más</span>
    </Button>
  ) : null;

  const coreShareButtons = [
    <Button
      key="whatsapp"
      variant="secondary"
      size="sm"
      nativeButton={false}
      className="pl-acct-share-btn"
      render={<a href={whatsAppHref} target="_blank" rel="noopener noreferrer" />}
    >
      <WhatsAppIcon />
      <span>WhatsApp</span>
    </Button>,
    <Button
      key="x"
      variant="secondary"
      size="sm"
      nativeButton={false}
      className="pl-acct-share-btn"
      render={<a href={xHref} target="_blank" rel="noopener noreferrer" />}
    >
      <XBrandIcon />
      <span>X</span>
    </Button>,
    <Button
      key="copy-msg"
      type="button"
      variant="secondary"
      size="sm"
      className="pl-acct-share-btn"
      onClick={() => void copyText(shareMessage, "msg", "Copiado")}
    >
      <span>{copiedTarget === "msg" ? "Copiado" : "Copiar mensaje"}</span>
    </Button>,
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

      <div className="pl-acct-hero-grid">
        <section className="pl-acct-card-stage" aria-label="Tu tarjeta de invitación">
          <div className="pl-acct-card-stage-top">
            <span className="pl-acct-card-stage-title">Tu tarjeta de invitación</span>
            <div className="pl-acct-flip-seg" role="group" aria-label="Cara de la tarjeta">
              <button
                type="button"
                className="pl-acct-flip-btn"
                aria-pressed={!flipped}
                onClick={() => setFlipped(false)}
              >
                Frente
              </button>
              <button
                type="button"
                className="pl-acct-flip-btn"
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
            />
          </button>

          <div className="pl-acct-card-stage-foot">
            <span className="pl-acct-card-stage-hint">
              Toca o presiona Enter para ver el {flipped ? "frente" : "reverso"}.
            </span>
          </div>
        </section>

        <SofascoreCard as="section" className="pl-acct-offer-card">
          <div className="pl-acct-offer-inner">
            <div className="pl-acct-offer-head">
              <h2 id="pl-acct-offer-h" className="pl-acct-h2">
                Regala {trialDays} días de Ultra. Suma +{bothDays} días cuando tu amigo pague.
              </h2>

              <SofascoreKpiStrip items={rewardKpis} className="pl-acct-perk-kpis" />

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

            <div className="pl-acct-link-box min-w-0">
              <label htmlFor="pl-acct-ref-link" className="pl-acct-field-label">
                Tu enlace
              </label>
              <div className="pl-acct-link-row">
                <input
                  id="pl-acct-ref-link"
                  type="text"
                  readOnly
                  value={shortDisplay}
                  className="pl-acct-input num"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="primary"
                  data-copy-short-link=""
                  onClick={() => void copyText(shortUrl, "input", "Copiado")}
                >
                  {copiedTarget === "input" ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            <div className="pl-acct-share-grid" role="group" aria-label="Compartir invitación">
              {orderedShareButtons}
            </div>

            <div className="pl-acct-code-row min-w-0">
              <span>Tu código</span>
              <div className="pl-acct-code-actions">
                {!accountsEnabled ? <ExampleBadge /> : null}
                <button
                  type="button"
                  className="pl-acct-code-pill num"
                  onClick={() => void copyText(ensuredCode, "code", "Copiado")}
                >
                  {copiedTarget === "code" ? "Copiado" : ensuredCode}
                </button>
              </div>
            </div>
          </div>
        </SofascoreCard>
      </div>

      <div className="pl-acct-bottom-grid">
        <SofascoreCard
          id="pl-acct-avance"
          title="Avance hacia embajador"
          meta={!accountsEnabled ? <ExampleBadge /> : undefined}
          className="pl-acct-ambassador-card"
        >
          <div className="pl-acct-ambassador-inner">
            <div className="pl-acct-ambassador-track">
              <div
                className="pl-acct-slots"
                role="img"
                aria-label={`${paidCount} de ${threshold} amigos pagaron`}
              >
                {Array.from({ length: threshold }, (_, idx) => {
                  const filled = idx < paidCount;
                  const isGoal = idx === threshold - 1;
                  return (
                    <div
                      key={idx}
                      aria-hidden="true"
                      className={`pl-acct-milestone ${filled ? "is-filled" : ""} ${isGoal ? "is-goal" : ""}`.trim()}
                    >
                      <span
                        className={`pl-acct-slot num ${filled ? "pl-acct-slot--filled" : "pl-acct-slot--empty"}`}
                      >
                        {filled ? <CheckMarkIcon /> : idx + 1}
                      </span>
                      <span className="pl-acct-milestone-label num">
                        {isGoal ? `+${bonusDays} d` : `+${bothDays} d`}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                className="pl-acct-progress-bar"
                role="progressbar"
                aria-label="Progreso hacia embajador"
                aria-valuenow={Math.min(paidCount, threshold)}
                aria-valuemin={0}
                aria-valuemax={threshold}
              >
                <span
                  className="pl-acct-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((paidCount / threshold) * 100))}%` }}
                />
              </div>

              <p className="pl-acct-progress-copy num" data-referral-friends="">
                {isAmbassador
                  ? `Eres embajador · desbloqueaste +${bonusDays} días extra`
                  : `${paidCount} de ${threshold} · ${
                      remainingForAmbassador === 1
                        ? "te falta 1 amigo"
                        : `te faltan ${remainingForAmbassador} amigos`
                    } para el bono de +${bonusDays} días`}
              </p>
            </div>

            <dl className="pl-acct-earned-row num">
              <div>
                <dt>Días ganados</dt>
                <dd data-referral-days="">+{earnedDays} días</dd>
              </div>
              <div>
                <dt>Meta embajador ({threshold}/5)</dt>
                <dd className="pl-acct-earned-bonus">+{bonusDays} días extra</dd>
              </div>
            </dl>
          </div>
        </SofascoreCard>

        <SofascoreCard
          id="pl-acct-invites"
          title="Tus invitaciones"
          meta={!accountsEnabled ? <ExampleBadge /> : undefined}
        >
          <div className="space-y-4">
            <SofascoreKpiStrip items={inviteMetrics} />

            {accountsEnabled ? (
              <SofascoreEmptyState
                title={
                  paidCount === 0 && pendingCount === 0
                    ? "Aún no invitas a nadie. Comparte tu enlace."
                    : "Pronto verás aquí a cada amigo."
                }
              />
            ) : (
              <SofascoreTable
                caption="Historial de invitaciones de muestra"
                columns={EXAMPLE_FRIEND_COLUMNS}
                rows={exampleRows}
                rowKey={(row) => row.id}
                density="compact"
              />
            )}
          </div>
        </SofascoreCard>
      </div>

      <p className="pl-acct-legal-foot">
        Los días se suman cuando tu amigo paga su primer mes; si cancela durante la prueba, no
        cuenta. Información para decidir, no una garantía. Solo mayores de 18.
      </p>

      {allowRoleSimulation ? (
        <aside className="pl-acct-simulator" aria-label="Simulador">
          <div className="pl-acct-simulator-copy">
            <span className="pl-acct-sim-badge">Simulador</span>
            <span>Prueba de desarrollo para sumar un amigo con primer mes pagado.</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-simulate-referral=""
            onClick={simulateFriendFirstPayment}
          >
            Simular pago de un amigo
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
