# Fix Chat Embedding Side-load and HTML Print Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two app bugs. First, Chat's **Add Local Embedding Model** button opens a file picker, but the MiniLM import needs a folder, so the import from Chat always fails. Second, HTML prints of the character sheet and the spellbook pack use the general spell template, and that template does not output an opening `<body>` tag.

**Architecture:** In the frontend, `ChatPanel` gets a folder picker for the embeddings import. This is the same `open({ directory: true, multiple: false })` call that Library uses through `useEmbeddingsProvisioning`. TinyLlama stays on the file picker. In the Python sidecar, one `_render_export_html` dispatcher selects the template by `mode`. The `html` branch and the legacy `pdf` branch of `handle_export` both call it, and `_render_print_html` gets its missing `<body>`. Docs that send users to Library for the MiniLM side-load change to say "Chat or Library".

**Tech Stack:** React 19 + TypeScript, `@tauri-apps/plugin-dialog`, Vitest (jsdom), Python 3 sidecar (`services/ml/spellbook_sidecar.py`), pytest, Ruff, Playwright (CDP to WebView2).

## Global Constraints

- Base: branch `add-cross-platform-installers` at `fb5c0f9` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`).
- Do not change the Rust backend. `embeddings_import_model_file` already takes a folder path in its `filePath` argument. `export_character_sheet` and `export_character_spellbook_pack` already send the correct `mode`, and they map `pdf` to `html` before they call the sidecar.
- Do not change the `data-testid` values or the button labels. The labels come from `ModelProvisioningActions` ("Add Local Model" / "Add Local Embedding Model").
- The `single`, `list`, and `spellbook` print modes must keep their current output, except that their HTML now includes `<body>`.
- Python commands run from the repo root with the root venv: `.\.venv\Scripts\python.exe`. Exception: Ruff runs from `services/ml` (Task 1 Step 5).
- Frontend commands: `pnpm --dir apps/desktop ...`. Vitest uses `--project=unit`.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files. On Windows, Python's `Path.write_text` writes CRLF; scripted edits must write bytes or pass `newline="\n"`.
- Playwright launches the built debug binary. If a frozen sidecar (`spellbook-sidecar*.exe`) is next to the exe, the app uses it instead of `spellbook_sidecar.py` (`sidecar/client.rs` `resolve_sidecar_command`). Thus, sidecar fixes are visible in E2E only after `python scripts/prepare_release_bundle.py` and `pnpm --dir apps/desktop tauri:build --debug`. Playwright needs a shell with window-station access (no command sandbox).
- Out of scope: merging `ChatPanel`'s download/modal logic into `useEmbeddingsProvisioning`. The Markdown export paths. Renaming `importEmbeddingsModelFile` / `filePath`.

## Root causes (verified 2026-11-04)

- `apps/desktop/src/ui/components/chat/ChatPanel.tsx` has one `pickModelFile()` that calls `open({ multiple: false })`. `handleImportLlm` and `handleImportEmbeddings` both use it. Thus, Chat can select only a file for MiniLM. The backend then rejects the file because it is not the five-file bundle folder. Library's `useEmbeddingsProvisioning.importBundle` already calls `open({ directory: true, multiple: false })`.
- `services/ml/spellbook_sidecar.py` `handle_export`: the `fmt == "html"` branch always calls `_render_print_html(spells, mode, layout, character)`. Only the `fmt == "pdf"` branch selects `_render_character_sheet_html` / `_render_spellbook_pack_html`. Rust sends `format: "html"` for both character prints, so the correct templates never run.
  - Character sheet: Rust sends no `spells`, so the HTML body is empty. Reproduced output after `</head>`: `'\n    \n</body>\n</html>\n'`.
  - Spellbook pack: the title is "Spellbook Print". The `<h1>{name}'s Spellbook</h1>` heading and the `Class: …` subtitle are missing. The character name is not in the file.
- `_render_print_html` goes from `</head>` directly to `{body}` and `</body>`. It has no `<body>` open tag.

## Plan dry-run (2026-11-04, on `fb5c0f9`)

The code blocks in this plan were applied verbatim and then reverted. The results:

