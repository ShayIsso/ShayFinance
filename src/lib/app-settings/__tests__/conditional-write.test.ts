import { describe, it, expect } from "vitest";
import { buildCompleteOnboardingWrite } from "../store";

/**
 * Guards the SQL the Store fake cannot reach. A fake reimplements the write-once
 * rule as a read-then-write; only the emitted statement shows whether the
 * database is still the one enforcing it (ADR-0014 §4). Building a statement
 * needs no connection, so this runs in the ordinary suite.
 */
async function onboardingWriteSql() {
  const [{ db }, { appSettings }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  return buildCompleteOnboardingWrite(
    { db, appSettings },
    new Date("2026-03-04T00:00:00.000Z"),
    new Date("2026-03-04T00:00:00.000Z"),
  ).toSQL().sql;
}

describe("completeOnboarding SQL", () => {
  it("guards the SET with the timestamp still being null", async () => {
    expect(await onboardingWriteSql()).toContain('"onboarding_completed_at" is null');
  });

  it("upserts on the singleton id rather than inserting a second row", async () => {
    expect(await onboardingWriteSql()).toContain('on conflict ("id") do update');
  });

  it("returns the affected row, so zero rows can mean already-complete", async () => {
    expect(await onboardingWriteSql()).toMatch(/returning "id"/);
  });
});
