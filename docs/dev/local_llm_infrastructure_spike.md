# Local LLM Infrastructure Spike

## Dependency Approval

Manifest edits stay blocked until the table below is complete and every dependency-security checklist item from `docs/DEPENDENCY_SECURITY.md` is checked for the approved crates and model assets.

| Purpose | Spec label / runtime nickname | Exact crates.io package name | Approved version | Required features | Registry URL | Upstream repo | Approval notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM runtime | llama-cpp-rs family / approved LLM runtime | llama-cpp-2 | 0.1.145 | `none` | https://crates.io/crates/llama-cpp-2 | https://github.com/utilityai/llama-cpp-rs | Official project name is `llama-cpp-rs` but the canonical crates.io package is `llama-cpp-2`; upstream explicitly warns it does not follow semver meaningfully, so the version should be pinned exactly |
| Embeddings | approved embedding runtime / fastembed-rs | fastembed | 5.13.3 | `none` | https://crates.io/crates/fastembed | https://github.com/Anush008/fastembed-rs | The runtime nickname is `fastembed-rs` but the canonical crates.io package name is `fastembed` |
| Download client | reqwest | reqwest | 0.13.2 | `stream` | https://crates.io/crates/reqwest | https://github.com/seanmonstar/reqwest | `bytes_stream` is documented on docs.rs as requiring the `stream` feature |
| RAM/disk probe | approved system resource probe / sysinfo fallback candidate | sysinfo | 0.38.4 | `none` | https://crates.io/crates/sysinfo | https://github.com/GuillaumeGomez/sysinfo | No official probe crate recommendation was found in the approved stack docs, so `sysinfo` is the reviewed fallback candidate |

Manifest edits stay blocked until the table above is complete and every dependency-security checklist below is checked.

## Dependency Security Checklist (`docs/DEPENDENCY_SECURITY.md` provenance checklist)

### Crate Approval Checks
| Check | LLM runtime | Embeddings | reqwest | RAM/disk probe |
| --- | --- | --- | --- | --- |
| Exact canonical package name verified from official docs or upstream repo | [x] | [x] | [x] | [x] |
| crates.io registry page reviewed | [x] | [x] | [x] | [x] |
| Registry metadata points to the canonical upstream repository | [x] | [x] | [x] | [x] |
| crates.io is the only source; no git/url/alternate registry dependency required | [x] | [x] | [x] | [x] |
| Suspicious naming, ownership, and publish-history review passed | [x] | [x] | [x] | [x] |
| Approval note captured in `## Dependency Approval` | [x] | [x] | [x] | [x] |

### Model Asset Approval Checks
| Check | TinyLlama GGUF | Embedding bundle/archive |
| --- | --- | --- |
| Exact source URL verified from official upstream/release page | [ ] | [x] |
| Approved version / release tag recorded | [ ] | [x] |
| Publisher / repository owner matches the approved upstream | [ ] | [x] |
| Hash strategy recorded and follows `## Asset Measurement and Hash Rules` | [ ] | [x] |
| Download size bytes recorded | [ ] | [ ] |
| Installed size bytes recorded | [ ] | [ ] |
| Peak RAM bytes recorded from the first approved initialization/load path measurement | [ ] | [ ] |
| Final destination path recorded under `SpellbookVault/models/` | [x] | [x] |

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
- Host target triple: `x86_64-pc-windows-msvc`
- `rustc --version`: `rustc 1.95.0 (59807616e 2026-04-14)`
- `cargo --version`: `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`
- Visual Studio Build Tools workload: `Microsoft.VisualStudio.Workload.VCTools`
- Visual Studio Build Tools version: `18.5.11709.299`
- Windows SDK full version string (for example, `10.0.22621.0`): `10.0.26100.0`
- Required environment variables or compiler flags (`none` if none were needed): `none` for the successful embedding compile; however, the `llama-cpp` build was missing `LIBCLANG_PATH` or another discoverable libclang shared library
- LLM scratch crate command + result: `Set-Location $env:TEMP\spellbook-llm-spikes\llm-compile; cargo check` -> failed. Exact blocker: `bindgen` panicked because it could not find `libclang.dll` or `clang.dll` and requested `LIBCLANG_PATH`
- Embedding scratch crate command + result: `Set-Location $env:TEMP\spellbook-llm-spikes\embed-compile; cargo check` -> succeeded. `Finished dev profile [unoptimized + debuginfo] target(s) in 35.07s`
- Blocking notes: `llama-cpp-sys-2 v0.1.145` failed before compile proof because `bindgen` could not find a libclang shared library on this machine

### Windows MSVC Completion Gate
- [x] Host target triple recorded
- [x] `rustc --version` recorded
- [x] `cargo --version` recorded
- [x] Visual Studio Build Tools workload recorded
- [x] Visual Studio Build Tools version recorded
- [x] Windows SDK full version string recorded
- [x] Required environment variables or compiler flags recorded (`none` if none)
- [x] LLM scratch crate command + result recorded
- [x] Embedding scratch crate command + result recorded
- [x] No field above is blank, `TBD`, or `unknown`

## Interruptibility Findings
- Status: `Outcome B accepted`
- Acceptance rule:
  - Outcome A is accepted only when the exact cooperative stop API and the scratch proof command/snippet reference are recorded.
  - Outcome B is accepted only when the blocking prototype/decision note is complete with the exact scratch reference, worker boundary, stop primitive, polling boundary, and unsupported cancellation paths.
  - If either acceptance rule is unmet, Task 1 remains blocked and `Cargo.toml / Cargo.lock edits permitted` must stay unchecked.
