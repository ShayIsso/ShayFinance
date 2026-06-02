/**
 * Next.js instrumentation hook — runs once at server startup.
 * Registers the daily scheduler when SCHEDULER_ENABLED=true.
 *
 * This is the correct seam for startup registration in Next.js 15+.
 * Do NOT register the scheduler from a React layout/effect — it would
 * run per-request on the client.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    await startScheduler();
  }
}
