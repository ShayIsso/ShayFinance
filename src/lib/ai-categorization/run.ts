import { redactText } from "@/lib/redaction";
import {
  lookupMemory,
  recordAssignment,
  canOverwrite,
  deriveMerchantKey,
  type MerchantMemoryStore,
  type CategorySource,
} from "@/lib/merchant-memory";
import { matchesTransferDescriptor, type TransferDescriptorKind } from "@/lib/transaction-matching";
import { assemblePrompt, chunkIntoBatches, BATCH_SIZE, type PromptCategory } from "./prompt";
import { parseCategorizationResponse } from "./parse";
import { routeConfidence } from "./router";
import type { CategorizationProvider, GenerationOptions } from "./provider";

export type BankType = "discount" | "max" | "visaCal";

export interface UncategorizedTxn {
  readonly id: string;
  readonly description: string;
  readonly bankType: BankType;
}

/** A category as the store hands it out: id for applying, name+description for the prompt. */
export interface PromptCategoryRow extends PromptCategory {
  readonly id: string;
}

export interface FewShotRow {
  readonly categoryName: string;
  /** Raw rule-matched description; redacted at the egress boundary by the run. */
  readonly description: string;
}

export interface AiCorrectionRow {
  /** Pre-redacted snapshot (ADR-0010 §5). */
  readonly description: string;
  readonly correctedToCategoryName: string;
}

export interface SuppressedPair {
  readonly transactionId: string;
  readonly categoryId: string;
}

/** A suggestion row the run writes. Only the two write-time statuses are producible here. */
export interface SuggestionInsert {
  readonly transactionId: string;
  readonly categoryId: string;
  readonly confidence: number;
  readonly model: string;
  readonly status: "pending_review" | "auto_applied";
}

/**
 * AI-specific persistence seam. Memory reads/writes are NOT here — they go
 * through the injected `MerchantMemoryStore` so the run composes the existing
 * merchant-memory operations rather than re-implementing memory semantics.
 * The Drizzle implementation lives in store.ts; tests inject an in-memory fake.
 */
export interface AiCategorizationStore {
  getUncategorizedTransactions(): Promise<UncategorizedTxn[]>;
  getPromptCategories(): Promise<PromptCategoryRow[]>;
  /** Rule-matched descriptions, disjoint from the served pool, as positive examples. */
  getFewShotExamples(): Promise<FewShotRow[]>;
  /** Corrections-log rows with `from_source='ai'`, as anti-examples. */
  getRecentAiCorrections(): Promise<AiCorrectionRow[]>;
  /**
   * (transaction, category) pairs with a `rejected` or `undone` suggestion — a
   * pair here is never re-suggested or re-applied (suppression).
   */
  getSuppressedPairs(transactionIds: string[]): Promise<SuppressedPair[]>;
  insertSuggestion(row: SuggestionInsert): Promise<void>;
}

export interface RunOptions {
  readonly batchSize?: number;
}

export interface RunFailure {
  /** 1-based batch number, or null for pre-batch failures. */
  readonly batch: number | null;
  /** Batch-local 1-based index, or null when document-level. */
  readonly index: number | null;
  readonly reason: string;
}

export interface AiCategorizationSummary {
  readonly totalUncategorized: number;
  readonly memoryApplied: number;
  readonly transferSkipped: number;
  readonly autoApplied: number;
  readonly queuedForReview: number;
  readonly discarded: number;
  readonly suppressed: number;
  /** Automation applies (memory or auto-apply) dropped because the row was no longer overwritable (overwrite law). */
  readonly overwriteBlocked: number;
  readonly batches: number;
  readonly failures: RunFailure[];
}

export interface RunDeps {
  readonly aiStore: AiCategorizationStore;
  readonly memoryStore: MerchantMemoryStore;
  readonly provider: CategorizationProvider;
  readonly options?: RunOptions;
}

/**
 * Card statements carry bare 4-digit merchant names (e.g. "פיצה 2000") that the
 * `card_settlement` shape would false-match, so cards scope the transfer guard
 * to genuine cross-account shapes only; bank accounts get all three kinds
 * (owner-adjudicated, PR #150). Mirrors reconciliation P1's bankType gate.
 */
