// Public interface for the recurring-detection module.
// Consumers import exclusively from here — never from internal files.

export { detectPatterns } from "./detect";
export { computeNextExpectedDate } from "./next-date";
export { persistDetectedPatterns, runDetection } from "./scan";
export { drizzleRecurringStore } from "./store";
export type { RecurringStore } from "./store";
export type {
  RecurringPattern,
  DetectionTransaction,
  Cadence,
  PersistedRecurringPattern,
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
  DormantAlert,
} from "./types";
export {
  detectPriceChanges,
  detectMissedPayments,
  detectNewlyDetected,
  detectDormant,
} from "./anomalies";
