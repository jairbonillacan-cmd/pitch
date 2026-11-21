/**
 * Esquema PostgreSQL (Neon, ADR-007) de PitchLab con Drizzle.
 *
 * - Datos del socio: bitácora sellada, vigilancia y preferencias (hoy viven en el navegador).
 * - Crecimiento y cobro: tablas de docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md §4.2.
 * Montos en centavos MXN (`integer`), fechas en `timestamptz` UTC.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Usuarios y datos del socio
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Cuenta de Better Auth (auth_user.id). Se liga al primer inicio de sesión. */
  authUserId: text("auth_user_id").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  handle: text("handle").unique(),
  bio: varchar("bio", { length: 160 }),
  avatarUrl: text("avatar_url"),
  xUsername: text("x_username"),
  xLinkedAt: ts("x_linked_at"),
  referralCode: text("referral_code").unique(),
  /** Referencia SPEI permanente y única ligada a la cuenta del socio (`PL-{HANDLE}-{4}`). */
  speiReferenceCode: text("spei_reference_code").unique(),
  isAmbassador: boolean("is_ambassador").notNull().default(false),
  isAdult: boolean("is_adult").notNull().default(false),
  publicProfile: boolean("public_profile").notNull().default(true),
  socialPauseEnabled: boolean("social_pause_enabled").notNull().default(false),
  /** Paso 2 del registro: fecha de nacimiento (`AAAA-MM-DD`) y consentimientos con versión. */
  birthDate: date("birth_date"),
  termsVersion: text("terms_version"),
  termsAcceptedAt: ts("terms_accepted_at"),
  analyticsConsent: boolean("analytics_consent").notNull().default(false),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  createdAt: createdAt(),
});

/** Bitácora: picks sellados antes del inicio, con su liquidación. */
export interface SealedParlayLegSpec {
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  market: string;
  selection: string;
  line?: number | null;
  p: number;
  fairDecimal: number;
  kickoffAt: string;
}

export interface SealedParlayLegResult {
  pickId: string;
  gameId: string;
  status: "won" | "lost" | "void";
  homeScore: number;
  awayScore: number;
  closingDecimal?: number | null;
  clvPct?: number | null;
  settledAt: string;
}

export const sealedPicks = pgTable(
  "sealed_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickId: text("pick_id").notNull(),
    gameId: text("game_id").notNull(),
    leagueLabel: text("league_label").notNull(),
    matchLabel: text("match_label").notNull(),
    pickLabel: text("pick_label").notNull(),
    origin: text("origin").notNull(),
    units: numeric("units", { precision: 5, scale: 2 }).notNull(),
    userDecimal: numeric("user_decimal", { precision: 7, scale: 3 }).notNull(),
    fairDecimal: numeric("fair_decimal", { precision: 7, scale: 3 }).notNull(),
    clvPct: numeric("clv_pct", { precision: 6, scale: 2 }),
    status: text("status").notNull().default("pending"),
    note: varchar("note", { length: 280 }),
    /** SHA-256 del contenido sellado: prueba de que no se editó después del inicio. */
    sealHash: char("seal_hash", { length: 64 }).notNull(),
    sealedAt: ts("sealed_at").notNull().defaultNow(),
    kickoffAt: ts("kickoff_at").notNull(),
    settledAt: ts("settled_at"),
    pickKind: text("pick_kind").notNull().default("single"),
    pickMarket: text("pick_market"),
    pickSelection: text("pick_selection"),
    pickLine: numeric("pick_line", { precision: 6, scale: 2 }),
    parlayLegs: jsonb("parlay_legs").$type<SealedParlayLegSpec[] | null>(),
    parlayLegResults: jsonb("parlay_leg_results").$type<SealedParlayLegResult[] | null>(),
    closingDecimal: numeric("closing_decimal", { precision: 7, scale: 3 }),
  },
  (t) => [
    index("sealed_picks_user_idx").on(t.userId, t.sealedAt),
    index("sealed_picks_status_kickoff_idx").on(t.status, t.kickoffAt),
    uniqueIndex("sealed_picks_user_pick_uq").on(t.userId, t.pickId),
    check("sealed_picks_status_ck", sql`${t.status} IN ('pending', 'won', 'lost', 'void')`),
    check("sealed_picks_kind_ck", sql`${t.pickKind} IN ('single', 'parlay')`),
    check("sealed_picks_units_ck", sql`${t.units} > 0 AND ${t.units} <= 5`),
    check("sealed_picks_before_kickoff_ck", sql`${t.sealedAt} < ${t.kickoffAt}`),
  ],
);

export const watchlist = pgTable(
  "watchlist",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    createdAt: createdAt(),
    /** Avisos de «Siguiendo» (EN-VIVO-1, migración 0022). */
    alertKickoff: boolean("alert_kickoff").notNull().default(true),
    alertGoals: boolean("alert_goals").notNull().default(true),
    alertFinal: boolean("alert_final").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] }), index("watchlist_game_idx").on(t.gameId)],
);

