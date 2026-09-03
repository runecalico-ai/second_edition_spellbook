## 1. Pre-Build Resource Provisioning

- [ ] 1.1 Add script to download platform `vec0` library (sqlite-vec v0.1.6) into `src-tauri/resources/sqlite-vec/`; fail if empty
- [ ] 1.2 Wire sqlite-vec script into release build pipeline (before `tauri build`)

## 2. Sidecar Bundling

- [ ] 2.1 Audit sidecar runtime deps; confirm `pdfminer.six` and `python-docx` ship in frozen binary
- [ ] 2.2 Add PyInstaller spec and build script under `services/ml/` producing `spellbook-sidecar-{target-triple}` with Python 3.14
- [ ] 2.3 Register sidecar in `tauri.conf.json` `bundle.externalBin` under `src-tauri/binaries/`
- [ ] 2.4 Update `sidecar/client.rs`: probe for bundled binary via `current_exe().parent()`; dev fallback to script+venv when absent
- [ ] 2.5 Wire sidecar freeze step into pre-build script invoked by release workflow and local release docs

## 3. Tauri Bundle Configuration

- [ ] 3.1 Set `bundle.targets` for Windows (`nsis`) and Linux (`appimage`, `deb`) in `tauri.conf.json`
- [ ] 3.2 Replace placeholder icons with production assets; gate placeholder generation in `build.rs` to dev-only
- [ ] 3.3 Confirm NSIS hook `installer/vcredist-check.nsh` still applies (non-blocking warning)
- [ ] 3.4 Add npm scripts `tauri:build:win` and `tauri:build:linux`

## 4. Local Release Verification

- [ ] 4.1 Build NSIS installer locally on Windows; verify app starts, sidecar import/export, sqlite-vec load without repo checkout
- [ ] 4.2 Build AppImage and `.deb` on Ubuntu 24.04; verify same smoke checks
- [ ] 4.3 Confirm installed app does not bundle model files; provisioning still works post-install
- [ ] 4.4 Smoke-test LLM chat and semantic search on installed full build

## 5. GitHub Actions Release Workflow

- [ ] 5.1 Create `.github/workflows/release.yml` triggered on `v*` tags and `workflow_dispatch`
- [ ] 5.2 Add `windows-latest` job: Node 24, pnpm, Rust, Python 3.14, pre-build scripts, `pnpm tauri build`
- [ ] 5.3 Add `ubuntu-24.04` job: same toolchain plus Linux GTK/WebKit deps
- [ ] 5.4 Upload release assets with versioned naming and `.sha256` checksum files
- [ ] 5.5 Configure Cargo and PyInstaller caching
- [ ] 5.6 Cut `v0.1.0-rc.1` tag for end-to-end dry run

## 6. Documentation

- [ ] 6.1 Add release build section to `docs/DEVELOPMENT.md` (prerequisites, commands, artifacts)
- [ ] 6.2 Document end-user requirements: VC++ redistributable (Windows), Ubuntu 24.04+ (Linux), model provisioning (network on first run), unsigned SmartScreen workaround
- [ ] 6.3 Document PDF behavior: export → HTML (browser print-to-PDF); import → bundled pdfminer
- [ ] 6.4 Note lite installer variant as planned future artifact

## 7. Resolved Decisions (reference)

- PDF: import via bundled pdfminer; export via HTML (browser print-to-PDF)
- Linux baseline: Ubuntu 24.04 LTS minimum
- Lite variant: deferred to future release
- Windows code signing: not planned
- sqlite-vec: pre-build download into `resources/sqlite-vec/`
- Sidecar release detection: bundled binary probe, not `debug_assertions`
- VC++ NSIS hook: warning only, non-blocking
