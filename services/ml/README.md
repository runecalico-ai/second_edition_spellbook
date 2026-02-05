# Spellbook ML Sidecar

This sidecar provides local-only helpers for embeddings, import parsing, chat, and export.

## Running (development)

```bash
python3 spellbook_sidecar.py <<EOF
{"jsonrpc":"2.0","id":1,"method":"embed","params":{"texts":["test"]}}
EOF
```

## Environment

Requires Python 3.14. The MVP is designed to run fully offline. When you are ready to enable real
models, install the optional dependencies from `requirements.txt` and place models in a local
folder. The sidecar will be extended to load those models without any network access.
