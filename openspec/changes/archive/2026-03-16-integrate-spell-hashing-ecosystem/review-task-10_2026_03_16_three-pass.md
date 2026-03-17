# Code Review: Task 10 - Performance Validation

**Change:** `integrate-spell-hashing-ecosystem`  
**Task:** 10. Performance Validation  
**Review Date:** 2026-03-16  
**Review Mode:** Three-pass, subagent-assisted, findings-first  
**Status:** Partial; current implementation exists, but Task 10 is not yet verified complete

## Scope

This review covers both items under Task 10:

1. Task 10.1: vault garbage-collection benchmark
2. Task 10.2: Migration 0014 FTS rebuild/repopulate benchmark

Each item was reviewed independently by a dedicated subagent, then consolidated against the spec, design, and implementation.

## Findings

### High

1. **Task 10.2 benchmark does not validate the production canonical-text repopulation path.**  
   The benchmark fixture uses camelCase or simplified keys such as `castingTime`, `savingThrow`, `magicResistance`, and `experienceComponent`, while Migration 0014 extracts snake_case canonical paths like `$.casting_time.text`, `$.saving_throw.raw_legacy_value`, `$.magic_resistance.source_text`, and `$.experience_cost.source_text`. Because the benchmark only asserts document count, it can pass even if most canonical text columns are blank or `NULL`, which means it does not validate the required structured-field indexing workload.
   
   Evidence:
   - [migrations.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/db/migrations.rs#L522)
   - [0014_fts_extend_canonical.sql](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/db/migrations/0014_fts_extend_canonical.sql#L44)
   - [design.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md#L91)
   - [spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/search/spec.md#L7)

### Medium

2. **Task 10.1 benchmark does not exercise the full production retention logic used by vault GC.**  
   Production GC retains hashes referenced by `spell`, `artifact.spell_content_hash`, and `character_class_spell.spell_content_hash`, but the benchmark populates only `spell` rows and leaves artifact/list references unused. That makes the benchmark narrower than the shipped GC behavior it is supposed to validate.
   
   Evidence:
   - [tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L160)
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L692)
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L1896)
   - [vault spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/vault/spec.md#L28)
   - [artifacts spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/artifacts/spec.md#L38)

3. **Both Task 10 benchmarks are ignored-by-default, so the task is checked off without fresh executable verification evidence.**  
   The implementation contains ignored benchmark tests for both items, but ignored tests are not part of ordinary validation. The current review artifact also reported local timings without captured command output or environment details. That is not sufficient evidence for a checked-off “Verify ... completes in < N seconds” requirement.
   
   Evidence:
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L1894)
   - [migrations.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/db/migrations.rs#L498)
   - [tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L161)
   - [tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L163)

4. **Task 10.2 measures a reduced migration setup rather than a realistic pre-0014 upgrade shape.**  
   The benchmark builds only a `spell` table and applies the SQL file directly. It does not seed legacy `spell_fts` or legacy triggers before timing the migration, even though the migration is explicitly defined as dropping and recreating those objects. That weakens the claim that the measured time represents the full 0014 rebuild/repopulate path.
   
   Evidence:
   - [migrations.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/db/migrations.rs#L503)
   - [0014_fts_extend_canonical.sql](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/db/migrations/0014_fts_extend_canonical.sql#L6)
   - [design.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md#L83)

5. **Task 10.1 measures a helper rather than the user-facing GC entry path.**  
   The benchmark calls `run_vault_gc_with_root` directly. The production maintenance flow goes through `optimize_vault_with_root`, which includes GC guard acquisition. The measured timing is therefore for a narrower internal path than the user-triggered operation.
   
   Evidence:
   - [design.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md#L134)
   - [vault spec.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/specs/vault/spec.md#L44)
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L725)
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L761)
   - [vault.rs](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/commands/vault.rs#L1896)

## Pass 1: Completeness

### Task 10.1

- A dedicated benchmark exists for 10,000 vault files and includes the mandatory integrity-check-first behavior because `run_vault_gc_with_root` invokes `run_vault_integrity_check_with_root` before deletion.
- Coverage is still incomplete relative to shipped behavior because the benchmark does not include artifact-backed or character-list-backed liveness, even though production GC supports both.

### Task 10.2

- A dedicated benchmark exists for 10,000 spells and executes the real Migration 0014 SQL file.
- Coverage is incomplete because the seeded JSON does not represent the canonical text-bearing shape that the migration is specifically required to repopulate and index.

## Pass 2: Accuracy

### Task 10.1

- The production GC implementation appears structurally correct: it gathers live hashes from the relevant tables and deletes only non-live `spells/*.json` files.
- The benchmark is only a partial accuracy proxy because it validates a spell-only case and bypasses the higher-level maintenance wrapper.

### Task 10.2

- The benchmark is directionally correct in that it times the real SQL file and verifies 10,000 FTS documents were created.
- The benchmark is not an accurate production proxy for canonical-text repopulation because the JSON fixture shape does not match the extraction paths used by the migration, and the assertions do not inspect canonical text columns at all.

## Pass 3: Verification Quality

- Verification quality is insufficient for a “complete & accurate” or “verified” conclusion.
- I attempted to collect fresh benchmark execution evidence, but the local environment could not reliably launch `cargo`; both sandboxed and unrestricted attempts failed to provide runnable benchmark output, so no execution-based pass claim is made here.
- The prior review file overstated confidence by reporting local timing numbers without reproducible command output.

## Item Verdicts

| Item | Verdict | Reason |
|---|---|---|
| Task 10.1 Vault GC | Partial | Benchmark exists, but it is ignored and narrower than the full production retention and invocation path. |
| Task 10.2 FTS rebuild | Partial | Benchmark exists, but fixture/assertions do not validate the required canonical-text repopulation behavior. |

## Overall Verdict

Task 10 should not currently be treated as fully verified complete.

The codebase contains benchmark scaffolding for both required items, but the evidence is not strong enough to support the checked-off status in [tasks.md](/C:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/tasks.md#L160). The benchmark implementations need stronger production-shape coverage, and the task needs fresh executable evidence before it can honestly be called complete.

## Review/Implementation Guidance

1. Update the Task 10.1 benchmark to cover mixed liveness sources:
   - `spell`
   - `artifact.spell_content_hash`
   - `character_class_spell.spell_content_hash`

2. Time the user-facing GC path or explicitly document that the helper-only benchmark is intentionally narrower and add a second benchmark for the guarded path if the task requirement is meant to cover the full operation.

3. Replace the Task 10.2 fixture with realistic canonical JSON that matches the actual Migration 0014 extraction paths (`range.text`, `duration.text`, `area.text`, `casting_time.*`, `saving_throw.*`, `damage.*`, `magic_resistance.*`, `experience_cost.*`).

4. Strengthen Task 10.2 assertions so the benchmark proves repopulation quality, not just document count. Spot-check one or more canonical text columns after migration.

5. Run both ignored benchmarks with captured output in a reproducible environment, then update the task status and review artifact with actual evidence instead of inferred timing claims.