export interface SavedScreenerViewRecord {
  id: string;
  name: string;
  sport: string;
  league: string;
  band: string;
  kind: string;
  sort: string;
  onlyPositiveEdge: boolean;
  minOddsStep: number;
  maxOddsStep: number;
  window: string;
  pinToHomeHub: boolean;
}

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    oddsFormat: text("odds_format").notNull().default("american"),
    themeMode: text("theme_mode").notNull().default("dark"),
    timezone: text("timezone").notNull().default("America/Mexico_City"),
    riskPreference: text("risk_preference").notNull().default("medio"),
    favoriteLeagues: text("favorite_leagues").array().notNull().default(sql`'{}'::text[]`),
    unitMxnCentavos: integer("unit_mxn_centavos").notNull().default(10000),
    showMxnBalance: boolean("show_mxn_balance").notNull().default(false),
    publicRecordVisible: boolean("public_record_visible").notNull().default(true),
    /** Correo cuando se califica un pick de la bitácora. Solo con consentimiento: apagado por defecto. */
    emailPickResults: boolean("email_pick_results").notNull().default(false),
    emailValueAlerts: boolean("email_value_alerts").notNull().default(true),
    emailBeforeMatch: boolean("email_before_match").notNull().default(false),
    emailBillingReminder: boolean("email_billing_reminder").notNull().default(true),
    emailWeeklyDigest: boolean("email_weekly_digest").notNull().default(false),
    emailMonthlyRecord: boolean("email_monthly_record").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    showInRanking: boolean("show_in_ranking").notNull().default(true),
    pauseCommunity: boolean("pause_community").notNull().default(false),
    responsiblePauseKind: text("responsible_pause_kind"),
    responsiblePauseUntil: ts("responsible_pause_until"),
    /** Privacidad de Mi récord por bloque y dato. */
    recordPrivacy: jsonb("record_privacy").notNull().default(sql`'{}'::jsonb`),
    /** Banca inicial en pesos (centavos); nunca pública. */
    bankrollStartMxnCentavos: integer("bankroll_start_mxn_centavos"),
    /** Ligas y equipos seguidos en Comunidad (`{ leagues: string[], teams: string[] }`). */
    followedTopics: jsonb("followed_topics")
      .notNull()
      .default(sql`'{"leagues":[],"teams":[]}'::jsonb`),
    featuredBadges: text("featured_badges").array().notNull().default(sql`'{}'::text[]`),
    preferredBookmakers: text("preferred_bookmakers").array().notNull().default(sql`'{}'::text[]`),
    savedViews: jsonb("saved_views").$type<SavedScreenerViewRecord[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("user_preferences_odds_ck", sql`${t.oddsFormat} IN ('american', 'decimal')`),
    check("user_preferences_risk_ck", sql`${t.riskPreference} IN ('conservador', 'medio', 'arriesgado')`),
    check("user_preferences_theme_ck", sql`${t.themeMode} IN ('dark', 'light', 'system')`),
    check(
      "user_preferences_bankroll_ck",
      sql`${t.bankrollStartMxnCentavos} IS NULL OR (${t.bankrollStartMxnCentavos} >= 0 AND ${t.bankrollStartMxnCentavos} <= 1000000000)`,
    ),
    check("user_preferences_featured_badges_ck", sql`cardinality(${t.featuredBadges}) <= 3`),
    check(
      "user_preferences_pause_ck",
      sql`${t.responsiblePauseKind} IS NULL OR ${t.responsiblePauseKind} IN ('24h', '7d', '30d')`,
    ),
  ],
);

/**
 * Correos transaccionales que ya se mandaron, quedaron programados en Resend o en espera
 * (>28 días para recordatorios de renovación/expiración). La clave `(user_id, kind, cycle_key)`
 * evita duplicados dentro de un mismo ciclo y permite ciclos repetidos tras nuevas activaciones.
 */
export const scheduledEmails = pgTable(
  "scheduled_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `welcome`, `trial_ending`, `trial_ended`, `payment_receipt`, `renewal_reminder`, `access_expired` o `transfer_rejected`. */
    kind: text("kind").notNull(),
    /** Permite distinguir ciclos (por ejemplo, `transfer:<id>` o `default`). */
    cycleKey: text("cycle_key").notNull().default("default"),
    /** Id del correo en Resend. */
    providerId: text("provider_id"),
    sendAt: ts("send_at").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("scheduled_emails_user_kind_cycle_uq").on(t.userId, t.kind, t.cycleKey),
    index("scheduled_emails_status_send_idx").on(t.status, t.sendAt),
    check("scheduled_emails_status_ck", sql`${t.status} IN ('pending', 'scheduled', 'sent', 'canceled', 'failed')`),
  ],
);

// ---------------------------------------------------------------------------
// A. Banderas operativas
// ---------------------------------------------------------------------------

