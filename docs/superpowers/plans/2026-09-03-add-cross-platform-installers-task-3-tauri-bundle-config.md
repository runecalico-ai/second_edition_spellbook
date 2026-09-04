# Cross-Platform Installers Task 3 Tauri Bundle Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 3 for `add-cross-platform-installers` by setting Windows/Linux bundle targets, replacing 1×1 icons with committed assets and gating `build.rs`, confirming the NSIS VC++ hook stays a non-blocking warning, and adding `tauri:build:win` / `tauri:build:linux` scripts.

**Architecture:** Use Tauri's bundler only (no Inno/WiX/Flatpak). Keep `installer/vcredist-check.nsh` wired. Release detection for the sidecar stays the filesystem probe from Task 2b. Icons: committed files under `apps/desktop/src-tauri/icons/`; `build.rs` may write 1×1 placeholders only when `PROFILE` is not `release`.

**Tech Stack:** Tauri v2 CLI, NSIS, AppImage, deb, npm scripts in `apps/desktop/package.json`.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 3 — `tasks.md` 3.1–3.4  
**Depends on:** Task groups 1–2 (resources + `externalBin`)  
**Unblocks:** Task groups 4–5  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-2b-sidecar-resolution.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-local-release-verification.md`

---

## Global Constraints

- Windows target token: **`nsis`**. Linux tokens: **`appimage`** and **`deb`**. No RPM, Flatpak, Snap, MSI, macOS.
- NSIS hook must remain **warning-only** (`MessageBox` then fall through to `vcredist_present`). Do not `Abort`.
- `STATIC_VCRUNTIME=false` stays in `apps/desktop/src-tauri/.cargo/config.toml`.
- No Windows Authenticode signing.
- v1 ships one full installer per platform (default `llm` features).
- Do not rewrite delta specs. Flip only 3.1–3.4.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 3.1 Set `bundle.targets` for Windows (`nsis`) and Linux (`appimage`, `deb`) | Task 1 | `tauri.conf.json` updated; checkbox `[x]` |
| 3.2 Replace placeholder icons; gate placeholder generation in `build.rs` to dev-only | Task 2 | committed icons; release `build.rs` panics if `icon.png` missing; checkbox `[x]` |
| 3.3 Confirm NSIS hook still applies (non-blocking warning) | Task 3 | hook file + config unchanged in behavior; checkbox `[x]` |
| 3.4 Add npm scripts `tauri:build:win` and `tauri:build:linux` | Task 4 | scripts added; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `apps/desktop/src-tauri/tauri.conf.json` | Modify: `targets`, `icon` |
| `apps/desktop/src-tauri/build.rs` | Modify: release fail-closed |
| `apps/desktop/src-tauri/icons/*` | Create: real icon set |
| `apps/desktop/src-tauri/installer/vcredist-check.nsh` | Verify only |
| `apps/desktop/package.json` | Modify: platform build scripts |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 3.1–3.4 |

---

### Task 1: Bundle targets (OpenSpec 3.1)

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (3.1 only)

**Interfaces:**
- Consumes: existing `bundle.resources`, `bundle.externalBin`, NSIS hooks from prior groups
- Produces: `"targets": ["nsis", "appimage", "deb"]`

Tauri v2 ignores OS-inappropriate targets on the host (NSIS on Linux is skipped; AppImage on Windows is skipped). Explicit list still documents intent and prevents default `"all"` from enabling RPM/macOS later by accident.

- [ ] **Step 1: Set targets**

In `apps/desktop/src-tauri/tauri.conf.json`, `bundle` must include:

```json
    "targets": ["nsis", "appimage", "deb"],
```

Place it as the first key inside `bundle` for readability. Keep `resources`, `externalBin`, and `windows.nsis.installerHooks`.

- [ ] **Step 2: Mark OpenSpec 3.1 complete**

From:

```markdown
- [ ] 3.1 Set `bundle.targets` for Windows (`nsis`) and Linux (`appimage`, `deb`) in `tauri.conf.json`
```

To:

```markdown
- [x] 3.1 Set `bundle.targets` for Windows (`nsis`) and Linux (`appimage`, `deb`) in `tauri.conf.json`
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
chore(tauri): limit release bundles to NSIS, AppImage, and deb

Avoid default all-targets so v1 does not grow RPM or macOS artifacts.
EOF
)"
```

---

### Task 2: Production icons and `build.rs` gate (OpenSpec 3.2)

**Files:**
- Create: `apps/desktop/src-tauri/icons/icon.png` (at least 256×256, not 1×1)
- Create: `apps/desktop/src-tauri/icons/icon.ico`
- Create: `apps/desktop/src-tauri/icons/32x32.png`
- Create: `apps/desktop/src-tauri/icons/128x128.png`
- Create: `apps/desktop/src-tauri/icons/icon.icns` **only if** `tauri icon` emits it; omit for v1 if absent (macOS is out of scope)
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (`bundle.icon`)
- Modify: `apps/desktop/src-tauri/build.rs`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (3.2 only)

**Interfaces:**
- Consumes: a committed ≥256px PNG. v1 production icon is that committed set (navy `#1e3a5f` generated via `tauri icon` is acceptable). Branded artwork may replace the same filenames later without a spec change.
- Produces: committed icon files; release builds fail if `icons/icon.png` is missing

- [ ] **Step 1: Generate the icon set**

From `apps/desktop`:

```powershell
pnpm exec tauri icon src-tauri/icons/icon.png
```

If `icon.png` does not exist yet, create a 1024×1024 source first. Preferred: maintainer-supplied brand PNG. Fallback: write any valid PNG ≥256px (solid `#1e3a5f` is acceptable for v1) as `apps/desktop/src-tauri/icons/icon.png`, then re-run `tauri icon` so `icon.ico` and size variants exist.

Do not leave the 1×1 bytes currently embedded in `build.rs` as the committed `icon.png`.

- [ ] **Step 2: Point Tauri at the icons**

Add to `bundle` in `tauri.conf.json`:

```json
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.png",
      "icons/icon.ico"
    ],
```

If `tauri icon` also wrote `icons/icon.icns`, include it in the array. Missing icns is fine for v1 (no macOS target).

- [ ] **Step 3: Gate placeholder generation**

In `apps/desktop/src-tauri/build.rs`, keep dist-dir creation and the Windows manifest. Change icon generation so **release** never writes 1×1 files:

```rust
    let icon_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons");
    std::fs::create_dir_all(&icon_dir).expect("create icon directory");
    let icon_path = icon_dir.join("icon.png");
    let profile = std::env::var("PROFILE").unwrap_or_default();
    if !icon_path.exists() {
        if profile == "release" {
            panic!(
                "missing apps/desktop/src-tauri/icons/icon.png; commit production icons before a release build"
            );
        }
        let icon_bytes = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&icon_path, icon_bytes).expect("write placeholder icon.png");
    }
    let ico_path = icon_dir.join("icon.ico");
    if !ico_path.exists() {
        if profile == "release" {
            panic!(
                "missing apps/desktop/src-tauri/icons/icon.ico; commit production icons before a release build"
            );
        }
        // existing 1x1 ICO bytes from the current build.rs
        let ico_bytes = [
            0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00,
            0x2c, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x01, 0x00,
            0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00,
            0x00, 0x00,
        ];
        std::fs::write(&ico_path, ico_bytes).expect("write placeholder icon.ico");
    }
```

Because production icons are committed, local `cargo test` still works. A clean tree without icons fails **release** compiles.

- [ ] **Step 4: Verify icon.png is not 1×1**

PowerShell:

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path 'apps\desktop\src-tauri\icons\icon.png'))
'{0}x{1}' -f $img.Width, $img.Height
$img.Dispose()
```

Expected: width and height **≥ 32** (prefer ≥ 256).

- [ ] **Step 5: Mark OpenSpec 3.2 complete**

From:

```markdown
- [ ] 3.2 Replace placeholder icons with production assets; gate placeholder generation in `build.rs` to dev-only
```

To:

```markdown
- [x] 3.2 Replace placeholder icons with production assets; gate placeholder generation in `build.rs` to dev-only
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/icons apps/desktop/src-tauri/build.rs apps/desktop/src-tauri/tauri.conf.json openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
feat(tauri): ship committed icons and fail release builds without them

Stop generating 1x1 placeholders for PROFILE=release so public installers are not unbranded.
EOF
)"
```

---

### Task 3: Confirm NSIS VC++ hook (OpenSpec 3.3)

**Files:**
- Modify: none unless the hook was accidentally removed
- Read: `apps/desktop/src-tauri/installer/vcredist-check.nsh`
- Read: `apps/desktop/src-tauri/tauri.conf.json` `bundle.windows.nsis.installerHooks`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (3.3 only)

**Interfaces:**
- Consumes: existing `NSIS_HOOK_PREINSTALL`
- Produces: unchanged warning-only behavior

Required file contents (must still match):

```nsh
!macro NSIS_HOOK_PREINSTALL
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  IntCmp $0 1 vcredist_present
    MessageBox MB_OK|MB_ICONEXCLAMATION "Spellbook requires the Microsoft Visual C++ Redistributable (x64), which was not detected on this system.$\r$\n$\r$\nPlease download and install it from https://aka.ms/vs/17/release/vc_redist.x64.exe, then run this installer again."
  vcredist_present:
!macroend
```

Required config value: `"installerHooks": "installer/vcredist-check.nsh"`.

- [ ] **Step 1: Verify hook is warning-only**

Confirm there is **no** `Abort` after the `MessageBox`. Confirm `tauri.conf.json` still points at this file after Tasks 1–2.

- [ ] **Step 2: Mark OpenSpec 3.3 complete**

From:

```markdown
- [ ] 3.3 Confirm NSIS hook `installer/vcredist-check.nsh` still applies (non-blocking warning)
```

To:

```markdown
- [x] 3.3 Confirm NSIS hook `installer/vcredist-check.nsh` still applies (non-blocking warning)
```

- [ ] **Step 3: Commit**

```bash
git add openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
chore(openspec): confirm NSIS VC++ hook remains a non-blocking warning

Retain the existing pre-install check without bundling or silently installing the redistributable.
EOF
)"
```

If the hook file itself had to be restored, include it in the same commit.

---

### Task 4: Platform npm scripts (OpenSpec 3.4)

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (3.4 only)

**Interfaces:**
- Consumes: Tauri CLI already on `devDependencies`
- Produces: `tauri:build:win` → `tauri build --bundles nsis --config src-tauri/tauri.release.conf.json`; `tauri:build:linux` → `tauri build --bundles appimage,deb --config src-tauri/tauri.release.conf.json`; also update `"tauri:build"` to pass the same `--config` so a generic release build still embeds the sidecar.

- [ ] **Step 1: Add scripts**

In `apps/desktop/package.json` `scripts`:

```json
    "tauri:build": "tauri build --config src-tauri/tauri.release.conf.json",
    "tauri:build:win": "tauri build --bundles nsis --config src-tauri/tauri.release.conf.json",
    "tauri:build:linux": "tauri build --bundles appimage,deb --config src-tauri/tauri.release.conf.json",
```

Leave `"tauri:dev": "tauri dev"` **without** `--config` so it uses `tauri.conf.json` only.

In `scripts/build_windows_installer.ps1`, change the tauri args from `--bundles nsis` to also pass `--config src-tauri/tauri.release.conf.json` (working directory is already `apps/desktop`).

- [ ] **Step 2: Mark OpenSpec 3.4 complete**

From:

```markdown
- [ ] 3.4 Add npm scripts `tauri:build:win` and `tauri:build:linux`
```

To:

```markdown
- [x] 3.4 Add npm scripts `tauri:build:win` and `tauri:build:linux`
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json scripts/build_windows_installer.ps1 openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
chore(desktop): add explicit Windows and Linux Tauri bundle scripts

Give maintainers platform-specific commands that match the v1 installer set.
EOF
)"
```