// Locked by the benchmark shape (#144): deterministic JSON output, not caller-tunable.
const GENERATION: GenerationOptions = { temperature: 0, json: true };

// An ai-tier cache apply gets a suggestion row like any fresh auto-apply, so
// undo and suppression work uniformly (#144 stories 5 and 12). ai-tier memory
// is only ever seeded by a confidence>=6 auto-apply, so 6 is an honest floor;
// "memory" as the model identifier marks the guess as served from cache.
const MEMORY_CACHE_MODEL = "memory";
const MEMORY_CACHE_CONFIDENCE = 6;

function transferKindsFor(bankType: BankType): TransferDescriptorKind[] {
  return bankType === "discount"
    ? ["inter_account", "bit_mirror", "card_settlement"]
    : ["inter_account", "bit_mirror"];
}

/**
 * Runs uncategorized transactions through the ADR-0010 precedence order:
 * merchant memory → transfer guard → AI provider batches. Memory hits and
 * transfer-shaped descriptions never reach a provider. Provider answers route by
 * anchored confidence (ADR-0008 §7): 6–7 auto-apply marked-as-AI (writing
 * ai-tier memory + an `auto_applied` suggestion), 3–5 queue a `pending_review`
 * suggestion, 1–2 discard. Every apply obeys the overwrite law (NULL/`ai` only)
 * and suppression (no re-suggest of a rejected/undone pair). Provider and parse
 * errors are recorded, never thrown across the boundary.
 */
