# Cross-Platform Installers Task 5b Artifacts Caching and Dry Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec items 5.4–5.6 for `add-cross-platform-installers` by uploading versioned installer assets with `.sha256` files, caching Cargo and PyInstaller outputs, and performing an end-to-end dry run (`workflow_dispatch` then `v0.1.0-rc.1`).

**Architecture:** After each platform job builds, rename artifacts to the spec names if Tauri’s defaults differ, write SHA256 sidecars, **re-hash to confirm the sidecar matches**, and upload. `workflow_dispatch` uploads workflow artifacts only (dry run). Tag pushes create a **published** GitHub Release with `gh release create --generate-notes` (no extra Action). Version: on tag jobs only, `scripts/set_release_version.py` runs **before** `prepare_release_bundle.py` using `.venv`. Dispatch leaves in-tree `0.1.0` unchanged. Design decision 13 smoke: artifact exists + checksum verifies; do **not** add `--version` (the desktop binary has no such flag). Windows: `Get-AuthenticodeSignature` must be `NotSigned`.

**Tech Stack:** GitHub Actions `actions/upload-artifact@v4`, GitHub CLI `gh`, `actions/cache@v4`, Python stdlib `hashlib`.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 5.4–5.6  
**Depends on:** Task 5a workflow jobs  
**Unblocks:** Task group 6 docs can cite the real asset names  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-5a-release-workflow.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-6-documentation.md`

---

## Global Constraints

- Windows asset example from spec: `Spellbook_0.2.0_x64-setup.exe` plus `Spellbook_0.2.0_x64-setup.exe.sha256`.
- Linux: product + version + architecture for AppImage and `.deb`, each with `.sha256`.
- Checksum file format: one line `{sha256}  {filename}` (GNU `sha256sum` style).
- Cache Cargo at **repo-root** `target/` (this repo sets `target-dir = "../../../target"`). Do not cache only `apps/desktop/src-tauri/target` (that path is unused).
- Cache PyInstaller: `~/.cache/pyinstaller` on Linux and `%LOCALAPPDATA%\pyinstaller` on Windows if present, plus leave `services/ml/dist` uncached in git.
- One full installer per OS; no lite artifact.
- Do not rewrite delta specs. Flip 5.4–5.6 only after each deliverable works.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 5.4 Upload versioned names and `.sha256` files | Task 1 | workflow uploads those files; checkbox `[x]` |
| 5.5 Configure Cargo and PyInstaller caching | Task 2 | cache steps present with correct `target/` path; checkbox `[x]` |
| 5.6 Cut `v0.1.0-rc.1` for end-to-end dry run | Task 3 | dispatch dry-run succeeded; tag dry-run documented; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `scripts/set_release_version.py` | Create |
| `scripts/test_set_release_version.py` | Create |
| `scripts/checksum_release_assets.py` | Create |
| `.github/workflows/release.yml` | Modify |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 5.4–5.6 |

---

### Task 1: Naming, checksums, upload (OpenSpec 5.4)

**Files:**
- Create: `scripts/set_release_version.py`
- Create: `scripts/test_set_release_version.py`
- Create: `scripts/checksum_release_assets.py`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml` (add pytest for the new scripts)
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.4 only)

**Interfaces:**
- Consumes: git tag `GITHUB_REF_NAME` (e.g. `v0.1.0-rc.1`) or workflow input `version`
- Produces: `set_release_version.strip_v_prefix("v0.1.0-rc.1") -> "0.1.0-rc.1"`; updates `apps/desktop/package.json` `"version"`, `apps/desktop/src-tauri/tauri.conf.json` `"version"`, `apps/desktop/src-tauri/Cargo.toml` `version =`; `checksum_release_assets.write_sha256(path) -> path.with_suffix(path.suffix + ".sha256")` wait: for `foo.exe` write `foo.exe.sha256`

- [ ] **Step 1: Write failing version tests**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from set_release_version import replace_json_version, strip_v_prefix


def test_strip_v() -> None:
    assert strip_v_prefix("v0.1.0-rc.1") == "0.1.0-rc.1"
    assert strip_v_prefix("0.2.0") == "0.2.0"


def test_replace_json_version_first_only() -> None:
    raw = '{\n  "version": "0.1.0",\n  "name": "spellbook-desktop"\n}\n'
    assert '"version": "0.2.0"' in replace_json_version(raw, "0.2.0")
    assert '"name": "spellbook-desktop"' in replace_json_version(raw, "0.2.0")
