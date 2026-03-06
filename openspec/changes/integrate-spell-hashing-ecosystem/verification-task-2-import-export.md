# Task 2 Import/Export Verification Report

**Date:** 2026-03-04  
**Scope:** Pass 1 (spec compliance), Pass 2 (code quality and integration) per plan to-dos `verify-spec`, `verify-quality`.

---

## Pass 1: Spec Compliance

Implementation was checked against [tasks.md](tasks.md) (2.1, 2.2, 2.3) and [specs/import-export/spec.md](specs/import-export/spec.md).

### Task 2.1 — Import Logic (JSON path)

| Requirement / Scenario | Status | Evidence |
|------------------------|--------|----------|
| **2.1.1** Parse and classify payload (bundle vs single) | ✅ | `parse_and_classify_payload()`: bundle = top-level `spells` array + `bundle_format_version`; single = no `spells`; rejects missing version for bundle, rejects `spells` not array. |
| **2.1.1** Reject future bundle format version | ✅ | `version > BUNDLE_FORMAT_VERSION` → `Err(Unsupported bundle_format_version ...)`. |
| **2.1.1** Single-spell: no bundle_format_version required | ✅ | Branch when `obj.get("spells")` is None; single spell parsed without version. |
| **2.1.1** Schema version: warn if > current, continue best-effort | ✅ | `check_schema_version_warn()`; `process_spell()` adds warning, continues. |
| **2.1.2** Normalize/truncate before validation/hash | ✅ | `normalize_truncate_metadata()`: tags ≤100 sorted/dedup; source_refs ≤50 dedup by `source_ref_dedup_key`. Called in preview before `process_spell()`. |
| **2.1.2** SourceRef dedup key: URL or (system, book, page, note) | ✅ | `source_ref_dedup_key()`: url if non-empty, else format!("{}|{}|{}|{}", system, book, page, note). |
| **2.1.3** Migrate + hash per spell; tampered import warning | ✅ | `process_spell()`: `normalize(None)`, `compute_hash()`; if imported `id` ≠ recomputed → warning, use recomputed hash. |
| **2.1.4** Lookup by hash first; skip insert, merge metadata | ✅ | `apply_import_spell_json_impl`: SELECT by `content_hash`; if found → merge tags + canonical_data source_refs, no insert. |
| **2.1.4** Lookup by name; conflict if different hash | ✅ | SELECT by `name` and `level`; if existing_hash ≠ content_hash → conflict or resolve. |
| **2.1.4** Intra-bundle dedup in document order | ✅ | `seen_hash_in_batch`: first occurrence inserted/merged; later same hash → merge into same row only. |
| **2.1.5** Metadata merge (tags union, cap 100; source_refs existing first, cap 50) | ✅ | `merge_tags()`, `merge_canonical_data_source_refs()`; merge only when hash exists (skip-insert path). |
| **2.1.6** Conflict resolution: Keep Existing, Replace, Keep Both, Apply to All | ✅ | `resolve_action_for_conflict()`: keep_existing, replace_with_new, keep_both; default_action skip_all/replace_all/keep_all. |
| **2.1.6** Keep Both: unique name "Fireball (1)", "(2)"… | ✅ | `find_unique_name_for_keep_both()`: DB + batch names, LIKE pattern, max N+1. |
| **2.1.6** Replace with New: update row, cascade spell_content_hash, change_log | ✅ | `replace_with_new_impl()`: UPDATE spell; `table_has_column` → UPDATE character_class_spell/artifact; `log_changes()`. |
| **2.1.6** Replace Hash Collision: fail with clear error | ✅ | `replace_with_new_impl()`: SELECT id WHERE content_hash=? AND id!=? → if some, return Err. |
| **2.1.6** Replace Rolls Back on Cascade Failure | ✅ | On `replace_with_new_impl()` Err, apply returns `?` → transaction dropped (rollback); no partial commit. *(Fixed during verification.)* |
| **2.1.7** Import result: imported, duplicates (merged/no-change), conflicts, failures | ✅ | `ImportSpellJsonResult`: imported_count, duplicates_skipped (total, merged_count, no_change_count), conflicts, conflicts_resolved, failures, warnings. |
| **2.1.7** Partial failure: skip invalid spells, report per-spell reason | ✅ | Preview: per-spell validation/hash failures → `failures.push(spell_name, reason)`; apply phase failures from replace also surface. |
| **2.1.8** URL allowlist (http, https, mailto); reject javascript/data/ipfs | ✅ | `validate_source_ref_url()`, `ALLOWED_URL_SCHEMES`. |
| **2.1.8** sourceRefUrlPolicy: drop-ref (default), reject-spell | ✅ | `SourceRefUrlPolicy::DropRef` / `RejectSpell`; `process_source_ref_urls()`. |
| **2.1.8** XSS: sanitize SourceRef URL before storage | ✅ | `sanitize_url_for_display()`: strip angle-bracket tags, collapse whitespace; applied in `process_source_ref_urls()`. |

### Task 2.2 — Export Logic

| Requirement / Scenario | Status | Evidence |
|------------------------|--------|----------|
| **2.2.1** Single-spell export; id = content_hash; schema_version required | ✅ | `export_spell_as_json`: load spell, reject NULL content_hash with prompt to run migration; canonical.id = content_hash, schema_version = CURRENT. |
| **2.2.1** Reject export when content_hash NULL | ✅ | `ok_or_else(|| AppError::Export("...Run the migration..."))`. |
| **2.2.2** Bundle export: schema_version, bundle_format_version, spells; each id = content_hash | ✅ | `export_spell_bundle_json`: SpellBundleExport { schema_version, bundle_format_version, spells }; each canonical.id = content_hash; reject any NULL hash. |

