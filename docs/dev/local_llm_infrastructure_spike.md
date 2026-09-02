# Local LLM Infrastructure Spike

## Dependency Approval

Manifest edits stay blocked until the dependency table, dependency-security checklist, and the later shared pre-manifest completion gate are all fully satisfied for the approved crates and model assets.

| Purpose | Spec label / runtime nickname | Exact crates.io package name | Approved version | Required features | Registry URL | Upstream repo | Approval notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LLM runtime | llama-cpp-rs family / approved LLM runtime | llama-cpp-2 | 0.1.145 | `none` | https://crates.io/crates/llama-cpp-2 | https://github.com/utilityai/llama-cpp-rs | Official project name is `llama-cpp-rs` but the canonical crates.io package is `llama-cpp-2`; upstream explicitly warns it does not follow semver meaningfully, so the version should be pinned exactly |
| Embeddings | approved embedding runtime / fastembed-rs | fastembed | 5.13.3 | `none` | https://crates.io/crates/fastembed | https://github.com/Anush008/fastembed-rs | The runtime nickname is `fastembed-rs` but the canonical crates.io package name is `fastembed` |
| Download client | reqwest | reqwest | 0.13.2 | `rustls`, `stream` | https://crates.io/crates/reqwest | https://github.com/seanmonstar/reqwest | `bytes_stream` requires `stream`, and HTTPS downloads from the approved Hugging Face asset URLs require reqwest TLS transport; reqwest 0.13.2 exposes that through the `rustls` feature |
| RAM/disk probe | approved system resource probe / sysinfo fallback candidate | sysinfo | 0.38.4 | `disk`, `system` | https://crates.io/crates/sysinfo | https://github.com/GuillaumeGomez/sysinfo | No official probe crate recommendation was found in the approved stack docs, so `sysinfo` is the reviewed fallback candidate; the provisioning resource probe uses `Disks` and `System`, which sysinfo 0.38.4 gates behind the `disk` and `system` features |

Manifest edits stay blocked until the table above is complete, every dependency-security checklist below is checked, and the later shared pre-manifest completion gate is fully satisfied.

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
| Exact source URL verified from official upstream/release page | [x] | [x] |
| Approved version / release tag recorded | [x] | [x] |
| Publisher / repository owner matches the approved upstream | [x] | [x] |
| Hash strategy recorded and follows `## Asset Measurement and Hash Rules` | [x] | [x] |
| Download size bytes recorded | [x] | [x] |
| Installed size bytes recorded | [x] | [x] |
| Peak RAM bytes recorded from the first approved initialization/load path measurement | [x] | [x] |
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
| TinyLlama GGUF | `15514431488` | `LlamaModel::load_from_file` | `250 ms` | `14603587584` | `910843904` | Measured from `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\llm-compile` with `cargo run -- 'C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\downloads\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'`; the command exited `0` after loading the real staged model file |
| Embedding bundle/archive | `16171147264` | `TextEmbedding::try_new(EmbeddingModel::AllMiniLML6V2)` | `250 ms` | `16050122752` | `121024512` | Measured from `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\embed-compile` against the staged five-file snapshot at revision `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`; the subsequent `embed(...)` smoke call ran after the sampling window closed |

