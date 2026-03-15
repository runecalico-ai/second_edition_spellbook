# Add Knip CI Hygiene

## Why

Unused dependencies, exports, and files accumulate over time and are hard to spot manually. Adding Knip to the project gives ongoing hygiene: CI will catch new unused npm dependencies so they don’t creep in, while unused exports and files are reported for optional cleanup.

## What Changes

- Add **knip** as a devDependency in `apps/desktop` (canonical package name verified from [knip.dev](https://knip.dev/) / npm).
- **Scripts** in `apps/desktop/package.json`:
  - **`lint`** — Run Biome then Knip so one local command covers both (Biome lint, then Knip).
  - **`lint:biome`** — Biome only (for CI step 1).
  - **`knip`** — Knip only, configured so the process exits with a non-zero code only when there are **unused dependencies**; unused exports and files are reported but do not fail the run.
- **CI** (e.g. `.github/workflows/ci.yml`): two separate steps — one for Lint (Biome), one for Knip — so it is clear which tool failed when a job fails.
- **Knip config** in `apps/desktop` so entry points and framework (Vite, React, Tauri) are detected correctly, and so only unused-dependency issues cause CI failure.

## Capabilities

### New Capabilities

- **knip-ci**: Knip integration for the desktop app: configuration (entry points, plugins), npm scripts, and CI step; contract that CI fails only on unused dependencies and that local `pnpm lint` runs both Biome and Knip.

### Modified Capabilities

- None. No existing spec requirements change; this is additive tooling in `apps/desktop`.

## Impact

- **Code**: `apps/desktop/package.json` (new devDependency, new/updated scripts), new Knip config file in `apps/desktop`.
- **CI**: `.github/workflows/ci.yml` (or equivalent) gains a separate Knip step; no change to Rust or Python jobs.
- **Docs**: `docs/DEVELOPMENT.md` (or similar) updated to mention Knip and the new scripts.
- **Scope**: JS/TS only in `apps/desktop`; Rust backend and Python sidecar are out of scope.
