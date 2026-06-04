# Local LLM Chat Task 4 Backend RAG Pipeline and LLM Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 4 for `add-local-llm-chat-interface` by wiring FTS5-only RAG retrieval, ChatML prompt assembly with history truncation, and production-grade `llm_chat` inference behavior (streaming, timeout, cancellation, single-flight guard) on top of the existing Rust `llm.rs` lifecycle from task group 2.

**Architecture:** Keep all chat inference in `apps/desktop/src-tauri/src/commands/llm.rs` and add a focused RAG helper module under `apps/desktop/src-tauri/src/commands/llm_rag.rs`. Before each generation, extract 1–3 search terms from the user query, retrieve top 5 spells via the existing FTS5 stack in `search.rs`, assemble a ChatML prompt (system + RAG + truncated history + current user turn), then feed that prompt into the existing `LlmRuntimeDriver` token loop. Extend `DoneEvent` with grounding metadata for the Chat UI. Do not call embeddings or the Python sidecar on the chat path.

**Tech Stack:** Rust 2021, Tauri v2 events, `llama-cpp-2`, existing `rusqlite` FTS5 (`search.rs`), `tokio::task::spawn_blocking`, `tokio::time` for the 120 s inference timeout.

---

## Spec Snapshot (Task Group 4)

| Task | Requirement |
|------|-------------|
| 4.1 | Robust search-term extractor (stopwords + domain keywords) |
| 4.2 | FTS-only RAG retrieval: top 5 spells with grounded metadata |
| 4.3 | ChatML prompt assembler with 2048-token history truncation |
| 4.4 | `llm_chat` uses frontend `stream_id`, accepts history, replaces `chat_answer` behavior |
| 4.5 | 120 s inference timeout + cooperative cancel via existing `llm_cancel_generation` |
| 4.6 | Concurrent request guard (one inference at a time) |

**Normative sources:** `openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md` (RAG, ChatML, streaming, concurrency), `design.md` (Decision 4–6, data flow), `tasks.md` §4.

---

## Current Repo Baseline (from exploration)

Task group 2 is largely implemented in `commands/llm.rs`:

- `llm_chat(message, stream_id)` streams via `llm://token/<id>` and `llm://done/<id>`.
- Concurrent generation guard exists (`begin_generation` → "already being generated").
- Cancel uses `Arc<AtomicBool>` polled each token (spike Outcome B).
- Prompt today is **user-only** ChatML stub — no system block, no history, no RAG.
- `generate_chat_completion` uses placeholder `<|im_end|>` tokens; implementation must use the real TinyLlama ChatML end token via `CHATML_IM_END` (see Task 3 — not the redacted spec placeholder).
- `llm_chat` does **not** take `history` or database `State`; both are required for task 4.
- `search_keyword_with_conn` in `search.rs` is private and returns `SpellSummary` without `description` (RAG needs ≤200 char description snippets).

Task group 3 (embeddings) is orthogonal: chat must work when embeddings are `notProvisioned`.

---

## Prerequisites

| Prerequisite | Status | Notes |
|--------------|--------|-------|
| Task 1 spikes (MSVC, interruptibility) | Done | See `docs/dev/local_llm_infrastructure_spike.md` |
| Task 2 `LlmState`, provisioning, `llm_chat` shell | Done | Extend, do not rewrite lifecycle |
| Task 3 embeddings | Not required for chat RAG | FTS-only per Decision 4 |
| SQLite spell DB + FTS5 | Exists | `spell_fts` includes `description` |

**Stop condition:** If `llm.rs` lifecycle commands are missing on the branch, complete task 2 plan first.

---

## Planned File Structure

