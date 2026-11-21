## Context

Spellbook runs on Tauri v2 with a Rust backend (default `llm` feature: `llama-cpp-2`, `fastembed`, dynamic MSVC CRT on Windows) and a Python sidecar for document import/export only. Current state:

| Area | Today |
|------|-------|
| Local build | `pnpm tauri:build` in `apps/desktop` |
| Windows NSIS hook | `vcredist-check.nsh` warns if VC++ x64 runtime missing (non-blocking) |
| Bundle resources | `resources/sqlite-vec/*` referenced in config but **directory not populated in repo** |
| Sidecar resolution | Repo-relative `services/ml/spellbook_sidecar.py` + venv/system Python via `tokio::process::Command` |
| Sidecar PDF import | `pdfminer.six` (Python dep, must ship inside frozen sidecar) |
| Sidecar PDF export | Print-optimized **HTML** returned; UI label says "PDF" but no PDF engine/subprocess is invoked |
| CI | Lint/test only on `ubuntu-latest`; no installer builds |
| Icons | 1×1 placeholders generated in `build.rs` |
| ML models | Downloaded post-install into `{data_dir}/SpellbookVault/models/` |
| User data | `%APPDATA%/SpellbookVault` (Windows) via `dirs::data_dir()` — survives upgrades |

Tauri v2's bundler natively supports NSIS (Windows), AppImage and `.deb` (Linux). Cross-compiling Windows installers from Linux is unsupported for NSIS; each platform must build on its native OS runner.

## Goals / Non-Goals

**Goals:**

- Produce installable artifacts on tagged releases: Windows NSIS `.exe`, Linux AppImage and `.deb`.
- Bundle the Python sidecar (with `pdfminer.six` + `python-docx`) so import/export works without system Python.
- Populate `resources/sqlite-vec/` at build time so vector search works on clean installs.
- Keep PR CI fast; run full bundle builds only on release tags (and optional manual `workflow_dispatch`).
- Preserve offline-first behavior after install: core app + sidecar work without network; models remain user-provisioned (first download is a documented exception).
- Document reproducible local release builds for maintainers.

**Non-Goals:**

- macOS `.dmg`/`.app` (can follow same pattern later).
- Windows code signing (Authenticode) — not planned; releases remain unsigned.
- MSI/WiX installer (NSIS is sufficient for v1).
- Bundling TinyLlama / MiniLM models (~760 MB combined).
- Tauri auto-updater plugin.
- Flatpak, Snap, or RPM.
- Lite installer variant in v1 (reserved for future release).
- Fixing "Export PDF" UI label vs HTML output (separate UX change).

## Decisions

### 1. Use Tauri's built-in bundler (not a third-party installer framework)

**Choice:** Configure `tauri.conf.json` `bundle.targets` and invoke `pnpm tauri build` per platform.

**Rationale:** Already integrated; NSIS hook exists; no new dependencies.

**Windows target:** `nsis` — supports custom hooks (VC++ check already wired).

**Linux targets:** `appimage` + `deb`. Skip RPM/Flatpak initially.

### 2. GitHub Actions matrix on native runners

**Choice:** New `release.yml` triggered by `v*` tags (and manual dispatch):

```
windows-latest  →  NSIS .exe
ubuntu-24.04    →  AppImage + .deb
```

**Rationale:** NSIS and Linux GTK/WebKit deps require native toolchains.

**CI split:** Existing `ci.yml` unchanged.

**Artifact upload:** GitHub Release assets with names like `Spellbook_{version}_x64-setup.exe`, `Spellbook_{version}_amd64.AppImage`, `Spellbook_{version}_amd64.deb`, plus **SHA256 checksum files** (`.sha256`) for each binary.

**Release creation:** Tag push creates a **published** GitHub Release (not draft) with auto-generated release notes from commits since prior tag.

### 3. Bundle Python sidecar via Tauri `externalBin`

**Choice:** Build `spellbook-sidecar` as a standalone executable per target triple, register in `tauri.conf.json`:

```json
"bundle": {
  "externalBin": ["binaries/spellbook-sidecar"]
}
```

Tauri expects `binaries/spellbook-sidecar-x86_64-pc-windows-msvc.exe` (and Linux equivalent).

**Build tool:** PyInstaller, pinned in `services/ml/requirements-dev.txt` after security review per `docs/DEPENDENCY_SECURITY.md`.

**Python version:** Match CI — **Python 3.14** for freeze builds.

**Sidecar spawn (release):** Resolve bundled binary at runtime via `std::env::current_exe().parent()` (Tauri places `externalBin` next to the main executable). Spawn with `tokio::process::Command` — same JSON-RPC stdin/stdout protocol as today. **Do not** use deprecated Tauri v1 `tauri::api::path` patterns; shell plugin is not required for this stdin-pipe sidecar.

**Sidecar spawn (dev):** If bundled binary is absent, fall back to existing repo-relative `spellbook_sidecar.py` + venv/system Python path.