export async function runAiCategorization(
  deps: RunDeps,
  now: Date = new Date(),
): Promise<AiCategorizationSummary> {
  const { aiStore, memoryStore, provider } = deps;
  const batchSize = deps.options?.batchSize ?? BATCH_SIZE;

  const all = await aiStore.getUncategorizedTransactions();
  const failures: RunFailure[] = [];
  let memoryApplied = 0;
  let transferSkipped = 0;
  let autoApplied = 0;
  let queuedForReview = 0;
  let discarded = 0;
  let suppressedCount = 0;
  let overwriteBlocked = 0;

  // Suppression covers every automation path: a rejected/undone (transaction,
  // category) pair is never re-applied by the memory cache nor re-suggested by
  // a provider (#144 story 5). User-tier memory is exempt — it is the user's
  // own decision, which outranks a past rejection of an AI guess.
  const suppressedRows = await aiStore.getSuppressedPairs(all.map((t) => t.id));
  const suppressed = new Set(suppressedRows.map((p) => `${p.transactionId}|${p.categoryId}`));

  // ── Step 1: bulk merchant-memory lookup (ADR-0010 §1) ──
  const keyByTxn = new Map<string, string>();
  for (const txn of all) keyByTxn.set(txn.id, deriveMerchantKey(txn.description));
  const uniqueKeys = [...new Set([...keyByTxn.values()].filter(Boolean))];
  const hits = await lookupMemory(uniqueKeys, memoryStore, now);

  const afterMemory: UncategorizedTxn[] = [];
  for (const txn of all) {
    const key = keyByTxn.get(txn.id) ?? "";
    const entry = key ? hits.get(key) : undefined;
    if (!entry) {
      afterMemory.push(txn);
      continue;
    }
    if (entry.source !== "user" && suppressed.has(`${txn.id}|${entry.categoryId}`)) {
      suppressedCount++;
      afterMemory.push(txn);
      continue;
    }
    // Re-check the overwrite law at apply time: a row categorized as
    // user/rule/memory since fetch is never overwritten by automation.
    const current = await memoryStore.getTransaction(txn.id);
    if (!current || !canOverwrite(current.categorySource)) {
      overwriteBlocked++;
      continue;
    }
    // Trust TIER, not mechanism: a user-tier entry writes `memory`, an ai-tier
    // entry writes `ai` — a cached AI guess never gains protected status.
    const source: CategorySource = entry.source === "user" ? "memory" : "ai";
    await memoryStore.setTransactionCategory([txn.id], entry.categoryId, source, now);
    if (source === "ai") {
      await aiStore.insertSuggestion({
        transactionId: txn.id,
        categoryId: entry.categoryId,
        confidence: MEMORY_CACHE_CONFIDENCE,
        model: MEMORY_CACHE_MODEL,
        status: "auto_applied",
      });
    }
    memoryApplied++;
  }

  // ── Step 2: transfer guard (never sent to a provider) ──
  const afterTransfer: UncategorizedTxn[] = [];
  for (const txn of afterMemory) {
    if (matchesTransferDescriptor(txn.description, transferKindsFor(txn.bankType))) {
      transferSkipped++;
    } else {
      afterTransfer.push(txn);
    }
  }

  // ── Step 3: provider batches ──
  let batchCount = 0;
  if (afterTransfer.length > 0) {
    const categories = await aiStore.getPromptCategories();
    const idByName = new Map(categories.map((c) => [c.name, c.id]));
    const validNames = categories.map((c) => c.name);
    const promptCategories: PromptCategory[] = categories.map((c) => ({
      name: c.name,
      description: c.description,
    }));

    const fewShot = (await aiStore.getFewShotExamples()).map((e) => ({
      categoryName: e.categoryName,
      description: redactText(e.description),
    }));
    const antiExamples = (await aiStore.getRecentAiCorrections()).map((a) => ({
      description: redactText(a.description),
      correctedToCategoryName: a.correctedToCategoryName,
    }));

    const batches = chunkIntoBatches(afterTransfer, batchSize);
    batchCount = batches.length;

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const redacted = batch.map((t) => redactText(t.description));
      const prompt = assemblePrompt({
        categories: promptCategories,
        fewShot,
        antiExamples,
        batch: redacted,
      });

      let raw: string;
      try {
        raw = await provider.generate(prompt, GENERATION);
      } catch {
        failures.push({ batch: b + 1, index: null, reason: "provider_error" });
        continue;
      }

      const parsed = parseCategorizationResponse(raw, {
        validCategoryNames: validNames,
        batchSize: batch.length,
      });
      for (const f of parsed.failures) {
        failures.push({ batch: b + 1, index: f.index, reason: f.reason });
      }

      for (const ans of parsed.answers) {
        const txn = batch[ans.index - 1];
        const categoryId = idByName.get(ans.categoryName);
        if (!categoryId) {
          failures.push({ batch: b + 1, index: ans.index, reason: "unknown_category" });
          continue;
        }
        const tier = routeConfidence(ans.confidence);
        if (tier === "discard") {
          discarded++;
          continue;
        }
        const pairKey = `${txn.id}|${categoryId}`;
        if (suppressed.has(pairKey)) {
          suppressedCount++;
          continue;
        }

        if (tier === "auto_apply") {
          // Re-check the overwrite law at apply time: a row categorized as
          // user/rule/memory since fetch is never overwritten by automation.
          const current = await memoryStore.getTransaction(txn.id);
          if (!current || !canOverwrite(current.categorySource)) {
            overwriteBlocked++;
            continue;
          }
          // ai-tier recordAssignment sets category_source='ai' and writes an
          // ai-tier memory entry (cached guess, still undoable).
          await recordAssignment(
            { transactionId: txn.id, toCategoryId: categoryId, tier: "ai" },
            memoryStore,
            now,
          );
          autoApplied++;
        } else {
          queuedForReview++;
        }
        await aiStore.insertSuggestion({
          transactionId: txn.id,
          categoryId,
          confidence: ans.confidence,
          model: provider.modelId,
          status: tier === "auto_apply" ? "auto_applied" : "pending_review",
        });
      }
    }
  }

  return {
    totalUncategorized: all.length,
    memoryApplied,
    transferSkipped,
    autoApplied,
    queuedForReview,
    discarded,
    suppressed: suppressedCount,
    overwriteBlocked,
    batches: batchCount,
    failures,
  };
}
