import { readdirSync, statSync, unlinkSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const SCREENSHOT_DIR = "/tmp/scraper-failures";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ScreenshotInfo = {
  filename: string;
  bank: string;
  timestamp: number;
  age: string;
};

function formatAge(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  if (hours > 0) return `${hours} שעות`;
  return `${minutes} דקות`;
}

export function listScreenshots(): ScreenshotInfo[] {
  if (!existsSync(SCREENSHOT_DIR)) return [];

  const now = Date.now();
  const files = readdirSync(SCREENSHOT_DIR).filter((f) => f.endsWith(".png"));

  return files
    .flatMap((filename) => {
      const match = /^([a-zA-Z0-9_]+)-(\d+)\.png$/.exec(filename);
      if (!match) return [];
      const bank = match[1];
      const timestamp = parseInt(match[2], 10);
      const age = formatAge(now - timestamp);
      return [{ filename, bank, timestamp, age }];
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getScreenshot(filename: string): Buffer | null {
  if (!/^[a-zA-Z0-9_-]+\.png$/.test(filename)) return null;
  const filepath = join(SCREENSHOT_DIR, filename);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath);
}

export function cleanup(): { deleted: number } {
  if (!existsSync(SCREENSHOT_DIR)) return { deleted: 0 };

  const now = Date.now();
  let deleted = 0;

  for (const filename of readdirSync(SCREENSHOT_DIR)) {
    if (!filename.endsWith(".png")) continue;
    const filepath = join(SCREENSHOT_DIR, filename);
    try {
      const { mtimeMs } = statSync(filepath);
      if (now - mtimeMs > MAX_AGE_MS) {
        unlinkSync(filepath);
        deleted++;
      }
    } catch {
      // File may have been removed already — ignore
    }
  }

  return { deleted };
}

// Run cleanup when module is first imported
try {
  cleanup();
} catch {}
