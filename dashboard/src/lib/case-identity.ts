import { normalizeHeader } from './csv';

// Canonical case identity — the SINGLE source of truth (§13) for how a case is keyed. Imported by
// both the master-sheet sync and first-call intake so a case we originate threads with Golden
// Gate's later sheet rows by exactly the same key. Do not duplicate this logic anywhere else.

// Normalized person key. Keeps Jr/Sr/II/III — they distinguish different people, and stripping
// them merged distinct cases. Produces e.g. "bermudez jorge" from "Bermudez, Jorge".
export function caseMatchKey(value: string): string {
  return normalizeHeader(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Golden Gate's NN-NNN is a per-register, per-year sequence; the 2-digit prefix is the death year.
// Reject implausible (future) prefixes so data-entry noise (e.g. "32-"/"34-") can't mint a fake
// year bucket.
export function caseNumberYear(caseNumber: string | null | undefined): string | null {
  const match = caseNumber?.match(/^(\d{2})-\d{3,4}$/);
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const currentYear = new Date().getFullYear();
  return year >= 2000 && year <= currentYear + 1 ? String(year) : null;
}

// Year (YYYY) from a canonical date string like "YYYY-MM-DD". Used to derive the death-year for a
// first-call case from its captured date of death.
export function yearFromDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const match = date.match(/^(\d{4})-\d{2}-\d{2}/);
  return match ? match[1] : null;
}

// The canonical grouping key: normalized name + death-year, or the name alone when no year is
// known. Both the sync and first-call intake build the key through this function.
export function caseGroupKey(name: string, year: string | null): string {
  const key = caseMatchKey(name);
  return year && key ? `${key}|${year}` : key;
}
