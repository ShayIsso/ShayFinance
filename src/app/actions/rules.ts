"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatZodError } from "@/lib/api-utils";
import {
  previewRetroactiveApply,
  applyRetroactively,
  drizzleRetroactiveStore,
} from "@/lib/categories/retroactive";

const ruleIdSchema = z.object({
  ruleId: z.string().uuid({ message: "מזהה כלל לא תקין" }),
});

export async function previewRetroactiveApplyAction(
  data: unknown,
): Promise<{ count?: number; error?: string }> {
  const parsed = ruleIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }
  const { count } = await previewRetroactiveApply(parsed.data.ruleId, drizzleRetroactiveStore);
  return { count };
}

export async function applyRetroactivelyAction(
  data: unknown,
): Promise<{ applied?: number; error?: string }> {
  const parsed = ruleIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }
  const { applied } = await applyRetroactively(parsed.data.ruleId, drizzleRetroactiveStore);
  revalidatePath("/transactions");
  return { applied };
}
