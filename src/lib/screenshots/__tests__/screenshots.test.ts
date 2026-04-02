import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the fs module before importing the module under test
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import * as fs from "fs";
import { listScreenshots, getScreenshot, cleanup } from "../index";

const MOCK_DIR = "/tmp/scraper-failures";
const NOW = 1_700_000_000_000; // fixed "now" for deterministic age strings

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
});

// ── listScreenshots ────────────────────────────────────────────────────────

describe("listScreenshots", () => {
  it("returns empty array when directory does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(listScreenshots()).toEqual([]);
  });

  it("returns empty array when directory is empty", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);
    expect(listScreenshots()).toEqual([]);
  });

  it("parses a valid screenshot filename", () => {
    const timestamp = NOW - 30 * 60 * 1000; // 30 minutes ago
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      `discount-${timestamp}.png`,
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const results = listScreenshots();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      filename: `discount-${timestamp}.png`,
      bank: "discount",
      timestamp,
      age: "30 דקות",
    });
  });

  it("shows age in hours when older than 60 minutes", () => {
    const timestamp = NOW - 3 * 60 * 60 * 1000; // 3 hours ago
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([`max-${timestamp}.png`] as unknown as ReturnType<
      typeof fs.readdirSync
    >);

    const [result] = listScreenshots();
    expect(result.age).toBe("3 שעות");
  });

  it("skips files that do not match the expected pattern", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      "not-a-screenshot.txt",
      "no-timestamp.png",
      `visaCal-${NOW}.png`,
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const results = listScreenshots();
    expect(results).toHaveLength(1);
    expect(results[0].bank).toBe("visaCal");
  });

  it("sorts results newest first", () => {
    const older = NOW - 5 * 60 * 60 * 1000;
    const newer = NOW - 1 * 60 * 60 * 1000;
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      `discount-${older}.png`,
      `max-${newer}.png`,
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    const results = listScreenshots();
    expect(results[0].timestamp).toBe(newer);
    expect(results[1].timestamp).toBe(older);
  });
});

// ── getScreenshot ──────────────────────────────────────────────────────────

describe("getScreenshot", () => {
  it("returns null for path traversal attempt", () => {
    expect(getScreenshot("../../etc/passwd")).toBeNull();
    expect(getScreenshot("../secret.png")).toBeNull();
    expect(getScreenshot("foo/bar.png")).toBeNull();
  });

  it("returns null when file does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(getScreenshot("discount-12345.png")).toBeNull();
  });

  it("returns file buffer for a valid existing file", () => {
    const fakeBuffer = Buffer.from("fake-png-data");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(fakeBuffer as unknown as string);

    const result = getScreenshot("discount-12345.png");
    expect(result).toBe(fakeBuffer);
    expect(fs.readFileSync).toHaveBeenCalledWith(`${MOCK_DIR}/discount-12345.png`);
  });

  it("accepts filenames with underscores and hyphens", () => {
    const fakeBuffer = Buffer.from("data");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(fakeBuffer as unknown as string);

    expect(getScreenshot("visaCal_bank-99999.png")).not.toBeNull();
  });
});

// ── cleanup ────────────────────────────────────────────────────────────────

describe("cleanup", () => {
  it("returns { deleted: 0 } when directory does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(cleanup()).toEqual({ deleted: 0 });
  });

  it("deletes files older than 24 hours and returns count", () => {
    const old = NOW - 25 * 60 * 60 * 1000; // 25h ago
    const recent = NOW - 1 * 60 * 60 * 1000; // 1h ago

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      `discount-${old}.png`,
      `max-${recent}.png`,
    ] as unknown as ReturnType<typeof fs.readdirSync>);
    vi.mocked(fs.statSync).mockImplementation((filepath) => {
      const isOld = String(filepath).includes(String(old));
      return { mtimeMs: isOld ? old : recent } as ReturnType<typeof fs.statSync>;
    });

    const result = cleanup();
    expect(result).toEqual({ deleted: 1 });
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(`${MOCK_DIR}/discount-${old}.png`);
  });

  it("keeps files newer than 24 hours", () => {
    const recent = NOW - 2 * 60 * 60 * 1000;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([`discount-${recent}.png`] as unknown as ReturnType<
      typeof fs.readdirSync
    >);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: recent } as ReturnType<typeof fs.statSync>);

    const result = cleanup();
    expect(result).toEqual({ deleted: 0 });
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it("skips non-.png files", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["README.txt"] as unknown as ReturnType<
      typeof fs.readdirSync
    >);

    cleanup();
    expect(fs.statSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it("silently ignores errors when deleting a file", () => {
    const old = NOW - 25 * 60 * 60 * 1000;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([`discount-${old}.png`] as unknown as ReturnType<
      typeof fs.readdirSync
    >);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: old } as ReturnType<typeof fs.statSync>);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      throw new Error("permission denied");
    });

    // Should not throw
    expect(() => cleanup()).not.toThrow();
  });
});
