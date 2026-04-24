# Local LLM Infrastructure Spike

## Dependency Approval

Manifest edits stay blocked until the table below is complete and every dependency-security checklist item from `docs/DEPENDENCY_SECURITY.md` is checked for the approved crates and model assets.

| Purpose | Spec label / runtime nickname | Exact crates.io package name | Approved version | Required features | Registry URL | Upstream repo | Approval notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM runtime | llama-cpp-rs family / approved LLM runtime |  |  | `none` or exact feature list |  |  | Record the exact crates.io package name from official docs if the upstream repo name differs |
| Embeddings | approved embedding runtime |  |  | `none` or exact feature list |  |  | Record the exact crates.io package name from official docs/runtime; do not guess from the repo nickname |
| Download client | reqwest | reqwest |  | `stream` |  |  | Reqwest is only approved here when `stream` is recorded; do not enable any other feature unless the spike ledger records the exact additional requirement |
| RAM/disk probe | approved system resource probe / evaluate `sysinfo` first | sysinfo |  | `none` or exact feature list |  |  | `sysinfo` is the default first candidate only. If provenance fails or an official source points elsewhere, record the rejection reason, replace this row with the exact official crate, and keep the manifest gate blocked until that crate passes the same review. If no official recommendation exists and `sysinfo` fails the checklist, Task 1 is blocked and must be escalated to the project maintainer/change owner |

Manifest edits stay blocked until the table above is complete and every dependency-security checklist below is checked.

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
| TinyLlama GGUF |  |  |  |  |  |  |  |  | `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` | |
| Embedding bundle/archive |  |  |  |  |  |  |  |  | `embeddings/all-MiniLM-L6-v2/` | |

## LLM Spike Gate
- [ ] Dependency-security crate checks passed for the LLM runtime, `reqwest`, and RAM/disk probe
- [ ] Exact crate names approved
- [ ] Approved versions recorded
- [ ] Windows MSVC Completion Gate checked
- [ ] Interruptibility outcome accepted by the explicit accept/block rule
- [ ] LLM Spike Gate passed
- [ ] LLM Spike Gate failed

Blocker note:

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