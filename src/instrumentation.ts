/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates the boot-critical environment, then registers the daily scheduler
 * when SCHEDULER_ENABLED=true.
 *
 * This is the correct seam for startup registration in Next.js 15+.
 * Do NOT register the scheduler from a React layout/effect — it would
 * run per-request on the client.
 *
 * Nothing in here may throw. A throw out of `register()` fails server
 * preparation, and *every* route then 500s — including the diagnostic page that
 * exists to explain a bad environment. That is why the scheduler start is
 * wrapped below rather than trusted: `startScheduler` parses the full env
 * schema, so any field that is not blank-tolerant would otherwise turn a
 * cosmetic .env mistake into a dead app.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkBootEnv } = await import("@/lib/env");
  const { createRedactedLogger } = await import("@/lib/logging");
  const logger = createRedactedLogger();

  const bootEnv = checkBootEnv(process.env);

  if (!bootEnv.ok) {
    // Variable names only — never a value, not even its length (zero-leak
    // policy). What to do about each one belongs on the diagnostic page that
    // /env-check renders, which is where the operator is actually looking.
    logger.error(
      `[boot] Unusable environment: ${bootEnv.problems.map((p) => p.variable).join(", ")}. ` +
        `Serving the setup diagnostic on every route; scheduler not started.`,
    );
    // Every scheduler path reaches the database, whose URL or encryption key is
    // the thing that failed. Starting it anyway would turn a legible boot
    // failure into a recurring one on a timer (ADR-0014 §1).
    return;
  }

  try {
    const { startScheduler } = await import("@/lib/scheduler");
    await startScheduler();
  } catch (err) {
    logger.error("[boot] Scheduler not started:", err);
  }
}
