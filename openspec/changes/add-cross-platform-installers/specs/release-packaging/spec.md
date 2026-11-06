## ADDED Requirements

### Requirement: Windows NSIS Installer

The release pipeline SHALL produce a Windows NSIS installer (`.exe`) for the x86_64-pc-windows-msvc target on every tagged release.

#### Scenario: Tagged release produces Windows installer

- **WHEN** a maintainer pushes a git tag matching `v*` (e.g. `v0.2.0`)
- **THEN** the release workflow SHALL build the application on `windows-latest`
- **AND** SHALL upload a single NSIS setup executable as a GitHub Release asset

#### Scenario: VC++ runtime check at install time

- **WHEN** a user runs the Windows installer on a machine without the MSVC x64 redistributable
- **THEN** the installer SHALL display a warning with a link to the official Microsoft redistributable
- **AND** SHALL NOT silently install the redistributable
- **AND** SHALL allow the user to continue installation after acknowledging the warning

### Requirement: Linux AppImage and Debian Package

The release pipeline SHALL produce Linux AppImage and `.deb` packages for the x86_64-unknown-linux-gnu target on every tagged release.

#### Scenario: Tagged release produces Linux artifacts

- **WHEN** a maintainer pushes a git tag matching `v*`
- **THEN** the release workflow SHALL build the application on an Ubuntu 24.04 runner
- **AND** SHALL upload an AppImage and a `.deb` file as GitHub Release assets

### Requirement: Bundled Python Sidecar

The installed application SHALL include a bundled Python sidecar executable so document import and export work without a system Python installation.

#### Scenario: Sidecar available in release build

- **WHEN** the application is launched from an installed release build
- **THEN** the Tauri backend SHALL spawn the bundled sidecar binary registered as an `externalBin`
- **AND** SHALL NOT require `services/ml/spellbook_sidecar.py` or a local virtualenv to exist on disk

#### Scenario: Sidecar dev fallback

- **WHEN** the application is launched from a development build and the bundled sidecar binary is absent
- **THEN** the backend MAY resolve the sidecar via the existing repo-relative script and venv/system Python path

#### Scenario: Markdown and DOCX import on clean machine

- **WHEN** a user installs the application on a machine without Python 3 installed
- **AND** triggers a Markdown or DOCX import
- **THEN** the import SHALL complete successfully using the bundled sidecar

#### Scenario: PDF import uses bundled pdfminer

- **WHEN** a user triggers a PDF import on a machine without Python 3 installed
- **THEN** the import SHALL use `pdfminer.six` bundled inside the frozen sidecar

#### Scenario: PDF export returns HTML

- **WHEN** a user triggers an export with format `pdf`
- **THEN** the sidecar SHALL produce print-optimized HTML for browser print-to-PDF

#### Scenario: PDF behavior documented

- **WHEN** a user reads the installation or release documentation
- **THEN** they SHALL find that PDF export produces HTML for browser print-to-PDF
- **AND** SHALL find that PDF import uses the bundled sidecar (`pdfminer.six`)

### Requirement: sqlite-vec Build-Time Provisioning

Release builds SHALL populate `src-tauri/resources/sqlite-vec/` with the platform-appropriate loadable `vec0` library before bundling.

#### Scenario: Resource directory populated at build

- **WHEN** a release bundle build runs
- **THEN** the build SHALL download or stage the correct `vec0` library for the target platform into `resources/sqlite-vec/`
- **AND** SHALL fail the build if the resource directory is empty

#### Scenario: Vector search on clean install

- **WHEN** a user installs from a release artifact and launches the application
- **THEN** the application SHALL copy the bundled sqlite-vec library into `SpellbookVault` if not already present
- **AND** SHALL load the extension for semantic search

### Requirement: Linux Minimum Baseline

Linux release artifacts SHALL target Ubuntu 24.04 LTS as the minimum supported distribution. Release builds SHALL run on Ubuntu 24.04-compatible CI runners.