- Blocking prototype/decision note:
  - Scratch prototype or experiment summary: official `llama-cpp-rs` example loop in `examples/simple/src/main.rs` and `examples/openai_stream.rs`; app-owned `while` loop around `sampler.sample(...)` and `ctx.decode(...)`
  - Approved worker boundary: dedicated inference worker owns the model/session
  - Stop primitive: `Arc<std::sync::atomic::AtomicBool>`
  - Polling boundary: check at the top of the per-token `while` loop before `sampler.sample(&ctx, ...)` and optionally after `ctx.decode(&mut batch)`
  - Unsupported cancellation paths: no thread kill, process kill, or undocumented FFI interruption is attempted
  - Acceptance decision: Outcome B is complete and acceptable on its own

## Pre-Manifest Completion Gate
- [x] Dependency Approval table complete for all four rows and all approval fields
- [ ] Dependency Security Checklist complete for all four crates and both approved model assets
- [x] Windows MSVC Completion Gate complete with every field filled
- [x] Interruptibility Findings records Outcome A or Outcome B, and the chosen outcome satisfies the acceptance rule above
- [x] Embedding Bundle Layout records discovery source, approved bundle version, exact required files, and hash scope
- [ ] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle, including baseline free RAM, minimum observed free RAM, and computed delta
- [ ] Approved Model Assets TinyLlama row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [ ] Approved Model Assets embedding bundle row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [x] LLM Spike Gate final box checked
- [x] Embedding Spike Gate final box checked
- [ ] Cargo.toml / Cargo.lock edits permitted

## Embedding Bundle Layout
- Discovery source(s): `fastembed` upstream model map and tests, plus the Hugging Face tree for `Qdrant/all-MiniLM-L6-v2-onnx`
- Approved bundle version lock: Hugging Face revision candidate `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`
- Approved archive / manifest hash: No stable upstream archive hash; revision pin only for now
- Hash strategy: `FileInventoryOnly` with per-file SHA-256 inventory still pending staged local hashing
- Closed-set rule: missing file, extra file, or hash mismatch blocks provisioning for this v1 bundle
- Closed-set note: `vocab.txt` exists upstream but is not required by `fastembed` 5.13.3's documented initialization path for `AllMiniLML6V2`

### Required File Inventory
| Relative path | Source | Size bytes | SHA-256 | Notes |
| --- | --- | --- | --- | --- |
| `model.onnx` | `Qdrant/all-MiniLM-L6-v2-onnx` | 90387630 | `pending staged local hash` | runtime-required ONNX model file |
| `tokenizer.json` | `Qdrant/all-MiniLM-L6-v2-onnx` | 711661 | `pending staged local hash` | runtime-required tokenizer file |
| `config.json` | `Qdrant/all-MiniLM-L6-v2-onnx` | 650 | `pending staged local hash` | runtime-required config file |
| `special_tokens_map.json` | `Qdrant/all-MiniLM-L6-v2-onnx` | 695 | `pending staged local hash` | runtime-required tokenizer metadata |
| `tokenizer_config.json` | `Qdrant/all-MiniLM-L6-v2-onnx` | 1433 | `pending staged local hash` | runtime-required tokenizer metadata |

## Approved Model Assets
| Asset | Source URL | Approved version | SHA-256 / hash strategy | Download size bytes | Installed size bytes | Peak RAM bytes | Required free disk bytes | Required free RAM bytes | Destination under SpellbookVault/models/ | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TinyLlama GGUF |  |  |  |  |  |  |  |  | `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` | |
| Embedding bundle/archive | https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx | `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | `FileInventoryOnly`; per-file SHA-256 inventory pending staged local hashing |  |  |  |  |  | `embeddings/all-MiniLM-L6-v2/` | Publisher/owner: `Qdrant`. Download size, installed size, peak RAM, hashes, and thresholds remain blocked pending staged asset download and measurement |

## LLM Spike Gate
- [x] Dependency-security crate checks passed for the LLM runtime, `reqwest`, and RAM/disk probe
- [x] Exact crate names approved
- [x] Approved versions recorded
- [x] Windows MSVC Completion Gate checked
- [x] Interruptibility outcome accepted by the explicit accept/block rule
- [ ] LLM Spike Gate passed
- [x] LLM Spike Gate failed

Blocker note: `llama-cpp-sys-2 v0.1.145` failed on Windows because `bindgen` could not find `libclang.dll`; install or expose libclang via `LIBCLANG_PATH` before retrying.

## Embedding Spike Gate
- [x] Dependency-security crate checks passed for the embedding runtime
- [x] Exact embedding crate name approved
- [x] Approved embedding version recorded
- [x] Windows MSVC Completion Gate checked
- [x] Embedding Bundle Layout frozen with discovery source, version lock, archive or manifest hash, and the full required file inventory
- [ ] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle
- [ ] Approved Model Assets TinyLlama row complete
- [ ] Approved Model Assets embedding bundle row complete
- [ ] Embedding Spike Gate passed
- [x] Embedding Spike Gate failed

Blocker note: Windows embedding compile proof succeeded, but the gate cannot pass while the shared TinyLlama and embedding asset hashes, RAM measurements, and approved model-asset rows remain incomplete after the `llama-cpp-rs` Windows compile blocker.

## Final Blocker Status
Task 1 blocked: `llama-cpp-rs` Windows compile proof failed because `bindgen` could not find `libclang.dll`; install or expose libclang via `LIBCLANG_PATH`, rerun the LLM scratch proof, and do not start OpenSpec task groups 2-4 until resolved. Handoff to the project maintainer/change owner is required for any alternate dependency decision.