# Python Sidecar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the Python sidecar by removing deprecated ML stub handlers (`embed` and `llm_answer`) and related code/tests, updating documentation, and marking the tasks as complete in the OpenSpec change checklist.

**Architecture:** Remove `handle_embed`, `_zero_vector`, `handle_llm_answer` and their registrations from `services/ml/spellbook_sidecar.py`. Remove the associated `test_embed_returns_vectors` from `services/ml/tests/test_sidecar.py`. Document these changes in `services/ml/AGENTS.md` and update `openspec/changes/add-local-llm-chat-interface/tasks.md`.

**Tech Stack:** Python 3, Pytest, Ruff, OpenSpec.

---

## Spec Snapshot (Task Group 5 & Documentation 11.5)

| Task | Requirement |
| ---- | ----------- |
| 5.1  | Remove `handle_embed` function and its `_zero_vector` helper from `services/ml/spellbook_sidecar.py` |
| 5.2  | Remove `handle_llm_answer` function from `services/ml/spellbook_sidecar.py` |
| 5.3  | Remove `"embed"` and `"llm_answer"` entries from the `handlers` dispatch dict in `main()` |
| 5.4  | Update sidecar tests in `services/ml/tests/` to remove any tests for the removed handlers |
| 5.5  | Run `ruff check services/ml/` and fix any linting issues introduced by the removals |
| 11.5 | Update `services/ml/AGENTS.md` to note that `embed` and `llm_answer` handlers were removed and why |

---

## Planned File Structure

| File | Action | Purpose |
| ---- | ------ | ------- |
| [spellbook_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/spellbook_sidecar.py) | Modify | Remove `_zero_vector`, `handle_embed`, `handle_llm_answer`, and their handlers entries |
| [test_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/tests/test_sidecar.py) | Modify | Remove `test_embed_returns_vectors` test case |
| [AGENTS.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/AGENTS.md) | Modify | Add a note explaining the removal of the ML handlers and their migration to Rust |
| [tasks.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-local-llm-chat-interface/tasks.md) | Modify | Mark tasks 5.1–5.5 and 11.5 as completed |

---

### Task 1: Clean up `services/ml/spellbook_sidecar.py`

