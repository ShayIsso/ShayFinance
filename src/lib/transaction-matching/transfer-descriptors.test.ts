import { describe, it, expect } from "vitest";
import { classifyTransferDescriptor, matchesTransferDescriptor } from "./index";

describe("classifyTransferDescriptor", () => {
  it("classifies העברה as inter_account", () => {
    expect(classifyTransferDescriptor("העברה")).toEqual({
      kind: "inter_account",
      token: "העברה",
    });
  });

  it("classifies Latin transfer as inter_account (case-insensitive)", () => {
    expect(classifyTransferDescriptor("Bank TRANSFER out")).toEqual({
      kind: "inter_account",
      token: "transfer",
    });
  });

  it("classifies ביט as bit_mirror", () => {
    expect(classifyTransferDescriptor("ביט")).toEqual({
      kind: "bit_mirror",
      token: "ביט",
    });
  });

  it("classifies Latin bit as bit_mirror (case-insensitive)", () => {
    expect(classifyTransferDescriptor("BIT payment")).toEqual({
      kind: "bit_mirror",
      token: "bit",
    });
  });

  it("classifies the two-word phrase חיוב ישיר as bit_mirror", () => {
    expect(classifyTransferDescriptor("חיוב ישיר")).toEqual({
      kind: "bit_mirror",
      token: "חיוב ישיר",
    });
  });

  it("classifies ויזה as card_settlement", () => {
    expect(classifyTransferDescriptor("ויזה")).toEqual({
      kind: "card_settlement",
      token: "ויזה",
    });
  });

  it("classifies מאסטרקארד as card_settlement", () => {
    expect(classifyTransferDescriptor("מאסטרקארד")).toEqual({
      kind: "card_settlement",
      token: "מאסטרקארד",
    });
  });

  it("classifies a bare חיוב token as card_settlement", () => {
    expect(classifyTransferDescriptor("חיוב חודשי")).toEqual({
      kind: "card_settlement",
      token: "חיוב",
    });
  });

  it("classifies a standalone 4-digit run as card_settlement", () => {
    expect(classifyTransferDescriptor("כרטיס 4321")).toEqual({
      kind: "card_settlement",
      token: "4321",
    });
  });

  it("returns null when nothing matches", () => {
    expect(classifyTransferDescriptor("סופרמרקט רמי לוי")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(classifyTransferDescriptor("")).toBeNull();
  });

  describe("whole-token discipline (no substring matches)", () => {
    it("does NOT match ביט inside ביטוח", () => {
      expect(classifyTransferDescriptor("ביטוח לאומי")).toBeNull();
    });

    it("does NOT match bit inside debit", () => {
      expect(classifyTransferDescriptor("direct debit")).toBeNull();
    });

    it("does NOT match bit inside habit", () => {
      expect(classifyTransferDescriptor("good habit")).toBeNull();
    });

    it("matches a whole token amid separators (card-1234 tokenizes)", () => {
      expect(classifyTransferDescriptor("card-4321")).toEqual({
        kind: "card_settlement",
        token: "4321",
      });
    });
  });

  describe("multi-word phrase matching", () => {
    it("matches חיוב ישיר only as consecutive tokens", () => {
      expect(classifyTransferDescriptor("חיוב ישיר לחשבון")).toEqual({
        kind: "bit_mirror",
        token: "חיוב ישיר",
      });
    });

    it("does NOT match the phrase when tokens are non-consecutive", () => {
      // "חיוב" alone still matches as card_settlement, but not the bit_mirror phrase.
      expect(classifyTransferDescriptor("חיוב חודשי ישיר")).toEqual({
        kind: "card_settlement",
        token: "חיוב",
      });
    });
  });

  describe("4-digit-run pattern semantics (matches /\\b\\d{4}\\b/)", () => {
    it("matches an exact 4-digit run", () => {
      expect(classifyTransferDescriptor("חיוב 4321")).not.toBeNull();
    });

    it("does NOT match a 5-digit run", () => {
      expect(classifyTransferDescriptor("12345")).toBeNull();
    });

    it("does NOT match a longer digit run (9-digit account id)", () => {
      expect(classifyTransferDescriptor("123456789")).toBeNull();
    });

    it("does NOT match 4 digits embedded in a longer alphanumeric token", () => {
      expect(classifyTransferDescriptor("x1234y")).toBeNull();
    });
  });

  describe("kind-scoped classification", () => {
    it("returns null when a matching kind is excluded from the considered set", () => {
      // העברה matches inter_account, but card_settlement scope excludes it.
      expect(classifyTransferDescriptor("העברה", ["card_settlement"])).toBeNull();
    });

    it("finds a card_settlement match when scoped to card_settlement", () => {
      expect(classifyTransferDescriptor("חיוב ויזה", ["card_settlement"])).toEqual({
        kind: "card_settlement",
        token: "ויזה",
      });
    });

    it("finds a bit_mirror match for חיוב ישיר when scoped to bit_mirror", () => {
      expect(classifyTransferDescriptor("חיוב ישיר", ["bit_mirror"])).toEqual({
        kind: "bit_mirror",
        token: "חיוב ישיר",
      });
    });

    it("matches over the {inter_account, bit_mirror} union (P3 scope)", () => {
      expect(classifyTransferDescriptor("ביט", ["inter_account", "bit_mirror"])).toEqual({
        kind: "bit_mirror",
        token: "ביט",
      });
      expect(classifyTransferDescriptor("העברה", ["inter_account", "bit_mirror"])).toEqual({
        kind: "inter_account",
        token: "העברה",
      });
    });

    it("does NOT match a bare 4-digit run under the {inter_account, bit_mirror} scope", () => {
      expect(classifyTransferDescriptor("4321", ["inter_account", "bit_mirror"])).toBeNull();
    });
  });

  describe("precedence when multiple kinds match", () => {
    it("resolves חיוב ישיר to bit_mirror (phrase) over card_settlement (bare חיוב)", () => {
      expect(classifyTransferDescriptor("חיוב ישיר")?.kind).toBe("bit_mirror");
    });
  });
});

describe("matchesTransferDescriptor", () => {
  it("returns true for a matching description under the given scope", () => {
    expect(matchesTransferDescriptor("חיוב ויזה", ["card_settlement"])).toBe(true);
  });

  it("returns false when the only match is outside the given scope", () => {
    expect(matchesTransferDescriptor("העברה", ["card_settlement"])).toBe(false);
  });

  it("returns false when nothing matches", () => {
    expect(matchesTransferDescriptor("סופרמרקט")).toBe(false);
  });
});