export const platformRuntimeFlags = pgTable("platform_runtime_flags", {
  key: text("key").primaryKey(),
  boolValue: boolean("bool_value").notNull().default(true),
  jsonValue: jsonb("json_value"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetKey: text("target_key").notNull(),
    payloadJson: jsonb("payload_json"),
    ipSubnetHash: char("ip_subnet_hash", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_audit_logs_created_idx").on(t.createdAt),
    index("admin_audit_logs_actor_idx").on(t.actorUserId),
  ],
);

// ---------------------------------------------------------------------------
// B. Suscripción y días concedidos
// ---------------------------------------------------------------------------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id").unique(),
    planInterval: text("plan_interval").notNull(),
    status: text("status").notNull(),
    priceCentavosMxn: integer("price_centavos_mxn").notNull(),
    currentPeriodStart: ts("current_period_start").notNull(),
    currentPeriodEnd: ts("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: ts("canceled_at"),
    graceUntil: ts("grace_until"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_customer_idx").on(t.providerCustomerId),
    uniqueIndex("subscriptions_provider_customer_uq").on(t.provider, t.providerCustomerId),
    index("subscriptions_period_end_idx").on(t.currentPeriodEnd),
    check("subscriptions_provider_ck", sql`${t.provider} IN ('stripe', 'mercadopago', 'manual')`),
    check("subscriptions_interval_ck", sql`${t.planInterval} IN ('monthly', 'annual')`),
    check(
      "subscriptions_status_ck",
      sql`${t.status} IN ('trialing_no_card', 'trialing_card', 'active', 'past_due_grace', 'canceled', 'expired')`,
    ),
  ],
);

export const entitlementGrants = pgTable(
  "entitlement_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sourceKind: text("source_kind").notNull(),
    daysGranted: integer("days_granted").notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    appliedToStripeSubAt: ts("applied_to_stripe_sub_at"),
    revokedAt: ts("revoked_at"),
    revokeReason: text("revoke_reason"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("entitlement_grants_user_ends_idx").on(t.userId, t.endsAt),
    check(
      "entitlement_grants_source_ck",
      sql`${t.sourceKind} IN ('trial_m1_nocard', 'trial_tipster_5d', 'referral_host_15d', 'referral_friend_15d', 'ambassador_bonus_30d', 'tipster_comp_pass', 'admin_grant', 'transfer_payment', 'coupon')`,
    ),
    check("entitlement_grants_days_ck", sql`${t.daysGranted} > 0`),
    check("entitlement_grants_range_ck", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

// ---------------------------------------------------------------------------
// C. Escudo anti-abuso de la prueba gratis
// ---------------------------------------------------------------------------

export const trialFingerprints = pgTable(
  "trial_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    canonicalEmail: text("canonical_email").notNull(),
    canonicalEmailSha256: char("canonical_email_sha256", { length: 64 }).notNull().unique(),
    oauthProvider: text("oauth_provider"),
    oauthSubject: text("oauth_subject"),
    deviceFpHash: char("device_fp_hash", { length: 64 }).notNull(),
    ipSubnetHash: char("ip_subnet_hash", { length: 64 }).notNull(),
    turnstileRayId: text("turnstile_ray_id"),
    stripeCardFingerprint: text("stripe_card_fingerprint"),
    trialPhase: text("trial_phase").notNull(),
    decision: text("decision").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("trial_fp_oauth_idx").on(t.oauthProvider, t.oauthSubject),
    index("trial_fp_device_idx").on(t.deviceFpHash),
    index("trial_fp_subnet_idx").on(t.ipSubnetHash),
    uniqueIndex("trial_fp_card_uq")
      .on(t.stripeCardFingerprint)
      .where(sql`${t.stripeCardFingerprint} IS NOT NULL`),
    check("trial_fp_provider_ck", sql`${t.oauthProvider} IS NULL OR ${t.oauthProvider} IN ('google', 'apple', 'email')`),
    check("trial_fp_phase_ck", sql`${t.trialPhase} IN ('month1_no_card', 'month2_setup_intent')`),
    check(
      "trial_fp_decision_ck",
      sql`${t.decision} IN ('granted', 'denied_duplicate_email', 'denied_duplicate_device', 'denied_duplicate_card', 'denied_subnet_rate')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// D. Referido doble vía
// ---------------------------------------------------------------------------

export const referralGrants = pgTable(
  "referral_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    referralCodeUsed: text("referral_code_used").notNull(),
    status: text("status").notNull(),
    friendDiscountCouponId: text("friend_discount_coupon_id"),
    qualifyingStripeInvoiceId: text("qualifying_stripe_invoice_id").unique(),
    qualifyingPaidCentavosMxn: integer("qualifying_paid_centavos_mxn"),
    referrerGrantId: uuid("referrer_grant_id").references(() => entitlementGrants.id),
    referredGrantId: uuid("referred_grant_id").references(() => entitlementGrants.id),
    triggeredAmbassadorBonusGrantId: uuid("triggered_ambassador_bonus_grant_id").references(
      () => entitlementGrants.id,
    ),
    qualifiedAt: ts("qualified_at"),
    rewardedAt: ts("rewarded_at"),
    clawedBackAt: ts("clawed_back_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("referral_grants_referrer_idx").on(t.referrerUserId),
    check("referral_grants_self_ck", sql`${t.referrerUserId} <> ${t.referredUserId}`),
    check(
      "referral_grants_status_ck",
      sql`${t.status} IN ('trial_started', 'qualified_paid', 'rewarded_bilateral', 'rejected_fraud', 'clawed_back')`,
    ),
    check(
      "referral_grants_paid_ck",
      sql`${t.qualifyingPaidCentavosMxn} IS NULL OR ${t.qualifyingPaidCentavosMxn} >= 15000`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// E. Tipsters oficiales
// ---------------------------------------------------------------------------

export const tipsterProfiles = pgTable(
  "tipster_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    handle: text("handle").notNull().unique(),
    displayName: text("display_name").notNull(),
    specialty: text("specialty").notNull(),
    promoCode: text("promo_code").notNull().unique(),
    stripePromotionCodeId: text("stripe_promotion_code_id").unique(),
    freeTrialDays: integer("free_trial_days").notNull().default(5),
    commissionBps: integer("commission_bps").notNull().default(2500),
    defaultWeeklySlug: text("default_weekly_slug").notNull().unique(),
    payoutMethod: text("payout_method").notNull().default("spei_manual"),
    stripeConnectAccountId: text("stripe_connect_account_id").unique(),
    /** Stripe confirmó que la cuenta conectada puede recibir transferencias. */
    connectPayoutsEnabled: boolean("connect_payouts_enabled").notNull().default(false),
    clabeEncrypted: text("clabe_encrypted"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("tipster_profiles_payout_ck", sql`${t.payoutMethod} IN ('spei_manual', 'stripe_connect')`),
    check("tipster_profiles_bps_ck", sql`${t.commissionBps} BETWEEN 0 AND 5000`),
    check("tipster_profiles_code_upper_ck", sql`${t.promoCode} = upper(${t.promoCode})`),
  ],
);

export const tipsterAttributions = pgTable(
  "tipster_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipsterUserId: uuid("tipster_user_id")
      .notNull()
      .references(() => tipsterProfiles.userId),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .unique()
      .references(() => users.id),
    promoCodeUsed: text("promo_code_used").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    landingSlug: text("landing_slug"),
    status: text("status").notNull(),
    firstPaidAt: ts("first_paid_at"),
    lastPaidAt: ts("last_paid_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tipster_attr_tipster_idx").on(t.tipsterUserId),
    check("tipster_attr_self_ck", sql`${t.tipsterUserId} <> ${t.referredUserId}`),
    check(
      "tipster_attr_status_ck",
      sql`${t.status} IN ('trial_5d', 'active_paying', 'churned', 'fraud_blocked')`,
    ),
  ],
);

export const tipsterCommissionLedger = pgTable(
  "tipster_commission_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributionId: uuid("attribution_id")
      .notNull()
      .references(() => tipsterAttributions.id),
    tipsterUserId: uuid("tipster_user_id")
      .notNull()
      .references(() => tipsterProfiles.userId),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    grossPaidCentavosMxn: integer("gross_paid_centavos_mxn").notNull(),
    vatCentavosMxn: integer("vat_centavos_mxn").notNull(),
    gatewayFeeCentavosMxn: integer("gateway_fee_centavos_mxn").notNull(),
    netCommissionableCentavosMxn: integer("net_commissionable_centavos_mxn").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commissionCentavosMxn: integer("commission_centavos_mxn").notNull(),
    status: text("status").notNull(),
    clearsAt: ts("clears_at").notNull(),
    /** Marca de reclamo atómico mientras se ejecuta la transferencia en Stripe Connect. */
    claimStartedAt: ts("claim_started_at"),
    payoutBatchId: uuid("payout_batch_id"),
    /** Transferencia de Stripe Connect que pagó este asiento. */
    stripeTransferId: text("stripe_transfer_id").unique(),
    /** Nota o referencia humana para liquidaciones manuales (Beta 1.0). */
    payoutNote: text("payout_note"),
    paidOutAt: ts("paid_out_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tipster_ledger_attr_idx").on(t.attributionId),
    index("tipster_ledger_tipster_idx").on(t.tipsterUserId),
    check(
      "tipster_ledger_status_ck",
      sql`${t.status} IN ('pending_clearance', 'payable', 'processing_payout', 'paid_out', 'reversed_refund')`,
    ),
    check(
      "tipster_ledger_net_ck",
      sql`${t.netCommissionableCentavosMxn} = ${t.grossPaidCentavosMxn} - ${t.vatCentavosMxn} - ${t.gatewayFeeCentavosMxn}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// F. Pick abierto semanal
// ---------------------------------------------------------------------------

export const publicWeeklyPicks = pgTable(
  "public_weekly_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipsterUserId: uuid("tipster_user_id")
      .notNull()
      .references(() => tipsterProfiles.userId),
    isoYearWeek: char("iso_year_week", { length: 8 }).notNull(),
    publicSlug: text("public_slug").notNull(),
    originType: text("origin_type").notNull(),
    gameId: text("game_id").notNull(),
    unlockedPickId: text("unlocked_pick_id").notNull(),
    sealedJournalEntryId: uuid("sealed_journal_entry_id").references(() => sealedPicks.id),
    thesisCopy: varchar("thesis_copy", { length: 240 }).notNull(),
    viewsCount: integer("views_count").notNull().default(0),
    signupClicksCount: integer("signup_clicks_count").notNull().default(0),
    publishedAt: ts("published_at").notNull().defaultNow(),
    gameKickoffAt: ts("game_kickoff_at").notNull(),
  },
  (t) => [
    uniqueIndex("public_weekly_one_per_week_uq").on(t.tipsterUserId, t.isoYearWeek),
    index("public_weekly_slug_idx").on(t.publicSlug),
    index("public_weekly_game_idx").on(t.gameId),
    check("public_weekly_origin_ck", sql`${t.originType} IN ('spacetime', 'bitacora')`),
    check(
      "public_weekly_bitacora_seal_ck",
      sql`${t.originType} <> 'bitacora' OR ${t.sealedJournalEntryId} IS NOT NULL`,
    ),
    check("public_weekly_before_kickoff_ck", sql`${t.publishedAt} < ${t.gameKickoffAt}`),
  ],
);

// ---------------------------------------------------------------------------
// G. Comunidad VIP
// ---------------------------------------------------------------------------

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    /** Partido del pick adjunto; null en una publicación sin pick. */
    gameId: text("game_id"),
    leagueLabel: text("league_label").notNull(),
    matchLabel: text("match_label").notNull(),
    originType: text("origin_type").notNull(),
    pickBadge: text("pick_badge").notNull(),
    /** Pick adjunto tal como se publicó (id, cuota, unidades, probabilidad del modelo). */
    pick: jsonb("pick"),
    sealedJournalEntryId: uuid("sealed_journal_entry_id").references(() => sealedPicks.id),
    authorRoleBadgeSnapshot: text("author_role_badge_snapshot").notNull(),
    authorRecordSnapshot: text("author_record_snapshot").notNull(),
    authorClvSnapshot: text("author_clv_snapshot").notNull(),
    body: varchar("body", { length: 600 }).notNull(),
    likesCount: integer("likes_count").notNull().default(0),
    copiesToJournalCount: integer("copies_to_journal_count").notNull().default(0),
    isHiddenByModeration: boolean("is_hidden_by_moderation").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("social_posts_author_idx").on(t.authorUserId),
    index("social_posts_game_idx").on(t.gameId),
    index("social_posts_created_idx").on(t.createdAt.desc()),
    check("social_posts_origin_ck", sql`${t.originType} IN ('Spacetime Suite', 'Bitácora Propia')`),
  ],
);

export const socialComments = pgTable(
  "social_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => socialComments.id, {
      onDelete: "set null",
    }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: varchar("body", { length: 400 }).notNull(),
    authorRecordSnapshot: text("author_record_snapshot").notNull(),
    isHiddenByModeration: boolean("is_hidden_by_moderation").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("social_comments_post_idx").on(t.postId, t.createdAt),
    index("social_comments_author_idx").on(t.authorUserId, t.createdAt),
    index("social_comments_parent_idx").on(t.parentCommentId),
  ],
);

/** «Me gusta»: uno por socio y publicación. */
export const socialLikes = pgTable(
  "social_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/** Marcas de «Útil» en respuestas de Comunidad. */
export const socialCommentLikes = pgTable(
  "social_comment_likes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => socialComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId] }),
    index("social_comment_likes_user_idx").on(t.userId),
  ],
);

/** A quién sigue cada socio. */
export const socialFollows = pgTable(
  "social_follows",
  {
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedUserId: uuid("followed_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerUserId, t.followedUserId] }),
    index("social_follows_followed_idx").on(t.followedUserId),
    check("social_follows_not_self_ck", sql`${t.followerUserId} <> ${t.followedUserId}`),
  ],
);

export const socialModerationLogs = pgTable("social_moderation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

/** Reportes de publicaciones y comentarios en Comunidad. */
export const socialReports = pgTable(
  "social_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => socialPosts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => socialComments.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    resolvedAt: ts("resolved_at"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("social_reports_status_created_idx").on(t.status, t.createdAt.desc()),
    index("social_reports_reporter_created_idx").on(t.reporterUserId, t.createdAt.desc()),
    uniqueIndex("social_reports_reporter_post_uidx")
      .on(t.reporterUserId, t.postId)
      .where(sql`${t.postId} IS NOT NULL`),
    uniqueIndex("social_reports_reporter_comment_uidx")
      .on(t.reporterUserId, t.commentId)
      .where(sql`${t.commentId} IS NOT NULL`),
    check(
      "social_reports_target_ck",
      sql`(${t.postId} IS NOT NULL AND ${t.commentId} IS NULL) OR (${t.postId} IS NULL AND ${t.commentId} IS NOT NULL)`,
    ),
    check(
      "social_reports_reason_ck",
      sql`${t.reason} IN ('spam_enlaces', 'ofensivo', 'apuesta_riesgosa', 'otro')`,
    ),
    check(
      "social_reports_status_ck",
      sql`${t.status} IN ('pending', 'hidden', 'restored', 'dismissed')`,
    ),
  ],
);

/** Avisos sociales de la campana: comentarios, nuevos seguidores y «me gusta» agrupados. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => socialPosts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => socialComments.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    readAt: ts("read_at"),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    uniqueIndex("notifications_follow_once_uidx")
      .on(t.userId, t.actorUserId)
      .where(sql`${t.kind} = 'follow'`),
    uniqueIndex("notifications_like_post_uidx")
      .on(t.userId, t.postId)
      .where(sql`${t.kind} = 'like'`),
    check("notifications_kind_ck", sql`${t.kind} IN ('comment', 'comment_reply', 'mention', 'follow', 'like')`),
  ],
);

// ---------------------------------------------------------------------------
// H. CFDI 4.0
// ---------------------------------------------------------------------------

export const cfdiProfiles = pgTable(
  "cfdi_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    rfc: varchar("rfc", { length: 13 }).notNull(),
    legalName: text("legal_name").notNull(),
    taxZipCode: char("tax_zip_code", { length: 5 }).notNull(),
    satTaxSystem: char("sat_tax_system", { length: 3 }).notNull(),
    cfdiUse: char("cfdi_use", { length: 3 }).notNull().default("G03"),
    billingEmail: text("billing_email").notNull(),
    facturapiCustomerId: text("facturapi_customer_id").unique(),
    autoInvoiceEnabled: boolean("auto_invoice_enabled").notNull().default(true),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("cfdi_profiles_system_ck", sql`${t.satTaxSystem} IN ('601', '605', '612', '616', '626')`),
    check("cfdi_profiles_rfc_ck", sql`char_length(${t.rfc}) IN (12, 13)`),
    check("cfdi_profiles_zip_ck", sql`${t.taxZipCode} ~ '^[0-9]{5}$'`),
  ],
);

export const cfdiInvoices = pgTable(
  "cfdi_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    invoiceKind: text("invoice_kind").notNull(),
    facturapiInvoiceId: text("facturapi_invoice_id").notNull().unique(),
    satUuid: uuid("sat_uuid").notNull().unique(),
    totalCentavosMxn: integer("total_centavos_mxn").notNull(),
    vatCentavosMxn: integer("vat_centavos_mxn").notNull(),
    status: text("status").notNull(),
    xmlStorageKey: text("xml_storage_key").notNull(),
    pdfStorageKey: text("pdf_storage_key").notNull(),
    stampedAt: ts("stamped_at").notNull(),
  },
  (t) => [
    index("cfdi_invoices_user_idx").on(t.userId),
    check(
      "cfdi_invoices_kind_ck",
      sql`${t.invoiceKind} IN ('individual_auto', 'individual_self_service', 'global_monthly', 'egreso_refund')`,
    ),
    check("cfdi_invoices_status_ck", sql`${t.status} IN ('valid', 'cancellation_pending', 'canceled')`),
    check(
      "cfdi_invoices_global_ck",
      sql`(${t.invoiceKind} = 'global_monthly') = (${t.userId} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Eventos de la pasarela ya procesados (idempotencia del webhook)
// ---------------------------------------------------------------------------

export const processedPaymentEvents = pgTable("processed_payment_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type").notNull(),
  processedAt: ts("processed_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Autenticación (Better Auth, ADR-010). `users.auth_user_id` liga la cuenta con el perfil.
// ---------------------------------------------------------------------------

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_session_user_idx").on(t.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("auth_account_user_idx").on(t.userId),
    uniqueIndex("auth_account_provider_account_uq").on(t.providerId, t.accountId),
  ],
);

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Cobro por transferencia SPEI y cupones de acceso (Beta 1.0)
// ---------------------------------------------------------------------------

export const transferPaymentRequests = pgTable(
  "transfer_payment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planInterval: text("plan_interval").notNull(),
    amountCentavosMxn: integer("amount_centavos_mxn").notNull(),
    reportedAmountCentavosMxn: integer("reported_amount_centavos_mxn"),
    amountMismatch: boolean("amount_mismatch").notNull().default(false),
    referralDiscountApplied: boolean("referral_discount_applied").notNull().default(false),
    referenceCode: text("reference_code").notNull(),
    originBank: text("origin_bank"),
    receiptReference: text("receipt_reference"),
    payerName: text("payer_name"),
    transferDate: text("transfer_date"),
    userNote: text("user_note"),
    status: text("status").notNull().default("pending_review"),
    issuedCouponId: uuid("issued_coupon_id").references((): AnyPgColumn => accessCoupons.id, {
      onDelete: "set null",
    }),
    entitlementGrantId: uuid("entitlement_grant_id").references(() => entitlementGrants.id),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    adminNotes: text("admin_notes"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("transfer_requests_user_created_idx").on(t.userId, t.createdAt),
    index("transfer_requests_status_created_idx").on(t.status, t.createdAt),
    index("transfer_requests_reference_code_idx").on(t.referenceCode),
    uniqueIndex("transfer_requests_one_pending_per_user_uq")
      .on(t.userId)
      .where(sql`${t.status} = 'pending_review'`),
    uniqueIndex("transfer_requests_pending_ref_uq")
      .on(t.referenceCode)
      .where(sql`${t.status} = 'pending_review'`),
    check("transfer_requests_interval_ck", sql`${t.planInterval} IN ('monthly', 'annual')`),
    check("transfer_requests_amount_ck", sql`${t.amountCentavosMxn} > 0`),
    check(
      "transfer_requests_reported_amount_ck",
      sql`${t.reportedAmountCentavosMxn} IS NULL OR ${t.reportedAmountCentavosMxn} > 0`,
    ),
    check(
      "transfer_requests_status_ck",
      sql`${t.status} IN ('pending_review', 'approved', 'rejected', 'canceled')`,
    ),
  ],
);

export const accessCoupons = pgTable(
  "access_coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    days: integer("days").notNull(),
    maxRedemptions: integer("max_redemptions"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    expiresAt: ts("expires_at"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    transferRequestId: uuid("transfer_request_id")
      .unique()
      .references((): AnyPgColumn => transferPaymentRequests.id, { onDelete: "set null" }),
    restrictedToUserId: uuid("restricted_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("access_coupons_code_upper_ck", sql`${t.code} = upper(${t.code})`),
    check("access_coupons_days_ck", sql`${t.days} BETWEEN 1 AND 365`),
    check(
      "access_coupons_max_redemptions_ck",
      sql`${t.maxRedemptions} IS NULL OR ${t.maxRedemptions} > 0`,
    ),
    check("access_coupons_redeemed_count_ck", sql`${t.redeemedCount} >= 0`),
    check(
      "access_coupons_quota_ck",
      sql`${t.maxRedemptions} IS NULL OR ${t.redeemedCount} <= ${t.maxRedemptions}`,
    ),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => accessCoupons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entitlementGrantId: uuid("entitlement_grant_id").references(() => entitlementGrants.id),
    transferRequestId: uuid("transfer_request_id").references(() => transferPaymentRequests.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coupon_redemptions_coupon_user_uq").on(t.couponId, t.userId),
    index("coupon_redemptions_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/** Votos de la comunidad por partido: quién gana y si se dará el pick principal. */
export const matchVotes = pgTable(
  "match_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    question: text("question").notNull(),
    choice: text("choice").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("match_votes_user_game_question_uidx").on(t.userId, t.gameId, t.question),
    index("match_votes_game_question_idx").on(t.gameId, t.question),
    check("match_votes_question_ck", sql`${t.question} IN ('ganador', 'pick')`),
    check(
      "match_votes_choice_ck",
      sql`(${t.question} = 'ganador' AND ${t.choice} IN ('home', 'draw', 'away')) OR (${t.question} = 'pick' AND ${t.choice} IN ('si', 'no'))`,
    ),
    check("match_votes_game_id_ck", sql`${t.gameId} ~ '^[a-zA-Z0-9._-]{1,128}$'`),
  ],
);

/**
 * Resultado final de cada partido, guardado la primera vez que el servidor lo ve terminado.
 * Los snapshots de partidos rotan; esto conserva el marcador para insignias como
 * «Lectura del partido».
 */
export const matchResults = pgTable(
  "match_results",
  {
    gameId: text("game_id").primaryKey(),
    homeScore: integer("home_score").notNull(),
    awayScore: integer("away_score").notNull(),
    outcome: text("outcome").notNull(),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    check("match_results_outcome_ck", sql`${t.outcome} IN ('home', 'draw', 'away')`),
    check("match_results_scores_ck", sql`${t.homeScore} >= 0 AND ${t.awayScore} >= 0`),
    check("match_results_game_id_ck", sql`${t.gameId} ~ '^[a-zA-Z0-9._-]{1,128}$'`),
  ],
);

/**
 * Pick principal congelado 60 minutos antes del saque inicial («Antes del partido»).
 * Se escribe una sola vez por `game_id` (`ON CONFLICT DO NOTHING`) para que no cambie
 * aunque el motor o los snapshots se recalculen después.
 */
export const matchFrozenPicks = pgTable(
  "match_frozen_picks",
  {
    gameId: text("game_id").primaryKey(),
    pickId: text("pick_id").notNull(),
    pickLabel: text("pick_label").notNull(),
    categoryLabel: text("category_label").notNull(),
    marketGroup: text("market_group").notNull(),
    selectionKey: text("selection_key").notNull(),
    probability: numeric("probability", { precision: 6, scale: 5 }).notNull(),
    fairDecimal: numeric("fair_decimal", { precision: 8, scale: 3 }).notNull(),
    fairAmerican: integer("fair_american").notNull(),
    kickoffAt: ts("kickoff_at").notNull(),
    freezeAt: ts("freeze_at").notNull(),
    frozenAt: ts("frozen_at").notNull().defaultNow(),
  },
  (t) => [
    check("match_frozen_picks_game_id_ck", sql`${t.gameId} ~ '^[a-zA-Z0-9._-]{1,128}$'`),
    check("match_frozen_picks_probability_ck", sql`${t.probability} > 0 AND ${t.probability} < 1`),
    check("match_frozen_picks_fair_decimal_ck", sql`${t.fairDecimal} > 1`),
    check("match_frozen_picks_freeze_window_ck", sql`${t.freezeAt} < ${t.kickoffAt}`),
  ],
);

/**
 * EN-VIVO-1 (migración 0022). Id del proveedor ↔ id propio del partido. Las URLs y las demás
 * tablas usan siempre `game_id`; el id del proveedor solo vive aquí.
 */
export const providerMatchLinks = pgTable(
  "provider_match_links",
  {
    provider: text("provider").notNull(),
    gameId: text("game_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    method: text("method").notNull(),
    linkedAt: ts("linked_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "provider_match_links_pk", columns: [t.provider, t.gameId] }),
    uniqueIndex("provider_match_links_event_uidx").on(t.provider, t.providerEventId),
    check("provider_match_links_provider_ck", sql`${t.provider} IN ('bzzoiro')`),
    check("provider_match_links_game_id_ck", sql`${t.gameId} ~ '^[a-zA-Z0-9._-]{1,128}$'`),
    check("provider_match_links_event_ck", sql`${t.providerEventId} ~ '^[0-9]{1,18}$'`),
  ],
);

/**
 * Caché compartida del lector en vivo: todas las instancias del servidor leen de aquí y solo una
 * (la que toma el `refresh_lease_until`) consulta al proveedor. Guarda el estado ya normalizado,
 * nunca el dato crudo del proveedor.
 */
export const liveFeedCache = pgTable(
  "live_feed_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    payload: jsonb("payload").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
    freshUntil: ts("fresh_until").notNull(),
    refreshLeaseUntil: ts("refresh_lease_until"),
  },
  (t) => [check("live_feed_cache_key_ck", sql`${t.cacheKey} ~ '^[a-z0-9:._-]{1,160}$'`)],
);

/** Peticiones del día por proveedor y lo que el proveedor dice que queda (`RateLimit`). */
export const providerQuota = pgTable(
  "provider_quota",
  {
    provider: text("provider").notNull(),
    day: date("day").notNull(),
    requests: integer("requests").notNull().default(0),
    remaining: integer("remaining"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "provider_quota_pk", columns: [t.provider, t.day] }),
    check("provider_quota_requests_ck", sql`${t.requests} >= 0`),
  ],
);

/** Momentos del partido detectados por el lector en vivo; alimentan los avisos de «Siguiendo». */
export const liveMatchEvents = pgTable(
  "live_match_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id").notNull(),
    kind: text("kind").notNull(),
    side: text("side"),
    minute: integer("minute"),
    homeScore: integer("home_score").notNull(),
    awayScore: integer("away_score").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique("live_match_events_dedupe_key_unique"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("live_match_events_game_time_idx").on(t.gameId, t.occurredAt),
    check("live_match_events_kind_ck", sql`${t.kind} IN ('kickoff', 'goal', 'halftime', 'final')`),
    check("live_match_events_side_ck", sql`${t.side} IS NULL OR ${t.side} IN ('home', 'away')`),
    check("live_match_events_scores_ck", sql`${t.homeScore} >= 0 AND ${t.awayScore} >= 0`),
    check("live_match_events_game_id_ck", sql`${t.gameId} ~ '^[a-zA-Z0-9._-]{1,128}$'`),
  ],
);

/** Última cuota observada pre-kickoff para calcular CLV real al liquidar picks. */
export const closingOdds = pgTable(
  "closing_odds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: text("game_id").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    lineKey: text("line_key").notNull().default(""),
    book: text("book").notNull(),
    decimalOdds: numeric("decimal_odds", { precision: 7, scale: 3 }).notNull(),
    fairDecimal: numeric("fair_decimal", { precision: 7, scale: 3 }),
    noVigProb: numeric("no_vig_prob", { precision: 6, scale: 5 }),
    source: text("source").notNull(),
    kickoffAt: ts("kickoff_at").notNull(),
    capturedAt: ts("captured_at").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("closing_odds_key_uq").on(t.gameId, t.market, t.selection, t.lineKey),
    index("closing_odds_kickoff_idx").on(t.kickoffAt),
    check("closing_odds_before_kickoff_ck", sql`${t.capturedAt} <= ${t.kickoffAt}`),
  ],
);