**Files:**
- Modify: [spellbook_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/spellbook_sidecar.py#L40-L41) (Delete `_zero_vector`)
- Modify: [spellbook_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/spellbook_sidecar.py#L225-L235) (Delete `handle_embed` and `handle_llm_answer`)
- Modify: [spellbook_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/spellbook_sidecar.py#L805-L810) (Remove `"embed"` and `"llm_answer"` from `handlers`)

- [x] **Step 1.1: Remove `_zero_vector` helper**
Remove lines 40–41 from `services/ml/spellbook_sidecar.py`:
```python
def _zero_vector(size: int = 384) -> List[float]:
    return [0.0] * size
```

- [x] **Step 1.2: Remove `handle_embed` and `handle_llm_answer` functions**
Remove lines 225–235 from `services/ml/spellbook_sidecar.py`:
```python
def handle_embed(params: Dict[str, Any]) -> Dict[str, Any]:
    texts = params.get("texts") or []
    return {"vectors": [_zero_vector() for _ in texts]}


def handle_llm_answer(params: Dict[str, Any]) -> Dict[str, Any]:
    query = params.get("query") or ""
    contexts = params.get("contexts") or []
    citations = [c.get("citation") for c in contexts if c.get("citation")]
    answer = "(stub) Local-only answer for: " + query
    return {"answer": answer, "citations": citations, "meta": {"model": "stub"}}
```

- [x] **Step 1.3: Remove dispatcher entries in `main()`**
Modify `handlers` dictionary inside `main()` on lines 805–810:
```diff
         handlers = {
-            "embed": handle_embed,
-            "llm_answer": handle_llm_answer,
             "import": handle_import,
             "export": handle_export,
         }
```

- [x] **Step 1.4: Run Ruff check on sidecar to ensure syntax is valid**
Run: `..\..\.venv\Scripts\ruff.exe check .` (from directory `services/ml`)
Expected: No syntax or compilation errors.

---

### Task 2: Clean up tests in `services/ml/tests/`

**Files:**
- Modify: [test_sidecar.py](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/tests/test_sidecar.py#L22-L35) (Delete `test_embed_returns_vectors` test case)

- [x] **Step 2.1: Remove `test_embed_returns_vectors` test case**
Remove lines 22–35 from `services/ml/tests/test_sidecar.py`:
```python
def test_embed_returns_vectors():
    response = _run_sidecar(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "embed",
            "params": {"texts": ["alpha", "beta"]},
        }
    )
    assert "result" in response
    vectors = response["result"]["vectors"]
    assert len(vectors) == 2
    assert len(vectors[0]) == 384
```

- [x] **Step 2.2: Run pytest to verify all remaining sidecar tests pass**
Run: `..\..\.venv\Scripts\pytest.exe tests/` (from directory `services/ml`)
Expected: All remaining tests pass successfully.

- [x] **Step 2.3: Run Ruff check on `services/ml/` to ensure no linting issues remain**
Run: `..\..\.venv\Scripts\ruff.exe check .` (from directory `services/ml`)
Expected: No linting issues.

- [x] **Step 2.4: Commit code changes** (`7c5b60f`)
Run:
```powershell
git add services/ml/spellbook_sidecar.py services/ml/tests/test_sidecar.py
git commit -m "chore(sidecar): remove unused embed and llm_answer ML handlers and tests"
```

---

### Task 3: Update Documentation

**Files:**
- Modify: [AGENTS.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/services/ml/AGENTS.md)

- [x] **Step 3.1: Document removal of `embed` and `llm_answer` handlers in `services/ml/AGENTS.md`**
Add the following notice at the top of `services/ml/AGENTS.md` (after the metadata front-matter):
```markdown
> [!NOTE]
> As of the local LLM chat interface implementation (v2), the Python sidecar is used ONLY for document importing and exporting (parsing PDF, DOCX, Markdown, rendering HTML/Markdown print sheets). The `embed` and `llm_answer` handlers have been fully removed and migrated to native Rust commands in the Tauri backend.
```

- [x] **Step 3.2: Run Ruff check and commit documentation updates** (`b979947`)
Run:
```powershell
git add services/ml/AGENTS.md
git commit -m "docs(sidecar): document removal of ML handlers in AGENTS.md"
```

---

### Task 4: Update OpenSpec change checklist

**Files:**
- Modify: [tasks.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-local-llm-chat-interface/tasks.md)

- [x] **Step 4.1: Mark tasks 5.1–5.5 and 11.5 as completed in `openspec/changes/add-local-llm-chat-interface/tasks.md`**
Change the checkboxes to `[x]` for items 5.1 through 5.5:
```diff
- - [ ] 5.1 Remove `handle_embed` function and its `_zero_vector` helper from `services/ml/spellbook_sidecar.py`
- - [ ] 5.2 Remove `handle_llm_answer` function from `services/ml/spellbook_sidecar.py`
- - [ ] 5.3 Remove `"embed"` and `"llm_answer"` entries from the `handlers` dispatch dict in `main()`
- - [ ] 5.4 Update sidecar tests in `services/ml/tests/` to remove any tests for the removed handlers
- - [ ] 5.5 Run `ruff check services/ml/` and fix any linting issues introduced by the removals
+ - [x] 5.1 Remove `handle_embed` function and its `_zero_vector` helper from `services/ml/spellbook_sidecar.py`
+ - [x] 5.2 Remove `handle_llm_answer` function from `services/ml/spellbook_sidecar.py`
+ - [x] 5.3 Remove `"embed"` and `"llm_answer"` entries from the `handlers` dispatch dict in `main()`
+ - [x] 5.4 Update sidecar tests in `services/ml/tests/` to remove any tests for the removed handlers
+ - [x] 5.5 Run `ruff check services/ml/` and fix any linting issues introduced by the removals
```
And also for item 11.5:
```diff
- - [ ] 11.5 Update `services/ml/AGENTS.md` to note that `embed` and `llm_answer` handlers were removed and why
+ - [x] 11.5 Update `services/ml/AGENTS.md` to note that `embed` and `llm_answer` handlers were removed and why
```

- [x] **Step 4.2: Commit the spec updates** (`7db17a8`)
Run:
```powershell
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "chore(spec): mark task group 5 and 11.5 as completed in tasks spec"
```

---

## Grill-Me Review Log

### Round 1 — Pre-Implementation Check

| Question | Resolution |
| -------- | ---------- |
| Are there any other references to `embed` and `llm_answer`? | No, grep search confirmed no other references inside the Python service. |
| Are the commands to run Ruff and Pytest correct? | Yes, using `.venv` relative path (`..\..\.venv\Scripts\...`) from `services/ml` matches Windows OS. |
| Will the tests run correctly after deletion? | Yes, removing `test_embed_returns_vectors` matches the deletion of the handlers. All import/export tests should pass. |
| What are the spec files to update? | `openspec/changes/add-local-llm-chat-interface/tasks.md`. |

**Satisfaction estimate: 95%** — The plan is fully detailed and ready to execute.

---

## Implementation Complete

**Status:** All tasks finished (2026-06-12).

| Commit | Message |
| ------ | ------- |
| `7c5b60f` | `chore(sidecar): remove unused embed and llm_answer ML handlers and tests` |
| `b979947` | `docs(sidecar): document removal of ML handlers in AGENTS.md` |
| `7db17a8` | `chore(spec): mark task group 5 and 11.5 as completed in tasks spec` |

**Verification:** pytest 18 passed, ruff clean.

**Follow-up (out of plan scope):** `services/ml/README.md` still documents the removed `embed` RPC example.