| Check | Result |
|---|---|
| Task 1 red: `pytest services/ml/tests/test_export.py` | 4 failed, 6 passed, all at the `<body>` assertion |
| Task 1 green: same file, then full `pytest services/ml` | 10 passed; 39 passed |
| `ruff@0.6.9 check .`; `format --check` on the two touched files | pass; pass |
| Task 2 red: `ChatPanel.test.tsx` | 1 failed (folder-picker args), 22 passed |
| Task 2 green: `ChatPanel` + `useEmbeddingsProvisioning` tests | 32 passed |
| `typecheck`, `lint:biome`, `format:check` | all exit 0 |
| Task 3: Biome lint/format of the spec | pass |
| Task 3: `character_print_options.spec.ts` on the rebuilt binaries | 5 passed |
| Task 3: new test on the old binaries | 1 failed at `toContain("<body>")` |

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `services/ml/spellbook_sidecar.py` | `_render_export_html` dispatcher; `<body>` in `_render_print_html` | 1 |
| `services/ml/tests/test_export.py` | Template-selection and `<body>` regression tests | 1 |
| `apps/desktop/src/ui/components/chat/ChatPanel.tsx` | Folder picker for the embeddings import | 2 |
| `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx` | Picker-argument tests for both imports | 2 |
| `docs/RELEASE.md` | MiniLM side-load is in Chat or Library | 2 |
| `docs/DEVELOPMENT.md` | Side-load labels and picker kinds | 2 |
| `apps/desktop/src/AGENTS.md` | Chat test-id table notes the folder picker | 2 |
| `apps/desktop/tests/character_print_options.spec.ts` | E2E: HTML prints use their own templates | 3 |

Tasks 1 and 2 are independent. Task 3 needs Task 1.

---

### Task 1: Sidecar selects the correct HTML template and outputs `<body>`

**Files:**
- Modify: `services/ml/spellbook_sidecar.py` (`handle_export` html/pdf branches near lines 315–339; `_render_print_html` template near lines 420–425)
- Test: `services/ml/tests/test_export.py`

**Interfaces:**
- Consumes: the existing `_render_character_sheet_html(character)`, `_render_spellbook_pack_html(spells, character, class_name, layout)`, and `_render_print_html(spells, mode, layout, character)`.
- Produces: `_render_export_html(spells: List[Dict[str, Any]], mode: str, layout: str, character: Dict[str, Any], class_name: str) -> str`. This is a private helper. The sidecar's JSON-RPC contract does not change.

- [x] **Step 1: Write the failing tests**

Append to `services/ml/tests/test_export.py`:

```python
CHARACTER = {
    "name": "Raistlin",
    "characterType": "PC",
    "race": "Human",
    "alignment": "Neutral",
    "notes": "",
    "abilities": {
        "str": 9,
        "dex": 16,
        "con": 10,
        "int": 18,
        "wis": 12,
        "cha": 10,
        "com": 10,
    },
    "classes": [{"className": "Mage", "classLabel": "Mage", "level": 3}],
    "characterSpells": [
        {
            "name": "Sleep",
            "level": 1,
            "className": "Mage",
            "prepared": 1,
            "known": 1,
            "description": "Puts creatures to sleep.",
        }
    ],
    "includeCom": False,
    "includeNotes": True,
}


def _body(content: str) -> str:
    assert content.count("<body>") == 1
    assert content.index("</head>") < content.index("<body>")
    return content.split("<body>", 1)[1].split("</body>", 1)[0]


@pytest.mark.parametrize("fmt", ["html", "pdf"])
def test_handle_export_character_sheet_uses_character_sheet_template(tmp_path, fmt):
    result = handle_export(
        {
            "mode": "character_sheet",
            "character": CHARACTER,
            "format": fmt,
            "output_dir": str(tmp_path),
        }
    )

    assert result["format"] == "html"
    content = Path(result["path"]).read_text(encoding="utf-8")
    body = _body(content)
    assert "<title>Raistlin - Character Sheet</title>" in content
    assert "<h1>Raistlin</h1>" in body
    assert "STR</div>" in body
    assert "Mage (Level 3)" in body
    assert 'class="spell-table"' in body
    assert "Sleep" in body


@pytest.mark.parametrize("fmt", ["html", "pdf"])
def test_handle_export_spellbook_pack_uses_pack_template(tmp_path, fmt):
    spells = [
        {
            "name": "Sleep",
            "level": 1,
            "school": "Enchantment",
            "description": "Puts creatures to sleep.",
        }
    ]
    result = handle_export(
        {
            "mode": "spellbook_pack",
            "character": CHARACTER,
            "class_name": "Mage",
            "spells": spells,
            "format": fmt,
            "layout": "compact",
            "output_dir": str(tmp_path),
        }
    )

    assert result["format"] == "html"
    content = Path(result["path"]).read_text(encoding="utf-8")
    body = _body(content)
    assert "<title>Raistlin's Spellbook - Mage</title>" in content
    assert "<h1>Raistlin's Spellbook</h1>" in body
    assert "Class: Mage" in body
    assert "Puts creatures to sleep." in body


@pytest.mark.parametrize("mode", ["single", "spellbook"])
def test_handle_export_print_html_wraps_spells_in_body(tmp_path, mode):
    spells = [
        {
            "name": "Shield",
            "level": 1,
            "school": "Evocation",
            "description": "Invisible barrier.",
        }
    ]
    result = handle_export(
        {
            "mode": mode,
            "spells": spells,
            "character": {"name": "Raistlin"},
            "format": "html",
            "layout": "stat-block",
            "output_dir": str(tmp_path),
        }
    )

    body = _body(Path(result["path"]).read_text(encoding="utf-8"))
    assert "Shield" in body
    assert "Invisible barrier." in body
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m pytest services/ml/tests/test_export.py -v`