| File | Action | Purpose |
|------|--------|---------|
| `apps/desktop/src-tauri/src/commands/llm_rag.rs` | Create | Term extraction, FTS RAG retrieval, prompt assembly, unit tests |
| `apps/desktop/src-tauri/src/commands/llm.rs` | Modify | Wire RAG + history into `run_claimed_llm_chat`, timeout, `stream_id` validation, extend `ChatRunOutput` / `DoneEvent` |
| `apps/desktop/src-tauri/src/commands/search.rs` | Modify | Add `pub(crate) fn search_rag_spells_with_conn(...)` returning description snippets |
| `apps/desktop/src-tauri/src/commands/mod.rs` | Modify | `mod llm_rag;` |
| `apps/desktop/src-tauri/src/models/llm.rs` | Modify | `ChatMessage`, `RagSpellContext`, `LlmChatGrounding`, extend `DoneEvent` |
| `apps/desktop/src-tauri/src/models/mod.rs` | Modify | Re-export new types |
| `apps/desktop/src-tauri/src/commands/search.rs` (`chat_answer`) | Modify | Compat path uses same prompt builder |
| `apps/desktop/src/ui/Chat.tsx` | Modify (minimal) | Pass `history: []` until task 7; required for IPC signature |

No new `Cargo.toml` dependencies.

---

## Design Decisions (locked for implementation)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | FTS-only RAG via new `search_rag_spells_with_conn`, limit 5 | Reuses `build_fts_query` + `bm25`; avoids coupling chat to embeddings |
| D2 | Multi-term retrieval: join extracted terms with ` OR ` inside one FTS `MATCH` | Single ranked list; cap at 5 rows |
| D3 | `RagSpellContext { id, name, school, level, description_snippet }` | Spec needs description ≤200 chars; `SpellSummary` lacks description |
| D4 | Prompt token budget: **2048** (`TINYLLAMA_CONTEXT_TOKENS`) | Per spec; measure with `model.str_to_token` before inference |
| D5 | Truncation drops **oldest** non-system turns first; always keep system + latest user | Per spec scenario |
| D6 | ChatML tokens: `<\|im_start\|>` + `CHATML_IM_END` constant | Replace `redacted_im_end` placeholder in existing code |
| D7 | Inference timeout: 120 s wall clock, check `Instant` each token loop iteration | Append `[Response timed out]` to partial response in `DoneEvent` |
| D8 | Extend `DoneEvent` with `searchTerms` + `groundedSpells` | Feeds task 7 `GroundedInIndicator` without re-running FTS on the frontend |
| D9 | `stream_id` validation: non-empty after trim, max length 128 | Task 9.6; reject before `begin_generation` |
| D10 | `llm_chat` adds `db: State<'_, Arc<Pool>>` and `history: Vec<ChatMessage>` | RAG needs DB; spec requires history in command |
| D11 | RAG + prompt build runs in `spawn_blocking` before generation worker | Avoid blocking async runtime on DB + tokenization |
| D12 | Empty FTS → system prompt includes exact string: `No matching spells found in the library` | Per spec scenario |

---

## Guardrails

- Do **not** add dependencies; follow `docs/DEPENDENCY_SECURITY.md` if that changes.
- Do **not** invoke `call_sidecar`, `embeddings_*`, or `search_spells_semantic` from the chat path.
- Preserve task 2 lifecycle semantics: preflight failures before claim stay non-sticky; post-load failures use `record_lifecycle_error`.
- Keep camelCase on all frontend-visible structs (`#[serde(rename_all = "camelCase")]`).
- Every successful generation claim must still emit a terminal `llm://done/<stream_id>` (including timeout and pre-generation failures after claim).
- Run `cargo test` in `apps/desktop/src-tauri` for touched modules before claiming task complete.

---

### Task 0: Preflight Gate

**Files:**
- Read: `apps/desktop/src-tauri/src/commands/llm.rs`
- Read: `apps/desktop/src-tauri/src/commands/search.rs`
- Read: `openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md`

- [x] **Step 0.1: Confirm task 2 shell exists**

```bash
cd apps/desktop/src-tauri
rg -n 'pub async fn llm_chat|fn begin_generation|fn generate_chat_completion' src/commands/llm.rs
```

Expected: all three symbols exist.

- [x] **Step 0.2: Confirm FTS5 schema includes description**

