# Local LLM Chat Task 1 Infrastructure Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 1 for `add-local-llm-chat-interface` by proving the Rust-side LLM and embedding stack on Windows, recording approved crate and model-asset provenance with explicit `docs/DEPENDENCY_SECURITY.md` gates, landing a single global provisioning guard shared across both LLM and embedding downloads, and updating developer documentation before any later LLM or embedding commands are built.

**Architecture:** This work is a gated infrastructure spike, not feature delivery. First, record the approved dependency names, versions, upstream provenance, dependency-security checklist completion, Windows MSVC findings, interruptibility decision, approved model asset measurements, and embedding bundle inventory in a repo-local spike ledger while keeping compile experiments in temporary scratch crates outside the repository. The pre-manifest gate stays closed until both approved asset rows (TinyLlama and the embedding bundle) are complete with the chosen hash strategy, download-size, installed-size, and peak-RAM measurements, plus the enforced thresholds derived from those measurements. Second, once the spike unblocks the stack, land only the minimal repo changes needed for future tasks: approved Cargo dependencies, a shared provisioning support module with one global provisioning lease across both asset types and deterministic resource-threshold helpers derived from the approved asset metadata, Tauri-managed state registration, and `DEVELOPMENT.md` guidance for provisioning and offline-after-provisioning behavior.

**Tech Stack:** Rust 2021, Tauri v2, Cargo, Windows MSVC toolchain, `reqwest` streaming downloads, approved LLM crate, approved embedding crate, approved RAM/disk probe crate, Markdown docs.

---

## Planned File Structure

- Create: `docs/dev/local_llm_infrastructure_spike.md`
  Purpose: Source-of-truth spike ledger for dependency approval, `docs/DEPENDENCY_SECURITY.md` checklist completion, Windows compile findings, interruptibility findings, approved model URLs/versions/hash strategies/download sizes/installed sizes/peak RAM values, and the verified embedding bundle inventory.
- Create: `apps/desktop/src-tauri/src/commands/provisioning.rs`
  Purpose: Shared Rust support for Task 1.7 and later model commands: approved asset metadata, `SpellbookVault/models/` path helpers, consolidated system-resource thresholds, and one global provisioning/download guard shared across both LLM and embedding downloads.
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
  Purpose: Export `provisioning` so later `llm.rs` and `embeddings.rs` can reuse it.
- Modify: `apps/desktop/src-tauri/src/lib.rs`
  Purpose: Register `Arc<ProvisioningState>` in Tauri managed state next to the pool and vault maintenance state.
- Modify: `apps/desktop/src-tauri/Cargo.toml`
  Purpose: Add only the approved Rust crates from the spike ledger.
- Modify: `apps/desktop/src-tauri/Cargo.lock`
  Purpose: Preserve deterministic Cargo resolution after the approved dependency additions.
- Modify: `docs/DEVELOPMENT.md`
  Purpose: Publish the verified Windows toolchain requirements, provisioning flow, approved model asset metadata, verified side-load destinations, and the offline-after-provisioning guarantee.

## Guardrails

- Do not change `apps/desktop/src-tauri/Cargo.toml` or `apps/desktop/src-tauri/Cargo.lock` until the spike ledger records the exact approved crate names, versions, registry pages, upstream repositories, approval notes, and completed provenance checklist items from `docs/DEPENDENCY_SECURITY.md` for the LLM crate, embedding crate, `reqwest`, the RAM/disk probe crate, and both approved model-asset rows (TinyLlama and the embedding bundle).
- Reqwest feature rule: enable only the `stream` feature unless the approved spike ledger records another exact required feature plus the reason it is needed. Do not pre-enable unrelated `reqwest` features during Task Group 1.
- Keep all compile experiments in scratch crates under `$env:TEMP\spellbook-llm-spikes\`; do not create throwaway workspace members inside the repository.
- If either blocking spike fails (`llama-cpp-rs`-family compile on Windows, or interruptibility proof), or if the Outcome B fallback note is incomplete, mark the corresponding spike gate failed in the ledger, keep the latest ledger commit as the blocker record, stop Task Group 1 before Task 4, and hand the blocker to the project maintainer/change owner for an alternate dependency decision. Do not revert the docs or land repo manifest changes.
- Reuse `AppError::Validation` for user-facing “already in progress” guard failures instead of inventing a new error channel.
- Successful Windows MSVC findings require every field and completion checkbox in `## Windows MSVC Findings` to be filled. Blank values, `TBD`, or `unknown` entries are blockers.
- RAM/disk probe selection rule: first check the official docs or upstream repos for this approved stack for a canonical probe crate recommendation. If an official source names one, review only that exact crate against the provenance checklist in `docs/DEPENDENCY_SECURITY.md`. If no official source recommends any probe crate, `sysinfo` may be approved only after it passes that same provenance checklist. If the official crate or `sysinfo` cannot satisfy every checklist item, mark Task 1 blocked, record the blocker plus escalation note in the ledger, hand the blocker to the project maintainer/change owner, and stop instead of looping through alternate crates or guessing an unreviewed fallback.
- Asset validation must follow the `## Asset Measurement and Hash Rules` section in the spike ledger. Record separate download size, installed size, and peak RAM measurements for each approved asset; disk thresholds derive from the download/install footprint, while RAM thresholds derive only from peak RAM.
- Task Group 1 uses one global provisioning guard across both LLM and embedding downloads. Concurrent reindex work, queued provisioning, and mid-download cancellation semantics are explicitly out of scope for this plan.
- Ordering rule: after Task 1 creates the ledger and both scratch crates, Tasks 2 and 3 may proceed in parallel. Task 4 stays blocked until both `## LLM Spike Gate` and `## Embedding Spike Gate` are fully checked, and `## Pre-Manifest Completion Gate` is complete.
- Tie the provisioning thresholds to the approved asset measurements recorded in the ledger. If any approved measurement exceeds the current 800 MB disk or 1.5 GB RAM baselines, record the higher enforced threshold and carry that exact value into Task 4 and Task 5 instead of repeating the stale assumption.

