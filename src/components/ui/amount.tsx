"use client";

/**
 * <Amount> — canonical currency display component.
 *
 * All currency formatting happens here (client-side only) to prevent
 * hydration mismatches (SSR locale ≠ browser locale for Intl.NumberFormat).
 *
 * Color convention:
 *   - Positive values → text-emerald-600  (emerald is reserved for POSITIVE values only)
 *   - Negative values → text-red-600
 *   - No color       → inherit (use colorize={false})
 *
 * Lucide icon convention (documented here as the shared UI entry point):
 *   - Default stroke width: 1.5px  (Lucide default; do not override globally)
 *   - Duo-tone treatment only on section-header icons, nowhere else
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Currency helpers (source of truth — lifted from transactions-table) ────────

/** Maps common currency symbols to ISO 4217 codes for Intl.NumberFormat. */
export const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  "₪": "ILS",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};

/**
 * Normalises a currency string to an ISO 4217 code.
 * Passes through strings that are already codes (e.g. "ILS", "USD").
 */
export function normalizeCurrency(currency: string): string {
  return CURRENCY_SYMBOL_TO_CODE[currency] ?? currency;
}

/**
 * Formats a numeric amount as a locale-aware Hebrew currency string.
 *
 * @param amount   - The numeric value to format.
 * @param currency - ISO 4217 code or a known symbol (₪, $, €, £). Defaults to "ILS".
 * @param fractionDigits - Override minimum/maximum fraction digits (default: 2 for foreign, 2 for ILS).
 */
export function formatAmount(
  amount: number,
  currency: string = "ILS",
  fractionDigits?: number,
): string {
  const code = normalizeCurrency(currency);
  const digits = fractionDigits ?? 2;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface AmountProps {
  /** The numeric value to display. */
  amount: number;
  /**
   * ISO 4217 currency code or a known symbol (₪, $, €, £).
   * @default "ILS"
   */
  currency?: string;
  /**
   * Apply emerald (positive) / red (negative) color treatment.
   * Pass false to render in the inherited text color.
   * @default true
   */
  colorize?: boolean;
  /**
   * Override fraction digits (min and max are set to the same value).
   * Useful for ILS-only dashboard figures where 0 decimals are preferred.
   */
  fractionDigits?: number;
  /** Additional class names applied to the wrapping <span>. */
  className?: string;
}

/**
 * Renders a currency amount with `tabular-nums` and locale-aware Hebrew
 * formatting. Use this component for ALL monetary values in the app.
 */
export function Amount({
  amount,
  currency = "ILS",
  colorize = true,
  fractionDigits,
  className,
}: AmountProps) {
  const colorClass = colorize ? (amount < 0 ? "text-red-600" : "text-emerald-600") : undefined;

  return (
    <span className={cn("tabular-nums", colorClass, className)}>
      {formatAmount(amount, currency, fractionDigits)}
    </span>
  );
}