```bash
rg -n 'description' ../../db/migrations/0014_fts_extend_canonical.sql
```

Expected: `description` listed in `spell_fts` columns.

- [x] **Step 0.3: Confirm no new dependencies required**

```bash
rg -n '^(llama-cpp-2|rusqlite)\s*=' Cargo.toml
```

Expected: crates already pinned.

---

### Task 1: RAG types and term extractor (4.1)

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/llm_rag.rs`
- Modify: `apps/desktop/src-tauri/src/models/llm.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`

- [x] **Step 1.1: Add models**

In `models/llm.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum ChatRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct RagSpellContext {
    pub id: i64,
    pub name: String,
    pub school: Option<String>,
    pub level: i64,
    pub description_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct LlmChatGrounding {
    pub search_terms: Vec<String>,
    pub grounded_spells: Vec<RagSpellContext>,
}
```

Extend `DoneEvent`:

```rust
pub struct DoneEvent {
    pub full_response: String,
    pub cancelled: bool,
    pub search_terms: Vec<String>,
    pub grounded_spells: Vec<RagSpellContext>,
    pub timed_out: bool,
}
```

- [x] **Step 1.2: Write failing tests for term extraction**

In `llm_rag.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_terms_strips_stopwords_and_keeps_domain_words() {
        let terms = extract_search_terms("What does a fireball spell do for damage?");
        assert_eq!(terms, vec!["fireball", "damage"]);
    }

    #[test]
    fn extract_terms_caps_at_three() {
        let terms = extract_search_terms("fire cold lightning acid poison evocation");
        assert!(terms.len() <= 3);
    }

    #[test]
    fn extract_terms_returns_empty_for_stopword_only_query() {
        let terms = extract_search_terms("what is the of and");
        assert!(terms.is_empty());
    }
}
```

- [x] **Step 1.3: Run tests to verify failure**

```bash
cd apps/desktop/src-tauri
cargo test extract_terms -- --nocapture
```

Expected: FAIL (function not defined).

- [x] **Step 1.4: Implement `extract_search_terms`**

Implementation rules:

- Lowercase input; split on non-alphanumeric boundaries.
- Drop tokens in `STOPWORDS` (include generic English + AD&D noise: `spell`, `spells`, `level`, `what`, `does`, `the`, `a`, `an`, `how`, `many`, `of`, `for`, `is`, `are`, `do`, `can`, `you`, `me`, `about`).
- Keep tokens with len ≥ 3 OR known domain short tokens (`hd`, `hp`, `ac`, `mr`).
- Deduplicate preserving order; return at most 3.

- [x] **Step 1.5: Run tests — expect PASS**

- [x] **Step 1.6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/llm_rag.rs apps/desktop/src-tauri/src/models/llm.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/models/mod.rs
git commit -m "feat(llm): add RAG term extractor and chat grounding types"
```

---

### Task 2: FTS RAG retrieval (4.2)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`
- Modify: `apps/desktop/src-tauri/src/commands/llm_rag.rs`

- [x] **Step 2.1: Write failing retrieval test**

```rust
#[test]
fn search_rag_spells_returns_top_matches_with_snippets() {
    let conn = setup_fts_db_with_sample_spells(); // helper in search.rs tests
    let results = search_rag_spells_with_conn(&conn, &["fireball".to_string()], 5).unwrap();
    assert!(!results.is_empty());
    assert!(results[0].description_snippet.len() <= 200);
}
```

- [x] **Step 2.2: Implement `search_rag_spells_with_conn` in `search.rs`**

```rust
pub(crate) const RAG_RETRIEVAL_LIMIT: usize = 5;

pub(crate) fn search_rag_spells_with_conn(
    conn: &Connection,
    terms: &[String],
    limit: usize,
) -> Result<Vec<RagSpellContext>, AppError> {
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let fts_query = terms
        .iter()
        .map(|t| build_fts_query(t))
        .filter(|q| !q.is_empty())
        .collect::<Vec<_>>()
        .join(" OR ");
    // SELECT s.id, s.name, s.school, s.level, s.description
    // FROM spell s JOIN spell_fts ON spell_fts.rowid = s.id
    // WHERE spell_fts MATCH ? ORDER BY bm25(spell_fts) ASC LIMIT ?
    // Map description -> description_snippet via truncate_to_chars(desc, 200)
}
```

