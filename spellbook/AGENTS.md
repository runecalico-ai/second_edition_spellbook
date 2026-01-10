# Agent Guide

## Repo layout

- `apps/desktop`: Tauri + React desktop app.
- `services/ml`: Python sidecar services.
- `db/migrations`: SQLite migrations.
- `scripts`: helper scripts.
- `spells_md`: markdown spell content.

## Desktop app workflow

**Prereqs:** Node 18+, pnpm or npm, Rust toolchain, Tauri CLI.

```bash
cd apps/desktop
pnpm install
pnpm tauri:dev
```

For the web UI (without the Tauri shell):

```bash
cd apps/desktop
pnpm dev
```

## Sidecar workflow

Location: `services/ml`.

- Dependencies live in `requirements.txt` and `requirements-dev.txt`.
- Example run (JSON-RPC):

```bash
cd services/ml
python3 spellbook_sidecar.py <<EOF
{"jsonrpc":"2.0","id":1,"method":"embed","params":{"texts":["test"]}}
EOF
```

## Testing guidance

Tests live in `services/ml/tests`. When needed:

```bash
cd services/ml
python -m pytest
```

## Notes

- Keep instructions offline-friendly since the sidecar is designed to run without network access.
- See `spellbook/README.md` for more details.
