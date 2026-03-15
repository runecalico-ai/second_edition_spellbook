# Integrate Spell Hashing Ecosystem - Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update and create user and architecture documentation to accurately reflect the new hash-based deduplication, conflict resolution, spell versioning, and vault file storage behaviors introduced by the spell hashing ecosystem integration (Task 11).

**Architecture:** We will update existing documentation (like `bundle_format.md` or `character_profiles.md`) and create new user-facing guides in `docs/user/` to explain the new import/export semantics, conflict resolution UI, and the Vault feature.

**Tech Stack:** Markdown.

---

## Chunk 1: Update Existing Formats and Deduplication Logic

**Files:**
- Modify: `docs/bundle_format.md:96-122`

- [ ] **Step 1: Update `bundle_format.md` Deduplication section**

Replace the existing `## 3. Import Logic & Deduplication` section entirely with the following text:

```markdown
## 3. Import Logic & Deduplication

When importing a bundle (JSON or Markdown), the system performs the following logic to handle identity and prevent unwanted duplicate spells.

### 3.1 Character Collision
1. **Match**: Checks for existing character by `name`.
2. **Resolution**:
   - If **Overwrite** is selected: Updates existing character identity, clears old classes/spells, and inserts new ones.
   - If **Create New** is selected: Creates a new character with `(Imported)` appended to the name.

### 3.2 Spell Deduplication and Versioning
The Spellbook application identifies spells universally by their **Canonical Content Hash** (a SHA-256 fingerprint of the core rules content of the spell, ignoring metadata like tags or sources). This ensures precise spell versioning.

**Resolution Algorithm**:
1. For each spell in the import batch, its `content_hash` is computed.
2. The system checks the local database for an existing spell with that `content_hash`.
3. **If the exact hash exists**: 
   - The core spell is considered a duplicate and skipped automatically.
   - However, any **metadata** (e.g., new `tags` or `source_refs` attached to the imported version) is merged into the existing local spell, up to the defined limits.
4. **If the exact hash does NOT exist, but the `name` matches an existing spell**:
   - This triggers a **Conflict Resolution** prompt for the user (see Import/Export User Guide for details).
5. **If neither hash nor name exists**:
   - The spell is inserted as a brand new record into the global library.
```

- [ ] **Step 2: Commit updates for `bundle_format.md`**

```bash
git add docs/bundle_format.md
git commit -m "docs: update bundle format deduplication to describe hash-based logic"
```

## Chunk 2: Create Import/Export User Guide

**Files:**
- Create: `docs/user/import_export.md`

- [ ] **Step 1: Create the User Guide Document**

Create `docs/user/import_export.md` with the following content:

```markdown
# Importing and Exporting

The Spellbook application allows you to freely share characters and spell libraries using standard JSON bundles or `.zip` archives. When importing spells from external sources, the system employs a robust identification and conflict resolution system.

## Spell Versioning with Hashes
To guarantee consistency across different users, every spell generates a **content hash**—a unique digital fingerprint based purely on the spell's core mechanics (its level, casting time, distance, text, etc.). 
- Two spells with the exact same rules will formulate the exact same ID (hash).
- Metadata such as custom tags and reference books do not alter the hash.

## Hash-Based Deduplication
Because of hash tracking, you will never accidentally create duplicate spells when importing identical content:
- **Duplicates Skipped Automatically**: If you import a spell that perfectly matches the hash of a spell already in your library computationally, the system skips it completely.
- **Metadata Merging**: If the skipped incoming spell contains tags or source references you don't possess locally, those are thoughtfully merged onto your local spell automatically.

## Conflict Resolution
If you import a spell that shares a **name** with a spell in your database, but the **content hashes differ**, the system recognizes a version conflict. It halts the import for that spell to let you choose how to proceed:

* **Keep Existing**: The import is skipped, and your current version of the spell remains unchanged.
* **Replace with New**: Your local version of the spell is completely overwritten by the imported version. Characters that memorized the old version will seamlessly use the new one.
* **Keep Both**: The imported version is added as a completely separate spell in your library. To tell them apart, it receives a numeric suffix (e.g., `Fireball (1)`).
* **Apply to All**: Clicking this box applies your chosen action to any other conflicting spells found in your current import batch (for this current session only).

## Examples of Import Scenarios

**Scenario A: Re-importing a Community Bundle**
You download an updated "Vanilla 2e Spells" bundle. Because 98% of the spells are identical to the ones you already have (duplicates), the app rapidly skips all 98%. Only the 2% that were actually altered (updated versions) or brand new (new spells) trigger any action or conflict resolution, making large imports lightning-fast and harmless.

**Scenario B: Receiving a Friend's Homebrew Variation**
Your friend gives you their character holding a modified version of *Magic Missile* (dealing slightly more damage). Your app spots that the name matches but the rules (hash) differ, triggering the conflict dialog. You click **Keep Both**, storing it as *Magic Missile (1)* alongside your official copy.
```

- [ ] **Step 2: Commit new Import/Export user guide**

```bash
git add docs/user/import_export.md
git commit -m "docs: add user guide for import/export and conflict resolution"
```

## Chunk 3: Create Vault Documentation

**Files:**
- Create: `docs/user/vault.md`

- [ ] **Step 1: Create the Vault Document**

Create `docs/user/vault.md` with the following content:

```markdown
# The Spell Vault

Underneath the hood, the Spellbook application physically stores your spells as `.json` files in your workspace's underlying Vault directory.

## Hash-Based File Naming
To prevent accidental overwrites and make manual backup painless, the application uses **Hash-Based File Naming**. Every file is stored under `spells/{content_hash}.json` (e.g., `spells/a1b2c3d4...json`). 

Because the filename itself relies on the mathematical breakdown of the file's payload:
- It's impossible for a new spell version to accidentally overwrite another.
- Identical spells automatically reuse the same file securely.

## Vault Integrity Checks
Because the vault is heavily tied to file fingerprints, the application guarantees you never load corrupted or secretly-tampered data:
1. **Background Checks**: Before performing cleanup, the app always comprehensively verifies your files haven't drifted.
2. **Auto-Recovery**: If you accidentally delete a vault file off your hard drive, the database will silently regenerate it next time it synchronizes.
3. **Startup Validation**: You can configure the system to run a hard integrity check dynamically on startup via the `vault.integrityCheckOnOpen` setting toggle.

## Garbage Collection
If you're often overwriting or deleting spell lists, you might eventually stack up old file revisions in the raw `spells/` folder. The system periodically runs automated **Garbage Collection** (Vault Housekeeping) to identify spell files floating in the folder that are no longer referenced by any database entries, safely purging them to keep your computer's storage space tidy.
```

- [ ] **Step 2: Commit new Vault documentation**

```bash
git add docs/user/vault.md
git commit -m "docs: add user guide for spell vault"
```

