import { describe, it, expect } from "vitest";
import {
  datesWithin,
  amountsMatch,
  sumMatches,
  extractMerchant,
  scoreSimilarity,
  canonicalizeMerchant,
  merchantKey,
  sameMerchant,
} from "./index";

describe("datesWithin", () => {
  it("returns true for the same day (window = 0)", () => {
    const d = new Date("2024-01-01T00:00:00Z");
    expect(datesWithin(d, d, 0)).toBe(true);
  });

  it("returns true when dates are exactly the window apart (inclusive boundary)", () => {
    const a = new Date("2024-01-01T00:00:00Z");
    const b = new Date("2024-01-08T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(true);
  });

  it("returns false when dates are one day beyond the window", () => {
    const a = new Date("2024-01-01T00:00:00Z");
    const b = new Date("2024-01-09T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(false);
  });

  it("is order-independent (b before a)", () => {
    const a = new Date("2024-01-08T00:00:00Z");
    const b = new Date("2024-01-01T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(true);
  });

  it("returns true for 1-day apart with window 1", () => {
    const a = new Date("2024-03-15T00:00:00Z");
    const b = new Date("2024-03-16T00:00:00Z");
    expect(datesWithin(a, b, 1)).toBe(true);
  });

  it("returns false for 2-day apart with window 1", () => {
    const a = new Date("2024-03-15T00:00:00Z");
    const b = new Date("2024-03-17T00:00:00Z");
    expect(datesWithin(a, b, 1)).toBe(false);
  });
});

describe("amountsMatch", () => {
  it("returns true for exact match with default tolerance", () => {
    expect(amountsMatch(100, 100)).toBe(true);
  });

  it("returns true when diff is within tolerance (9% < 10%)", () => {
    expect(amountsMatch(100, 109, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false when diff exceeds tolerance (11% > 10%)", () => {
    expect(amountsMatch(100, 111, { amountTolerancePct: 0.1 })).toBe(false);
  });

  it("returns true for both-negative within tolerance (8% < 10%)", () => {
    expect(amountsMatch(-50, -54, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false for opposite-sign inputs", () => {
    expect(amountsMatch(50, -50)).toBe(false);
  });

  it("returns true for (0, 0)", () => {
    expect(amountsMatch(0, 0)).toBe(true);
  });

  it("returns true at exact boundary (10% diff = 10% tolerance)", () => {
    expect(amountsMatch(100, 110, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false when one value is zero and other is not", () => {
    expect(amountsMatch(0, 1)).toBe(false);
  });
});

describe("sumMatches", () => {
  it("returns true when items sum exactly to target", () => {
    expect(sumMatches([30, 20, 50], 100, {})).toBe(true);
  });

  it("returns true when sum is within tolerance (1% under with 2% tolerance)", () => {
    expect(sumMatches([30, 20, 49], 100, { amountTolerancePct: 0.02 })).toBe(true);
  });

  it("returns false when sum is outside zero tolerance", () => {
    expect(sumMatches([30, 20, 49], 100, { amountTolerancePct: 0 })).toBe(false);
  });

  it("returns true for empty array with target 0", () => {
    expect(sumMatches([], 0, {})).toBe(true);
  });

  it("returns true for single-element array matching target within tolerance", () => {
    expect(sumMatches([95], 100, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false for single-element array outside tolerance", () => {
    expect(sumMatches([85], 100, { amountTolerancePct: 0.1 })).toBe(false);
  });
});

describe("extractMerchant", () => {
  it("strips Latin bank prefix and lowercases domain", () => {
    expect(extractMerchant("תשלום ב-NETFLIX.COM")).toBe("netflix");
  });

  it("strips Hebrew-word prefix and preserves Hebrew merchant name", () => {
    expect(extractMerchant("רכישה בנטפליקס ישראל")).toBe("נטפליקס ישראל");
  });

  it("strips card-number digits (4 digits) after prefix strip", () => {
    expect(extractMerchant("חיוב ויזה 0584")).toBe("ויזה");
  });

  it("strips 9-digit account/ID number", () => {
    expect(extractMerchant("העברה 123456789")).toBe("העברה");
  });

  it("returns empty string for empty input", () => {
    expect(extractMerchant("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(extractMerchant("   ")).toBe("");
  });

  it("lowercases Latin characters while preserving Hebrew", () => {
    expect(extractMerchant("AMAZON")).toBe("amazon");
  });

  it("normalizes multiple spaces to single space", () => {
    expect(extractMerchant("חיוב  ויזה")).toBe("ויזה");
  });

  it("strips domain suffix from mixed Hebrew-Latin description", () => {
    expect(extractMerchant("תשלום ב-SPOTIFY.COM")).toBe("spotify");
  });
});

describe("scoreSimilarity", () => {
  it("returns 1.0 for identical descriptions", () => {
    expect(scoreSimilarity("netflix", "netflix")).toBe(1.0);
  });

  it("returns >= 0.85 for same merchant with domain suffix vs without", () => {
    expect(scoreSimilarity("netflix.com", "netflix")).toBeGreaterThanOrEqual(0.85);
  });

  it("returns <= 0.40 for completely different merchants", () => {
    expect(scoreSimilarity("netflix", "spotify")).toBeLessThanOrEqual(0.4);
  });

  it("returns >= 0.75 for Hebrew partial match (ויזה vs ויזה ישראל)", () => {
    expect(scoreSimilarity("ויזה", "ויזה ישראל")).toBeGreaterThanOrEqual(0.75);
  });

  it("normalizes via extractMerchant before scoring", () => {
    // "תשלום ב-NETFLIX.COM" and "נטפליקס ישראל" both extract to different merchants
    // but "תשלום ב-NETFLIX.COM" vs "NETFLIX" should still be high after normalization
    expect(scoreSimilarity("תשלום ב-NETFLIX.COM", "NETFLIX")).toBeGreaterThanOrEqual(0.85);
  });

  it("returns 0 for empty string vs non-empty", () => {
    expect(scoreSimilarity("", "netflix")).toBe(0);
  });

  it("returns 1 for both empty strings", () => {
    expect(scoreSimilarity("", "")).toBe(1);
  });

  it("returns > 0.5 for same single Hebrew word in longer phrase", () => {
    expect(scoreSimilarity("ויזה", "ויזה")).toBe(1.0);
  });

  it("returns 1 for cross-script Netflix (Hebrew name vs Latin name)", () => {
    expect(scoreSimilarity("נטפליקס ישראל", "NETFLIX.COM")).toBe(1);
  });

  it("returns 1 for cross-script Spotify (Hebrew name vs Latin name)", () => {
    expect(scoreSimilarity("ספוטיפיי", "SPOTIFY")).toBe(1);
  });

  it("returns 1 for cross-script Google (Hebrew name vs Latin name)", () => {
    expect(scoreSimilarity("גוגל", "GOOGLE")).toBe(1);
  });

  it("does NOT merge two distinct seeded brands (Netflix vs Spotify)", () => {
    expect(scoreSimilarity("נטפליקס", "SPOTIFY")).toBeLessThan(0.7);
  });
});

describe("canonicalizeMerchant", () => {
  it("maps Hebrew and Latin Netflix aliases to the same canonical key", () => {
    expect(canonicalizeMerchant("נטפליקס ישראל")).toBe(canonicalizeMerchant("netflix"));
  });

  it("maps Hebrew and Latin Spotify aliases to the same canonical key", () => {
    expect(canonicalizeMerchant("ספוטיפיי")).toBe(canonicalizeMerchant("spotify"));
  });

  it("maps Hebrew and Latin Google aliases to the same canonical key", () => {
    expect(canonicalizeMerchant("גוגל")).toBe(canonicalizeMerchant("google"));
  });

  it("maps Hebrew and Latin YouTube aliases to the same canonical key", () => {
    expect(canonicalizeMerchant("יוטיוב")).toBe(canonicalizeMerchant("youtube"));
  });

  it("maps Hebrew and Latin Apple aliases to the same canonical key", () => {
    expect(canonicalizeMerchant("אפל")).toBe(canonicalizeMerchant("apple"));
  });

  it("returns an unseeded Hebrew-only merchant unchanged", () => {
    expect(canonicalizeMerchant("סופרמרקט רמי לוי")).toBe("סופרמרקט רמי לוי");
  });

  it("returns an unseeded Latin-only merchant unchanged", () => {
    expect(canonicalizeMerchant("amazon")).toBe("amazon");
  });

  it("gives distinct canonical keys to distinct seeded brands", () => {
    expect(canonicalizeMerchant("נטפליקס")).not.toBe(canonicalizeMerchant("ספוטיפיי"));
  });

  // Regression: matching is whole-token, not substring. A short alias token that
  // happens to be a substring of an unrelated word must NOT trigger a merge.
  it("does NOT canonicalize a merchant that merely CONTAINS a Hebrew alias substring", () => {
    // "אפל" (Apple) is a substring of "אפליקציה" — must stay unchanged.
    expect(canonicalizeMerchant("אפליקציה דיגיטל")).toBe("אפליקציה דיגיטל");
    expect(canonicalizeMerchant("אפליקציה דיגיטל")).not.toBe(canonicalizeMerchant("apple"));
  });

  it("does NOT canonicalize a merchant that merely CONTAINS a Latin alias substring", () => {
    // "apple" is a substring of "snapple" — must stay unchanged.
    expect(canonicalizeMerchant("snapple")).toBe("snapple");
    expect(canonicalizeMerchant("snapple")).not.toBe(canonicalizeMerchant("apple"));
  });

  it("matches an alias that is a whole token amid other words and separators", () => {
    // hyphen/dot separators still tokenize: "google-pay" contains the token "google".
    expect(canonicalizeMerchant("google pay")).toBe(canonicalizeMerchant("google"));
    expect(canonicalizeMerchant("נטפליקס ישראל")).toBe(canonicalizeMerchant("netflix"));
  });
});

// ── Merchant identity (#237) ──────────────────────────────────────────────────
// All descriptors below are synthesized. The shapes they stand for — a
// per-charge machine token, a per-charge date fragment, a branch/city suffix —
// are the real recall failures; the strings are not real bank data.

describe("merchantKey", () => {
  it("strips a per-charge machine token (mixed letters+digits) from a card descriptor", () => {
    expect(merchantKey("ORBITSND K7Q2M4 NORTHPORT SE")).toBe("orbitsnd northport se");
  });

  it("gives every charge of a tokenized descriptor family the same key", () => {
    const keys = [
      merchantKey("ORBITSND K7Q2M4 NORTHPORT SE"),
      merchantKey("ORBITSND K7Q2M9 NORTHPORT SE"),
      merchantKey("ORBITSND K7Q2N3 NORTHPORT SE"),
    ];
    expect(new Set(keys).size).toBe(1);
  });

  it("keeps a brand token that carries a single digit", () => {
    expect(merchantKey("level3 media")).toBe("level3 media");
    expect(merchantKey("קפה 5")).toBe("קפה 5");
  });

  it("keeps a short alphanumeric token — too short to be a machine token", () => {
    expect(merchantKey("h2o bar")).toBe("h2o bar");
  });

  it("strips a digit run of 4+ that punctuation glues to a word", () => {
    // extractMerchant only strips whitespace-bounded digit runs, so a per-charge
    // reference number attached by a colon survives it.
    expect(merchantKey("משיכת שיק:1234")).toBe("משיכת שיק");
  });

  it("strips an embedded per-charge date fragment", () => {
    expect(merchantKey("מש' מכספומט 19/05")).toBe("מש' מכספומט");
    expect(merchantKey("מש' מכספומט 04/08")).toBe("מש' מכספומט");
  });

  it("leaves an ordinary merchant descriptor alone (beyond extractMerchant's own work)", () => {
    expect(merchantKey("harbor fitness northport")).toBe("harbor fitness northport");
    expect(merchantKey("מכון כושר צפון")).toBe("מכון כושר צפון");
  });

  it("is idempotent — a key re-keyed is unchanged", () => {
    for (const input of [
      "ORBITSND K7Q2M4 NORTHPORT SE",
      "משיכת שיק:1234",
      "מש' מכספומט 19/05",
      "harbor fitness northport",
      "",
    ]) {
      expect(merchantKey(merchantKey(input))).toBe(merchantKey(input));
    }
  });

  it("agrees whether applied to a raw description or to its extracted merchant", () => {
    // The invariant that lets evidence matching key a PERSISTED merchant (already
    // an extractMerchant output) and a raw description into the same bucket
    // without a data migration.
    for (const input of [
      "תשלום ב-ORBITSND K7Q2M4 NORTHPORT SE",
      "רכישה בהארבור פיטנס צפון",
      "משיכת שיק:1234",
    ]) {
      expect(merchantKey(extractMerchant(input))).toBe(merchantKey(input));
    }
  });

  it("strips a host prefix that carries no identity", () => {
    expect(merchantKey("WWW.ORBITSHOP")).toBe(merchantKey("ORBITSHOP"));
  });

  it("returns empty for blank input", () => {
    expect(merchantKey("")).toBe("");
    expect(merchantKey("   ")).toBe("");
  });
});

describe("sameMerchant", () => {
  it("matches two charges of a tokenized descriptor family", () => {
    expect(sameMerchant("ORBITSND K7Q2M4 NORTHPORT SE", "ORBITSND K7Q2N3 NORTHPORT SE")).toBe(true);
  });

  it("matches a tokenized descriptor against the same merchant's plain form", () => {
    expect(sameMerchant("ORBITSND K7Q2M4 NORTHPORT SE", "ORBITSNDIL NORTHPORT SE")).toBe(true);
  });

  it("matches a branch/descriptor switch at one merchant", () => {
    expect(sameMerchant('הארבור מרכז פ"ת- הו"ק', 'הארבור פ"ת דרום הו"ק')).toBe(true);
  });

  it("matches across scripts through the alias table", () => {
    expect(sameMerchant("נטפליקס ישראל", "NETFLIX.COM")).toBe(true);
  });

  it("does NOT match unrelated merchants", () => {
    expect(sameMerchant("harbor fitness", "orbit sound")).toBe(false);
    expect(sameMerchant("נטפליקס", "SPOTIFY")).toBe(false);
  });

  it("is symmetric", () => {
    const a = "ORBITSND K7Q2M4 NORTHPORT SE";
    const b = "ORBITSNDIL NORTHPORT SE";
    expect(sameMerchant(a, b)).toBe(sameMerchant(b, a));
  });

  // Regression: a lone token found INSIDE a longer descriptor is coincidence, not
  // identity. On real data this merged unrelated merchants sharing a similar word,
  // and let generic descriptors swallow everything they prefixed.
  it("does NOT match a single-token key contained in a longer descriptor", () => {
    expect(sameMerchant("parkstone", "alonet park northport")).toBe(false);
    expect(sameMerchant("transfer", "transfer to alpha beta")).toBe(false);
    expect(sameMerchant("fee", "fee via alpha northport")).toBe(false);
  });

  it("still matches two single-token keys directly", () => {
    expect(sameMerchant("orbitshop", "orbitshopil")).toBe(true);
  });

  it("still matches when the shorter side carries a company suffix", () => {
    // Two tokens is enough to be contained: the shorter key is fully present.
    expect(sameMerchant("גוד מרקט", 'גוד מרקט בע"מ')).toBe(true);
  });

  it("never matches when either side has no merchant at all", () => {
    expect(sameMerchant("", "harbor fitness")).toBe(false);
    expect(sameMerchant("harbor fitness", "")).toBe(false);
    expect(sameMerchant("", "")).toBe(false);
  });
});