```

- [ ] **Step 2: Run to see fail, then implement `scripts/set_release_version.py`**

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def strip_v_prefix(tag: str) -> str:
    return tag[1:] if tag.startswith("v") else tag


def replace_cargo_version(text: str, version: str) -> str:
    return re.sub(
        r'(?m)^version = "[^"]+"',
        f'version = "{version}"',
        text,
        count=1,
    )


def replace_json_version(text: str, version: str) -> str:
    return re.sub(
        r'("version"\s*:\s*")([^"]+)(")',
        rf'\g<1>{version}\g<3>',
        text,
        count=1,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    version = strip_v_prefix(args.version)
    pkg = REPO / "apps/desktop/package.json"
    pkg.write_text(replace_json_version(pkg.read_text(encoding="utf-8"), version), encoding="utf-8")
    conf = REPO / "apps/desktop/src-tauri/tauri.conf.json"
    conf.write_text(replace_json_version(conf.read_text(encoding="utf-8"), version), encoding="utf-8")
    cargo = REPO / "apps/desktop/src-tauri/Cargo.toml"
    cargo.write_text(replace_cargo_version(cargo.read_text(encoding="utf-8"), version), encoding="utf-8")
    print(version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Preserve JSON key order by regex-replacing only the first `"version"` string in `package.json` and `tauri.conf.json`. Do not `json.dumps` the whole file.

- [ ] **Step 3: Checksum helper**

`scripts/checksum_release_assets.py`:

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksum(path: Path) -> Path:
    sidecar = path.with_name(path.name + ".sha256")
    digest = sha256_file(path)
    sidecar.write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    recorded = sidecar.read_text(encoding="utf-8").split()[0]
    if recorded != digest:
        raise SystemExit(f"checksum mismatch after write: {sidecar}")
    return sidecar


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.paths:
        if not path.is_file():
            raise SystemExit(f"missing asset: {path}")
        print(write_checksum(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Rename + upload steps in both jobs**

After each platform build, add steps. Insert **Set version from tag** immediately **before** `Prepare release resources` in both jobs from Task 5a (use `.venv` Python).

```yaml
      - name: Set version from tag
        if: startsWith(github.ref, 'refs/tags/v')
        run: .venv/bin/python scripts/set_release_version.py ${{ github.ref_name }}
