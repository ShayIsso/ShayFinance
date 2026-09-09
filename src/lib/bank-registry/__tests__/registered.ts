import { findBankEntry, type BankRegistryEntry } from "../index";

/**
 * Lookup for an id the test itself registered. The module's own lookup is
 * deliberately optional (ADR-0013 §4), which fixtures should not have to unwrap.
 */
export function registered(id: string): BankRegistryEntry {
  const entry = findBankEntry(id);
  if (!entry) throw new Error(`fixture referenced an unregistered institution: ${id}`);
  return entry;
}