## Windows MSVC Findings
- Host target triple: `x86_64-pc-windows-msvc`
- `rustc --version`: `rustc 1.95.0 (59807616e 2026-04-14)`
- `cargo --version`: `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`
- Visual Studio Build Tools workload: `Microsoft.VisualStudio.Workload.VCTools`
- Visual Studio Build Tools version: `18.5.11709.299`
- Windows SDK full version string (for example, `10.0.22621.0`): `10.0.26100.0`
- Required environment variables or compiler flags (`none` if none were needed): `LIBCLANG_PATH=C:\Program Files\LLVM\bin` fixed the original `bindgen` blocker; `CMAKE=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe` was also required in this shell so the already-installed CMake binary could be found
- LLM scratch crate command + result: `$env:LIBCLANG_PATH='C:\Program Files\LLVM\bin'; $env:CMAKE='C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'; Set-Location $env:TEMP\spellbook-llm-spikes\llm-compile; cargo check` -> succeeded. `Finished dev profile [unoptimized + debuginfo] target(s) in 1m 40s`
- Embedding scratch crate command + result: `Set-Location $env:TEMP\spellbook-llm-spikes\embed-compile; cargo check` -> succeeded. `Finished dev profile [unoptimized + debuginfo] target(s) in 35.07s`
- Blocking notes: the earlier embedding download failure and TinyLlama staging blocker are cleared. A fresh `Set-Location $env:TEMP\spellbook-llm-spikes\embed-compile; cargo run` succeeded, staged the bundle under `.fastembed_cache\models--Qdrant--all-MiniLM-L6-v2-onnx\snapshots\5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, and allowed exact local file hashes, size totals, and peak RAM measurements to be captured. The later Hugging Face revision API check published the same revision `sha` plus the snapshot sibling list, which is sufficient to treat that upstream-published revision identifier as the manifest hash for this frozen `FileInventoryOnly` snapshot without changing the per-file integrity strategy. A separate `cargo run` in `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\llm-compile` loaded the real staged TinyLlama file successfully and produced the exact single-file SHA-256, measured size, and peak RAM delta. No Windows-only spike blocker remains after incorporating that upstream revision-manifest evidence

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
  - Scratch prototype or experiment summary: compile-checked temp function `interruptibility_loop_prototype` in `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\llm-compile\src\main.rs` models the app-owned generation loop with `Arc<std::sync::atomic::AtomicBool>` polling immediately before `sampler.sample(...)` and immediately after `ctx.decode(...)`; it was validated with `$env:LIBCLANG_PATH='C:\Program Files\LLVM\bin'; $env:CMAKE='C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'; Set-Location $env:TEMP\spellbook-llm-spikes\llm-compile; cargo check`. Upstream `llama-cpp-rs` generation-loop references inspected for parity were `examples/simple/src/main.rs`, `examples/openai_stream.rs`, and `examples/usage.rs`
  - Approved worker boundary: dedicated inference worker owns the model/session
  - Stop primitive: `Arc<std::sync::atomic::AtomicBool>`
  - Polling boundary: check at the top of the per-token `while` loop before `sampler.sample(&ctx, ...)` and optionally after `ctx.decode(&mut batch)`
  - Unsupported cancellation paths: no thread kill, process kill, or undocumented FFI interruption is attempted
  - Acceptance decision: Outcome B is complete and acceptable on its own

## Pre-Manifest Completion Gate
- [x] Dependency Approval table complete for all four rows and all approval fields
- [x] Dependency Security Checklist complete for all four crates and both approved model assets
- [x] Windows MSVC Completion Gate complete with every field filled
- [x] Interruptibility Findings records Outcome A or Outcome B, and the chosen outcome satisfies the acceptance rule above
- [x] Embedding Bundle Layout records discovery source, approved bundle version, exact required files, and hash scope
- [x] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle, including baseline free RAM, minimum observed free RAM, and computed delta
- [x] Approved Model Assets TinyLlama row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [x] Approved Model Assets embedding bundle row complete, including hash strategy, download size bytes, installed size bytes, peak RAM bytes, and enforced free-resource thresholds
- [x] LLM Spike Gate final box checked
- [x] Embedding Spike Gate final box checked
- [x] Cargo.toml / Cargo.lock edits permitted

## Embedding Bundle Layout
- Discovery source(s): actual staged bundle at `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\embed-compile\.fastembed_cache\models--Qdrant--all-MiniLM-L6-v2-onnx\snapshots\5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, local `refs\main` content `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, the Hugging Face revision API response for `https://huggingface.co/api/models/Qdrant/all-MiniLM-L6-v2-onnx/revision/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, the revision-pinned `HEAD` check on `https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/resolve/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079/model.onnx`, and the official upstream repo root `https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`
- Approved bundle version lock: upstream and local evidence now agree on snapshot revision `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`; the local staged snapshot, local `refs\main`, and Hugging Face revision API all reported the same revision identifier
- Approved archive / manifest hash: upstream-published Hugging Face revision `sha` `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, taken from the revision API response for `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`; for this spike, that revision `sha` is the approved manifest hash for the snapshot layout, not an archive digest
- Hash strategy: `FileInventoryOnly @ revision 5f1b8cd78bc4fb444dd171e59b18f3a3af89a079 + UpstreamRevisionManifestSHA`, with exact per-file SHA-256 inventory over the five runtime-required files below. The upstream revision `sha` freezes the published snapshot manifest identity, while the per-file SHA-256 inventory remains the installed-layout integrity check
- Closed-set rule: missing file, extra file, or hash mismatch blocks provisioning for this v1 bundle
- Closed-set note: the Hugging Face revision API published six siblings for this revision: `config.json`, `model.onnx`, `special_tokens_map.json`, `tokenizer.json`, `tokenizer_config.json`, and `vocab.txt`. `vocab.txt` remains upstream-published but not runtime-required by `fastembed` 5.13.3's documented initialization path for `AllMiniLML6V2`, so the approved closed set for this spike remains the five files inventoried below

### Required File Inventory

The size values and SHA-256 values below come from the staged local snapshot under `.fastembed_cache\models--Qdrant--all-MiniLM-L6-v2-onnx\snapshots\5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`.

| Relative path | Source | Size bytes | SHA-256 | Notes |
| --- | --- | --- | --- | --- |
| `model.onnx` | `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | 90387630 | `bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5` | runtime-required ONNX model file |
| `tokenizer.json` | `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | 711661 | `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0` | runtime-required tokenizer file |
| `config.json` | `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | 650 | `1b4d8e2a3988377ed8b519a31d8d31025a25f1c5f8606998e8014111438efcd7` | runtime-required config file |
| `special_tokens_map.json` | `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | 695 | `5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a` | runtime-required tokenizer metadata |
| `tokenizer_config.json` | `Qdrant/all-MiniLM-L6-v2-onnx@5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | 1433 | `bd2e06a5b20fd1b13ca988bedc8763d332d242381b4fbc98f8fead4524158f79` | runtime-required tokenizer metadata |

