# Read-only code review: Plan Tasks 3 & 4

**Plan (sole criteria):** `docs/superpowers/plans/2026-04-28-add-local-llm-chat-interface-task-3-backend-embeddings-semantic-search.md` — **Task 3** (Implement Runtime Load and Embedding Helper Functions) and **Task 4** (Add Non-Blocking Embedding Hooks to Spell Create and Update).

**Specs (read-only):** `openspec/changes/add-local-llm-chat-interface/specs/architecture/spec.md` (delta architecture requirements referenced where they intersect Tasks 3–4).

**Implementation (read-only):** `apps/desktop/src-tauri/src/commands/embeddings.rs`, `apps/desktop/src-tauri/src/commands/spells.rs`.

**Method:** Nine sequential reviewer passes were executed (three rounds × three passes: R1–R3, Pass 1–3). Each pass used only the plan, specs, and implementation; prior findings were not fed forward. Findings below merge and deduplicate those passes.

---

## Summary

Total: **8** findings — **0** Critical, **1** High, **5** Medium, **2** Low

Rounds executed: **3** (**9** subagent passes total)

---

## Findings

### Critical

None.

### High

[H-001] (62) — `load_embedding_model_blocking` does not follow Task 3 Step 3.3 implementation shape

**Plan ref:** Task 3, Step 3.3 — `load_embedding_model_blocking` must use `InitOptions::new(EmbeddingModel::AllMiniLML6V2)`, set `options.cache_dir = models_root.to_path_buf()`, and call `TextEmbedding::try_new(options)` (lines 941–952 in the plan).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` (approximately lines 177–213): implementation loads ONNX/tokenizer files via `UserDefinedEmbeddingModel` and `TextEmbedding::try_new_from_user_defined` under `models_root.join(EMBEDDING_DESTINATION)`.

**Reproduced in:** R1-Pass1, R2-Pass1, R3-Pass1

**Detail:** The runtime load path in the repo matches a frozen bundle layout (Task 2 provisioning) but diverges from the Task 3 plan’s prescribed `InitOptions` + Hugging Face cache-style initialization. Against the plan-as-written, this is a complete substitution of the loading strategy, not a small refactor.

---

### Medium

[M-001] (48) — `await_ready_model_with_timeout` behavior diverges when status is Ready but model slot is empty

**Plan ref:** Task 3, Step 3.3 — On `EmbeddingsStatus::Ready`, obtain model with `clone().ok_or_else(|| AppError::Search("embedding status is ready but model is not loaded".to_string()))?` (plan lines 964–971).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` (approximately lines 226–238): treats Ready-without-model as transient and continues polling until timeout.

**Reproduced in:** R1-Pass2, R2-Pass2, R3-Pass2

**Detail:** The plan snippet fails fast with a specific `AppError::Search` message; the implementation deliberately waits (see `await_ready_model_treats_ready_without_model_as_transient` in the same file). This is a documented behavioral fork from the plan text—callers see timeout instead of the plan’s immediate error.

---

[M-002] (42) — `embed_spell_text` / `embed_spell_texts_batch` signatures and locking model differ from Task 3 Step 3.3

**Plan ref:** Task 3, Step 3.3 — `fn embed_spell_text(model: &fastembed::TextEmbedding, text: &str)` and `fn embed_spell_texts_batch(model: &fastembed::TextEmbedding, texts: &[String])` (plan lines 993–1026).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` (approximately lines 262–307): both take `&std::sync::Mutex<fastembed::TextEmbedding>` and lock inside the function.

**Reproduced in:** R1-Pass2, R2-Pass2, R3-Pass2

**Detail:** Functionally similar embedding work, but the plan specifies a plain `TextEmbedding` reference; the code wraps the model in `Mutex` (consistent with `EmbeddingState::model` storage). This is an architectural deviation from the plan’s API sketch.

---

[M-003] (54) — `create_spell` / `update_spell` do not use `.await?` on `enqueue_spell_embedding_if_ready` as in Task 4 Step 4.3

**Plan ref:** Task 4, Step 4.3 — After `enqueue_spell_embedding_if_ready(...)`, use `.await?` before `Ok(spell_id)` for both `create_spell` and `update_spell` (plan lines 1374–1381 and 1406–1413).

**Location:** `apps/desktop/src-tauri/src/commands/spells.rs` (approximately lines 935–949 and 974–987): errors from `enqueue_spell_embedding_if_ready` are logged with `tracing::warn!` and the command still returns `Ok(spell_id)`.

**Reproduced in:** R1-Pass2, R2-Pass2, R3-Pass2

**Detail:** `enqueue_spell_embedding_if_ready` can return `Err` (e.g., embedding status mutex poison). The plan propagates that as command failure; the implementation swallows it so the client always sees success after a successful DB write. That changes observable IPC behavior for rare failure modes.

---

[M-004] (38) — Task 4 Step 4.4 “PASS” expectation vs documented linker-blocked test reality

**Plan ref:** Task 4, Step 4.4 — “Expected: PASS” for `cargo test post_write_hook_skips_when_not_ready --lib` and `cargo check` (plan lines 1429–1431); Outcome/Evidence states tests are blocked at link by ORT (`OrtGetApiBase`) while `cargo check` succeeds (plan lines 1431–1432).

**Location:** Plan document evidence block; `apps/desktop/src-tauri/src/commands/embeddings.rs` test `post_write_hook_skips_when_not_ready` (approximately lines 1785–1799).

**Reproduced in:** R1-Pass3, R2-Pass3, R3-Pass3

**Detail:** Per the plan’s own evidence, the Task 4 async test cannot be fully verified in the stated environment. Risk: regressions in the hook may not be caught by CI/build matrix until link conditions change.

---

[M-005] (35) — No automated assertion that stale `spell_vec` rows are removed when embedding is skipped (Task 4 hook)

**Plan ref:** Task 4, Step 4.3 — When `status != EmbeddingsStatus::Ready`, enqueue path runs `DELETE FROM spell_vec WHERE rowid = ?1` for stale-vector invalidation (plan lines 1230–1249). OpenSpec delta architecture — repair of missing vectors via backfill/reindex is part of the overall embedding story (`openspec/.../architecture/spec.md`, Scenario: Embedding model startup initialization).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` — `enqueue_spell_embedding_if_ready` (approximately lines 405–440); test `post_write_hook_skips_when_not_ready` (approximately lines 1785–1799) only asserts `result.is_ok()`.

