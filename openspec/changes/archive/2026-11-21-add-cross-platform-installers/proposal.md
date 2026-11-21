## Why

Spellbook is a Tauri v2 desktop app that today builds only from a developer checkout. There is no repeatable way to produce installable Windows and Linux artifacts for end users, and CI validates code quality but never exercises the release bundle path. The Python import/export sidecar is resolved at runtime from repo-relative paths and system Python, so a packaged binary would fail import/export on a clean machine. The `sqlite-vec` bundle resource path is configured but not populated at build time. We need a release pipeline that produces trustworthy installers and closes these packaging gaps before wider distribution.

## What Changes

- Add a GitHub Actions **release workflow** (tag-triggered) that builds Windows and Linux installers on native runners and uploads release assets with SHA256 checksums.
- Configure Tauri v2 bundle targets: **NSIS** (Windows `.exe` installer) and **AppImage + `.deb`** (Linux).
- Bundle the Python sidecar as a Tauri **external binary** (`pdfminer.six` + `python-docx` inside frozen binary).
- Add **pre-build script** to download platform `vec0` library into `resources/sqlite-vec/`.
- Replace placeholder app icons with production icons before release builds.
- Document local release build steps in `docs/DEVELOPMENT.md`.
- Add npm scripts for explicit platform bundle commands (e.g. `tauri:build:win`, `tauri:build:linux`).
- Keep LLM/embedding model files **out of the installer** (provisioned at runtime into `SpellbookVault/models/` as today).
- Retain the existing NSIS VC++ redistributable pre-install check (`installer/vcredist-check.nsh`) — non-blocking warning.
- Document **PDF behavior accurately**: export produces HTML (browser print-to-PDF); import uses bundled pdfminer.
- Target **Ubuntu 24.04 LTS** as the minimum supported Linux baseline.
- Defer **lite installer** variant to a future release; v1 ships full build only.
- **No Windows code signing** — unsigned releases permanently.

## Capabilities

### New Capabilities

- `release-packaging`: Cross-platform installer generation, sidecar bundling, sqlite-vec build provisioning, CI release workflow, and artifact naming/checksum conventions.

### Modified Capabilities

- `architecture`: Add a distributable-packaging requirement covering sidecar bundling, sqlite-vec resources, and offline-capable installed layout.

## Impact

- **CI/CD**: New `.github/workflows/release.yml` (separate from fast PR CI).
- **Tauri config**: `apps/desktop/src-tauri/tauri.conf.json` — bundle targets, `externalBin`, icons, resources.
- **Sidecar**: `services/ml/` PyInstaller spec + build script; `sidecar/client.rs` bundled-binary resolution.
- **Build tooling**: Pre-build scripts for sqlite-vec download and sidecar freeze under `scripts/`.
- **Docs**: `docs/DEVELOPMENT.md`, optional `docs/RELEASE.md`.
- **Not in scope**: macOS packaging, Windows code signing, MSI/WiX, auto-update, bundling ML models, lite installer (v1), fixing "Export PDF" UI label.
