# AI Agent Development Guide for Python Services

This document provides guidelines for AI agents working on Python services (ML/sidecar components).

## Project Structure

```
services/ml/
├── spellbook_sidecar.py   # Main sidecar script
├── requirements.txt        # Runtime dependencies
├── requirements-dev.txt    # Development dependencies
└── tests/                  # Unit tests
```

## Code Quality with Ruff

All Python code must pass Ruff linting checks. Run linting from the repository root:

```bash
# Activate virtual environment (Windows)
.\.venv\Scripts\Activate.ps1

# Run Ruff
cd services/ml
ruff check .

# Auto-fix where possible
ruff check --fix .
```

## Common Linting Issues

### Unused Imports (F401)

**❌ Avoid:**
```python
import subprocess  # Never used in the code
import sys
```

**✅ Good:**
```python
import sys  # Only import what you actually use
```

> [!IMPORTANT]
> Remove unused imports immediately. They bloat the module, confuse readers, and may have subtle performance impacts. Ruff can auto-fix these with `--fix`.

### Unused Variables (F841)

**❌ Avoid:**
```python
def handle_export(params: Dict[str, Any]) -> Dict[str, Any]:
    page_size = params.get("page_size") or "letter"  # Retrieved but never used
    character = params.get("character") or {}
    # ... rest of function doesn't reference page_size
```

**✅ Good:**
```python
def handle_export(params: Dict[str, Any]) -> Dict[str, Any]:
    # Only extract parameters you actually need
    character = params.get("character") or {}
    output_dir = Path(params.get("output_dir") or os.getcwd())
```

**✅ Alternative (if used later):**
```python
def handle_export(params: Dict[str, Any]) -> Dict[str, Any]:
    page_size = params.get("page_size") or "letter"
    # Actually use it in the export logic
    html = render_html(spells, page_size=page_size)
```

> [!TIP]
> If a parameter might be needed in the future but isn't currently used, remove it now and add it back when it's actually implemented. Premature extraction creates dead code.

## Type Hints

Always use type hints for function signatures:

```python
from typing import Any, Dict, List

def my_function(param: str) -> Dict[str, Any]:
    return {"result": param}
```

## Testing

Run tests with pytest:

```bash
pytest tests/
```

## Common Pitfalls

1. **Unused imports**: Run `ruff check --fix` to auto-remove
2. **Unused variables**: Extract parameters only when you need them
3. **Type hints**: Include them for all public functions and methods
