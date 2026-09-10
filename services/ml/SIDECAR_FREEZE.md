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

Transitive wheels (`charset-normalizer`, `lxml`, `cryptography`, etc.) are pulled by pip at freeze time. Do not add them to `requirements.txt` unless a freeze build fails with a missing module; if that happens, pin the missing module after a fresh Dependency Security review.

## Out of freeze

- `pytest`
- `ruff`
- TinyLlama / MiniLM model files

## Dependency provenance

- Why: freeze `spellbook_sidecar.py` for Tauri `externalBin` (no existing freezer in-repo)
- pyinstaller 6.22.2 from PyPI — https://pypi.org/project/pyinstaller/6.22.2/ — upstream https://github.com/pyinstaller/pyinstaller — verified via https://pyinstaller.org/en/stable/installation.html
- pyinstaller-hooks-contrib 2026.7 from PyPI — required companion; resolved by `pip install pyinstaller==6.22.2` then `pip show`
- Human approval: 2026-09-03 for `pyinstaller==6.22.2`
