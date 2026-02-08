# Design: Knip CI Hygiene

## Context

The desktop app (`apps/desktop`) is a Tauri + React + Vite + TypeScript workspace. Linting and formatting use Biome (`pnpm lint`, `pnpm format`). CI runs in `.github/workflows/ci.yml`. There is no existing tooling for unused dependencies, exports, or files. The repo follows [Dependency Security Policy](../../docs/DEPENDENCY_SECURITY.md): new dependencies must use the exact canonical package name from official sources (here: [knip.dev](https://knip.dev/) / npm package `knip`).

## Goals / Non-Goals

**Goals:**
- CI fails only when Knip reports **unused dependencies**; unused exports and files are reported but do not fail the run.
- Locally, one command (`pnpm lint`) runs both Biome and Knip.
- In CI, two separate steps (Lint / Knip) so it is clear which tool failed.
- Knip correctly detects entry points and framework (Vite, React, Tauri) in `apps/desktop`.

**Non-Goals:**
- Failing CI on unused exports or unused files (optional cleanup only).
- Running Knip in other workspaces (Rust, Python) or at repo root.
- One-off bulk cleanup of existing dead code; this change is about adding the gate and scripts.

## Decisions

### Decision: Knip config so only unused dependencies exit non-zero

Use Knip’s configuration to treat unused exports and unused files as non-fatal (e.g. `ignore` or equivalent so they don’t set exit code), and leave dependency issues as fatal.

- **Why**: Matches the product decision (Option C): strict on deps, informational on exports/files.
- **How**: In `knip.json` (or `knip.config.*`) in `apps/desktop`, configure issue types so that only `dependencies` (and optionally `devDependencies`) cause a non-zero exit; other categories are reported only.
- **Alternative considered**: Single exit-on-any-issue with a wrapper script that parses output and exits 0 for non-dependency issues — rejected in favor of using Knip’s native config so behavior is standard and maintainable.

### Decision: Script layout — `lint` = Biome then Knip; separate `lint:biome` and `knip`

- **`lint`**: Runs `lint:biome` then `knip` (e.g. `pnpm run lint:biome && pnpm run knip`). One local command for full lint + Knip.
- **`lint:biome`**: `biome lint .` only. Used by the first CI step.
- **`knip`**: Knip only (e.g. `knip` with appropriate args/config). Used by the second CI step and for local-only Knip runs.

- **Why**: Aligns with user preference: local = single flow (A), CI = separate steps (B) for clear failure attribution.
- **Alternative considered**: Single `lint` that only runs Biome, with Knip as a separate script and no combined command — rejected so local “lint” still implies “lint + Knip” without remembering a second command.

### Decision: CI — two steps in the same job (or same workflow)

Add a second step after the existing “Lint” (Biome) step that runs `pnpm run knip` in `apps/desktop`. Keep one job so we don’t multiply matrix legs; two steps give clear logs (e.g. “Lint” vs “Knip”).

- **Why**: Clear which tool failed; no need for separate jobs unless the team later wants parallelization.
- **Alternative considered**: Single step running `pnpm run lint` (Biome + Knip) — rejected because then a Knip failure would show as “Lint” without distinguishing Biome vs Knip.

### Decision: Knip config file in `apps/desktop`

Add a Knip config file (e.g. `knip.json` or `knip.config.ts`) in `apps/desktop` to:

- Set entry points (e.g. Vite entry, Tauri entry, Playwright config) so Knip’s graph is accurate.
- Rely on Knip’s auto-detection for Vite/React; add or adjust plugins if Tauri/Playwright need explicit handling.
- Enforce “exit non-zero only for unused dependencies” as above.

- **Why**: Single package; config lives next to `package.json` and avoids affecting other parts of the repo.
- **Alternative considered**: Root-level Knip config — rejected because the only JS/TS workspace is `apps/desktop` and a root config would be misleading for a non-monorepo.

## Risks / Trade-offs

- **Knip false positives (e.g. dynamic imports, Tauri/Playwright)**  
  **Mitigation**: Configure entry points and use Knip’s ignore/allow lists for known false positives; iterate on config when CI or local runs report incorrect “unused” items.

- **Existing unused deps in `apps/desktop`**  
  **Mitigation**: Before or as part of this change, run Knip and fix or remove any reported unused dependencies so CI is green on first enablement; or temporarily allow-list and clear in a follow-up.

- **Script naming**  
  **Trade-off**: `lint` currently means “Biome” to some; after the change it means “Biome + Knip.” Docs (e.g. DEVELOPMENT.md) and any automation that assumes “lint = Biome only” should be updated and, if needed, use `lint:biome` in CI.

## Migration Plan

1. Add `knip` as a devDependency in `apps/desktop` (exact name from npm).
2. Add `knip.json` (or chosen config format) in `apps/desktop` with entry points and “fail only on unused deps” behavior.
3. Add scripts: `lint:biome`, `knip`, and `lint` = `lint:biome && knip`.
4. Run `pnpm run knip` locally; fix any reported unused dependencies (or add allow-list with a follow-up to clean).
5. Add the Knip step to CI after the existing Lint step; verify both steps run and that a failing Knip (e.g. add an unused dep) fails the job.
6. Update docs (e.g. DEVELOPMENT.md) to describe Knip and the new scripts.

No rollback beyond: remove the Knip step and the `knip` script if needed; `lint` can be reverted to run only `lint:biome`.

## Open Questions

- None. Entry points and “deps-only” config can be finalized when adding the config file (e.g. by running `knip --help` or consulting Knip docs for the exact option names).