Expected: 4 FAILED and 6 PASSED. The failures are `character_sheet...[html]`, `spellbook_pack...[html]`, `print_html_wraps_spells_in_body[single]`, and `print_html_wraps_spells_in_body[spellbook]`. Each one fails at `assert content.count("<body>") == 1`. The `[pdf]` cases and the 4 tests that were already in the file pass.

- [x] **Step 3: Add the dispatcher and the `<body>` tag**

In `services/ml/spellbook_sidecar.py`, add this function directly above `def _render_print_html(`:

```python
def _render_export_html(
    spells: List[Dict[str, Any]],
    mode: str,
    layout: str,
    character: Dict[str, Any],
    class_name: str,
) -> str:
    if mode == "character_sheet":
        return _render_character_sheet_html(character)
    if mode == "spellbook_pack":
        return _render_spellbook_pack_html(spells, character, class_name, layout)
    return _render_print_html(spells, mode, layout, character)
```

In `handle_export`, replace the `html` and `pdf` branches with:

```python
    if fmt == "html":
        html_path = output_dir / f"spellbook_export_{unique_id}.html"
        html = _render_export_html(spells, mode, layout, character, class_name)
        html_path.write_text(html, encoding="utf-8")
        return {"path": str(html_path), "format": "html"}

    if fmt == "pdf":
        # Generate print-optimized HTML instead of PDF
        # Users can use browser "Print to PDF" for actual PDF output
        html_path = output_dir / f"spellbook_export_{unique_id}.html"
        html = _render_export_html(spells, mode, layout, character, class_name)
        html_path.write_text(html, encoding="utf-8")

        # Return HTML path with note that it's print-optimized
        return {
            "path": str(html_path),
            "format": "html",
            "note": "Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output.",
        }
```

At the end of the `_render_print_html` f-string, change:

```python
  </style>
</head>
    {body}
</body>
</html>
"""
```

to:

```python
  </style>
</head>
<body>
    {body}
</body>
</html>
"""
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m pytest services/ml/tests/test_export.py -v`
Expected: 10 passed.

- [x] **Step 5: Run the full sidecar suite and Ruff**

Run: `.\.venv\Scripts\python.exe -m pytest services/ml -q`
Expected: all pass.

CI runs `ruff check .` and `ruff format --check .` from `services/ml` with `ruff==0.6.9` (pinned in `services/ml/requirements-dev.txt`). The repo has no Ruff config, so Ruff uses its defaults: line length 88. On 2026-11-04 the root `.venv` did not have Ruff. Run the pinned version without changing the venv:

Run (from `services/ml`): `uvx ruff@0.6.9 check .`
Expected: `All checks passed!`