/** Caché persistente de análisis Cortex IA compartido entre instancias serverless. */
export const cortexCache = pgTable(
  "cortex_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    gameId: text("game_id").notNull(),
    factsHash: text("facts_hash").notNull(),
    model: text("model").notNull(),
    summary: jsonb("summary").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("cortex_cache_game_idx").on(t.gameId),
    index("cortex_cache_expires_idx").on(t.expiresAt),
  ],
);

/** Suscripciones Web Push VAPID del socio. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique("push_subscriptions_endpoint_uq"),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    topicPicks: boolean("topic_picks").notNull().default(true),
    topicLive: boolean("topic_live").notNull().default(true),
    topicSocial: boolean("topic_social").notNull().default(true),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    lastSentAt: ts("last_sent_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** Embudo de conversión mínimo propio, activado solo bajo consentimiento de analítica. */
export const funnelEvents = pgTable(
  "funnel_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventName: text("event_name").notNull(),
    stageOrder: integer("stage_order").notNull(),
    sessionHash: text("session_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sourcePath: text("source_path"),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("funnel_events_session_event_uq").on(t.sessionHash, t.eventName),
    index("funnel_events_name_created_idx").on(t.eventName, t.createdAt),
    check(
      "funnel_events_name_ck",
      sql`${t.eventName} IN ('landing', 'signup_step1', 'signup_step2', 'first_sealed_pick', 'spei_transfer', 'coupon_redeemed')`,
    ),
  ],
);

export const securityRateBuckets = pgTable(
  "security_rate_buckets",
  {
    bucket: text("bucket").notNull(),
    subjectKey: text("subject_key").notNull(),
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
    hits: integer("hits").notNull().default(1),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [
    primaryKey({ name: "security_rate_buckets_pk", columns: [t.bucket, t.subjectKey, t.windowStart] }),
    index("security_rate_buckets_expires_idx").on(t.expiresAt),
  ],
);

export const securityAbuseEvents = pgTable(
  "security_abuse_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ipHash: text("ip_hash").notNull(),
    route: text("route").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    index("security_abuse_events_created_idx").on(t.createdAt.desc()),
    index("security_abuse_events_user_created_idx").on(t.userId, t.createdAt.desc()),
    check(
      "security_abuse_events_kind_ck",
      sql`${t.kind} IN ('rate_limit', 'scraping_velocity', 'session_revoked', 'csrf_rejected', 'idor_attempt')`,
    ),
    check(
      "security_abuse_events_severity_ck",
      sql`${t.severity} IN ('low', 'medium', 'high', 'critical')`,
    ),
  ],
);
