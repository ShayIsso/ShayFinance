import { ZodError } from "zod";

export function formatZodError(error: ZodError): string {
  return error.issues.map((e) => e.message).join(", ");
}

/** Field name → first validation message for that field ("root" for form-level issues). */
export type FieldErrors = Record<string, string>;

/**
 * Per-field companion to formatZodError, for Server Actions whose clients
 * surface validation failures as inline field errors (the shared form layer).
 */
export function formatZodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "root";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
