/**
 * Scheduler module — registers a daily node-cron job that runs the sync pipeline
 * with OTP-skip mode. Gated by SCHEDULER_ENABLED env flag so dev environments
 * don't trigger syncs on every hot reload.
 *
 * Public API: startScheduler() / stopScheduler()
 */

import { createRedactedLogger } from "@/lib/logging";
import { isSchedulerEnabled } from "@/lib/env";
import { cronTimeToExpression, drizzleSchedulerConfigStore } from "./config";

const logger = createRedactedLogger();

// Module-level cron task handle — kept so stopScheduler() can stop it.
let cronTask: { stop(): void } | null = null;

/**
 * Drives the full sync pipeline for a scheduled run.
 * Drains the generator to completion; no SSE needed.
 * Exported for direct invocation (e.g. manual trigger in tests or debugging).
 */
export async function runScheduledSync(): Promise<void> {
  // Lazy-import to avoid pulling in the heavy scraper at module initialisation time.
  const { syncAllBanksClaimed } = await import("@/lib/sync");

  // A manual sync (or a previous scheduled run still finishing) already holds
  // the claim — refuse rather than overlap it (#246). Quiet no-op: there is
  // no SSE listener for a scheduled run, so this is log-only, not an error.
  const claimed = syncAllBanksClaimed({ triggeredBy: "scheduled", otpMode: "skip" });
  if (claimed === null) {
    logger.info("[scheduler] Skipped scheduled sync — a sync is already in progress");
    return;
  }
  const { events, release } = claimed;

  try {
    for await (const _event of events) {
      // Events are consumed to completion. sync_runs rows are written by the
      // existing S1 instrumentation inside syncAllBanks. No SSE forwarding here.
    }
  } catch (err) {
    // Unexpected throw (should not happen — syncAllBanks catches internally).
    logger.error("[scheduler] runScheduledSync threw unexpectedly:", err);
  } finally {
    // Idempotent alongside `events`'s own finally-driven release — belt and
    // suspenders for the same not-yet-started-generator gap route.ts guards
    // against (see claim.ts's `acquireAndRelease`), should this function's
    // shape ever grow an early return above the loop.
    release();
  }
}

/**
 * Registers the node-cron job when SCHEDULER_ENABLED=true.
 * Safe to call multiple times — stops any existing task before re-registering.
 * No-ops when SCHEDULER_ENABLED is false (dev/test default).
 */
export async function startScheduler(): Promise<void> {
  if (!isSchedulerEnabled()) {
    return;
  }

  // Stop any existing task before re-registering (idempotent guard).
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  let config: { enabled: boolean; cronTime: string };
  try {
    config = await drizzleSchedulerConfigStore.getConfig();
  } catch (err) {
    logger.error("[scheduler] Failed to read scheduler config — scheduler not started:", err);
    return;
  }

  if (!config.enabled) {
    return;
  }

  let expression: string;
  try {
    expression = cronTimeToExpression(config.cronTime);
  } catch (err) {
    logger.error("[scheduler] Invalid cron time in config — scheduler not started:", err);
    return;
  }

  const nodeCron = await import("node-cron");
  cronTask = nodeCron.schedule(expression, () => {
    runScheduledSync().catch((err) => {
      logger.error("[scheduler] Scheduled sync failed:", err);
    });
  });

  logger.info(`[scheduler] Daily sync scheduled at ${config.cronTime} (${expression})`);
}

/**
 * Stops the registered cron task if one is active.
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
}
