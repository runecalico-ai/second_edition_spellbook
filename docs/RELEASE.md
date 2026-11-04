# Spellbook releases

Spellbook ships **unsigned** Windows NSIS installers and Linux AppImage plus `.deb` packages. There is no macOS installer in v1.

## Windows

1. Download `Spellbook_{version}_x64-setup.exe` and its `.sha256` file from the GitHub Release.
2. Verify SHA256 before running the installer.
3. Windows SmartScreen may warn because the installer is **not Authenticode-signed**. Choose **More info**, then **Run anyway**. Signing is not planned.
4. If the installer warns that the Microsoft Visual C++ Redistributable (x64) is missing, install it from https://aka.ms/vs/17/release/vc_redist.x64.exe. The Spellbook installer does **not** silently install the redistributable. You may continue past the warning; the app will fail to launch if the runtime is truly absent.
5. User data lives in `%APPDATA%\SpellbookVault` and survives upgrades.

## Linux

Minimum supported distribution: **Ubuntu 24.04 LTS**. Newer Ubuntu releases may work; older glibc/GTK stacks are not supported.

Install the `.deb` with the system package manager, or run the AppImage after marking it executable.

User data lives in `~/.local/share/SpellbookVault` (or `$XDG_DATA_HOME/SpellbookVault`).

## Models and offline use

Installers do **not** include TinyLlama or MiniLM model files. After install, use in-app download or verified side-load into `SpellbookVault/models/`. Getting the model files the **first** time requires network access: either the in-app download, or downloading the approved files elsewhere for side-load. The side-load (import) step itself works offline. All other core features (library, keyword search, import/export via the bundled sidecar) work offline after install.