### Task 1: Create the Spike Ledger and Scratch Workspaces

**Files:**
- Create: `docs/dev/local_llm_infrastructure_spike.md`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\llm-compile\Cargo.toml`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\embed-compile\Cargo.toml`

- [x] **Step 1: Create the spike ledger with the exact review sections the later tasks need**

```markdown
# Local LLM Infrastructure Spike

## Dependency Approval
| Purpose | Spec label / runtime nickname | Exact crates.io package name | Approved version | Required features | Registry URL | Upstream repo | Approval notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM runtime | llama-cpp-rs family / approved LLM runtime |  |  | `none` or exact feature list |  |  | Record the exact crates.io package name from official docs if the upstream repo name differs |
| Embeddings | approved embedding runtime |  |  | `none` or exact feature list |  |  | Record the exact crates.io package name from official docs/runtime; do not guess from the repo nickname |
| Download client | reqwest | reqwest |  | `stream` |  |  | Reqwest is only approved here when `stream` is recorded; do not enable any other feature unless the spike ledger records the exact additional requirement |
| RAM/disk probe | approved system resource probe / evaluate `sysinfo` first | sysinfo |  | `none` or exact feature list |  |  | `sysinfo` is the default first candidate only. If provenance fails or an official source points elsewhere, record the rejection reason, replace this row with the exact official crate, and keep the manifest gate blocked until that crate passes the same review. If no official recommendation exists and `sysinfo` fails the checklist, Task 1 is blocked and must be escalated to the project maintainer/change owner |

Manifest edits stay blocked until the table above is complete and every dependency-security checklist item below is checked.

## Dependency Security Checklist (`docs/DEPENDENCY_SECURITY.md` provenance checklist)

### Crate Approval Checks
| Check | LLM runtime | Embeddings | reqwest | RAM/disk probe |
| --- | --- | --- | --- | --- |
| Exact canonical package name verified from official docs or upstream repo | [ ] | [ ] | [ ] | [ ] |
| crates.io registry page reviewed | [ ] | [ ] | [ ] | [ ] |
| Registry metadata points to the canonical upstream repository | [ ] | [ ] | [ ] | [ ] |
| crates.io is the only source; no git/url/alternate registry dependency required | [ ] | [ ] | [ ] | [ ] |
| Suspicious naming, ownership, and publish-history review passed | [ ] | [ ] | [ ] | [ ] |
| Approval note captured in `## Dependency Approval` | [ ] | [ ] | [ ] | [ ] |

### Model Asset Approval Checks
| Check | TinyLlama GGUF | Embedding bundle/archive |
| --- | --- | --- |
| Exact source URL verified from official upstream/release page | [ ] | [ ] |
| Approved version / release tag recorded | [ ] | [ ] |
| Publisher / repository owner matches the approved upstream | [ ] | [ ] |
| Hash strategy recorded and follows `## Asset Measurement and Hash Rules` | [ ] | [ ] |
| Download size bytes recorded | [ ] | [ ] |
| Installed size bytes recorded | [ ] | [ ] |
| Peak RAM bytes recorded from the first approved initialization/load path measurement | [ ] | [ ] |
| Final destination path recorded under `SpellbookVault/models/` | [ ] | [ ] |

## Asset Measurement and Hash Rules
- `download_size_bytes` = exact fetched archive or file bytes transferred for the approved asset.
- `installed_size_bytes` = final on-disk footprint under `SpellbookVault/models/` after extraction or copy completes.
- `peak_ram_bytes` = measured during the first approved model initialization or load path for that asset type.
- Peak RAM measurement procedure for each approved asset type:
  1. Record `baseline_free_ram_bytes` from the approved probe immediately before the first approved initialization or load path begins on an otherwise idle machine.
  2. Start the first approved initialization or load path for that asset type and sample `free_ram_bytes` every 250 ms with the same probe until the runtime reports ready for its first inference call without triggering further downloads.
  3. Record `minimum_free_ram_bytes_observed` during that window.
  4. Compute `peak_ram_bytes = baseline_free_ram_bytes - minimum_free_ram_bytes_observed`.
  5. Record the baseline, minimum, and computed delta in `### Peak RAM Measurement Log`, then copy the computed delta into the matching `## Approved Model Assets` row.
- Single-file assets such as TinyLlama GGUF use a single-file SHA-256. For these assets, `download_size_bytes` and `installed_size_bytes` should usually match, and `peak_ram_bytes` still comes only from the first approved initialization/load-path measurement.
- Archive-backed or multi-file bundles with a stable upstream archive must record both the archive SHA-256 and the per-file SHA-256 inventory after extraction. Use the archive hash for download validation and the per-file inventory for installed-layout validation.
- Multi-file bundles without a stable upstream archive hash must record the per-file SHA-256 inventory and, if the upstream publishes one, the approved manifest hash. Do not reduce this to a single bundle nickname.
- Disk-threshold rule for single-file assets: `required_free_disk_bytes = max(800 MB baseline, installed_size_bytes)`.
- Disk-threshold rule for archive installs: `required_free_disk_bytes = max(800 MB baseline, download_size_bytes + installed_size_bytes)` unless the spike proves a lower staged footprint and records the exact alternate formula in the asset notes.
- RAM-threshold rule: `required_free_ram_bytes = max(1.5 GB baseline, peak_ram_bytes)` when RAM applies. Never derive the RAM threshold from download size or installed size.

### Peak RAM Measurement Log
| Asset | Baseline free RAM bytes | First approved initialization/load path | Sampling cadence | Minimum free RAM bytes observed | Peak RAM bytes (= baseline - minimum) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TinyLlama GGUF |  |  | `250 ms` |  |  | Copy the computed delta into the TinyLlama row in `## Approved Model Assets` |
| Embedding bundle/archive |  |  | `250 ms` |  |  | Copy the computed delta into the embedding bundle row in `## Approved Model Assets` |