#### Scenario: Release built on Ubuntu 24.04

- **WHEN** Linux release artifacts are produced
- **THEN** the build SHALL run on an Ubuntu 24.04 runner
- **AND** documentation SHALL state Ubuntu 24.04 LTS as the minimum supported Linux version

### Requirement: Full Build for v1 Releases

v1 release installers SHALL ship the full application with default features (including LLM and embedding support). A lite variant without default `llm` features is reserved for a future release.

#### Scenario: v1 release is full build only

- **WHEN** a v1 tagged release is published
- **THEN** exactly one installer per platform SHALL be produced (full build)
- **AND** SHALL NOT include a separate lite artifact

#### Scenario: Lite variant planned for future

- **WHEN** project documentation describes release artifacts
- **THEN** it MAY note that a future lite installer (without LLM natives) is planned
- **AND** SHALL NOT require lite artifacts for v1 compliance

### Requirement: ML Models Excluded from Installer

Installers SHALL NOT bundle LLM or embedding model files. Model provisioning SHALL remain user-initiated into `SpellbookVault/models/`.

#### Scenario: Installer size excludes models

- **WHEN** a release installer is produced
- **THEN** the artifact SHALL NOT contain model files under `SpellbookVault/models/`
- **AND** the application SHALL offer in-app model download or import after installation

#### Scenario: First-run model provisioning exception

- **WHEN** documentation describes offline behavior
- **THEN** it SHALL state that first-time model download or import requires network access
- **AND** SHALL state that all other core features work offline after install

### Requirement: Release Artifact Naming and Checksums

Release assets SHALL use consistent, versioned filenames and include SHA256 checksum files.

#### Scenario: Windows asset name

- **WHEN** version `0.2.0` is released for Windows
- **THEN** the NSIS asset filename SHALL include the product name, version, and architecture (e.g. `Spellbook_0.2.0_x64-setup.exe`)
- **AND** a `.sha256` checksum file SHALL be uploaded alongside the installer

#### Scenario: Linux asset names

- **WHEN** version `0.2.0` is released for Linux
- **THEN** AppImage and `.deb` filenames SHALL include the product name, version, and architecture
- **AND** `.sha256` checksum files SHALL be uploaded for each artifact

### Requirement: Release Workflow Separation

Full installer builds SHALL run in a dedicated release workflow, separate from the pull-request CI workflow.

#### Scenario: PR CI does not build installers

- **WHEN** a pull request is opened or updated
- **THEN** the existing CI workflow SHALL run lint and test jobs only
- **AND** SHALL NOT invoke `tauri build` bundle targets

#### Scenario: Manual release dry run

- **WHEN** a maintainer triggers the release workflow manually via `workflow_dispatch`
- **THEN** the workflow SHALL build installers and upload artifacts
- **AND** MAY skip GitHub Release creation when configured for dry-run mode

### Requirement: Local Release Build Documentation

The project SHALL document how maintainers produce installers locally on Windows and Linux.

#### Scenario: Developer builds Windows installer locally

- **WHEN** a maintainer follows the release section of the development documentation on Windows
- **THEN** they SHALL be able to run documented commands to produce an NSIS installer without GitHub Actions

#### Scenario: Developer builds Linux packages locally

- **WHEN** a maintainer follows the release section on Ubuntu 24.04 with documented system dependencies
- **THEN** they SHALL be able to produce AppImage and `.deb` packages locally

### Requirement: Unsigned Windows Releases

Windows release installers SHALL NOT be Authenticode-signed. The project SHALL NOT implement or maintain Windows code-signing infrastructure.

#### Scenario: Windows installer is unsigned

- **WHEN** a Windows NSIS installer is produced for release
- **THEN** the artifact SHALL be distributed without an Authenticode signature

#### Scenario: SmartScreen documented for users

- **WHEN** a user reads the installation documentation for Windows
- **THEN** they SHALL find guidance for proceeding past SmartScreen warnings on unsigned installers
