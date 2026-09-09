import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  decimal,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  uniqueIndex,
  index,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom bytea type for encrypted data
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Enums
export const bankTypeEnum = pgEnum("bank_type", ["discount", "max", "visaCal"]);

export const categoryTypeEnum = pgEnum("category_type", [
  "income",
  "expense",
  "investment",
  "transfer",
  "ignore",
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["normal", "installments"]);

export const transactionStatusEnum = pgEnum("transaction_status", ["completed", "pending"]);

export const matchTypeEnum = pgEnum("match_type", ["contains", "starts_with", "exact", "regex"]);

export const reconciliationRoleEnum = pgEnum("reconciliation_role", [
  "settlement_lump",
  "settlement_detail",
  "transfer_pair",
]);

export const syncRunStatusEnum = pgEnum("sync_run_status", ["success", "otp_skipped", "error"]);

export const syncTriggerEnum = pgEnum("sync_trigger", ["manual", "scheduled"]);

export const recurringCadenceEnum = pgEnum("recurring_cadence", ["monthly", "quarterly", "annual"]);

export const recurringStatusEnum = pgEnum("recurring_status", ["active", "paused", "canceled"]);

// Provenance of a transaction's category (ADR-0010 §2). Records the trust
// TIER, not the mechanism: a user-tier merchant-memory hit writes `memory`,
// an ai-tier hit writes `ai`. NULL on the transaction column = uncategorized.
export const categorySourceEnum = pgEnum("category_source", ["rule", "memory", "ai", "user"]);

// Trust tier of a merchant-memory entry (ADR-0010 §4).
export const memorySourceEnum = pgEnum("memory_source", ["user", "ai"]);

// Lifecycle of an AI categorization suggestion (ADR-0008 §7). `pending_review`
// and `auto_applied` are written by an AI run; `accepted` / `rejected` /
// `undone` are user actions on a suggestion (review + undo flows, ticket #148).
export const aiSuggestionStatusEnum = pgEnum("ai_suggestion_status", [
  "pending_review",
  "auto_applied",
  "accepted",
  "rejected",
  "undone",
]);

// Tables
export const bankCredentials = pgTable("bank_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankType: bankTypeEnum("bank_type").notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  encryptedCredentials: bytea("encrypted_credentials").notNull(),
  iv: bytea("iv").notNull(),
  authTag: bytea("auth_tag").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    credentialId: uuid("credential_id")
      .references(() => bankCredentials.id, { onDelete: "cascade" })
      .notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    balance: decimal("balance", { precision: 12, scale: 2 }),
    balanceUpdatedAt: timestamp("balance_updated_at"),
  },
  (table) => [uniqueIndex("uq_bank_account").on(table.credentialId, table.accountNumber)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    type: categoryTypeEnum("type").notNull(),
    icon: varchar("icon", { length: 50 }).notNull(),
    color: varchar("color", { length: 7 }).notNull(),
    // Hebrew positive/anti-example guidance rendered into the AI categorization
    // prompt (#133). Nullable: user-created categories have none.
    description: text("description"),
    isDefault: boolean("is_default").default(false).notNull(),
    // One-level typed hierarchy (ADR-0011). Self-FK; a parent must itself be a
    // root (depth cap enforced at write time in categories/hierarchy.ts, not by
    // the DB). ON DELETE SET NULL matches the detach-on-group-delete rule (§8).
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
  },
  (table) => [uniqueIndex("uq_category_name").on(table.name)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .references(() => bankAccounts.id, { onDelete: "cascade" })
      .notNull(),
    externalId: varchar("external_id", { length: 100 }),
    date: date("date").notNull(),
    processedDate: date("processed_date").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    customDescription: varchar("custom_description", { length: 500 }),
    memo: text("memo"),
    originalAmount: decimal("original_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    originalCurrency: varchar("original_currency", { length: 3 }).notNull(),
    chargedAmount: decimal("charged_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    chargedCurrency: varchar("charged_currency", { length: 3 }),
    type: transactionTypeEnum("type").notNull(),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    status: transactionStatusEnum("status").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: categorySourceEnum("category_source"),
    reconciliationGroupId: uuid("reconciliation_group_id"),
    reconciliationRole: reconciliationRoleEnum("reconciliation_role"),
    reconciliationConfidence: real("reconciliation_confidence"),
    reconciliationConfirmedAt: timestamp("reconciliation_confirmed_at"),
    scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_external_id_account")
      .on(table.externalId, table.bankAccountId)
      .where(sql`external_id IS NOT NULL`),
  ],
);

export const categoryRules = pgTable("category_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(),
  matchType: matchTypeEnum("match_type").notNull(),
  pattern: varchar("pattern", { length: 500 }).notNull(),
  priority: integer("priority").default(0).notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  bank: bankTypeEnum("bank").notNull(),
  status: syncRunStatusEnum("status").notNull().default("success"),
  transactionsImported: integer("transactions_imported").notNull().default(0),
  errorMessage: text("error_message"),
  triggeredBy: syncTriggerEnum("triggered_by").notNull().default("manual"),
});

export const recurringExpenses = pgTable(
  "recurring_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patternFingerprint: text("pattern_fingerprint").notNull(),
    /** Immutable normalized match key (extractMerchant output). Used by RD2 badge matching + fingerprint. Never user-edited. */
    merchant: text("merchant").notNull(),
    /** Optional user-friendly name set on confirm. Display prefers this over merchant; matching never uses it. */
    displayName: text("display_name"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    expectedAmount: decimal("expected_amount", { precision: 12, scale: 2 }).notNull(),
    expectedCadence: recurringCadenceEnum("expected_cadence").notNull(),
    nextExpectedDate: date("next_expected_date").notNull(),
    lastMatchedTxnId: uuid("last_matched_txn_id").references(() => transactions.id),
    status: recurringStatusEnum("status").notNull().default("active"),
    /** Null = newly detected / needs user review. Set when user confirms the pattern. */
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_recurring_fingerprint").on(table.patternFingerprint)],
);

/**
 * Singleton configuration table for the background scheduler.
 * Always upsert id=1 — never insert additional rows.
 */
export const schedulerConfig = pgTable("scheduler_config", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(false),
  cronTime: varchar("cron_time", { length: 5 }).notNull().default("07:00"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Learned merchant→category mappings (ADR-0010 §4). Exact-key, one row per
 * merchant. `merchant_key` is `extractMerchant(description)` computed on the
 * raw description — never `custom_description`, never `canonicalizeMerchant`
 * (alias-table growth would orphan keys). Conflicts are last-write-wins.
 */
export const merchantMemory = pgTable(
  "merchant_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantKey: text("merchant_key").notNull(),
    categoryId: uuid("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
    source: memorySourceEnum("source").notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    lastHitAt: timestamp("last_hit_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_merchant_memory_key").on(table.merchantKey)],
);

/**
 * Append-only log of user recategorizations of already-categorized
 * transactions (ADR-0010 §5). No update/delete surface. Category names are
 * text SNAPSHOTS (denormalized on purpose) so history survives #133's
 * taxonomy renames/merges; the nullable FKs ride along for convenience.
 * `description_redacted` is produced by src/lib/redaction at write time — a
 * future AI-egress source must never store raw text.
 */
export const categoryCorrections = pgTable("category_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  merchantKey: text("merchant_key").notNull(),
  descriptionRedacted: text("description_redacted").notNull(),
  fromCategoryName: text("from_category_name").notNull(),
  toCategoryName: text("to_category_name").notNull(),
  fromCategoryId: uuid("from_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  toCategoryId: uuid("to_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  fromSource: categorySourceEnum("from_source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * AI categorization suggestions (ADR-0008 §7). One row per suggestion an AI run
 * produced: `auto_applied` rows record a 6–7 auto-apply (the category is already
 * on the transaction, marked `ai`); `pending_review` rows are 3–5 queued for the
 * user. A user's later `accepted` / `rejected` / `undone` action mutates status.
 *
 * `confidence` is the anchored 1–7 rubric (CONTEXT.md "anchored confidence") —
 * never reconciliation's 0–1 float. The (transaction, category) index serves the
 * suppression lookup (a `rejected`/`undone` pair is never re-suggested); the
 * status index serves the pending-review queue.
 */
/**
 * Savings goals (CONTEXT.md "savings goal", "goal ladder"). Months are stored as
 * "YYYY-MM" (day is not meaningful) so a goal's start/target aligns with the same
 * calendar month on `transactions.date` that every analytics/Dashboard widget
 * uses. Since #183 goals no longer accumulate independently: active goals form a
 * priority ladder that distributes one shared `savings pool` top-down (see
 * `goals_settings` for the pool's tracking-since baseline). Ladder math, capped
 * fill, and the accumulate-vs-reset law live in CONTEXT.md and `src/lib/goals`.
 */
export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
  startMonth: varchar("start_month", { length: 7 }).notNull(),
  openingAmount: decimal("opening_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  targetMonth: varchar("target_month", { length: 7 }),
  // Ascending ladder rank — priority 1 fills first (CONTEXT.md "goal ladder").
  // Seeded to creation order by migration 0007; new goals append to the bottom.
  priority: integer("priority").notNull(),
  // NULL = active (on the ladder). A completed goal holds its 100% claim until
  // archived; archiving releases the claim and drops it to read-only history.
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Global goals settings — a single row (id=1, mirrors `scheduler_config` /
 * `monthly_targets`: always upsert, never insert additional rows). Holds the
 * one user-set `tracking-since month` ("YYYY-MM") that anchors the shared
 * `savings pool` window (CONTEXT.md "savings pool"). Nullable until the user
 * sets it; editing it recomputes all goal progress statelessly.
 */
export const goalsSettings = pgTable("goals_settings", {
  id: integer("id").primaryKey().default(1),
  trackingSinceMonth: varchar("tracking_since_month", { length: 7 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Per-category monthly budgets (CONTEXT.md "budget pace"; decision record #105).
 * Budgets are gauges, not allocations: one optional cap per expense-type
 * category (uniqueness enforced here), measuring subtree spend for the calendar
 * month and resetting monthly. Expense-type-only attachment is a write invariant
 * in `src/lib/budgets` — the DB does not encode category type.
 *
 * `ON DELETE CASCADE` is the pre-accepted default from ADR-0011 §8: deleting a
 * category drops its budget. BGR8's delete-confirm dialog names this cascade
 * (see `getBudgetForCategory`); nothing else needs a detach story.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
    monthlyLimit: decimal("monthly_limit", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_budget_category").on(table.categoryId)],
);

/**
 * Singleton monthly targets (decision record #105 §1, §6). One row (id=1 —
 * mirrors `scheduler_config`, always upsert, never insert additional rows)
 * carrying the overall monthly expense target and the monthly net-savings
 * target. Both nullable: a target is opt-in. The savings target resets monthly
 * and is evaluated at month close (budgets reset monthly, goals accumulate).
 */
export const monthlyTargets = pgTable("monthly_targets", {
  id: integer("id").primaryKey().default(1),
  expenseTarget: decimal("expense_target", { precision: 12, scale: 2 }),
  savingsTarget: decimal("savings_target", { precision: 12, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: uuid("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
    confidence: integer("confidence").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    status: aiSuggestionStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_suggestions_txn_category").on(table.transactionId, table.categoryId),
    index("idx_ai_suggestions_status").on(table.status),
  ],
);

/**
 * App-level settings — a single row (id=1, mirrors `scheduler_config` /
 * `goals_settings`: always upsert, never insert additional rows). Holds what
 * ADR-0014 moves out of the environment, because the app can ask for it: the
 * app-password hash and the categorization provider selection with its key.
 *
 * `onboarding_completed_at` is the *sole* first-run signal and is never inferred
 * from data — deleting your only bank must not relaunch onboarding (ADR-0014
 * §4). It is written once: the setup submission conditions its upsert on this
 * column still being null, so a replay is harmless by construction.
 *
 * The API key is stored as the same AES-256-GCM triple as `bank_credentials`
 * (ADR-0002 — unique IV per record, GCM auth tag). All three parts are nullable
 * because a fresh install has no key, and all three must be read together.
 *
 * `categorization_provider` is `text`, not a `pgEnum`: the provider kinds are
 * owned by `src/lib/ai-categorization` and validated at the Zod boundary, and a
 * database enum listing them again is the second source of truth this schema
 * spent #248 removing. Projection is total, so a retired kind reads as unset.
 */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  appPasswordHash: text("app_password_hash"),
  categorizationProvider: text("categorization_provider"),
  categorizationApiKeyEncrypted: bytea("categorization_api_key_encrypted"),
  categorizationApiKeyIv: bytea("categorization_api_key_iv"),
  categorizationApiKeyAuthTag: bytea("categorization_api_key_auth_tag"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