Import `RagSpellContext` from `crate::models::llm`.

- [x] **Step 2.3: Add `retrieve_rag_context` wrapper in `llm_rag.rs`**

```rust
pub fn retrieve_rag_context(
    conn: &rusqlite::Connection,
    user_query: &str,
) -> Result<LlmChatGrounding, AppError> {
    let search_terms = extract_search_terms(user_query);
    let grounded_spells =
        search_rag_spells_with_conn(conn, &search_terms, RAG_RETRIEVAL_LIMIT)?;
    Ok(LlmChatGrounding { search_terms, grounded_spells })
}
```

- [x] **Step 2.4: Run retrieval tests — expect PASS**

- [x] **Step 2.5: Commit**

```bash
git commit -m "feat(llm): add FTS-only RAG spell retrieval for chat"
```

---

### Task 3: ChatML prompt assembler with truncation (4.3)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm_rag.rs`

- [x] **Step 3.1: Write failing prompt tests**

```rust
#[test]
fn assemble_prompt_includes_system_rag_and_user_turn() {
    let prompt = assemble_chatml_prompt(AssemblePromptInput {
        system_without_context: SYSTEM_PROMPT_PREFIX,
        grounding: sample_grounding_with_one_spell(),
        history: vec![],
        user_message: "Explain fireball".to_string(),
        tokenize: &|text| Ok(text.len() as u32 / 4), // test double
        context_limit: 2048,
    })
    .unwrap();
    assert!(prompt.contains("<|im_start|>system"));
    assert!(prompt.contains("Relevant spells from the library:"));
    assert!(prompt.contains("Explain fireball"));
    assert!(prompt.contains(CHATML_IM_END));
}

#[test]
fn assemble_prompt_truncates_oldest_history_first() {
    // Build history with 10 turns; assert first turn dropped, latest user kept
}
```

- [x] **Step 3.2: Implement constants and formatter**

```rust
pub const TINYLLAMA_CONTEXT_TOKENS: u32 = 2048;
// TinyLlama ChatML end-of-message token (spec docs redact this as "redacted_im_end").
pub const CHATML_IM_END: &str = concat!("<", "|im_end|", ">");
pub const SYSTEM_PROMPT_PREFIX: &str = "You are a helpful AD&D 2nd Edition spell expert. Answer questions about spells accurately using the provided library context. Be concise.\n\n";

pub fn format_rag_block(grounding: &LlmChatGrounding) -> String {
    if grounding.grounded_spells.is_empty() {
        return "No matching spells found in the library".to_string();
    }
    let mut out = String::from("Relevant spells from the library:\n");
    for spell in &grounding.grounded_spells {
        let school = spell.school.as_deref().unwrap_or("Unknown");
        out.push_str(&format!(
            "- {} (Level {} {}): {}\n",
            spell.name, spell.level, school, spell.description_snippet
        ));
    }
    out
}
```

ChatML block helpers:

```rust
fn chatml_block(role: &str, content: &str) -> String {
    format!("<|im_start|>{role}\n{content}\n{CHATML_IM_END}\n")
}
```

- [x] **Step 3.3: Implement truncation using tokenizer callback**

`assemble_chatml_prompt` accepts a `Fn(&str) -> Result<u32, AppError>` so production can pass `model.str_to_token` length, tests use a cheap estimator.

Algorithm:

1. Build fixed prefix: `system_block = SYSTEM_PROMPT_PREFIX + format_rag_block(&grounding)`.
2. Build required suffix: `user_block(current user)` + `assistant_header` (`<|im_start|>assistant\n`).
3. Token-count prefix + suffix; reserve from 2048.
4. Walk `history` oldest→newest, prepend turns that fit; drop excess oldest turns.
5. Concatenate: system, history, user, assistant header.

