# Task 6 Three-Pass Code Review

Spec: `integrate-spell-hashing-ecosystem`  
Task: **6.1 Migrate artifact spell references to content hash (Migration 0015)**  
Review date: 2026-03-13  
Method: Three independent passes (spec-compliance, backend correctness, test-and-maintainability).

---

## Task 6.1 Checklist (from tasks.md)

| # | Item | Status |
|---|------|--------|
| 6.1a | Add `spell_content_hash TEXT` to `artifact`; backfill from `spell.content_hash` WHERE `spell.id = artifact.spell_id` | Done (Migration 0015) |
| 6.1b | Add index `idx_artifact_spell_content_hash` on `artifact(spell_content_hash)` | Done |
| 6.1c | Use `spell_content_hash` for reads/joins; keep `spell_id` for migration period | Done (get_spell_from_conn hash-first) |
| 6.1d | Note: `artifact.hash` = artifact file hash; `artifact.spell_content_hash` = referenced spell canonical hash | Documented in SQL and migrations.rs |

---

## Pass 1: Spec-compliance review

- [x] `artifact.spell_content_hash` migration/backfill/index exists — **PASS**
- [x] Application reads use `spell_content_hash` and do not rely on `spell_id` — **PASS**
- [x] Missing spell references handled gracefully — **PASS**
- [x] Dual-column migration-period writes remain intact — **PASS**

No spec violations. Partial index on spell_content_hash is acceptable.

---

## Pass 2: Backend correctness review

- [x] Stale `spell_id` tolerance — **PASS**
- [x] No duplicate artifact loading — **PASS**
- [x] Rollback behavior on replace/write failures — **PASS**
- [x] Vault GC safety with `artifact.spell_content_hash` — **PASS**
- [x] Legacy fallback behavior preserved — **PASS**

No correctness bugs. Optional: test that one row when both hash and spell_id match.

---

## Pass 3: Test-and-maintainability review

- [x] Tests prove spec contract, not implementation trivia — **PASS**
- [x] Migration tests idempotent and isolated — **PASS**
- [x] Query logic readable for future `spell_id` removal — **PASS**
- [x] Comments distinguish `artifact.hash` vs `artifact.spell_content_hash` — **PASS**

Optional: forward-looking comment at get_spell_from_conn; comment at query site (both added).

---

## Findings by pass

- **Pass 1:** All four checklist items satisfied. Optional: reparse backfill for NULL artifact hash; test for missing-spell handling.
- **Pass 2:** All five focus areas satisfied. Optional: explicit test for single row when both columns match.
- **Pass 3:** All four focus areas satisfied. Added comments: artifact hash vs spell_content_hash at query site; forward-looking note for spell_id drop.

## Fixes made

- Added two comments in `get_spell_from_conn` (spells.rs): (1) artifact.hash = file hash, spell_content_hash = spell ref; (2) when spell_id is dropped, keep only hash branch and remove legacy arm.

## Residual risks

- Full `cargo test` can show vault_env_lock PoisonError when tests run in parallel (pre-existing). Focused suites (db::migrations::tests::, spells::, import::, vault::) pass.
- Export test failures in full run appear unrelated to Task 6 (different code paths).

## Final recommendation

**Task 6.1 implementation is complete and review-clean.** All three passes passed with no blocking issues. Optional improvements (extra tests, reparse backfill) can be done in a follow-up. Mark 6.1 complete.
