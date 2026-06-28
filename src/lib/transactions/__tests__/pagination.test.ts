import { describe, it, expect } from "vitest";
import { pageRange } from "../pagination";

describe("pageRange", () => {
  it("returns 1-based range on the first full page", () => {
    expect(pageRange(1, 50, 120)).toEqual({ from: 1, to: 50 });
  });

  it("caps `to` at total on the last partial page", () => {
    expect(pageRange(3, 50, 120)).toEqual({ from: 101, to: 120 });
  });

  it("returns 0–0 when there are no rows", () => {
    expect(pageRange(1, 50, 0)).toEqual({ from: 0, to: 0 });
  });

  it("handles a single full page exactly matching total", () => {
    expect(pageRange(1, 25, 25)).toEqual({ from: 1, to: 25 });
  });
});