```

On Windows the interpreter is `.\.venv\Scripts\python`. Do **not** rewrite versions on `workflow_dispatch`.

Windows collect/rename (then checksum, then unsigned check):

```yaml
      - name: Stage Windows assets
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force assets | Out-Null
          $exe = Get-ChildItem -Recurse target/release/bundle/nsis/*.exe | Select-Object -First 1
          if (-not $exe) { throw 'NSIS exe missing' }
          $pkg = Get-Content apps/desktop/package.json | ConvertFrom-Json
          $name = "Spellbook_$($pkg.version)_x64-setup.exe"
          Copy-Item $exe.FullName "assets/$name"
          .\.venv\Scripts\python scripts/checksum_release_assets.py "assets/$name"
          $sig = Get-AuthenticodeSignature "assets/$name"
          if ($sig.Status -ne 'NotSigned') { throw "expected unsigned installer, got $($sig.Status)" }
```

Linux:

```yaml
      - name: Stage Linux assets
        run: |
          mkdir -p assets
          VERSION=$(.venv/bin/python -c "import json; print(json.load(open('apps/desktop/package.json'))['version'])")
          APPIMAGE=$(find target/release/bundle/appimage -name '*.AppImage' | head -n 1)
          DEB=$(find target/release/bundle/deb -name '*.deb' | head -n 1)
          test -n "$APPIMAGE" && test -n "$DEB"
          cp "$APPIMAGE" "assets/Spellbook_${VERSION}_amd64.AppImage"
          cp "$DEB" "assets/Spellbook_${VERSION}_amd64.deb"
          .venv/bin/python scripts/checksum_release_assets.py \
            "assets/Spellbook_${VERSION}_amd64.AppImage" \
            "assets/Spellbook_${VERSION}_amd64.deb"
```

Upload:

```yaml
      - name: Upload workflow artifacts
        uses: actions/upload-artifact@v4
        with:
          name: spellbook-${{ runner.os }}
          path: assets/*

      - name: Publish GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release create "${{ github.ref_name }}" assets/* --generate-notes --verify-tag
```

Do not add `softprops/action-gh-release`. `workflow_dispatch` never hits this step. That is the spec dry-run: build + upload artifacts, skip GitHub Release.

Linux and Windows jobs both need this publish step **or** a final `publish` job that downloads both artifacts — prefer a **third job** `publish` that `needs: [windows, linux]`, downloads artifacts, and runs `gh release create` once so a failed Linux job cannot publish a Windows-only release.

```yaml
  publish:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [windows, linux]
    runs-on: ubuntu-24.04
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: assets
          merge-multiple: true
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release create "${{ github.ref_name }}" assets/* --generate-notes --verify-tag
```

Remove per-job Publish if you add `publish`. Keep per-job `upload-artifact`.

- [ ] **Step 5: Tests**

```powershell
.\.venv\Scripts\python -m pytest scripts\test_set_release_version.py -v
```

Extend CI pytest list with `scripts/test_set_release_version.py`.

- [ ] **Step 6: Mark OpenSpec 5.4 complete**

From:

```markdown
- [ ] 5.4 Upload release assets with versioned naming and `.sha256` checksum files
```

To:

```markdown
- [x] 5.4 Upload release assets with versioned naming and `.sha256` checksum files
```

- [ ] **Step 7: Commit**

```bash
git add scripts/set_release_version.py scripts/test_set_release_version.py scripts/checksum_release_assets.py .github/workflows/release.yml .github/workflows/ci.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
ci(release): upload versioned installers with SHA256 sidecars

Give GitHub Releases stable names and checksums without signing Windows binaries.
EOF
)"
```

---

### Task 2: Cargo and PyInstaller caches (OpenSpec 5.5)

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.5 only)

**Interfaces:**
- Consumes: `apps/desktop/src-tauri/Cargo.lock`
- Produces: cache keys per OS

- [ ] **Step 1: Insert cache steps after toolchain setup on both jobs**

```yaml
      - name: Cache Cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-release-cargo-${{ hashFiles('apps/desktop/src-tauri/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-release-cargo-

      - name: Cache PyInstaller
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/pyinstaller
            ~/AppData/Local/pyinstaller
          key: ${{ runner.os }}-pyinstaller-${{ hashFiles('services/ml/requirements-dev.txt') }}
          restore-keys: |
            ${{ runner.os }}-pyinstaller-
```

Windows `~/AppData/Local/pyinstaller` is the usual hooks cache; if the directory never appears, the cache step still succeeds.

- [ ] **Step 2: Mark OpenSpec 5.5 complete**

From:

```markdown
- [ ] 5.5 Configure Cargo and PyInstaller caching
```

To:

```markdown
- [x] 5.5 Configure Cargo and PyInstaller caching
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
ci(release): cache Cargo target and PyInstaller between tagged builds

Cut repeat compile time on native Windows and Ubuntu 24.04 runners.
EOF
)"
```

---

### Task 3: `v0.1.0-rc.1` dry run (OpenSpec 5.6)

**Files:**
- Modify: verification notes in `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md` **or** add a short section there named “Release workflow dry run”
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.6 only)

**Interfaces:**
- Consumes: merged `release.yml` on the default branch
- Produces: one successful `workflow_dispatch` (artifacts only) and one `v0.1.0-rc.1` tag run (published prerelease assets)

- [ ] **Step 1: Dispatch dry run**

GitHub → Actions → Release → Run workflow. Expected: both jobs green; artifacts `Spellbook_*` + `.sha256`; **no** GitHub Release.

- [ ] **Step 2: Tag dry run**

Only after Step 1 is green and groups 1–5.5 are `[x]`:

```bash
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

Expected: published GitHub Release (not draft) with auto notes, three binaries (exe, AppImage, deb) and three `.sha256` files. Windows exe is **unsigned**.

If the tag must wait on human permission to push, record that in the log and **do not** flip 5.6 until the tag workflow has actually run.

- [ ] **Step 3: Log**

```markdown
## Release workflow

- workflow_dispatch conclusion:
- v0.1.0-rc.1 Release URL:
- Asset names:
```

- [ ] **Step 4: Mark OpenSpec 5.6 complete**

From:

```markdown
- [ ] 5.6 Cut `v0.1.0-rc.1` tag for end-to-end dry run
```

To:

```markdown
- [x] 5.6 Cut `v0.1.0-rc.1` tag for end-to-end dry run
```

- [ ] **Step 5: Commit the log + checkbox** (the tag itself is not a commit)

```bash
git add docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
chore(openspec): record v0.1.0-rc.1 installer pipeline dry run

Close the release-workflow task group after tagged assets and checksums exist.
EOF
)"
```
