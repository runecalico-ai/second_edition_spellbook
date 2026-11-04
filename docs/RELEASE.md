# Spellbook releases

Spellbook ships **unsigned** Windows NSIS installers and Linux AppImage plus `.deb` packages. There is no macOS installer in v1.

## Windows

1. Download `Spellbook_{version}_x64-setup.exe` and its `.sha256` file from the GitHub Release.
2. Verify SHA256 before running the installer. In PowerShell, in the download folder, run:

   ```powershell
   Get-FileHash -Algorithm SHA256 .\Spellbook_{version}_x64-setup.exe
   ```

   The `Hash` value must match the first field of `Spellbook_{version}_x64-setup.exe.sha256` (the comparison is case-insensitive). Do not run the installer if they differ.
3. Windows SmartScreen may warn because the installer is **not Authenticode-signed**. Choose **More info**, then **Run anyway**. Signing is not planned.
4. If the installer warns that the Microsoft Visual C++ Redistributable (x64) is missing, install it from https://aka.ms/vs/17/release/vc_redist.x64.exe. The Spellbook installer does **not** silently install the redistributable. You may continue past the warning; the app will fail to launch if the runtime is truly absent.
5. User data lives in `%APPDATA%\SpellbookVault` and survives upgrades.

## Linux

Minimum supported distribution: **Ubuntu 24.04 LTS**. Newer Ubuntu releases may work; older glibc/GTK stacks are not supported.

Download `Spellbook_{version}_amd64.AppImage` or `Spellbook_{version}_amd64.deb`, plus its `.sha256` file, from the GitHub Release. Before installing, verify SHA256 in the download folder:

```bash
sha256sum -c Spellbook_{version}_amd64.AppImage.sha256
sha256sum -c Spellbook_{version}_amd64.deb.sha256
```

Run the line for each file you downloaded. It must print `OK`; do not install the file if it reports `FAILED`.

Install the `.deb` with the system package manager, or run the AppImage after marking it executable.

If the AppImage fails to start with a `libfuse.so.2` error, install FUSE 2 with `sudo apt install libfuse2t64` (the Ubuntu 24.04 package name), or use the `.deb` instead.

User data lives in `~/.local/share/SpellbookVault` (or `$XDG_DATA_HOME/SpellbookVault`).

## Models and offline use

Installers do **not** include TinyLlama or MiniLM model files. After install, use the in-app download, or side-load with **Add Local Model** (TinyLlama, in Chat) or **Add Local Embedding Model** (MiniLM, in Chat or in Library semantic search; select the model folder). Side-load verifies the file(s) and copies them into `SpellbookVault/models/`. Only the approved artifacts are accepted: the TinyLlama file `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` and the `all-MiniLM-L6-v2` ONNX folder (sources and hashes: [TinyLlama](DEVELOPMENT.md#approved-tinyllama-gguf), [MiniLM](DEVELOPMENT.md#approved-embedding-bundle-all-minilm-l6-v2-onnx)).

The MiniLM folder you select must contain only these five files at its top level: `model.onnx`, `tokenizer.json`, `config.json`, `special_tokens_map.json`, and `tokenizer_config.json`. Do not include other files or subfolders: the import rejects any extra file. For example, do not select a full Hugging Face repository download that also includes `README.md` or `.gitattributes`.

Getting the model files the **first** time requires network access: either the in-app download, or downloading the approved files elsewhere for side-load. The side-load (import) step itself works offline. All other core features (library, keyword search, import/export via the bundled sidecar) work offline after install.

## PDF import and export

- **Import:** PDF files are parsed by `pdfminer.six` inside the bundled sidecar. A system Python install is not required.
- **Export:** Choosing PDF export writes a print-optimized **HTML** file and shows its path. Open that file in a web browser, choose **Print**, and select a PDF destination such as **Save as PDF** (or **Microsoft Print to PDF** on Windows). Spellbook does not ship a PDF engine.

## Future lite installer

v1 publishes **one full installer per platform** (LLM and embedding natives included). A smaller lite installer without default `llm` features is planned for a later release and is **not** required for v1.
