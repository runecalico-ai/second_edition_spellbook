# Tasks: Add Knip CI Hygiene

## Dependency and configuration
- [x] Add `knip` as a devDependency in `apps/desktop/package.json` (exact package name `knip` from npm).
- [x] Create Knip config in `apps/desktop` (e.g. `knip.json` or `knip.config.ts`):
  - [x] Set or allow correct entry points for Vite, React, and (if needed) Tauri/Playwright.
  - [x] Configure so exit code is non-zero only for unused dependencies; unused exports and files are reported but do not change exit code.
- [x] Run `pnpm run knip` (once script exists) and confirm entry-point detection; add ignores or entry points for any false positives (e.g. dynamic imports, test/Playwright usage).

## Scripts
- [x] In `apps/desktop/package.json`:
  - [x] Add `lint:biome`: run `biome lint .` (Biome only).
  - [x] Add `knip`: run Knip (e.g. `knip` with no extra args if config handles behavior).
  - [x] Change `lint` to run `lint:biome` then `knip` (e.g. `pnpm run lint:biome && pnpm run knip`).
- [x] Verify locally: `pnpm run lint` runs Biome then Knip; `pnpm run lint:biome` and `pnpm run knip` work when run alone.

## Unused dependencies
- [x] Run Knip and fix or remove any reported unused dependencies so CI can be green on first enablement.
- [x] If any must remain temporarily, document or allow-list and add a follow-up task to remove.

## CI
- [x] In `.github/workflows/ci.yml`, replace or split the "Lint (JS)" step:
  - [x] Step 1 (e.g. "Lint (JS)" or "Lint (Biome)"): run `pnpm run lint:biome` in `apps/desktop`.
  - [x] Step 2 (e.g. "Knip"): run `pnpm run knip` in `apps/desktop`.
- [x] Ensure step names or logs make it clear which tool failed (e.g. "Lint (Biome)" vs "Knip").
- [x] Verify locally by introducing an unused dependency and running Knip to confirm failure behavior; then remove it and confirm both lint steps pass.

## Documentation
- [x] Update `docs/DEVELOPMENT.md` (or equivalent):
  - [x] Mention Knip and that `pnpm lint` runs Biome + Knip.
  - [x] Document `pnpm run lint:biome` and `pnpm run knip` for running tools separately.
  - [x] Note that CI fails only on unused dependencies; unused exports/files are informational.