Run (from `services/ml`): `uvx ruff@0.6.9 format --check spellbook_sidecar.py tests/test_export.py`
Expected: `2 files already formatted`.

Do not use `format --check .` as this task's gate. On `fb5c0f9`, `tests/test_build_sidecar.py` and `tests/test_sidecar.py` already fail it (lines over 88 characters, last touched in `3b8bf4b`). That drift is not part of this plan.

- [x] **Step 6: Commit**

```powershell
git add services/ml/spellbook_sidecar.py services/ml/tests/test_export.py
git commit -m "fix(sidecar): use sheet and pack templates for HTML" -m "The html branch of handle_export always used the generic print template, so character sheets printed with an empty body and spellbook packs lost their heading. Both html and legacy pdf now share one mode dispatcher. The generic template also gets its missing <body> tag."
```

---

### Task 2: Chat imports the MiniLM embedding model from a folder

**Files:**
- Modify: `apps/desktop/src/ui/components/chat/ChatPanel.tsx:28-32` (picker helpers) and `:143-153` (`handleImportEmbeddings`)
- Test: `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx` (the existing import tests, lines 205–244)
- Modify: `docs/RELEASE.md:40`, `docs/DEVELOPMENT.md:166`, `apps/desktop/src/AGENTS.md` (the Chat provisioning test-id table)

**Interfaces:**
- Consumes: `open` from `@tauri-apps/plugin-dialog`. `importEmbeddingsModelFile(path: string)` from `src/api/llm.ts`, which takes the bundle folder path.
- Produces: `ChatPanel`-local `pickModelFolder(): Promise<string | null>`. It is not exported.

- [x] **Step 1: Write the failing tests**

In `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx`, in the test `"clicking Add Local Model opens the file picker and imports the selected file"`, add this line directly after `expect(mockRefresh).toHaveBeenCalled();`. The line makes sure that TinyLlama keeps the file picker:

```tsx
    expect(mockOpen).toHaveBeenCalledWith({ multiple: false });
```

Replace the whole test `"unwraps an array result from the file picker"` with these three tests:

```tsx
  it("clicking Add Local Embedding Model opens a folder picker and imports the selected folder", async () => {
    mockOpen.mockResolvedValue("/models/all-MiniLM-L6-v2");
    mockImportEmbeddingsModelFile.mockResolvedValue(undefined);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    embeddingsStatus = { state: "notProvisioned" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-embeddings-import-button"));

    await vi.waitFor(() => {
      expect(mockImportEmbeddingsModelFile).toHaveBeenCalledWith("/models/all-MiniLM-L6-v2");
    });
    expect(mockOpen).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not import embeddings when the folder picker is cancelled", async () => {
    mockOpen.mockResolvedValue(null);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    embeddingsStatus = { state: "notProvisioned" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-embeddings-import-button"));

    await vi.waitFor(() => {
      expect(mockOpen).toHaveBeenCalledTimes(1);
    });
    expect(mockImportEmbeddingsModelFile).not.toHaveBeenCalled();
  });

  it("unwraps an array result from the folder picker", async () => {
    mockOpen.mockResolvedValue(["/first/all-MiniLM-L6-v2", "/second/all-MiniLM-L6-v2"]);
    mockImportEmbeddingsModelFile.mockResolvedValue(undefined);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    embeddingsStatus = { state: "notProvisioned" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-embeddings-import-button"));

    await vi.waitFor(() => {
      expect(mockImportEmbeddingsModelFile).toHaveBeenCalledWith("/first/all-MiniLM-L6-v2");
    });
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --dir apps/desktop exec vitest run --project=unit src/ui/components/chat/ChatPanel.test.tsx`

Expected: 1 FAILED, `"clicking Add Local Embedding Model opens a folder picker and imports the selected folder"`. The error is at `expect(mockOpen).toHaveBeenCalledWith({ directory: true, multiple: false })`, because the received call is `{ multiple: false }`. All other tests pass.

- [x] **Step 3: Add the folder picker and use it for embeddings**

In `apps/desktop/src/ui/components/chat/ChatPanel.tsx`, replace:

```tsx
async function pickModelFile(): Promise<string | null> {
  const selected = await open({ multiple: false });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}
```

with:

```tsx
function firstSelection(selected: string | string[] | null): string | null {
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}

async function pickModelFile(): Promise<string | null> {
  return firstSelection(await open({ multiple: false }));
}

// The MiniLM bundle is a folder of five files, not a single file.
async function pickModelFolder(): Promise<string | null> {
  return firstSelection(await open({ directory: true, multiple: false }));
}
```

In `handleImportEmbeddings`, change `const path = await pickModelFile();` to:

```tsx
    const path = await pickModelFolder();
```

`handleImportLlm` continues to call `pickModelFile()`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm --dir apps/desktop exec vitest run --project=unit src/ui/components/chat/ChatPanel.test.tsx src/hooks/useEmbeddingsProvisioning.test.tsx`
Expected: all pass (32 tests: the 30 in the baseline plus 2 net new).

- [x] **Step 5: Correct the docs**

`docs/RELEASE.md` line 40: change `**Add Local Embedding Model** (MiniLM, in Library semantic search; select the model folder)` to:

```markdown
**Add Local Embedding Model** (MiniLM, in Chat or in Library semantic search; select the model folder)
```

`docs/DEVELOPMENT.md` line 166: replace item 6 with:

```markdown
6. In Chat, the TinyLlama action is "Add Local Model" (`chat-llm-import-button`, file picker) and the MiniLM action is "Add Local Embedding Model" (`chat-embeddings-import-button`, folder picker). The Library semantic empty-state uses `library-embeddings-import-button` (folder picker).
```

`apps/desktop/src/AGENTS.md`, in the Chat provisioning table, change the row `| Side-load embeddings | \`chat-embeddings-import-button\` |` to:

```markdown
| Side-load embeddings (folder picker) | `chat-embeddings-import-button` |
```

- [x] **Step 6: Run the frontend gates**

Run each from the repo root:
- `pnpm --dir apps/desktop typecheck`
- `pnpm --dir apps/desktop lint:biome`
- `pnpm --dir apps/desktop format:check`

Expected: each exits 0. If `format:check` reports the edited files, run `pnpm --dir apps/desktop exec biome format --write src/ui/components/chat/ChatPanel.tsx src/ui/components/chat/ChatPanel.test.tsx` and run it again.

- [x] **Step 7: Commit**

```powershell
git add apps/desktop/src/ui/components/chat/ChatPanel.tsx apps/desktop/src/ui/components/chat/ChatPanel.test.tsx docs/RELEASE.md docs/DEVELOPMENT.md apps/desktop/src/AGENTS.md
git commit -m "fix(chat): pick a folder for embedding side-load" -m "Chat's Add Local Embedding Model opened a file picker, but the MiniLM import needs the bundle folder, so every Chat import failed. Use the same directory picker as Library. Docs now point to Chat or Library."
```

---

### Task 3: E2E guard for the HTML character prints

**Files:**
- Test: `apps/desktop/tests/character_print_options.spec.ts` (add one test at the end of the `describe` block)

**Interfaces:**
- Consumes: Task 1's sidecar output. Uses the existing test ids `btn-print-sheet`, `btn-print-pack`, `print-format-select`, and `btn-confirm-print`, the success text `Character sheet saved to:` / `Spellbook pack saved to:`, and the `SpellbookApp` methods `createCharacter`, `openCharacterEditor`, and `addClass`.
- Produces: nothing for later tasks.

The existing `"should apply selected options when printing character sheet"` test selects Markdown, so its HTML `else` branch never runs. This new test uses the default HTML format for both prints.

- [ ] **Step 1: Write the test**

Add inside `test.describe("Character Print Options Dialog", ...)`, after the last test:

```ts
  test("should print character sheet and spellbook pack as HTML with their own templates", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `HtmlPrint_${runId}`;

    const confirmPrintAndRead = async (savedText: RegExp): Promise<string> => {
      await page.getByTestId("btn-confirm-print").click();
      await expect(page.getByText(/Print Success/)).toBeVisible({ timeout: 10000 });
      const message = await page.getByText(savedText).textContent();
      const filePath = message?.split("saved to: ")[1]?.trim();
      if (!filePath) throw new Error(`No output path in success message: ${message}`);
      const content = fs.readFileSync(filePath, "utf8");
      await page.getByRole("button", { name: "OK" }).click();
      return content;
    };

    await test.step("Create character with a Mage class", async () => {
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");
    });

    await test.step("HTML character sheet has the sheet body", async () => {
      await page.getByTestId("btn-print-sheet").click();
      await expect(page.getByTestId("print-format-select")).toHaveValue("html");

      const content = await confirmPrintAndRead(/Character sheet saved to:/);

      expect(content).toContain("<body>");
      expect(content).toContain(`<h1>${charName}</h1>`);
      expect(content).toContain("STR</div>");
      expect(content).toContain("<h2>Mage (Level");
    });

    await test.step("HTML spellbook pack has the pack heading", async () => {
      await page.getByTestId("btn-print-pack").click();
      await expect(page.getByTestId("print-format-select")).toHaveValue("html");

      const content = await confirmPrintAndRead(/Spellbook pack saved to:/);

      expect(content).toContain("<body>");
      expect(content).toContain(`<h1>${charName}'s Spellbook</h1>`);
      expect(content).toContain("Class: Mage");
    });
  });
```

- [ ] **Step 2: Lint the spec**

Run: `pnpm --dir apps/desktop exec biome lint tests/character_print_options.spec.ts`
Expected: no errors.

- [ ] **Step 3: Rebuild the frozen sidecar and the debug app**

The bundled sidecar exe takes precedence over `spellbook_sidecar.py`. Thus, rebuild it so that the binary contains Task 1:

Run (repo root): `.\.venv\Scripts\python.exe scripts/prepare_release_bundle.py`
Expected: exits 0 and updates `apps/desktop/src-tauri/binaries/spellbook-sidecar-x86_64-pc-windows-msvc.exe`.

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: build succeeds (about 4–5 minutes incremental). The build copies the frozen sidecar to `<target>\debug\spellbook-sidecar.exe`, next to `spellbook-desktop.exe`. The app runs that copy.

The Playwright fixture (`tests/fixtures/tauri-fixture.ts` `getTauriBinaryPath`) always reads the repo-root `target\debug\spellbook-desktop.exe`. If `CARGO_TARGET_DIR` is set (agent sandboxes set it to a temp `cargo-target` folder), the build writes elsewhere and Playwright runs the old binary. Check with `$env:CARGO_TARGET_DIR`. If it is set, copy `spellbook-desktop.exe` and `spellbook-sidecar.exe` from `$env:CARGO_TARGET_DIR\debug` to the repo-root `target\debug` before Step 4.

- [ ] **Step 4: Run the spec**

Run (from `apps/desktop`, in a shell with window-station access): `npx playwright test tests/character_print_options.spec.ts`
Expected: `5 passed`, including the new test. The log line `Tauri app exited with error code 1` during cleanup is normal (the fixture kills the app).

Optional check that the new test catches the bug: before Step 3, copy the old `target\debug\spellbook-desktop.exe` and `spellbook-sidecar.exe` to a backup folder. After Step 4, copy them back and run `npx playwright test tests/character_print_options.spec.ts --grep "own templates"`. Expected: 1 failed, at `expect(content).toContain("<body>")`, and the file title is `Spellbook Print`. Then copy the new binaries back.

- [ ] **Step 5: Manual check of the Chat folder picker (native dialog, not automatable)**

Run `pnpm --dir apps/desktop tauri:dev` with an empty `SpellbookVault/models/embeddings/` folder and TinyLlama not provisioned. Then:
1. Chat: click **Add Local Embedding Model**. Expected: a native *folder* picker opens. Select an approved `all-MiniLM-L6-v2` folder that has exactly the five files. Expected: the embeddings badge goes to `Initializing` or `Ready`, and no `chat-embeddings-error-message` appears.
2. Chat: click **Add Local Model**. Expected: a native *file* picker opens. Cancel it.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/tests/character_print_options.spec.ts
git commit -m "test(e2e): cover HTML character sheet and pack prints" -m "The existing print test selects Markdown, so it never checked HTML output. Assert both HTML prints use their own templates and include <body>."
```

The rebuilt `apps/desktop/src-tauri/binaries/spellbook-sidecar-*.exe` is gitignored (`.gitignore` line 73). It does not appear in `git status`. Do not force-add it.