## Windows MSVC Findings
- Host target triple:
- `rustc --version`:
- `cargo --version`:
- Visual Studio Build Tools workload:
- Visual Studio Build Tools version:
- Windows SDK full version string (for example, `10.0.22621.0`):
- Required environment variables or compiler flags (`none` if none were needed):
- LLM scratch crate command + result:
- Embedding scratch crate command + result:
- Blocking notes:

### Windows MSVC Completion Gate
- [ ] Host target triple recorded
- [ ] `rustc --version` recorded
- [ ] `cargo --version` recorded
- [ ] Visual Studio Build Tools workload recorded
- [ ] Visual Studio Build Tools version recorded
- [ ] Windows SDK full version string recorded
- [ ] Required environment variables or compiler flags recorded (`none` if none)
- [ ] LLM scratch crate command + result recorded
- [ ] Embedding scratch crate command + result recorded
- [ ] No field above is blank, `TBD`, or `unknown`

## Interruptibility Findings
- Status: `pending`
- Acceptance rule:
  - Outcome A is accepted only when the exact cooperative stop API and the scratch proof command/snippet reference are recorded.
  - Outcome B is accepted only when the blocking prototype/decision note is complete with the exact scratch reference, worker boundary, stop primitive, polling boundary, and unsupported cancellation paths.
  - If either acceptance rule is unmet, Task 1 remains blocked and `Cargo.toml / Cargo.lock edits permitted` must stay unchecked.

## Pre-Manifest Completion Gate
- [ ] Dependency Approval table complete for all four rows and all approval fields
- [ ] Dependency Security Checklist complete for all four crates and both approved model assets
- [ ] Windows MSVC Completion Gate complete with every field filled
- [ ] Interruptibility Findings records Outcome A or Outcome B, and the chosen outcome satisfies the acceptance rule above
- [ ] Embedding Bundle Layout records discovery source, approved bundle version, exact required files, and hash scope
- [ ] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle, including baseline free RAM, minimum observed free RAM, and computed delta
- [ ] Approved Model Assets TinyLlama row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [ ] Approved Model Assets embedding bundle row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [ ] LLM Spike Gate final box checked
- [ ] Embedding Spike Gate final box checked
- [ ] Cargo.toml / Cargo.lock edits permitted

## Embedding Bundle Layout
- Discovery source(s):
- Approved bundle version lock:
- Approved archive / manifest hash:
- Hash strategy:
- Closed-set rule: missing file, extra file, or hash mismatch blocks provisioning for this v1 bundle

### Required File Inventory
| Relative path | Source | Size bytes | SHA-256 | Notes |
| --- | --- | --- | --- | --- |

## Approved Model Assets
| Asset | Source URL | Approved version | SHA-256 / hash strategy | Download size bytes | Installed size bytes | Peak RAM bytes | Required free disk bytes | Required free RAM bytes | Destination under SpellbookVault/models/ | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

- [x] **Step 2: State the dependency-security stop gate in the ledger before any manifest work**

Add the manifest stop note plus the concrete provenance checklist sections from `docs/DEPENDENCY_SECURITY.md` directly under `## Dependency Approval`, and leave every checkbox in `## Dependency Security Checklist` and `## Pre-Manifest Completion Gate` unchecked until Tasks 2-3 fill every required section.

- [x] **Step 3: Create two scratch crates outside the repo**

Run:

```powershell
$spikeRoot = Join-Path $env:TEMP "spellbook-llm-spikes"
Remove-Item $spikeRoot -Recurse -Force -ErrorAction Ignore
New-Item -ItemType Directory -Path $spikeRoot | Out-Null
cargo new --bin (Join-Path $spikeRoot "llm-compile")
cargo new --bin (Join-Path $spikeRoot "embed-compile")
```

Expected: both scratch crates are created outside the repository so compile experiments do not mutate tracked manifests.

- [ ] **Step 4: Commit the repo-local ledger scaffold**

```bash
git add docs/dev/local_llm_infrastructure_spike.md
git commit -m "docs: scaffold local llm infrastructure spike ledger"
```

### Task 2: Approve Exact Dependency Names and Prove the LLM Spike on Windows

**Files:**
- Modify: `docs/dev/local_llm_infrastructure_spike.md`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\llm-compile\Cargo.toml`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\llm-compile\src\main.rs`

- [x] **Step 1: Record the exact approved crate identities before touching repo manifests**

From the official project documentation or upstream repositories, fill the ledger rows for the LLM crate, `reqwest`, and the RAM/disk probe crate. For the RAM/disk probe row, first look for an official source for this stack that explicitly recommends a canonical probe crate. If one exists, review only that exact crate against the same provenance checklist captured from `docs/DEPENDENCY_SECURITY.md`. If no official source recommends any probe crate, review `sysinfo` as the fallback candidate against that same checklist. Each row must include the exact crates.io package name, approved version, required features (`stream` only for `reqwest` unless the ledger records another exact required feature, otherwise `none` or the explicit feature list), registry URL, upstream repository, and an approval note stating whether the spec label differs from the package name used in manifests. Then check the corresponding `## Dependency Security Checklist` crate boxes one by one. If the official crate or `sysinfo` cannot satisfy every checklist item, mark Task 1 blocked, record the blocker and escalation note in the ledger, hand the blocker to the project maintainer/change owner, leave the pre-manifest gate blocked, and stop instead of guessing an alternate crate or continuing the search.

- [x] **Step 2: Add the approved crates to the LLM scratch crate and prove MSVC compilation**

Edit the scratch `Cargo.toml` so it contains only the approved LLM crate, `reqwest` with only the `stream` feature unless the approved spike ledger records another required feature, and the approved RAM/disk probe crate. Then run:

```powershell
Set-Location (Join-Path $env:TEMP "spellbook-llm-spikes\llm-compile")
cargo check
```

Expected: `cargo check` succeeds on the active Windows MSVC toolchain. On success, immediately record the exact verified prerequisites in `## Windows MSVC Findings`: host target triple, `rustc` version, `cargo` version, Visual Studio Build Tools workload, Visual Studio Build Tools version, the full installed Windows SDK version string, and any required environment variables or compiler flags (write `none` if nothing extra was needed), plus the exact scratch command and result. Check `### Windows MSVC Completion Gate` only after every field is filled; blank, `TBD`, or `unknown` entries are blockers. If it fails, record the same attempted prerequisites plus the exact blocker, mark `## LLM Spike Gate` failed with that blocker, keep the ledger commit as the blocker record, hand the blocker to the project maintainer/change owner, and stop before Task 4.

- [x] **Step 3: Prove or reject cooperative interruption for generation**

Use the smallest official streaming or token-callback example from the approved LLM crate to determine whether generation can be stopped cooperatively. Record one of these exact outcomes in `## Interruptibility Findings`:

```markdown
- Outcome A: Native cooperative interruption exists. Later `llm_cancel_generation` will use: <exact callback / handle / stop API>.
- Outcome B: No native interruption exists.
  - Blocking prototype/decision note:
    - Scratch prototype or experiment summary: <exact temp path, command, or snippet reference>
    - Approved worker boundary: dedicated inference worker owns the model/session
    - Stop primitive: `<exact atomic type>` checked at `<exact token callback / loop boundary>`
    - Polling boundary: `<exact callback / loop site where the stop primitive is observed>`
    - Unsupported cancellation paths: no thread kill, process kill, or undocumented FFI interruption is attempted
    - Acceptance decision: Outcome B may unblock Task 4 only after every bullet above is filled
```

If neither outcome can be proven in the scratch spike, or if Outcome B is missing any required bullet, write `Task 1 blocked: interruptibility proof incomplete` in the ledger, mark `## LLM Spike Gate` failed with the same blocker, commit the ledger as the blocker record, hand the blocker to the project maintainer/change owner, and stop before Task 4; do not revert the docs.

- [x] **Step 4: Mark the LLM spike gate as pass or fail**

Append a checklist to the ledger:

```markdown
## LLM Spike Gate
- [ ] Dependency-security crate checks passed for the LLM runtime, `reqwest`, and RAM/disk probe
- [ ] Exact crate names approved
- [ ] Approved versions recorded
- [ ] Windows MSVC Completion Gate checked
- [ ] Interruptibility outcome accepted by the explicit accept/block rule
- [ ] LLM Spike Gate passed
- [ ] LLM Spike Gate failed

Blocker note:
```

On success, check only `LLM Spike Gate passed`. On failure, leave the pass line unchecked, check `LLM Spike Gate failed`, record the exact blocker under `Blocker note`, keep the ledger commit, hand the blocker to the project maintainer/change owner, and stop before Task 4. Task 4 still remains blocked until Task 3 also checks `## Embedding Spike Gate` and the shared `## Pre-Manifest Completion Gate`.

- [ ] **Step 5: Commit the recorded LLM findings or blocker record**

```bash
git add docs/dev/local_llm_infrastructure_spike.md
git commit -m "docs: record local llm dependency approval and windows spike findings"
```

### Task 3: Prove the Embedding Spike and Freeze the Side-Load Layout

**Files:**
- Modify: `docs/dev/local_llm_infrastructure_spike.md`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\embed-compile\Cargo.toml`
- Temporary (do not commit): `$env:TEMP\spellbook-llm-spikes\embed-compile\src\main.rs`

- [x] **Step 1: Record the exact embedding crate identity and version**

Fill the `Embeddings` row in the spike ledger with the exact approved crates.io package name from official docs/runtime, version, required features (`none` if none are needed), registry URL, upstream repository, and an approval note stating whether the runtime or repo nickname differs from the package name that will appear in `Cargo.toml`. Then check the embedding column in `## Dependency Security Checklist` only after each crate-approval verification item is complete.

- [x] **Step 2: Add the approved embedding crate to the scratch crate and prove MSVC compilation**

Edit `$env:TEMP\spellbook-llm-spikes\embed-compile\Cargo.toml` so it contains exactly one dependency entry for the approved embedding crate and the exact feature list recorded in the ledger. Edit `$env:TEMP\spellbook-llm-spikes\embed-compile\src\main.rs` to the smallest compile-only probe that imports the crate's canonical embedder/model type from the official docs, constructs the documented builder/config with a placeholder local path if the type checker requires it, and type-checks one documented embed/encode call or builder finalization. The scratch crate is compile-only: do not add network download code, reindex logic, concurrency primitives, or cancellation logic.

Run:

```powershell
Set-Location (Join-Path $env:TEMP "spellbook-llm-spikes\embed-compile")
cargo check
```

Expected: `cargo check` succeeds on Windows MSVC with the approved embedding crate. On success, append the exact verified Build Tools, full Windows SDK version string, toolchain, and required flags to `## Windows MSVC Findings` if they differ from the LLM scratch run, or restate that the same prerequisites were sufficient so no required field remains blank. Record the exact scratch command and result, then check `### Windows MSVC Completion Gate` only if every field is now filled. If it fails, document the blocker in `## Windows MSVC Findings`, mark `## Embedding Spike Gate` failed with that blocker, keep the ledger commit as the blocker record, and stop before Task 4.

- [x] **Step 3: Freeze the verified side-load destination and layout**

Derive the required embedding files from official runtime documentation plus inspection of the approved bundle staged in a temp directory or runtime cache. Apply the hash-selection rules from `## Asset Measurement and Hash Rules`: if a stable upstream archive exists, record both the archive SHA-256 and the per-file inventory; otherwise record the per-file inventory plus the upstream manifest hash when available. Record both discovery sources in `## Embedding Bundle Layout`, record the exact approved bundle version, the archive or manifest hash, and the chosen hash strategy, then fill `### Required File Inventory` with one row per required file (relative path, source, size bytes, SHA-256, notes). Freeze the approved layout using this destination shape:

```text
SpellbookVault/
  models/
    tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
    embeddings/
      all-MiniLM-L6-v2/
        <verified bundle contents>
```

The ledger entry must enumerate every file that the approved embedding runtime requires, note the exact approved bundle version, and state that the frozen layout is specific to that approved v1 bundle. Treat the inventory as a closed-set contract for Task Group 1: if a file is missing, an extra file appears, the version changes, or any recorded hash changes, provisioning stays blocked until the bundle is re-spiked. Also record the hash-validation scope the importer will enforce later (single manifest hash, per-file hashes, or both).

- [x] **Step 4: Fill the approved model asset table**

Before filling `## Approved Model Assets`, create entries in `### Peak RAM Measurement Log` for both approved asset types using the same reproducible procedure from `## Asset Measurement and Hash Rules`: record `baseline_free_ram_bytes`, run the first approved initialization or load path, sample `free_ram_bytes` every 250 ms until the asset is ready for its first inference call, record `minimum_free_ram_bytes_observed`, and compute `peak_ram_bytes` as the baseline-minus-minimum delta. Use `TinyLlama GGUF -> first approved model load in the chosen LLM runtime` and `Embedding bundle/archive -> first approved embedder or model initialization in the chosen embedding runtime` as the measurement-path descriptions in that log. Then record both approved asset rows in `## Approved Model Assets` before any manifest edit is allowed. For TinyLlama, record the final URL, version, single-file SHA-256, download size bytes, installed size bytes, the computed `peak_ram_bytes`, derived free-disk threshold, derived free-RAM threshold, and the exact destination path under `SpellbookVault/models/`. For the embedding bundle, record the final URL, version, chosen hash strategy (archive hash plus per-file hashes when a stable archive exists; otherwise per-file hashes plus the upstream manifest hash when available), download size bytes, installed size bytes, the computed `peak_ram_bytes`, derived free-disk threshold, derived free-RAM threshold, and the exact destination path under `SpellbookVault/models/`. Derive each enforced threshold from the correct measurement source: single-file disk thresholds come from installed size, archive-backed bundle disk thresholds come from download size plus installed size unless the spike records a lower staged footprint, and RAM thresholds always come from peak RAM bytes. If any approved measurement exceeds the current 800 MB disk or 1.5 GB RAM assumptions, record the higher enforced threshold here and carry that exact value forward into Task 4 code and Task 5 docs.

- [x] **Step 5: Mark the embedding spike gate as pass or fail**

Append a checklist to the ledger:

```markdown
## Embedding Spike Gate
- [ ] Dependency-security crate checks passed for the embedding runtime
- [ ] Exact embedding crate name approved
- [ ] Approved embedding version recorded
- [ ] Windows MSVC Completion Gate checked
- [ ] Embedding Bundle Layout frozen with discovery source, version lock, archive or manifest hash, and the full required file inventory
- [ ] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle
- [ ] Approved Model Assets TinyLlama row complete
- [ ] Approved Model Assets embedding bundle row complete
- [ ] Embedding Spike Gate passed
- [ ] Embedding Spike Gate failed

Blocker note:
```

On success, check only `Embedding Spike Gate passed`. On failure, leave the pass line unchecked, check `Embedding Spike Gate failed`, record the exact blocker under `Blocker note`, keep the ledger commit, hand the blocker to the project maintainer/change owner, and stop before Task 4. Task 4 remains blocked until Task 2 also checks `## LLM Spike Gate` and the shared `## Pre-Manifest Completion Gate`.

- [ ] **Step 6: Commit the embedding findings or blocker record**

```bash
git add docs/dev/local_llm_infrastructure_spike.md
git commit -m "docs: record embedding spike findings and approved model layout"
```

### Task 4: Land the Approved Cargo Changes and Shared Provisioning Support Module

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/provisioning.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [x] **Step 1: Complete the explicit pre-manifest gate before any Cargo edits**

Open `docs/dev/local_llm_infrastructure_spike.md` and check the `## Pre-Manifest Completion Gate` section only after verifying all of these conditions:

- [ ] Dependency Approval has the exact crates.io package name, approved version, required features, registry URL, upstream repo, and approval notes for the LLM, Embeddings, `reqwest`, and RAM/disk probe rows
- [ ] Dependency Security Checklist is fully checked for all four crates and both approved model assets
- [ ] Windows MSVC Completion Gate is fully checked; blank, `TBD`, or `unknown` fields are blockers
- [ ] Interruptibility Findings records Outcome A or Outcome B, and the chosen outcome satisfies the explicit acceptance rule
- [ ] Embedding Bundle Layout records the discovery source(s), approved bundle version, archive/manifest hash, exact required files, and hash scope
- [ ] Peak RAM Measurement Log is complete for TinyLlama and the embedding bundle, with baseline free RAM, minimum observed free RAM, and computed deltas recorded before the final asset rows are copied forward
- [ ] Approved Model Assets has two completed approved rows: TinyLlama GGUF and the embedding bundle, each with hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [ ] If any measured approved size exceeded the current 800 MB / 1.5 GB baselines, the higher enforced thresholds are recorded and will be copied into `provisioning.rs` and `docs/DEVELOPMENT.md`
- [ ] Neither `## LLM Spike Gate` nor `## Embedding Spike Gate` is marked failed; if either failed, stop here, treat the latest ledger commit as the blocker record, and hand the blocker to the project maintainer/change owner
- [ ] `## LLM Spike Gate` and `## Embedding Spike Gate` are both fully checked with the pass line checked before `## Pre-Manifest Completion Gate` marks Cargo edits permitted

If any item is incomplete, stop here. Do not edit `Cargo.toml` or `Cargo.lock`.

