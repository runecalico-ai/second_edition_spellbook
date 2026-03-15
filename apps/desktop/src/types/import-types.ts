/**
 * TypeScript types for hash-based spell import/conflict resolution.
 * These mirror the Rust structs in `src-tauri/src/models/import.rs`,
 * using camelCase to match Tauri's `rename_all = "camelCase"` serde config.
 */

// ---------------------------------------------------------------------------
// Pure helper — exported so it can be unit-tested in the node environment
// ---------------------------------------------------------------------------

/**
 * Abbreviates a content hash for display: shows first 16 characters followed
 * by "…". If the hash is already ≤ 16 characters, returns it unchanged.
 * Returns an empty string for null/undefined input.
 */
export function abbreviateHash(hash: string | null | undefined): string {
  if (!hash) return "";
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

// ---------------------------------------------------------------------------
// Conflict types
// ---------------------------------------------------------------------------

/** Mirrors ImportSpellJsonConflict (Rust). Carries only hashes + names — no full field data. */
export interface HashImportConflict {
  existingId: number;
  existingName: string;
  existingContentHash: string | null;
  incomingName: string;
  incomingContentHash: string;
}

/** Resolution action for a single conflict. */
export type ConflictAction = "keep_existing" | "replace_with_new" | "keep_both";

/** Mirrors ImportSpellJsonConflictResolution (Rust). */
export interface HashConflictResolution {
  existingId: number;
  incomingContentHash: string;
  action: ConflictAction;
}

/** Bulk dialog action — for 10+ conflicts. */
export type BulkConflictAction = "skip_all" | "replace_all" | "keep_all" | "review_each";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Mirrors DuplicatesSkipped (Rust). */
export interface DuplicatesSkipped {
  total: number;
  mergedCount: number;
  noChangeCount: number;
}

/** Mirrors ConflictsResolved (Rust). */
export interface ConflictsResolved {
  keepExistingCount: number;
  replaceCount: number;
  keepBothCount: number;
}

/** Mirrors ImportSpellJsonFailure (Rust). */
export interface ImportSpellJsonFailure {
  spellName: string;
  reason: string;
}

/**
 * Mirrors ImportSpellJsonResult (Rust).
 * Returned by both `import_spell_json` and `resolve_import_spell_json`.
 */
export interface HashImportResult {
  importedCount: number;
  duplicatesSkipped: DuplicatesSkipped;
  /** Remaining unresolved conflicts (empty if all resolved). */
  conflicts: HashImportConflict[];
  /** Present only when conflicts were resolved in this call. */
  conflictsResolved?: ConflictsResolved | null;
  failures: ImportSpellJsonFailure[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Preview type
// ---------------------------------------------------------------------------

/** Mirrors PreviewImportSpellJsonResult (Rust). */
export interface HashPreviewResult {
  spells: Array<{ spell: unknown; contentHash: string; warnings: string[] }>;
  warnings: string[];
  failures: ImportSpellJsonFailure[];
}