### Task 2.3 — Baseline capability alignment

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Align openspec/specs/importers/spec.md with hash-first identity and conflict handling | ✅ | [openspec/specs/importers/spec.md](../../../specs/importers/spec.md) already states: primary identity `content_hash`; Hash Match Skips Insert + merge metadata; Same Name Different Hash = conflict with Keep Existing / Replace / Keep Both / Apply to All; Metadata Merge on Deduplication (tags union, source_refs policy). No doc change required. |

### Spec scenarios (import-export spec) — spot check

- **Export Transformation** (id = hash): ✅ export sets `canonical.id = content_hash`.
- **Bundle Format Version** (required on bundle): ✅ envelope has `bundle_format_version`.
- **Export Rejected for NULL Hash**: ✅ both single and bundle export return `AppError::Export` with migration prompt.
- **Hash Match Skips Insert**: ✅ lookup by content_hash first; merge metadata, no insert.
- **Same Name, Different Hash**: ✅ conflict list; resolution actions.
- **Keep Both Collision Avoidance**: ✅ `find_unique_name_for_keep_both` with (1), (2)…
- **Replace with New Updates Existing Row**: ✅ `replace_with_new_impl` UPDATE spell + cascade.
- **Replace Rolls Back on Cascade Failure**: ✅ replace failure propagates via `?`, transaction not committed.
- **Partial Import Failure**: ✅ preview failures list; valid spells still applied when resolving.
- **Tag Merge / source_refs Merge**: ✅ `merge_tags`, `merge_canonical_data_source_refs`.
- **Warn on Future Schema Version**: ✅ `check_schema_version_warn`.
- **Reject Future Bundle Format Version**: ✅ in `parse_and_classify_payload`.
- **Reject Missing Bundle Format Version in Bundle**: ✅ Err("Bundle format requires 'bundle_format_version'").
- **Accept Missing Bundle Format Version in Single-Spell**: ✅ single-spell path has no version check.
- **Bundle vs Single-Spell Detection**: ✅ top-level `spells` array → bundle.
- **Reject Malformed Bundle Shape** (spells not array): ✅ Err("spells to be an array").
- **Tampered Import Hash**: ✅ warning in `process_spell()`, recomputed hash used.
- **Replace Hash Collision**: ✅ replace_with_new_impl checks other row with same new hash → Err.
- **Protocol Allowlist / drop-ref / reject-spell**: ✅ `validate_source_ref_url`, policy in `process_source_ref_urls`.
- **Intra-Bundle Deduplication Order**: ✅ document order, first hash wins, later merged.
- **XSS Prevention**: ✅ `sanitize_url_for_display`.

**Pass 1 result:** Implementation matches tasks 2.1, 2.2, 2.3 and the import-export spec. One behavioral fix applied: Replace failure now aborts the apply transaction (rollback) per “Replace Rolls Back on Cascade Failure”.

---

## Pass 2: Code Quality and Integration

### TDD / unit tests

- **Import:** 13 tests in `commands::import::tests`: parse_classify (single, bundle, bundle missing version, unsupported version, spells not array), normalize_truncate (tags, source_refs dedup), validate_source_ref_url (allowed/rejected), sanitize_url_for_display, preview policies (drop-ref, reject-spell, default valid URLs). All run with `cargo test --lib commands::import::`.
- **Canonical/hash:** Extensive tests in `models::canonical_spell::tests` and regression tests (hash stability, migration, normalization). Cover normalization, hashing, and schema versioning used by import/export.

**Evidence:** `cargo test --lib` → 260 tests passed (including 13 import tests).

### spawn_blocking and AppError

- **import.rs:** DB work in `apply_import_spell_json_impl` is invoked from `import_spell_json` and `resolve_import_spell_json` via `tokio::task::spawn_blocking(move || { let conn = pool.get()?; apply_import_spell_json_impl(...) })`. Errors mapped with `.map_err(|e| AppError::Unknown(e.to_string()))??`. Preview runs on async path (no DB). AppError::Import used for parse/validation/replace errors.
- **export.rs:** `export_spell_as_json` and `export_spell_bundle_json` use `spawn_blocking` for DB read and JSON build; return `Result<String, AppError>` with AppError::Export for NULL hash / invalid canonical_data.

**Evidence:** Grep for `spawn_blocking` and `AppError` in import.rs and export.rs confirms pattern.

### Parameterized queries

- Import: `content_hash = ?`, `name = ? AND level = ?`, `id = ?`, etc. via `params![...]` in `apply_import_spell_json_impl` and `replace_with_new_impl`. No string interpolation for user input.

### E2E / manual flow

- **E2E:** No dedicated Playwright test for spell JSON import/export in this change. Existing E2E: `batch_import.spec.ts` (file-based import wizard), `character_io.spec.ts` (character export JSON). Manual verification of spell JSON import/export is acceptable per plan (“E2E or manual import/export flow”).
- **Manual:** User can run app, export spell(s) as JSON (single or bundle), then re-import via JSON path (when UI invokes `preview_import_spell_json` / `import_spell_json` / `resolve_import_spell_json`).

**Pass 2 result:** TDD coverage present for import (parse, normalize, URL policy, preview); spawn_blocking and AppError used correctly; parameterized queries used; E2E for spell JSON import/export not added (manual flow acceptable).

---

## Verification Commands Run

1. `cargo test --lib commands::import::` → 13 passed  
2. `cargo test --lib` → 260 passed  
3. No linter errors on modified files (import.rs).

---

## Summary

- **verify-spec:** Done. Implementation aligns with tasks 2.1, 2.2, 2.3 and import-export spec; Replace failure now triggers full transaction rollback.
- **verify-quality:** Done. Unit tests for import path, correct use of spawn_blocking/AppError and parameterized queries; E2E for spell JSON left to manual verification per plan.
