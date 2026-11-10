# Sidecar freeze audit

## Runtime imports that must be inside the frozen binary

| User-facing feature | Import | Declared package |
| ------------------- | ------ | ---------------- |
| PDF import | `pdfminer.high_level.extract_text` | `pdfminer.six` |
| DOCX import | `docx.Document` | `python-docx` |
| Markdown import | stdlib | none |
| HTML / "PDF" export | stdlib HTML renderer | none |

PDF export (`format: "pdf"`) returns print-optimized HTML. Do not bundle a PDF engine.

## Hiddenimports for PyInstaller

- `pdfminer`
- `pdfminer.high_level`
- `pdfminer.layout`
- `docx`

Every package the release freeze installs, including transitive wheels, is pinned with `==` in `requirements-release.in`. `requirements-release.lock` adds the SHA-256 of every PyPI file for each pin (`python services/ml/release_requirements.py`). Release builds install it with `pip install --require-hashes --only-binary=:all:`. Change a pin only after a Dependency Security review, then regenerate the lock and run `pytest services/ml/tests/test_release_requirements.py`.

## Out of freeze

- `pytest`
- `ruff`
- TinyLlama / MiniLM model files

## Dependency provenance

- Why: freeze `spellbook_sidecar.py` for Tauri `externalBin` (no existing freezer in-repo)
- pyinstaller 6.22.2 from PyPI — https://pypi.org/project/pyinstaller/6.22.2/ — upstream https://github.com/pyinstaller/pyinstaller — verified via https://pyinstaller.org/en/stable/installation.html
- pyinstaller-hooks-contrib 2026.7 from PyPI — required companion; resolved by `pip install pyinstaller==6.22.2` then `pip show`
- Human approval: 2026-09-03 for `pyinstaller==6.22.2`
- Release lock (2026-11-05): pinned the existing freeze environment, no upgrades. `altgraph 0.17.5`, `cffi 2.1.1`, `charset-normalizer 3.5.1`, `cryptography 50.0.1`, `lxml 6.1.3`, `packaging 26.3`, `pdfminer.six 20260107`, `pefile 2024.8.26`, `pycparser 3.0`, `pyinstaller 6.22.2`, `pyinstaller-hooks-contrib 2026.7`, `python-docx 1.2.0`, `pywin32-ctypes 0.2.3`, `setuptools 84.0.0`, `typing_extensions 4.16.0`. PyPI pages and upstream links: Part 3 plan, Task 2 Step 1 table. Human approval: runecalico-ai, 2026-11-05.
