# Update Spell Hashing Specifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Update the `integrate-spell-hashing-ecosystem` specification files to address inconsistencies and missing details identified during review, ensuring a robust and secure content-addressable storage system.

**Architecture:** Systematic update of the OpenSpec change artifacts to include requirements for `SourceRef` URLs, strict hash-based deduplication in the import logic, and explicit vault storage layouts.

**Tech Stack:** Markdown, OpenSpec.

---

### Task 1: Update Proposal and Design Documents

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/proposal.md`
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/design.md`

**Step 1: Update Proposal Scope**
- Add requirement for `SourceRef` to include `url` field.
- Refine Deduplication goal to specify "Strict Content-Addressable Deduplication".

**Step 2: Update Design Decisions**
- Update Decision #3 to include URL validation and deduplication logic.
- Update Decision #1 to clarify `spells/` subfolder layout in the vault.
- Update Decision #2 (Import) to explicitly mandate metadata merging for existing hashes.

### Task 2: Update Vault Specification

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/specs/vault/spec.md`

**Step 1: Detail Storage Layout**
- Explicitly define the `{vault_root}/spells/{content_hash}.json` path.
- Add requirement for Windows path length preemptive check (warning if > 240 chars).

**Step 2: Define GC Triggers**
- Add requirement for automatic GC after successful imports and a manual optimization trigger.

### Task 3: Update Import/Export Specification

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/specs/import-export/spec.md`

**Step 1: Hash-Based Deduplication**
- Change import identification from (name, level, source) to strictly `content_hash`.

**Step 2: Metadata Merging Rules**
- Add detailed rules for merging `tags` (alphabetical, cap at 100) and `source_refs` (existing first, cap at 50) upon finding a duplicate hash.

**Step 3: URL Security**
- Add explicit validation requirements for `SourceRef` URLs (protocol allowed list, XSS prevention).

### Task 4: Update Search Specification

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/specs/search/spec.md`

**Step 1: Query Security**
- Add requirement for robust FTS query escaping in both basic and advanced modes.

### Task 5: Sync Tasks and Verification Plans

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/verification.md`

**Step 1: Update Tasks**
- Ensure all new requirements (URLs, metadata merging, layout) are reflected in the task checklist.

**Step 2: Update Verification**
- Add test cases for `SourceRef` URL validation, metadata merging limits, and concurrent import deduplication.
