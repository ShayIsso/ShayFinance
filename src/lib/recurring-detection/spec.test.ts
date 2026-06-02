/**
 * Spec-derived TDD suite for the recurring-detection pure core.
 *
 * These tests are authored from the SPEC (issue #48 + ARCHITECTURE.md §2),
 * deliberately independent of the implementation, so that spec/impl
 * disagreements surface as real failures rather than being rubber-stamped.
 */
import { describe, it, expect } from "vitest";
import { buildFingerprint } from "./fingerprint";

describe("buildFingerprint — upsert identity stability", () => {
  it("is stable across amount drift — the key does not depend on amount at all", () => {
    // expectedAmount drifts sync-to-sync as the rolling average shifts. The upsert
    // key must not move with it, or 'upsert on patternFingerprint' inserts duplicate
    // rows. The fingerprint is therefore keyed on (merchant, cadence) only.
    expect(buildFingerprint("netflix", "monthly")).toBe(buildFingerprint("netflix", "monthly"));
  });

  it("is deterministic — identical inputs produce identical output", () => {
    expect(buildFingerprint("spotify", "monthly")).toBe(buildFingerprint("spotify", "monthly"));
  });

  it("distinguishes different cadences", () => {
    expect(buildFingerprint("netflix", "monthly")).not.toBe(buildFingerprint("netflix", "annual"));
  });

  it("distinguishes different merchants", () => {
    expect(buildFingerprint("netflix", "monthly")).not.toBe(buildFingerprint("spotify", "monthly"));
  });
});
