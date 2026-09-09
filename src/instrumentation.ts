/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates the boot-critical environment, then registers the daily scheduler
 * when SCHEDULER_ENABLED=true.
 *
 * This is the correct seam for startup registration in Next.js 15+.
 * Do NOT register the scheduler from a React layout/effect — it would
 * run per-request on the client.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { checkBootEnv } = await import("@/lib/env");
  const bootEnv = checkBootEnv(process.env);

  if (!bootEnv.ok) {
    const { createRedactedLogger } = await import("@/lib/logging");
    // Variable names only — never a value, not even its length (zero-leak
    // policy). What to do about each one belongs on the diagnostic page the
    // root layout renders, which is where the operator is actually looking.
    createRedactedLogger().error(
      `[boot] Unusable environment: ${bootEnv.problems.map((p) => p.variable).join(", ")}. ` +
        `Serving the setup diagnostic on every route; scheduler not started.`,
    );
    // Every scheduler path reaches the database, whose URL or encryption key is
    // the thing that failed. Starting it anyway would turn a legible boot
    // failure into a recurring one on a timer (ADR-0014 §1).
    return;
  }

  const { startScheduler } = await import("@/lib/scheduler");
  await startScheduler();
}