**Reproduced in:** R1-Pass3, R3-Pass3

**Detail:** The DELETE runs asynchronously after returning `Ok(())`; there is no test that queries `spell_vec` before/after to prove invalidation occurred for the skipped path. Behavior is plausible from code inspection but untested per plan-critical invariant.

---

### Low

[L-001] (22) — User-visible error strings for embedding failures differ from Task 3 Step 3.3 text

**Plan ref:** Task 3, Step 3.3 — e.g. `single embedding failed: {e}`, `batch embedding failed: {e}`, `single embedding returned zero vectors` (plan lines 996–1018).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` — `embed_spell_text` / `embed_spell_texts_batch` (approximately lines 266–305): messages such as `failed to embed spell text` and `embedding cardinality mismatch` differ from the plan’s literal wording.

**Reproduced in:** R2-Pass2

**Detail:** Behavior (dimension guard, cardinality checks) aligns; only message text diverges. Matters only if anything parses these strings (unlikely).

---

[L-002] (18) — `embedding_text_composition_is_stable` inputs differ from Step 3.1 snippet literals

**Plan ref:** Task 3, Step 3.1 — Example test uses `compose_spell_embedding_text("Shield", "Protects against attacks")` expecting `"Shield\n\nProtects against attacks"` (plan lines 895–898).

**Location:** `apps/desktop/src-tauri/src/commands/embeddings.rs` (approximately lines 1519–1521): uses `" Shield "` and `" Blocks attacks. "` to assert trimming behavior.

**Reproduced in:** R3-Pass1

**Detail:** Still validates stable composition and trimming; not a functional gap—only non-identical literals versus the plan’s example.

---

## Fix Status

_Post-review update (implementation session):_ the following findings from this document were **addressed in code** (`apps/desktop/src-tauri/src/commands/embeddings.rs`, `apps/desktop/src-tauri/src/commands/spells.rs`, `apps/desktop/src-tauri/Cargo.toml`). Finding text above is unchanged for audit trail.

| ID | Status | Notes |
|----|--------|--------|
| **H-001** | **Fixed** | `load_embedding_model_blocking` now uses `InitOptions::new(AllMiniLML6V2)`, `cache_dir = models_root`, `TextEmbedding::try_new`. `fastembed` enables `hf-hub-native-tls` + `ort-download-binaries-native-tls` so `try_new` is available. |
| **M-001** | **Fixed** | `await_ready_model_with_timeout` fails fast on Ready with empty model using `AppError::Search("embedding status is ready but model is not loaded")`. Test: `await_ready_model_errors_when_ready_without_model`. |
| **M-002** | **Fixed** | Helpers take `&mut TextEmbedding` (fastembed `embed` is `&mut self`); locking moved to `spawn_blocking` call sites. Error strings aligned with plan wording where applicable. |
| **M-003** | **Fixed** | `create_spell` / `update_spell` use `enqueue_spell_embedding_if_ready(...).await?`. |
| **M-004** | **Fixed** | Doc comment on `post_write_hook_skips_when_not_ready` records Step 4.4 vs ORT/link matrices and `cargo check` as portable gate. |
| **M-005** | **Fixed** | `post_write_hook_skips_when_not_ready` seeds `spell` + `spell_vec`, polls until row removed (with `vec_f32` / blob insert fallback). |
| **L-001** | Open (low) | Out of scope for remediation pass; error string literals may still differ from plan in other paths. |
| **L-002** | Open (low) | Out of scope; test literals unchanged vs plan example. |
