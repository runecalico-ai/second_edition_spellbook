# Tasks: Add Knip CI Hygiene

## Dependency and configuration
- [ ] Add `knip` as a devDependency in `apps/desktop/package.json` (exact package name `knip` from npm).
- [ ] Create Knip config in `apps/desktop` (e.g. `knip.json` or `knip.config.ts`):
  - [ ] Set or allow correct entry points for Vite, React, and (if needed) Tauri/Playwright.
  - [ ] Configure so exit code is non-zero only for unused dependencies; unused exports and files are reported but do not change exit code.
- [ ] Run `pnpm run knip` (once script exists) and confirm entry-point detection; add ignores or entry points for any false positives (e.g. dynamic imports, test/Playwright usage).

## Scripts
- [ ] In `apps/desktop/package.json`:
  - [ ] Add `lint:biome`: run `biome lint .` (Biome only).
  - [ ] Add `knip`: run Knip (e.g. `knip` with no extra args if config handles behavior).
  - [ ] Change `lint` to run `lint:biome` then `knip` (e.g. `pnpm run lint:biome && pnpm run knip`).
- [ ] Verify locally: `pnpm run lint` runs Biome then Knip; `pnpm run lint:biome` and `pnpm run knip` work when run alone.

## Unused dependencies
- [ ] Run Knip and fix or remove any reported unused dependencies so CI can be green on first enablement.
- [ ] If any must remain temporarily, document or allow-list and add a follow-up task to remove.

## CI
- [ ] In `.github/workflows/ci.yml`, replace or split the "Lint (JS)" step:
  - [ ] Step 1 (e.g. "Lint (JS)" or "Lint (Biome)"): run `pnpm run lint:biome` in `apps/desktop`.
  - [ ] Step 2 (e.g. "Knip"): run `pnpm run knip` in `apps/desktop`.
- [ ] Ensure step names or logs make it clear which tool failed (e.g. "Lint (Biome)" vs "Knip").
- [ ] Verify: push a branch where Knip fails (e.g. add an unused dep) and confirm the Knip step fails and the job fails; fix and confirm both steps pass.

## Documentation
- [ ] Update `docs/DEVELOPMENT.md` (or equivalent):
  - [ ] Mention Knip and that `pnpm lint` runs Biome + Knip.
  - [ ] Document `pnpm run lint:biome` and `pnpm run knip` for running tools separately.
  - [ ] Note that CI fails only on unused dependencies; unused exports/files are informational.
