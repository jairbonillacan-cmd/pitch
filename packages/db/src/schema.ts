/**
 * Esquema PostgreSQL (Neon, ADR-007) de PitchLab con Drizzle.
 *
 * - Datos del socio: bitácora sellada, vigilancia y preferencias (hoy viven en el navegador).
 * - Crecimiento y cobro: tablas de docs/product/VISION_REESTRUCTURA_CLAUDE_GROWTH.md §4.2.
 * Montos en centavos MXN (`integer`), fechas en `timestamptz` UTC.
 */
import { sql } from "drizzle-orm";
import {
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
  xUsername: text("x_username"),
  xLinkedAt: ts("x_linked_at"),
  referralCode: text("referral_code").unique(),
  isAmbassador: boolean("is_ambassador").notNull().default(false),
  isAdult: boolean("is_adult").notNull().default(false),
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
  },
  (t) => [
    index("sealed_picks_user_idx").on(t.userId, t.sealedAt),
    uniqueIndex("sealed_picks_user_pick_uq").on(t.userId, t.pickId),
    check("sealed_picks_status_ck", sql`${t.status} IN ('pending', 'won', 'lost', 'void')`),
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
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    oddsFormat: text("odds_format").notNull().default("american"),
    riskPreference: text("risk_preference").notNull().default("medio"),
    favoriteLeagues: text("favorite_leagues").array().notNull().default(sql`'{}'::text[]`),
    unitMxnCentavos: integer("unit_mxn_centavos").notNull().default(10000),
    publicRecordVisible: boolean("public_record_visible").notNull().default(true),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("user_preferences_odds_ck", sql`${t.oddsFormat} IN ('american', 'decimal')`),
    check("user_preferences_risk_ck", sql`${t.riskPreference} IN ('conservador', 'medio', 'arriesgado')`),
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
    createdAt: createdAt(),
  },
  (t) => [
    index("entitlement_grants_user_ends_idx").on(t.userId, t.endsAt),
    check(
      "entitlement_grants_source_ck",
      sql`${t.sourceKind} IN ('trial_m1_nocard', 'trial_tipstar_5d', 'referral_host_15d', 'referral_friend_15d', 'ambassador_bonus_30d', 'tipstar_comp_pass', 'admin_grant')`,
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
// E. Tipstars oficiales
// ---------------------------------------------------------------------------

export const tipstarProfiles = pgTable(
  "tipstar_profiles",
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
    check("tipstar_profiles_payout_ck", sql`${t.payoutMethod} IN ('spei_manual', 'stripe_connect')`),
    check("tipstar_profiles_bps_ck", sql`${t.commissionBps} BETWEEN 0 AND 5000`),
    check("tipstar_profiles_code_upper_ck", sql`${t.promoCode} = upper(${t.promoCode})`),
  ],
);

export const tipstarAttributions = pgTable(
  "tipstar_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipstarUserId: uuid("tipstar_user_id")
      .notNull()
      .references(() => tipstarProfiles.userId),
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
    index("tipstar_attr_tipstar_idx").on(t.tipstarUserId),
    check("tipstar_attr_self_ck", sql`${t.tipstarUserId} <> ${t.referredUserId}`),
    check(
      "tipstar_attr_status_ck",
      sql`${t.status} IN ('trial_5d', 'active_paying', 'churned', 'fraud_blocked')`,
    ),
  ],
);

export const tipstarCommissionLedger = pgTable(
  "tipstar_commission_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributionId: uuid("attribution_id")
      .notNull()
      .references(() => tipstarAttributions.id),
    tipstarUserId: uuid("tipstar_user_id")
      .notNull()
      .references(() => tipstarProfiles.userId),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    grossPaidCentavosMxn: integer("gross_paid_centavos_mxn").notNull(),
    vatCentavosMxn: integer("vat_centavos_mxn").notNull(),
    gatewayFeeCentavosMxn: integer("gateway_fee_centavos_mxn").notNull(),
    netCommissionableCentavosMxn: integer("net_commissionable_centavos_mxn").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    commissionCentavosMxn: integer("commission_centavos_mxn").notNull(),
    status: text("status").notNull(),
    clearsAt: ts("clears_at").notNull(),
    payoutBatchId: uuid("payout_batch_id"),
    /** Transferencia de Stripe Connect que pagó este asiento. */
    stripeTransferId: text("stripe_transfer_id").unique(),
    paidOutAt: ts("paid_out_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tipstar_ledger_attr_idx").on(t.attributionId),
    index("tipstar_ledger_tipstar_idx").on(t.tipstarUserId),
    check(
      "tipstar_ledger_status_ck",
      sql`${t.status} IN ('pending_clearance', 'payable', 'paid_out', 'reversed_refund')`,
    ),
    check(
      "tipstar_ledger_net_ck",
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
    tipstarUserId: uuid("tipstar_user_id")
      .notNull()
      .references(() => tipstarProfiles.userId),
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
    uniqueIndex("public_weekly_one_per_week_uq").on(t.tipstarUserId, t.isoYearWeek),
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
    gameId: text("game_id").notNull(),
    leagueLabel: text("league_label").notNull(),
    matchLabel: text("match_label").notNull(),
    originType: text("origin_type").notNull(),
    pickBadge: text("pick_badge").notNull(),
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
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: varchar("body", { length: 400 }).notNull(),
    authorRecordSnapshot: text("author_record_snapshot").notNull(),
    isHiddenByModeration: boolean("is_hidden_by_moderation").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("social_comments_post_idx").on(t.postId, t.createdAt)],
);

export const socialModerationLogs = pgTable("social_moderation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

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
  (t) => [index("auth_account_user_idx").on(t.userId)],
);

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
