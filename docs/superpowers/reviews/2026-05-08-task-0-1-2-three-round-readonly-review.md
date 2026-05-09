## Summary
Total: 11 findings - 0 Critical, 0 High, 6 Medium, 5 Low
Rounds executed: 3 (9 subagent passes total)

## Fix Status Update (2026-05-09)

Critical/High/Medium implementation status from fix loop:

- [M-001] RESOLVED
- [M-002] RESOLVED
- [M-003] RESOLVED
- [M-004] RESOLVED
- [M-005] RESOLVED
- [M-006] RESOLVED

Additional regression tracked during verification:

- [H-007] INTRODUCED AND RESOLVED (regression in cancel-control wait handling)

Low findings remain out of scope for this fix pass:

- [L-001], [L-002], [L-003], [L-004], [L-005]

## Findings

### Critical
None.

### High
None.

### Medium
[M-001] (68) - Cancel-flow helper semantics diverge from plan's async wait-loop
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Task 2, Step 2.3 ("Implement status/download/import/cancel command surface"), specifically the planned `wait_for_download_control_or_idle` async loop + awaited usage in `cancel_embedding_download_and_wait`.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`wait_for_download_control_or_idle`, `cancel_embedding_download_and_wait`)
Reproduced in: R2-Pass2, R2-Pass3, R3-Pass2
Detail: Plan shows an async polling loop to stabilize/observe current download control before cancellation. Implementation snapshots immediately (no equivalent async wait-loop), which can weaken race handling during state transitions.

[M-002] (60) - Side-load validation does not enforce closed-set "no extra files" rule
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Task 0, Step 0.3 ("Verify model asset contract details match the spike ledger"), with spike contract requiring `FileInventoryOnly` closed-set behavior.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`validate_embedding_bundle_layout`, `copy_directory_recursive`, `install_imported_embedding_bundle`)
Reproduced in: R1-Pass3
Detail: Validator checks required files/size/hash, but does not reject extra files; copy routine can carry extras into models directory. That appears weaker than strict closed-set inventory enforcement.

[M-003] (58) - `AppError` cancellation handling deviates from planned variant usage and task file scope
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Global constraints ("Keep `AppError` usage consistent with existing backend patterns"), Task 2 Step 2.3 planned cancellation path uses `AppError::Search("Embedding download cancelled")`, and Task 2 file list.
Location: `apps/desktop/src-tauri/src/error.rs`, `apps/desktop/src-tauri/src/commands/embeddings.rs`
Reproduced in: R2-Pass2
Detail: Implementation introduces a dedicated cancellation error variant and corresponding matching behavior instead of the planned `Search` string path, and touches `error.rs` outside Task 2's listed file scope.

[M-004] (55) - Validation-path test coverage is incomplete for implemented integrity branches
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Task 2, Step 2.1 ("Add failing tests for command-state transitions and validation paths"), plus Step 2.3 validator branches.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (tests + `validate_embedding_bundle_layout`)
Reproduced in: R2-Pass3, R3-Pass3
Detail: Tests cover missing required file, but not size mismatch and hash mismatch paths that are explicitly implemented and plan-relevant.

[M-005] (52) - Command-state transition tests are helper-level only, not command-boundary level
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Task 2, Step 2.1 ("Add failing tests for command-state transitions and validation paths")
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`tests` module)
Reproduced in: R3-Pass3
Detail: Existing tests validate helper behavior and one validation failure path, but do not exercise state transitions through the actual IPC commands (`embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`).

[M-006] (50) - Cancel cleanup wait can spin indefinitely under abnormal cleanup failure
Status: RESOLVED (fixed in follow-up implementation pass)
Plan ref: Task 2, Step 2.3 ("Implement status/download/import/cancel command surface")
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`wait_for_download_cleanup_or_idle`)
Reproduced in: R3-Pass3
Detail: Cancel wait-loop has no timeout/backstop; if completion signaling/state-clear fails abnormally, cancellation may wait indefinitely. This is an untested edge behavior in a required command path.

### Low
[L-001] (24) - Dependency policy language is internally ambiguous around `futures-util`
Plan ref: Global no-new-dependencies wording and Task 0 Step 0.1 approved list versus Task 2 files list explicitly allowing direct `futures-util`.
Location: Plan/manifest contract (`docs/superpowers/plans/...`, `apps/desktop/src-tauri/Cargo.toml`)
Reproduced in: R1-Pass3
Detail: The plan includes both "no new dependencies" language and a Task 2 instruction to add direct `futures-util`; this creates audit ambiguity in preflight criteria.

[L-002] (22) - Import validation/install error labeling diverges from plan's two-stage error contexts
Plan ref: Task 2, Step 2.3 staged `spawn_blocking` flow with separate validation/install task error contexts.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`install_imported_embedding_bundle`)
Reproduced in: R2-Pass2
Detail: Consolidated blocking flow can collapse error labeling into install-stage context, reducing fidelity versus the plan's separate validation/install context labels.

[L-003] (18) - Download resume progress semantics include extra emissions not shown in plan
Plan ref: Task 2, Step 2.3 download/progress flow.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (resume/progress helper logic in download loop)
Reproduced in: R2-Pass2
Detail: Implementation adds additional resume accounting/progress emission behavior beyond plan snippet semantics; likely acceptable, but not a strict match to documented flow.

[L-004] (14) - `ActiveEmbeddingDownload` visibility widened beyond plan skeleton
Plan ref: Task 1, Step 1.3 state skeleton shape.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`ActiveEmbeddingDownload`)
Reproduced in: R2-Pass2
Detail: Plan shows private struct in-module; implementation uses broader visibility. Impact is minor but is a design-surface deviation.

[L-005] (12) - Symlink rejection behavior added though not explicitly specified
Plan ref: Task 2, Step 2.3 import/copy behavior.
Location: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`copy_directory_recursive`)
Reproduced in: R2-Pass2
Detail: Extra hardening rejects symlinks during import copy. This is reasonable security-wise but extends behavior beyond explicit plan text.