- [x] **Step 2: Add only the approved dependencies to the repo manifest**

Copy the exact crate names and versions from `docs/dev/local_llm_infrastructure_spike.md` into `apps/desktop/src-tauri/Cargo.toml`. Enable only the `stream` feature for `reqwest` unless the approved spike ledger explicitly records another required feature and why it is needed, do not add git dependencies, and let Cargo update `apps/desktop/src-tauri/Cargo.lock` deterministically.

- [x] **Step 3: Create the shared provisioning support module**

Implement `apps/desktop/src-tauri/src/commands/provisioning.rs` with the minimum reusable surface for later tasks:

```rust
use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const BASELINE_MIN_FREE_RAM_BYTES: u64 = 1_500 * 1024 * 1024;
pub const BASELINE_MIN_FREE_DISK_BYTES: u64 = 800 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProvisioningTarget {
    Llm,
    Embeddings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExpectedFile {
    pub relative_path: &'static str,
    pub size_bytes: u64,
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetHashStrategy {
    SingleFileSha256 { sha256: &'static str },
    ArchiveSha256AndFileInventory {
        archive_sha256: &'static str,
        files: &'static [ExpectedFile],
    },
    FileInventoryOnly {
        files: &'static [ExpectedFile],
        manifest_sha256: Option<&'static str>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiskFootprint {
    SingleFile,
    Archive { staged_bytes: Option<u64> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SystemResources {
    pub free_ram_bytes: u64,
    pub free_disk_bytes: u64,
}

pub trait ResourceProbe: Send + Sync {
    fn snapshot(&self, models_dir: &Path) -> Result<SystemResources, AppError>;
}

#[derive(Clone)]
pub struct LiveResourceProbe {
    snapshot_fn: Arc<dyn Fn(&Path) -> Result<SystemResources, AppError> + Send + Sync>,
}

impl LiveResourceProbe {
    pub fn new(
        snapshot_fn: Arc<dyn Fn(&Path) -> Result<SystemResources, AppError> + Send + Sync>,
    ) -> Self {
        Self { snapshot_fn }
    }
}

impl ResourceProbe for LiveResourceProbe {
    fn snapshot(&self, models_dir: &Path) -> Result<SystemResources, AppError> {
        (self.snapshot_fn)(models_dir)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FixedResourceProbe {
    pub resources: SystemResources,
}

impl ResourceProbe for FixedResourceProbe {
    fn snapshot(&self, _models_dir: &Path) -> Result<SystemResources, AppError> {
        Ok(self.resources)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ApprovedModelAsset {
    pub download_url: &'static str,
    pub hash_strategy: AssetHashStrategy,
    pub destination_relative_path: &'static str,
    pub disk_footprint: DiskFootprint,
    pub download_size_bytes: u64,
    pub installed_size_bytes: u64,
    pub peak_ram_bytes: Option<u64>,
}

#[derive(Debug, Default, Clone)]
pub struct ProvisioningState {
    active_download: Arc<Mutex<Option<ProvisioningTarget>>>,
}

#[derive(Debug)]
pub struct ProvisioningLease {
    active_download: Arc<Mutex<Option<ProvisioningTarget>>>,
    target: ProvisioningTarget,
}

impl ProvisioningState {
    pub fn start_download(&self, target: ProvisioningTarget) -> Result<ProvisioningLease, AppError> {
        let mut slot = self
            .active_download
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if slot.is_some() {
            return Err(AppError::Validation(
                "A model download is already in progress.".to_string(),
            ));
        }

        *slot = Some(target);

        Ok(ProvisioningLease {
            active_download: Arc::clone(&self.active_download),
            target,
        })
    }
}

impl Drop for ProvisioningLease {
    fn drop(&mut self) {
        let mut slot = self
            .active_download
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if slot.as_ref() == Some(&self.target) {
            *slot = None;
        }
    }
}

pub fn required_free_disk_bytes(asset: &ApprovedModelAsset) -> u64 {
    let staged_disk_bytes = match asset.disk_footprint {
        DiskFootprint::SingleFile => asset.installed_size_bytes,
        DiskFootprint::Archive { staged_bytes } => {
            staged_bytes.unwrap_or(asset.download_size_bytes) + asset.installed_size_bytes
        }
    };

    BASELINE_MIN_FREE_DISK_BYTES.max(staged_disk_bytes)
}

pub fn required_free_ram_bytes(asset: &ApprovedModelAsset) -> Option<u64> {
    asset
        .peak_ram_bytes
        .map(|peak_ram_bytes| BASELINE_MIN_FREE_RAM_BYTES.max(peak_ram_bytes))
}

pub fn ensure_resources_available(
    asset: &ApprovedModelAsset,
    resources: SystemResources,
) -> Result<(), AppError> {
    let required_disk_bytes = required_free_disk_bytes(asset);
    if resources.free_disk_bytes < required_disk_bytes {
        return Err(AppError::Validation(
            "Not enough free disk space for model provisioning.".to_string(),
        ));
    }

    if let Some(required_ram_bytes) = required_free_ram_bytes(asset) {
        if resources.free_ram_bytes < required_ram_bytes {
            return Err(AppError::Validation(
                "Not enough free RAM for model provisioning.".to_string(),
            ));
        }
    }

    Ok(())
}

pub fn models_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("models")
}
```

Wire the concrete system-resource reader selected by the spike ledger into `LiveResourceProbe::new(...)`; do not leave a `panic!`, `unreachable!`, or other placeholder stub in `provisioning.rs` once Task 4 begins.

- [x] **Step 4: Implement and test the single global provisioning guard**

Use `ProvisioningState` to serialize all high-bandwidth provisioning work with one guard shared across both LLM and embedding downloads. The public API should return an owned `ProvisioningLease` that automatically releases the slot on `Drop`; do not use a borrowed lifetime-based guard sketch here. The `Drop` implementation must clear the active target only when the stored target matches the lease being dropped. Task Group 1 stops at the lease-based mutual exclusion boundary: do not add queueing, reindex locks, or download-cancellation APIs here.