## Approved Model Assets
| Asset | Source URL | Approved version | SHA-256 / hash strategy | Download size bytes | Installed size bytes | Peak RAM bytes | Required free disk bytes | Required free RAM bytes | Destination under SpellbookVault/models/ | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TinyLlama GGUF | https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf | `TinyLlama-1.1B-Chat-v1.0 / Q4_K_M` | `SingleFileSHA256`; `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0` | `668788096` | `668788096` | `910843904` | `838860800` | `1610612736` | `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` | Fully staged local file verified at `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\downloads\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`. A real-file `cargo run` in `C:\Users\vitki\AppData\Local\Temp\spellbook-llm-spikes\llm-compile` completed with exit code `0` after `LlamaModel::load_from_file`, so the measured size, hash, and peak RAM values above come from the approved local asset rather than a public estimate |
| Embedding bundle/archive | https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079 | `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` | `FileInventoryOnly @ 5f1b8cd78bc4fb444dd171e59b18f3a3af89a079 + UpstreamRevisionManifestSHA`; manifest `sha` = `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`; exact per-file SHA-256 inventory recorded in `## Embedding Bundle Layout` | `91102069` | `91102069` | `121024512` | `838860800` | `1610612736` | `embeddings/all-MiniLM-L6-v2/` | Exact staged five-file snapshot captured locally. The Hugging Face revision API published the same revision `sha` together with the sibling manifest for this snapshot, so that upstream revision identifier is now the approved manifest hash for the frozen `FileInventoryOnly` layout. A revision-pinned `HEAD` on `model.onnx` also returned `ETag` `489ad214c162daff8026f207bc7efa8ce66d6ac1e3edd507221316de21eaa830` and `Content-Length` `90387630`, matching the measured ONNX file size. Alternate disk formula used: `max(800 MiB baseline, installed_size_bytes)` because `fastembed` downloaded the required files directly into the staged layout rather than via a separate archive |

## LLM Spike Gate
- [x] Dependency-security crate checks passed for the LLM runtime, `reqwest`, and RAM/disk probe
- [x] Exact crate names approved
- [x] Approved versions recorded
- [x] Windows MSVC Completion Gate checked
- [x] Interruptibility outcome accepted by the explicit accept/block rule
- [x] LLM Spike Gate passed
- [ ] LLM Spike Gate failed

Resolution note: Windows MSVC scratch compile proof passed once `LIBCLANG_PATH` pointed at `C:\Program Files\LLVM\bin` and `CMAKE` pointed at the installed Visual Studio Build Tools CMake binary for this shell. TinyLlama's approved-asset download and measurement requirements are satisfied with the staged real file and successful load-path probe. The embedding side now also has upstream-published revision-manifest evidence from the Hugging Face revision API, so no LLM-side blocker remains for the shared pre-manifest handoff.

## Embedding Spike Gate
- [x] Dependency-security crate checks passed for the embedding runtime
- [x] Exact embedding crate name approved
- [x] Approved embedding version recorded
- [x] Windows MSVC Completion Gate checked
- [x] Embedding Bundle Layout frozen with discovery source, version lock, archive or manifest hash, and the full required file inventory
- [x] Peak RAM Measurement Log complete for TinyLlama and the embedding bundle
- [x] Approved Model Assets TinyLlama row complete
- [x] Approved Model Assets embedding bundle row complete
- [x] Embedding Spike Gate passed
- [ ] Embedding Spike Gate failed

Resolution note: TinyLlama remains fully staged, hashed, size-measured, and RAM-measured from the real approved file. The embedding source is still a revision-pinned `FileInventoryOnly` five-file snapshot, but the Hugging Face revision API now supplies an upstream-published revision `sha` plus sibling manifest for that snapshot. That revision `sha` is therefore the approved manifest hash for the frozen snapshot layout, while the per-file SHA-256 inventory continues to enforce the required installed-file integrity.

## Final Blocker Status
Task 1 pre-manifest handoff is no longer blocked by the embedding evidence requirement. The LLM Windows compile proof passes, TinyLlama has a fully staged approved file with exact SHA-256, exact size bytes, and a measured first-load RAM delta from a successful real-file `cargo run`, and the embedding bundle now has all of the following at the same revision `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`: a verified revision lock, an upstream-published Hugging Face revision-manifest `sha`, the published sibling list for the frozen snapshot, exact per-file SHA-256 inventory for the five runtime-required files, exact download and installed size totals, and a measured peak RAM delta. Under the current gate wording, `Cargo.toml / Cargo.lock edits permitted` can now be checked. This subtask still does not edit either manifest file.
