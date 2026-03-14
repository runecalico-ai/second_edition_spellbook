# knip-ci Specification

## Purpose
This specification defines the Knip integration for the desktop app: configuration, npm scripts, and CI behavior so that unused npm dependencies are caught in CI while unused exports and files are reported for optional cleanup.

## ADDED Requirements

### Requirement: Knip runs in desktop workspace
Knip SHALL be installed as a devDependency in `apps/desktop` and SHALL be run from that workspace (config and scripts in `apps/desktop` only).

#### Scenario: Knip executes in correct workspace
- **WHEN** a developer or CI runs the Knip script from the repository root or from `apps/desktop`
- **THEN** Knip SHALL analyze only the `apps/desktop` package (entry points, dependencies, and files under that workspace)
- **AND** SHALL NOT require or assume a monorepo root config

#### Scenario: Package name is canonical
- **WHEN** the Knip dependency is added
- **THEN** the package name SHALL be exactly `knip` as published on the npm registry (per Dependency Security Policy)

### Requirement: CI fails only on unused dependencies
Knip SHALL be configured so that the process exit code is non-zero only when there are unused dependencies (or devDependencies). Unused exports and unused files SHALL be reported but SHALL NOT cause a non-zero exit.

#### Scenario: Unused dependency fails CI
- **WHEN** Knip reports one or more unused dependencies
- **THEN** the Knip process SHALL exit with a non-zero code
- **AND** the CI step that runs Knip SHALL fail

#### Scenario: Unused export or file does not fail CI
- **WHEN** Knip reports only unused exports and/or unused files (and zero unused dependencies)
- **THEN** the Knip process SHALL exit with code zero
- **AND** the CI step that runs Knip SHALL succeed
- **AND** unused exports/files MAY be printed in the log for optional cleanup

### Requirement: Local lint runs Biome then Knip
The `lint` script in `apps/desktop` SHALL run Biome lint and then Knip so that a single local command covers both checks.

#### Scenario: Single command runs both tools
- **WHEN** a developer runs the script designated as the combined lint command (e.g. `pnpm lint`) from `apps/desktop`
- **THEN** the script SHALL run the Biome lint command first
- **AND** SHALL then run the Knip command (only if Biome succeeds, or as defined by the script)
- **AND** the developer SHALL not need to run a separate command for Knip for normal lint flow

### Requirement: CI has separate Lint and Knip steps
CI SHALL run Biome lint and Knip as two separate steps so that when a job fails, it is clear whether the failure was from the Lint (Biome) step or the Knip step.

#### Scenario: Two steps in CI
- **WHEN** the frontend (or desktop) CI job runs
- **THEN** there SHALL be a distinct step that runs only the Biome lint command (e.g. `lint:biome` or equivalent)
- **AND** there SHALL be a distinct step that runs only the Knip command
- **AND** step names or logs SHALL allow identifying which tool failed (e.g. "Lint" vs "Knip")

#### Scenario: Biome-only script available
- **WHEN** CI or a developer needs to run only Biome (without Knip)
- **THEN** a script SHALL be available (e.g. `lint:biome`) that runs only the Biome lint command
- **AND** the Knip script SHALL be available separately (e.g. `knip`) for running Knip alone

### Requirement: Knip configuration and entry points
Knip SHALL be configured in `apps/desktop` so that entry points (e.g. Vite entry, Tauri source, Playwright config) and framework (Vite, React) are correctly detected, and so that only unused-dependency issues cause a non-zero exit.

#### Scenario: Config file present
- **WHEN** the Knip command runs in `apps/desktop`
- **THEN** a Knip configuration file (e.g. `knip.json` or `knip.config.*`) SHALL exist in `apps/desktop`
- **AND** the config SHALL specify or allow correct detection of entry points and plugins for the stack (Vite, React, and where relevant Tauri/Playwright)

#### Scenario: Exit behavior matches spec
- **WHEN** the Knip config is applied
- **THEN** the exit code behavior SHALL match Requirement "CI fails only on unused dependencies" (non-zero only for unused deps; zero when only exports/files are reported)