- [x] **Step 3.4: Run tests — expect PASS**

- [x] **Step 3.5: Commit**

```bash
git commit -m "feat(llm): add ChatML prompt assembler with context truncation"
```

---

### Task 4: Wire RAG into inference path (4.4, 4.6)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`
- Modify: `apps/desktop/src-tauri/src/commands/search.rs` (`chat_answer` compat)
- Modify: `apps/desktop/src/ui/Chat.tsx`

- [x] **Step 4.1: Write failing integration test for prompt wiring**

In `llm.rs` `#[cfg(test)]`:

```rust
#[test]
fn build_chat_prompt_for_query_includes_grounding_block() {
    let conn = crate::commands::search::tests::setup_rag_test_conn();
    let prompt = build_chat_prompt_for_query(&conn, "fireball damage", &[]).unwrap();
    assert!(prompt.contains("Relevant spells from the library:"));
}
```

- [x] **Step 4.2: Add `validate_stream_id`**

```rust
fn validate_stream_id(stream_id: &str) -> Result<(), AppError> {
    let trimmed = stream_id.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return Err(AppError::Validation(
            "streamId must be a non-empty string up to 128 characters".into(),
        ));
    }
    Ok(())
}
```

- [x] **Step 4.3: Extend `llm_chat` signature**

```rust
#[tauri::command]
pub async fn llm_chat(
    app: LlmCommandAppHandle,
    state: State<'_, Arc<LlmState>>,
    db: State<'_, Arc<Pool>>,
    message: String,
    stream_id: String,
    history: Vec<ChatMessage>,
) -> Result<(), AppError> {
    validate_stream_id(&stream_id)?;
    run_claimed_llm_chat(
        Arc::clone(state.inner()),
        Arc::clone(db.inner()),
        message,
        history,
        stream_id.clone(),
        Arc::new(TauriChatEventSink::new(app, stream_id)),
    )
    .await
    .map(|_| ())
}
```

- [x] **Step 4.4: Update `run_claimed_llm_chat` to build prompt via DB**

Flow after generation claim and successful preflight:

```rust
let pool = db.clone();
let prompt = tokio::task::spawn_blocking(move || {
    let conn = pool.get()?;
    let grounding = retrieve_rag_context(&conn, &user_message)?;
    assemble_chatml_prompt_with_model(&grounding, &history, &user_message, model_token_counter)
}).await??;

runtime_driver.generate(state, prompt, cancel, event_sink, grounding_metadata).await?;
```

Refactor `generate_chat_completion` to accept **full prompt string** (not raw user message) and fix ChatML end tokens to use `CHATML_IM_END`.

Thread `LlmChatGrounding` through `ChatRunOutput` so `build_done_event` can populate `searchTerms` / `groundedSpells`.

- [x] **Step 4.5: Update `llm_chat_answer_compat` to use same builder**

Compat path passes empty history and synthesized `stream_id`; answer text still returned for legacy tests.

- [x] **Step 4.6: Minimal frontend IPC fix**

In `Chat.tsx`, add `history: []` to `invoke("llm_chat", { message: q, streamId, history: [] })` so the command signature matches.

- [x] **Step 4.7: Run `cargo test` for llm + llm_rag + search — expect PASS**

- [x] **Step 4.8: Commit**

```bash
git commit -m "feat(llm): wire FTS RAG and history into llm_chat"
```

---

### Task 5: Inference timeout and cancel polish (4.5)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`

- [x] **Step 5.1: Write failing timeout test**

```rust
#[test]
fn generation_marks_timed_out_and_appends_notice() {
    // Use stub runtime driver that sleeps; assert timed_out=true and suffix present
}
```

- [x] **Step 5.2: Add `INFERENCE_TIMEOUT_SECS: u64 = 120`**

Inside `generate_chat_completion` loop:

