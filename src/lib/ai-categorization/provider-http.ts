import type { PacingPolicy } from "./pacing";

/**
 * Structured, body-free provider failure (zero-leak policy, ADR-0008). The
 * message and every field carry only a failure *shape* — provider name, error
 * kind, HTTP status *class* (never the numeric status or response body), and
 * retryability. The API key, the assembled prompt, and the raw provider
 * response are never referenced here, so a thrown `ProviderError` cannot leak
 * secrets or transaction data through a log line or a stack trace.
 */
export type ProviderErrorKind =
  | "http_error"
  | "network_error"
  | "bad_response"
  | "retries_exhausted";

export class ProviderError extends Error {
  readonly provider: string;
  readonly kind: ProviderErrorKind;
  /** e.g. "4xx" / "5xx" — a class, never the exact status or the body. */
  readonly statusClass?: string;
  readonly retryable: boolean;

  constructor(args: {
    provider: string;
    kind: ProviderErrorKind;
    statusClass?: string;
    retryable: boolean;
  }) {
    super(buildMessage(args));
    this.name = "ProviderError";
    this.provider = args.provider;
    this.kind = args.kind;
    this.statusClass = args.statusClass;
    this.retryable = args.retryable;
  }
}

function buildMessage(args: {
  provider: string;
  kind: ProviderErrorKind;
  statusClass?: string;
  retryable: boolean;
}): string {
  const status = args.statusClass ? ` (${args.statusClass})` : "";
  const retry = args.retryable ? " [retryable]" : "";
  return `${args.provider} ${args.kind}${status}${retry}`;
}

/** HTTP status → coarse class token for a body-free error, e.g. 503 → "5xx". */
export function httpStatusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

/**
 * Transient-error classification for the pacing retry loop: rate limiting (429)
 * and server-side 5xx are retryable; every other status (auth, bad request,
 * not-found) is a permanent failure that retrying cannot fix.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Sequential-batch pacing defaults shared by both adapters. The adapter's
 * network layer follows the pure `planPacing` decisions computed from this
 * policy — it owns only the timer and `Date.now()`, never the backoff curve.
 */
export const DEFAULT_PACING: PacingPolicy = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 20000,
  interBatchDelayMs: 1000,
});
