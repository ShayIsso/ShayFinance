import { z } from "zod";
import type { BankRegistryEntry } from "./entries";
import { credentialFieldRule } from "./fields";

/**
 * The credential schema for one institution, replacing the per-institution Zod
 * declarations. Takes a resolved entry rather than an id on purpose: for an
 * unregistered id there are no fields, and a schema over no fields would accept
 * any credential payload instead of rejecting it.
 */
export function credentialSchemaFor(
  entry: BankRegistryEntry,
): z.ZodObject<Record<string, z.ZodString>> {
  const shape: Record<string, z.ZodString> = {};
  for (const field of entry.credentialFields) {
    shape[field.key] = credentialFieldRule(field);
  }
  return z.object(shape);
}
