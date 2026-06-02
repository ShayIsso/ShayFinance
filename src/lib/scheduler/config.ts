/**
 * Scheduler config store — reads and persists the singleton scheduler_config row.
 * The row is always upserted with id=1 (singleton pattern).
 */

export type SchedulerConfigData = {
  enabled: boolean;
  cronTime: string; // "HH:MM"
};

export type SchedulerConfigStore = {
  getConfig(): Promise<SchedulerConfigData>;
  saveConfig(data: SchedulerConfigData): Promise<void>;
};

// ── Pure helper ───────────────────────────────────────────────────────────────

/**
 * Converts an "HH:MM" string into a node-cron expression "MM HH * * *".
 * Throws if the input is not a valid HH:MM string.
 */
export function cronTimeToExpression(hhmm: string): string {
  if (typeof hhmm !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) {
    throw new Error(`Invalid time format: "${hhmm}". Expected HH:MM (00:00–23:59).`);
  }
  const [hh, mm] = hhmm.split(":");
  return `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`;
}

// ── Drizzle implementation ────────────────────────────────────────────────────

export function makeDrizzleSchedulerConfigStore(): SchedulerConfigStore {
  return {
    async getConfig(): Promise<SchedulerConfigData> {
      const { db } = await import("@/db");
      const { schedulerConfig } = await import("@/db/schema");

      const row = await db.query.schedulerConfig.findFirst();
      if (!row) {
        // Seed the singleton row with defaults on first access
        await db
          .insert(schedulerConfig)
          .values({ id: 1, enabled: false, cronTime: "07:00" })
          .onConflictDoNothing();
        return { enabled: false, cronTime: "07:00" };
      }
      return { enabled: row.enabled, cronTime: row.cronTime };
    },

    async saveConfig(data: SchedulerConfigData): Promise<void> {
      const { db } = await import("@/db");
      const { schedulerConfig } = await import("@/db/schema");

      await db
        .insert(schedulerConfig)
        .values({ id: 1, enabled: data.enabled, cronTime: data.cronTime, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schedulerConfig.id,
          set: { enabled: data.enabled, cronTime: data.cronTime, updatedAt: new Date() },
        });
    },
  };
}

export const drizzleSchedulerConfigStore: SchedulerConfigStore = makeDrizzleSchedulerConfigStore();
