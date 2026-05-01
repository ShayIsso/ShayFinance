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
  customType,
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
    isDefault: boolean("is_default").default(false).notNull(),
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