```rust
let started = std::time::Instant::now();
while n_cur < n_ctx as i32 {
    if cancel.load(Ordering::SeqCst) { break; }
    if started.elapsed() >= Duration::from_secs(INFERENCE_TIMEOUT_SECS) {
        timed_out = true;
        break;
    }
    // existing sample/decode...
}
if timed_out {
    generated.push_str("\n[Response timed out]");
}
```

Set `ChatRunOutput { timed_out, .. }`.

- [x] **Step 5.3: Verify cancel still stops on next token boundary**

Existing `llm_cancel_generation` test `cancel_generation_marks_active_stream_cancelled` must still pass.

- [x] **Step 5.4: Run targeted tests**

```bash
cd apps/desktop/src-tauri
cargo test llm -- --nocapture
```

- [x] **Step 5.5: Commit**

```bash
git commit -m "feat(llm): enforce 120s inference timeout with partial response"
```

---

### Task 6: Verification and spec cross-check

- [ ] **Step 6.1: Spec coverage matrix**

| Spec scenario | Task |
|---------------|------|
| Term extraction 1–3 terms | Task 1 |
| FTS top 5 with metadata | Task 2 |
| Zero FTS → no-context system note | Task 2–3 |
| ChatML structure | Task 3–4 |
| History truncation 2048 | Task 3 |
| Token + done events | Task 4 (existing) |
| 120 s timeout | Task 5 |
| Concurrent rejection | Existing `begin_generation` (verify test) |
| Chat without embeddings | No embedding calls (verify by inspection) |
| `stream_id` validation | Task 4 |

- [ ] **Step 6.2: Run full backend checks**

```bash
cd apps/desktop/src-tauri
cargo fmt
cargo clippy -- -D warnings
cargo test
```

- [ ] **Step 6.3: Final commit if formatting-only changes**

---

## Out of Scope (explicit)

- Task 7 Chat UI (`ChatPanel`, spell links, grounding indicator styling) — consumes extended `DoneEvent`.
- Task 6 TypeScript types — add `ChatMessage`, grounding fields when implementing IPC layer.
- Vector/hybrid RAG — Decision 4 forbids in v1.
- Removing `chat_answer` registration — can remain as compat wrapper until task 7/11.

---

## Grill-Me Review Log

### Round 1 — Blocking design branches resolved

| Question | Resolution |
|----------|------------|
| Where does RAG live? | New `llm_rag.rs`; FTS SQL stays in `search.rs` |
| How to get descriptions? | Dedicated `search_rag_spells_with_conn` SELECT |
| Multi-term FTS? | `OR` of per-term `build_fts_query` outputs |
| Real ChatML end token? | `CHATML_IM_END` via `concat!`, fix existing placeholder |
| How does UI get grounding? | Extend `DoneEvent` now; task 7 renders it |
| Does `llm_chat` need DB? | Yes — add `State<Pool>` |
| History parameter? | Add to command; Chat.tsx passes `[]` until task 7 |
| Timeout mechanism? | `Instant::elapsed` in token loop (Outcome B compatible) |
| Concurrent guard already done? | Yes — verify test, no redesign |
| Dependency additions? | None |

**Assumptions accepted:** Task 2 lifecycle code on branch matches exploration; tokenizer-based truncation is acceptable latency vs char heuristic.

**Open questions:** None blocking implementation. Task 7 may refine `ChatRole` naming (`user`/`assistant` strings vs enum) when aligning TypeScript.

### Round 2 — Plan quality scan

- Placeholder scan: no TBD tasks.
- Type consistency: `RagSpellContext` / `DoneEvent` / `ChatMessage` defined before use.
- Spec gap: `DoneEvent.timedOut` not in design TypeScript sketch — document in task 6 IPC follow-up.

**Satisfaction estimate: 96%** — Plan is implementation-ready.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-30-add-local-llm-chat-interface-task-4-backend-rag-pipeline-llm-inference.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — one fresh subagent per task, review between tasks.
2. **Inline Execution** — use executing-plans skill with checkpoints in this session.

Which approach do you want?
