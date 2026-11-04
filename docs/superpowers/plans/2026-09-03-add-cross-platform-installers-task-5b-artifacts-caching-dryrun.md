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
- Cache PyInstaller: `~/.cache/pyinstaller` on Linux and `%LOCALAPPDATA%\pyinstaller` on Windows if present, plus leave `services/ml/dist` uncached in git. (superseded: no PyInstaller cache, see Task 2 outcome)
- One full installer per OS; no lite artifact.
- Do not rewrite delta specs. Flip 5.4–5.6 only after each deliverable works.
- Publish and version stamping run only on a real tag push: `github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')`. Never gate on the ref alone — a `workflow_dispatch` started from a tag ref has `github.ref == refs/tags/...` and must still be a dry run (no release, no version rewrite).
- Workflow-level `permissions` stays `contents: read` (set in 5a). Only the `publish` job gets `contents: write`.
- Every `uses:` in `release.yml` is pinned to a full commit SHA with a trailing `# vX.Y.Z` comment, using the values in Task 0. `ci.yml` keeps its tags (out of scope).
- Every `actions/checkout` in `release.yml` sets `persist-credentials: false`. Every job sets `timeout-minutes` (build jobs `120`, `publish` `15`; retune after the 5.6 dry run).
- The sqlite-vec archive download is verified against a pinned SHA-256 before extraction. Unpinned version/platform/arch combinations fail closed.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| — (hardening, no checkbox) | Task 0 | SHA-pinned actions, `persist-credentials: false`, `timeout-minutes`, sqlite-vec SHA-256 pin with tests |
| 5.4 Upload versioned names and `.sha256` files | Task 1 | workflow uploads those files; checkbox `[x]` in Task 3 |
| 5.5 Configure Cargo and PyInstaller caching | Task 2 | Cargo restore/save steps present with correct `target/` paths; PyInstaller cache dropped (see Task 2 outcome); checkbox `[x]` in Task 3 |
| 5.6 Cut `v0.1.0-rc.1` for end-to-end dry run | Task 3 | dispatch dry-run succeeded; tag dry-run documented; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `scripts/set_release_version.py` | Create |
| `scripts/test_set_release_version.py` | Create |
| `scripts/checksum_release_assets.py` | Create |
| `scripts/provision_sqlite_vec.py` | Modify (SHA-256 pin) |
| `scripts/test_provision_sqlite_vec.py` | Modify (checksum tests) |
| `.github/workflows/release.yml` | Modify |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 5.4–5.6 |

---

### Task 0: Harden the release workflow (no OpenSpec item)

Do this first so every step Tasks 1–2 add follows the same rules.

**Files:**
- Modify: `scripts/provision_sqlite_vec.py`
- Modify: `scripts/test_provision_sqlite_vec.py`
- Modify: `.github/workflows/release.yml` (existing `windows` and `linux` jobs from 5a)

**Interfaces:**
- Produces: `provision_sqlite_vec.ARCHIVE_SHA256: dict[tuple[str, str, str], str]` keyed by `(version, os_platform, arch)`; `provision_sqlite_vec.expected_sha256(version, os_platform, arch) -> str` (raises `SystemExit` when unpinned)
- Produces: pinned action references below, reused verbatim by Tasks 1–2

**Pinned action SHAs** (resolved 2026-11-03 with `git ls-remote` against each upstream repo; the SHA is the peeled commit of the exact release tag, which matched the moving major tag at that time):

| Action | Pin |
| ------ | --- |
| `actions/checkout` | `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` |
| `pnpm/action-setup` | `pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0` |
| `actions/setup-node` | `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0` |
| `dtolnay/rust-toolchain` | `dtolnay/rust-toolchain@b725eda525362e7cf34af9a7243cac1e3f01a7ec # stable` |
| `actions/setup-python` | `actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0` |
| `actions/upload-artifact` | `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2` |
| `actions/download-artifact` | `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0` |
| `actions/cache` | `actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0` |

`dtolnay/rust-toolchain` infers the toolchain from the ref name. When pinned to a SHA it **requires** `with: toolchain: stable`.

