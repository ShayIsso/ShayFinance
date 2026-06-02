"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatZodError } from "@/lib/api-utils";
import { drizzleSchedulerConfigStore } from "@/lib/scheduler/config";
import type { SchedulerConfigData } from "@/lib/scheduler/config";

// Zod schema for scheduler config input validation
const schedulerConfigSchema = z.object({
  enabled: z.boolean(),
  cronTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "זמן לא תקין — נדרש פורמט HH:MM (לדוגמה: 07:00)"),
});

export async function getSchedulerConfigAction(): Promise<SchedulerConfigData> {
  return drizzleSchedulerConfigStore.getConfig();
}

export async function saveSchedulerConfigAction(input: unknown): Promise<{ error?: string }> {
  const parsed = schedulerConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  try {
    await drizzleSchedulerConfigStore.saveConfig(parsed.data);
    revalidatePath("/settings");
    return {};
  } catch {
    return { error: "שגיאה בשמירת ההגדרות" };
  }
}