```rust
impl ProvisioningState {
    pub fn start_download(&self, target: ProvisioningTarget) -> Result<ProvisioningLease, AppError> {
        let mut slot = self
            .active_download
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if slot.is_some() {
            return Err(AppError::Validation(
                "A model download is already in progress.".to_string(),
            ));
        }

        *slot = Some(target);

        Ok(ProvisioningLease {
            active_download: Arc::clone(&self.active_download),
            target,
        })
    }
}
```

Add unit tests in the same module for:

- first acquisition for `ProvisioningTarget::Llm` succeeds
- second acquisition for `ProvisioningTarget::Llm` while the first lease is still live returns `AppError::Validation`
- second acquisition for `ProvisioningTarget::Embeddings` while the first lease is still live returns `AppError::Validation`
- dropping the first lease releases the slot so a third acquisition succeeds deterministically
- `models_dir()` always resolves to `SpellbookVault/models`

Use these deterministic double-acquire patterns in the test suite:

```rust
#[test]
fn global_guard_blocks_same_target_until_first_lease_drops() {
    let state = ProvisioningState::default();

    let first = state
        .start_download(ProvisioningTarget::Llm)
        .expect("first lease should succeed");

    let second = state.start_download(ProvisioningTarget::Llm);
    assert!(matches!(
        second,
        Err(AppError::Validation(message))
            if message == "A model download is already in progress."
    ));

    drop(first);

    let third = state.start_download(ProvisioningTarget::Llm);
    assert!(third.is_ok());
}
```

```rust
#[test]
fn global_guard_blocks_second_target_until_first_lease_drops() {
    let state = ProvisioningState::default();

    let first = state
        .start_download(ProvisioningTarget::Llm)
        .expect("first lease should succeed");

    let second = state.start_download(ProvisioningTarget::Embeddings);
    assert!(matches!(
        second,
        Err(AppError::Validation(message))
            if message == "A model download is already in progress."
    ));

    drop(first);

    let third = state.start_download(ProvisioningTarget::Embeddings);
    assert!(third.is_ok());
}
```

- [x] **Step 5: Add testable resource-threshold helpers and wire managed state**

Implement a deterministic resource-probe abstraction so tests can validate the approved RAM and disk thresholds without relying on host machine values. Add a production `LiveResourceProbe` implementation for the real machine, constructed with the exact approved RAM/disk probe reader selected in the spike ledger, and a `FixedResourceProbe` test double in module tests. Add pure helper functions that:

- compute the enforced disk threshold for an asset from `ApprovedModelAsset::disk_footprint`, `download_size_bytes`, and `installed_size_bytes`
- compute the enforced RAM threshold from `ApprovedModelAsset::peak_ram_bytes`
- reject provisioning with `AppError::Validation` when a `SystemResources` snapshot is below either threshold

The enforced thresholds must come from the ledger-approved asset metadata, using the higher of the current baseline or the measured/documented approved requirement for that target. Disk checks must use installed size for single-file assets and download-plus-installed size for archive installs unless the spike ledger recorded a lower staged footprint; RAM checks must use peak RAM only. Do not leave `LiveResourceProbe` as a temporary stub: if the approved probe crate is not ready to wire here, Task Group 1 stays blocked at the ledger gate. Then update `commands/mod.rs` and `lib.rs` so the app exports `provisioning` and registers `Arc::new(ProvisioningState::default())` during startup. Reindex concurrency and full download-cancellation behavior remain out of scope for Task Group 1; this module only provides the shared guard and threshold helpers.

Add deterministic unit tests in the module for:

- single-file asset disk threshold uses `installed_size_bytes` and stays at the 800 MB baseline when the approved asset is smaller
- archive-backed asset disk threshold uses `download_size_bytes + installed_size_bytes` and rises above the baseline when the approved asset is larger
- RAM threshold stays at the 1.5 GB baseline when `peak_ram_bytes` is smaller
- RAM threshold rises above the baseline when `peak_ram_bytes` is larger
- RAM threshold ignores download and installed size when peak RAM is lower
- exact-threshold equality passes
- 1 byte below either threshold returns `AppError::Validation`

Use these concrete tests as the starting shape for the module tests:

```rust
#[test]
fn one_byte_below_archive_disk_threshold_returns_validation_error() {
    let asset = ApprovedModelAsset {
        download_url: "https://example.invalid/embeddings.zip",
        hash_strategy: AssetHashStrategy::ArchiveSha256AndFileInventory {
            archive_sha256: "abc",
            files: &[],
        },
        destination_relative_path: "embeddings/all-MiniLM-L6-v2",
        disk_footprint: DiskFootprint::Archive { staged_bytes: None },
        download_size_bytes: 600 * 1024 * 1024,
        installed_size_bytes: 500 * 1024 * 1024,
        peak_ram_bytes: Some(512 * 1024 * 1024),
    };

    assert_eq!(required_free_disk_bytes(&asset), 1_100 * 1024 * 1024);

    let result = ensure_resources_available(
        &asset,
        SystemResources {
            free_disk_bytes: 1_100 * 1024 * 1024 - 1,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
        },
    );

    assert!(matches!(
        result,
        Err(AppError::Validation(message))
            if message == "Not enough free disk space for model provisioning."
    ));
}
```

```rust
#[test]
fn models_dir_appends_models_folder() {
    let vault_root = Path::new(r"C:\SpellbookVault");
    assert_eq!(
        models_dir(vault_root),
        PathBuf::from(r"C:\SpellbookVault").join("models")
    );
}
```

This test suite is the Task 1.7 verification path; do not rely on host-machine RAM or disk values in tests.

- [ ] **Step 6: Run targeted Rust verification**

Run:

```bash
cd apps/desktop/src-tauri
cargo fmt
cargo check
cargo test provisioning
```

Expected: formatting is clean, the app compiles with the approved dependencies, and the provisioning module tests pass.

- [ ] **Step 7: Commit the shared infrastructure landing**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/commands/provisioning.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(tauri): add local model provisioning infrastructure spike support"
```

### Task 5: Publish the Verified Developer Guidance

**Files:**
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/dev/local_llm_infrastructure_spike.md`

- [x] **Step 1: Add a dedicated local-model provisioning section to `DEVELOPMENT.md`**

Before editing `docs/DEVELOPMENT.md`, verify that both rows in `docs/dev/local_llm_infrastructure_spike.md` under `## Approved Model Assets` are fully populated with URL, version, hash strategy, download size bytes, installed size bytes, peak RAM bytes, enforced thresholds, and final destination paths. If either row has a blank value, `TBD`, `unknown`, or any other placeholder, stop and finish the ledger first.

Document the verified provisioning guidance required by OpenSpec task 1.6:

```markdown
## Local Model Provisioning

- Required Windows toolchain: <verified MSVC / Build Tools requirements>
- Approved TinyLlama asset: <URL>, version `<version>`, verification strategy `single-file SHA-256 <hash>`, download size `<bytes>`, installed size `<bytes>`, peak RAM `<bytes>`, destination `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`
- Approved embedding asset: <URL>, version `<version>`, verification strategy `<archive hash + per-file hashes | per-file hashes + manifest hash>`, download size `<bytes>`, installed size `<bytes>`, peak RAM `<bytes>`, destination `SpellbookVault/models/embeddings/all-MiniLM-L6-v2/`
- Enforced resource thresholds: free disk `>= <exact bytes derived from the approved download/install footprint per asset>` and free RAM `>= <exact bytes derived from peak RAM for the approved target>`; if approved measurements exceeded the original 800 MB / 1.5 GB assumptions, publish the higher enforced values here
- Provisioning flow: download or verified side-load into `SpellbookVault/models/`, then normal operation stays offline
- Shared download guard: one global provisioning guard spans both LLM and embedding downloads; the second request returns `A model download is already in progress.`
- Python sidecar scope: the Python sidecar remains responsible for document import/export only; it does not provide LLM or embedding functionality for this stack
- Scope note: embedding reindex concurrency and mid-download cancellation are not part of Task Group 1
```

Do not leave placeholder markers such as `<...>`, `TBD`, `TODO`, or `unknown` in the published `docs/DEVELOPMENT.md` section.

- [x] **Step 2: Link the spike ledger from the development guide**

Add one sentence pointing maintainers to `docs/dev/local_llm_infrastructure_spike.md` for the raw provenance notes, Windows compile evidence, and the exact embedding bundle file list.

- [x] **Step 3: Reconcile the ledger with the published docs**

Ensure the URLs, versions, hash strategies, download sizes, installed sizes, peak RAM values, enforced thresholds, destination paths, MSVC requirements, and interruptibility outcome in `docs/DEVELOPMENT.md` exactly match the spike ledger. Confirm again that both approved model asset rows were fully populated before the guide edit started, and remove any placeholder markers such as `<...>`, `TBD`, `TODO`, or `unknown` from the published docs before committing. If the docs and ledger differ, or if either approved asset row is incomplete, fix the ledger first and then update the guide.

- [ ] **Step 4: Commit the documentation updates**

```bash
git add docs/DEVELOPMENT.md docs/dev/local_llm_infrastructure_spike.md
git commit -m "docs: publish local model provisioning requirements"
```

### Task 6: Final Verification and Handoff Gate

**Files:**
- Modify: `docs/dev/local_llm_infrastructure_spike.md` (checklist only, if needed)

- [ ] **Step 1: Run the full verification set for Task 1**

Run:

```bash
cd apps/desktop/src-tauri
cargo clippy --all-targets --all-features
cargo test
cd ..
pnpm tauri:check
```

Expected: Task 1 infrastructure changes compile and test cleanly in the desktop app context.

- [ ] **Step 2: Confirm the blocking spike status in the ledger**

Before closing the task group, ensure `docs/dev/local_llm_infrastructure_spike.md` clearly says one of the following:

- `Task 1 unblocked: approved dependencies, Windows compile proof, interruptibility strategy, and embedding bundle layout recorded.`
- `Task 1 blocked: <exact blocker>; do not start OpenSpec task groups 2-4 until resolved. Handoff to the project maintainer/change owner is required for any alternate dependency decision.`

Use the blocked form if any dependency-security checklist item, Windows MSVC completion checkbox, interruptibility acceptance field, required embedding file inventory row, or enforced-threshold value is incomplete.

- [ ] **Step 3: Commit the final verification state**

```bash
git add docs/dev/local_llm_infrastructure_spike.md
git commit -m "chore: finalize task 1 local llm infrastructure verification"
```

## Coverage Check

- OpenSpec 1.1 is covered by Tasks 1-3 before any repo manifest changes.
- OpenSpec 1.2 is covered by Task 2 scratch-crate MSVC verification.
- OpenSpec 1.3 is covered by Task 2 interruptibility proof plus the explicit accept/block rule for Outcome B.
- OpenSpec 1.4 is covered by Task 3 scratch-crate compile proof, closed-set bundle inventory, source/version/hash freeze, and the explicit Embedding Spike Gate.
- OpenSpec 1.5 is covered by Task 4 manifest and lockfile updates.
- OpenSpec 1.6 is covered by Task 5 published developer documentation.
- OpenSpec 1.7 is covered by Task 4's single global provisioning guard shared across both LLM and embedding downloads, deterministic resource-probe helpers, and unit tests, with later `llm_download_model` and `embeddings_download_model` commands reusing that state.
- Out of scope for OpenSpec Task Group 1: queued provisioning, embedding reindex concurrency control, and mid-download cancellation semantics.