**sqlite-vec v0.1.6 archive SHA-256** (computed locally on 2026-11-03 and matched against the release's own `checksums.txt`, uploaded by `github-actions[bot]` on 2024-11-20):

| Asset | SHA-256 |
| ----- | ------- |
| `sqlite-vec-0.1.6-loadable-linux-x86_64.tar.gz` | `438e0df29f3f8db3525b3aa0dcc0a199869c0bcec9d7abc5b51850469caf867f` |
| `sqlite-vec-0.1.6-loadable-windows-x86_64.tar.gz` | `f1c615577ad2e692d1e2fe046fe65994dafd8a8cae43e9e864f5f682dc295964` |

- [x] **Step 1: Re-verify the pins before using them**

Re-run for each action (example for checkout) and confirm the peeled SHA equals the table:

```bash
git ls-remote --tags https://github.com/actions/checkout 'refs/tags/v4.4.0^{}'
git ls-remote https://github.com/dtolnay/rust-toolchain refs/heads/stable
```

For `dtolnay/rust-toolchain`, a newer `stable` head is acceptable; record the SHA you use. For the sqlite-vec hashes, fetch `https://github.com/asg017/sqlite-vec/releases/download/v0.1.6/checksums.txt` and confirm both lines match. If anything differs, **stop and escalate** (see `docs/DEPENDENCY_SECURITY.md`).

- [x] **Step 2: Write failing sqlite-vec checksum tests**

In `scripts/test_provision_sqlite_vec.py`, add `import hashlib` and `import provision_sqlite_vec`, then add:

```python
def _pin_payload(
    monkeypatch: pytest.MonkeyPatch, payload: bytes, os_platform: str = "windows", arch: str = "x86_64"
) -> None:
    monkeypatch.setitem(
        provision_sqlite_vec.ARCHIVE_SHA256,
        (SQLITE_VEC_VERSION, os_platform, arch),
        hashlib.sha256(payload).hexdigest(),
    )


def test_pinned_archive_hashes() -> None:
    assert provision_sqlite_vec.ARCHIVE_SHA256 == {
        ("0.1.6", "linux", "x86_64"): "438e0df29f3f8db3525b3aa0dcc0a199869c0bcec9d7abc5b51850469caf867f",
        ("0.1.6", "windows", "x86_64"): "f1c615577ad2e692d1e2fe046fe65994dafd8a8cae43e9e864f5f682dc295964",
    }


def test_stage_library_rejects_checksum_mismatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _targz_with_member("vec0.dll", b"tampered")
    monkeypatch.setattr(urllib.request, "urlopen", lambda url, timeout=None: _FakeResponse(payload))
    dest = tmp_path / "out"
    with pytest.raises(SystemExit) as exc:
        stage_library(dest, "0.1.6", "windows", "x86_64")
    assert "SHA-256 mismatch" in str(exc.value)
    assert not (dest / "vec0.dll").exists()


def test_stage_library_rejects_unpinned_asset_before_download(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as exc:
        stage_library(tmp_path / "out", "0.1.6", "macos", "aarch64")
    assert "No pinned SHA-256" in str(exc.value)
```

The autouse `_block_network` fixture raises `AssertionError` on any `urlopen`, so the unpinned test also proves the check runs before the download.

In the two existing tests that stage a fake payload successfully or reach extraction (`test_stage_library_copies_archive_root_dll`, `test_stage_library_rejects_nested_library`), call `_pin_payload(monkeypatch, payload)` before `stage_library`. Run and confirm the new tests fail:

```powershell
.\.venv\Scripts\python -m pytest scripts\test_provision_sqlite_vec.py -v
```

- [x] **Step 3: Implement the pin in `scripts/provision_sqlite_vec.py`**

Add `import hashlib`, then below `RELEASE_BASE`:

```python
# Values must match the upstream release's checksums.txt.
ARCHIVE_SHA256: dict[tuple[str, str, str], str] = {
    ("0.1.6", "linux", "x86_64"): "438e0df29f3f8db3525b3aa0dcc0a199869c0bcec9d7abc5b51850469caf867f",
    ("0.1.6", "windows", "x86_64"): "f1c615577ad2e692d1e2fe046fe65994dafd8a8cae43e9e864f5f682dc295964",
}


def expected_sha256(version: str, os_platform: str, arch: str) -> str:
    try:
        return ARCHIVE_SHA256[(version, os_platform, arch)]
    except KeyError:
        raise SystemExit(
            f"No pinned SHA-256 for {asset_name(version, os_platform, arch)}; "
            "add it to ARCHIVE_SHA256 from the release's checksums.txt"
        ) from None
```

Change `stage_library` so the expected hash is looked up **before** the download and the bytes are verified **before** they are written or extracted:

```python
def stage_library(dest: Path, version: str, os_platform: str, arch: str) -> Path:
    expected = expected_sha256(version, os_platform, arch)
    dest.mkdir(parents=True, exist_ok=True)
    url = download_url(version, os_platform, arch)
    lib = library_name(os_platform)
    with tempfile.TemporaryDirectory() as tmp:
        archive_path = Path(tmp) / asset_name(version, os_platform, arch)
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
        except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError) as exc:
            raise SystemExit(f"Failed to download sqlite-vec from {url}: {exc}") from exc
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected:
            raise SystemExit(f"SHA-256 mismatch for {url}: expected {expected}, got {actual}")
        archive_path.write_bytes(data)
        # ... existing extract / copy / chmod code unchanged ...
```

Re-run the tests from Step 2; all must pass. Then do one real download to prove the pinned hash matches the live asset:

```powershell
$d = Join-Path $env:TEMP "sqlite-vec-pin-check"
.\.venv\Scripts\python scripts\provision_sqlite_vec.py --dest $d
```

- [x] **Step 4: Harden the existing `windows` and `linux` jobs**

In `.github/workflows/release.yml`:

1. Add `timeout-minutes: 120` to each job, directly under `runs-on:`.
2. Replace every `uses:` with the pinned value from the table above.
3. Give both checkout steps `persist-credentials: false`:

```yaml
      - name: Checkout
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
```

4. Give both Rust steps an explicit toolchain:

```yaml
      - name: Set up Rust
        uses: dtolnay/rust-toolchain@b725eda525362e7cf34af9a7243cac1e3f01a7ec # stable
        with:
          toolchain: stable
```

Do not change `ci.yml`.

- [x] **Step 5: Sanity check**

Parse `release.yml` with the `yaml` package already in the pnpm store (`apps/desktop/node_modules/.pnpm/yaml@*/node_modules/yaml`; `actionlint` is not installed, and do not install it). Assert every `uses:` matches `^[^@]+@[0-9a-f]{40}$`, every checkout has `persist-credentials: false`, every job has `timeout-minutes`, and every `dtolnay/rust-toolchain` step has `with.toolchain == 'stable'`.

- [x] **Step 6: Commit**

```bash
git add scripts/provision_sqlite_vec.py scripts/test_provision_sqlite_vec.py .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
ci(release): pin actions and verify sqlite-vec download

Pin release actions to commit SHAs, drop persisted checkout credentials,
bound job runtime, and reject sqlite-vec archives that fail SHA-256.
EOF
)"
```

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

- [x] **Step 1: Write failing version tests**

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

- [x] **Step 2: Run to see fail, then implement `scripts/set_release_version.py`**

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

- [x] **Step 3: Checksum helper**

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

- [x] **Step 4: Rename + upload steps in both jobs**

After each platform build, add steps. Insert **Set version from tag** immediately **before** `Prepare release resources` in both jobs from Task 5a (use `.venv` Python).

```yaml
      - name: Set version from tag
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
        run: .venv/bin/python scripts/set_release_version.py ${{ github.ref_name }}
```

On Windows the interpreter is `.\.venv\Scripts\python`. Do **not** rewrite versions on `workflow_dispatch`, including a dispatch started from a tag ref (hence the `event_name` check).

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
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: spellbook-${{ runner.os }}
          path: assets/*

      - name: Publish GitHub Release
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release create "${{ github.ref_name }}" assets/* --generate-notes --verify-tag
```

Do not add `softprops/action-gh-release`. `workflow_dispatch` never hits this step, even when dispatched from a tag ref, because the gate checks `github.event_name`. That is the spec dry-run: build + upload artifacts, skip GitHub Release.

Linux and Windows jobs both need this publish step **or** a final `publish` job that downloads both artifacts — prefer a **third job** `publish` that `needs: [windows, linux]`, downloads artifacts, and runs `gh release create` once so a failed Linux job cannot publish a Windows-only release.

```yaml
  publish:
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
    needs: [windows, linux]
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          path: assets
          merge-multiple: true
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: gh release create "${{ github.ref_name }}" assets/* --generate-notes --verify-tag
```

Remove per-job Publish if you add `publish`. Keep per-job `upload-artifact`. The `publish` job has no checkout, so `gh` needs `GH_REPO` to know the repository.

- [x] **Step 5: Tests**

```powershell
.\.venv\Scripts\python -m pytest scripts\test_set_release_version.py -v
```

Extend CI pytest list with `scripts/test_set_release_version.py`.

- [ ] **Step 6: Mark OpenSpec 5.4 complete**

Deferred to Task 3: 5.4 stays `[ ]` until the dry run proves upload and publish on GitHub.

From:

```markdown
- [ ] 5.4 Upload release assets with versioned naming and `.sha256` checksum files
```

To:

```markdown
- [x] 5.4 Upload release assets with versioned naming and `.sha256` checksum files
```

- [x] **Step 7: Commit**

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

> **Outcome (human rulings, 2026-11-03):** The YAML sample below is superseded by `.github/workflows/release.yml`.
> - **Tag pushes use no caches.** No Cargo cache restore or save, and the setup-node pnpm and setup-python pip caches are off on push. This closes any cache-poisoning route into published installers; slower tag builds are accepted.
> - **Cargo cache on `workflow_dispatch` only.** Dispatch runs restore it; only dispatch on the default branch saves it (caches are ref-scoped). Paths: `~/.cargo/registry/index`, `~/.cargo/registry/cache`, `~/.cargo/git/db`, `target/release/*`, `!target/release/bundle` (bare `target` would ignore the exclusion and cache stale installers). Exact key, no `restore-keys`.
> - **No PyInstaller cache.** `services/ml/build_sidecar.py` runs PyInstaller with `--clean`, which empties the cache directory, and `spellbook_sidecar.spec` sets `strip=False, upx=False`, so the cache is never filled.
> - **Checkboxes.** 5.4 and 5.5 stay `[ ]` until the Task 3 dry run proves them; Task 3 ticks 5.4, 5.5 and 5.6 together. 5.5 is ticked on the Cargo cache plus setup-python's pip cache (dispatch runs).

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.5 only)

**Interfaces:**
- Consumes: `apps/desktop/src-tauri/Cargo.lock`
- Produces: cache keys per OS

- [ ] **Step 1: Insert cache steps after toolchain setup on both jobs**

```yaml
      - name: Cache Cargo
        uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-release-cargo-${{ hashFiles('apps/desktop/src-tauri/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-release-cargo-

      - name: Cache PyInstaller
        uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
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

Deferred to Task 3: 5.5 stays `[ ]` until the dry run proves the cache.

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
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.4–5.6)

**Interfaces:**
- Consumes: merged `release.yml` on the default branch
- Produces: two successful default-branch `workflow_dispatch` runs (cold and warm cache; artifacts only) and one `v0.1.0-rc.1` tag run (published prerelease assets)

- [ ] **Step 1: Dispatch dry run**

GitHub → Actions → Release → Run workflow. Expected: both jobs green; artifacts `Spellbook_*` + `.sha256`; **no** GitHub Release.

This first dispatch is the cold, cache-seeding run. Expected: `Restore Cargo cache` misses and `Save Cargo cache` runs in both jobs. Record each job's duration (cold build; compare with `timeout-minutes: 120`) and the saved cache key and size per OS (Actions → Caches, or `gh cache list`).

Dispatch a second time from the default branch. Expected: `Restore Cargo cache` reports an exact hit, `Save Cargo cache` is skipped, and staging still finds exactly one bundle per format (so `target/release/bundle` was not restored). Record the warm durations.

Dispatch artifacts are test-only: they are built from caches that default-branch workflows can write. Only tag-push assets are distributable.

- [ ] **Step 2: Tag dry run**

Only after Step 1 is green and groups 1–5.3 are `[x]` (5.4/5.5 are ticked in Step 4 after this run):

```bash
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1
```

Expected: published GitHub Release (not draft) with auto notes, three binaries (exe, AppImage, deb) and three `.sha256` files. Windows exe is **unsigned**. In both build jobs, `Restore Cargo cache` and `Save Cargo cache` are **skipped**, and setup-node and setup-python log no cache restore. Record the cold tag build duration per job.

Then dispatch once more with **Use workflow from** set to the `v0.1.0-rc.1` tag. Expected: both build jobs green, `publish` **skipped**, the "Set version from tag" steps **skipped**, and the existing release unchanged. This proves the `event_name` gate. `Restore Cargo cache` hits (a tag-ref run can read the default-branch cache) and `Save Cargo cache` is skipped.

If the tag must wait on human permission to push, record that in the log and **do not** flip 5.6 until the tag workflow has actually run.

- [ ] **Step 3: Log**

```markdown
## Release workflow

- workflow_dispatch conclusion:
- Cold dispatch durations (windows / linux):
- Cargo cache saved (key, size per OS):
- Warm dispatch: cache hit + durations:
- v0.1.0-rc.1 Release URL:
- Asset names:
- Tag run: cache steps skipped (yes/no) + durations:
- Tag-ref dispatch: cache hit, publish/version skipped:
```

- [ ] **Step 4: Mark OpenSpec 5.6 complete**

Tick 5.4 and 5.5 in the same edit (deferred from Tasks 1 and 2), but only if the Step 3 log fields show the expected results above.

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
