# Spellbook Desktop Scaffold (Tauri + React)

This is a minimal scaffold with screens (Library, Import, Chat, Export) and Tauri Rust command stubs.

## Quickstart

1) Install prerequisites
- Node 18+, pnpm or npm
- Rust toolchain (stable)
- Tauri 2 CLI: `npm i -g @tauri-apps/cli@latest` (or use npx)

2) Install JS deps
```bash
cd apps/desktop
pnpm install   # or npm install
```

3) Run in desktop mode
```bash
pnpm tauri:dev
```

If you want to run just the web UI for quick iteration:
```bash
pnpm dev
```

## Next steps
- Wire the database migrations (use `db/0001_init.sql` from the seed bundle).
- Implement Python sidecar for embeddings & FLAN-T5 (CTranslate2) and expose via Tauri commands.
- Replace mock UI calls with `invoke` from `@tauri-apps/api` (e.g., `invoke('search_keyword', { query })`).