**Release detection:** Probe for bundled binary existence at runtime — **not** `cfg!(not(debug_assertions))` (breaks `tauri build --debug` bundles).

### 4. Populate sqlite-vec resources at build time

**Choice:** Add a pre-build script (shared by local release and CI) that downloads the platform-appropriate loadable `vec0` library from the official `sqlite-vec` GitHub release (same version as `Cargo.toml`: `0.1.6`) into `src-tauri/resources/sqlite-vec/`.

**Rationale:** `tauri.conf.json` already references `resources/sqlite-vec/*` but the directory is empty in the repo. At runtime, `pool.rs` copies from bundle resources into `SpellbookVault` on first launch. Without this step, semantic search falls back to blob-backed tables on clean installs.

### 5. Do not bundle ML models

**Choice:** Installers ship app + sidecar only. Models download on first use via existing provisioning commands.

**Rationale:** Keeps installer ~150–200 MB vs ~900 MB+ with models.

**Offline exception:** First-time model provisioning requires network by design; document explicitly. All other core features work offline after install.

### 6. Keep dynamic CRT + NSIS VC++ warning (do not embed redistributable)

**Choice:** Continue `STATIC_VCRUNTIME=false` and pre-install NSIS hook.

**Behavior:** Warning is **non-blocking** — user may proceed without VC++ installed (app will fail at launch if runtime truly missing). Do not change hook to abort install.

### 7. Production icons before first public release

**Choice:** Replace placeholder icons in `src-tauri/icons/` with branded assets; gate placeholder generation in `build.rs` to dev-only or remove entirely.

### 8. Version alignment

**Choice:** Git tag is source of truth at release time (`v0.2.0` → `0.2.0`). Release workflow sets version in `package.json`, `tauri.conf.json`, and `Cargo.toml` before build (or validates they match tag).

### 9. PDF behavior (pdfminer import + HTML export)

**Choice:** Document actual PDF behavior. PDF **import** uses bundled `pdfminer.six`. PDF **export** (`format: "pdf"`) returns print-optimized HTML with a note to use browser "Print to PDF". No external PDF toolchain is required or shipped.

**Documentation for v1:** Document that export produces HTML; import uses bundled pdfminer.

### 10. Linux baseline: Ubuntu 24.04 LTS

**Choice:** Target **Ubuntu 24.04 LTS** minimum. Release builds on `ubuntu-24.04` runners. Smoke-test on clean Ubuntu 24.04 VM.

### 11. Lite variant deferred to a future release

**Choice:** v1 ships one **full** installer per platform (default `llm` features). Future: optional `tauri:build:lite` + second release matrix entry using `--no-default-features`.

### 12. No Windows code signing

**Choice:** Windows release installers remain unsigned permanently. Document SmartScreen workaround ("More info" → "Run anyway").

### 13. Post-install smoke verification in release workflow

**Choice:** Release workflow runs a minimal headless/smoke step after bundle (where feasible): verify installer artifact exists, checksum matches, and optionally launch binary with `--version` or env-guarded startup check. Full E2E on installed build is manual for v1 (Playwright requires Windows WebView2 + sandbox flags).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| PyInstaller binary size bloat | Audit `hiddenimports`; bundle only `pdfminer.six` + `python-docx` deps |
| Sidecar fails on end-user OS | Build on Ubuntu 24.04; smoke-test import on clean VM |
| sqlite-vec download fails in CI | Pin version + URL; fail build if resource dir empty |
| Windows SmartScreen blocks unsigned exe | Document workaround; no signing planned |
| Release build time (LLM natives) | Cache Cargo + PyInstaller; run only on tags |
| Dev/prod sidecar path divergence | Runtime probe for bundled binary; single `call_sidecar` entry point |
| "Export PDF" label vs HTML output | Document in release notes; fix UI label in separate change |
| Model provisioning needs network | Document as first-run exception to offline-first |

## Migration Plan

1. Add sqlite-vec + sidecar pre-build scripts; wire into release build.
2. Update `sidecar/client.rs` with bundled-binary resolution.
3. Verify `tauri build` locally on Windows and Ubuntu 24.04.
4. Add `release.yml`; cut `v0.1.0-rc.1` tag for dry run.
5. Update docs with accurate prerequisites (VC++, Ubuntu 24.04, model provisioning, PDF behavior).

**Rollback:** Disable release workflow; users continue building from source. No database migration.

## Resolved Questions (grill audit)

All major branches decided. No open design questions remain.

| Topic | Resolution |
|-------|------------|
| Linux baseline | Ubuntu 24.04 LTS |
| Lite variant | Future release |
| Code signing | Not planned |
| sqlite-vec | Pre-build download into `resources/sqlite-vec/` |
| Sidecar spawn | `current_exe().parent()` + dev fallback |
| Release detection | Bundled binary probe, not `debug_assertions` |
