# SPEC-1-Local AD&D 2e Spellbook

## Background

You want a **locally run** application to manage a character’s spellbook for **AD&D 2nd Edition**, with the following drivers:

- Full **offline**, privacy-first operation using **open-source** components only.
- Ability to **scale to thousands of spells** (including variants/homebrew) while staying fast on commodity hardware.
- Rich **search** (keyword, type/school/level, and contextual/semantic) to quickly find the right spell in and out of combat.
- **Import** spells from common document formats (PDF, Markdown, DOCX) and **export** selections to Markdown or PDF for sharing/printing.
- A lightweight, local **LLM “chat”** (T5-like small model) to answer questions about spells using only the on-disk collection.
- All **data stored locally**, user-controlled, with easy backup/restore.

This document will iteratively specify requirements, method, implementation, and milestones for an MVP that a contractor team can build directly.


## Requirements

Using MoSCoW prioritization and your confirmed constraints (Win/macOS/Linux desktop wrapper; personal/homebrew + OGL/permissioned content only):

### Must Have
- **Local-only, open-source stack**; no network dependency; all data stored in user directory with easy backup/restore.
- **Scale**: smooth performance with ~10k spells; cold start < 2s, search < 150ms P95 on mid-tier laptop CPU.
- **Data model** for AD&D 2e: name, school, sphere (cleric), level, range, components (V/S/M), casting time, duration, area/target, saving throw, description, source, tags, editions/variants, classes, reversible flag, material components text, author, permissions/licensing metadata.
- **Import**: batch import from **PDF**, **Markdown**, **DOCX**; per-file mapping UI; deduplicate by canonical keys (name+class+level+source) with merge review.
- **Export**: selected spells or full spellbook to **Markdown** and **PDF** (A4/Letter, printer-friendly, with optional stat-block styling).
- **Search**: keyword, faceted filters (school, level, class, components, duration, source), and **semantic/contextual** search over descriptions.
- **Local LLM “chat”**: small T5-like model for Q&A constrained to on-disk corpus; offline inference (CPU by default; optional GPU accel if present).
- **Desktop wrapper**: single codebase packaged for **Windows, macOS, Linux**.
- **License-safe content handling**: enforce labeling of imported content as homebrew/OGL/permissioned; never ship third‑party copyrighted data.
- **Auditability**: full-text index and embeddings entirely reproducible from the DB.

### Should Have
- **Spellbook collections** per character with prepared/known slots, notes, and per-session print packs.
- **Versioning**: keep original import artifact + normalized record; change history per spell.
- **Synonym/alias support** (e.g., British/American spelling, alternate names).
- **Bulk edit** and tag management.
- **Theming**: light/dark + high-contrast accessibility.
- **Simple plugin points** for custom normalizers/parsers.

### Could Have
- **Rules cross-reference**: link spells to conditions/items referenced in text (local link graph).
- **Image attachments** (tables, diagrams) stored locally and referenced in exports.
- **Dice roller** with exportable examples.
- **Optional LAN sync** via user-chosen folder sync tools (no built-in cloud).

### Won’t Have (v1)
- Multiuser concurrency or hosted/cloud features.
- Mobile apps.
- Non-open-source dependencies or telemetry.

### Constraints & Compliance
- 100% **open-source licenses** (permissive or copyleft acceptable) for runtime and tooling.
- **No external calls** during inference/search/import; optional model download performed manually/offline installer.
- Respect OGL/permission terms; user is responsible for content; app provides per-record provenance fields.

### Acceptance Criteria (MVP)
- Import 1,000+ mixed-format spells with < 1% unparsed critical fields after assisted mapping.
- Keyword+faceted queries return P95 < 150ms; semantic queries < 500ms P95 on CPU-only laptop.
- Export: generate a 100-spell PDF under 5s; Markdown export preserves all structured fields.
- Local chat answers at least 90% of a 50-question test set correctly with citations to local records.

## Method

### High-Level Architecture

```plantuml
@startuml
skinparam componentStyle rectangle
actor User
node "Tauri Desktop App" {
  [Frontend (React/Svelte)] as FE
  [Rust Core] as RC
  [Importer Sidecar (Python)] as IMP
}
node "Storage" {
  database "SQLite DB
(FTS5 + sqlite-vec)" as DB
  folder "Attachments" as FS
}
node "Local ML" {
  [Embeddings (Sentence-Transformers)] as EMB
  [LLM Q&A (FLAN-T5 via CTranslate2)] as LLM
}
User --> FE
FE <--> RC
RC <--> DB
RC <--> FS
RC <--> IMP
RC <--> EMB
RC <--> LLM
@enduml
```

**Rationale**
- **Tauri 2** for cross-platform desktop with small footprint and Rust backend. ([v2.tauri.app](https://v2.tauri.app/?utm_source=chatgpt.com))
- **SQLite + FTS5** for fast keyword search; portable DB with JSON features. ([sqlite.org](https://sqlite.org/fts5.html?utm_source=chatgpt.com))
- **Semantic search** stored in SQLite using **sqlite-vec** (HNSW-like ANN) for 384-d vectors. ([github.com](https://github.com/asg017/sqlite-vec?utm_source=chatgpt.com))
- **Embeddings**: `all-MiniLM-L6-v2` (384-dim, Apache-2.0, ~90MB) for CPU-friendly semantic indexing. ([huggingface.co](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2?utm_source=chatgpt.com))
- **Local LLM chat**: `flan-t5-small/base` converted & quantized with **CTranslate2** for fast CPU inference; supports T5/FLAN variants. ([github.com](https://github.com/OpenNMT/CTranslate2?utm_source=chatgpt.com))
- **Import pipeline**: Python sidecar using `pdfminer.six` for PDFs and `python-docx` for DOCX; Markdown via native parser or **Pandoc** when layout-heavy. ([pdfminersix.readthedocs.io](https://pdfminersix.readthedocs.io/?utm_source=chatgpt.com))

### Data Model (SQLite)

```sql
-- Core entities
CREATE TABLE spell (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT,             -- e.g., Alteration, Conjuration
  sphere TEXT,             -- cleric spheres
  class_list TEXT,         -- CSV or JSON of classes (e.g., "Mage, Cleric")
  level INTEGER NOT NULL,
  range TEXT,
  components TEXT,         -- e.g., "V,S,M"
  material_components TEXT,
  casting_time TEXT,
  duration TEXT,
  area TEXT,
  saving_throw TEXT,
  reversible INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  tags TEXT,               -- JSON array
  source TEXT,
  edition TEXT DEFAULT 'AD&D 2e',
  author TEXT,
  license TEXT,            -- OGL/homebrew/permission note
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT
);

-- Full text index for keyword search
CREATE VIRTUAL TABLE spell_fts USING fts5(
  name, description, material_components, tags, source, content='spell', content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER spell_ai AFTER INSERT ON spell BEGIN
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source);
END;
CREATE TRIGGER spell_ad AFTER DELETE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source)
  VALUES('delete', old.id, '', '', '', '', '');
END;
CREATE TRIGGER spell_au AFTER UPDATE ON spell BEGIN
  INSERT INTO spell_fts(spell_fts, rowid, name, description, material_components, tags, source)
  VALUES('delete', old.id, '', '', '', '', '');
  INSERT INTO spell_fts(rowid, name, description, material_components, tags, source)
  VALUES (new.id, new.name, new.description, new.material_components, new.tags, new.source);
END;

-- Embeddings for semantic search (sqlite-vec)
CREATE VIRTUAL TABLE spell_vec USING vec0(
  rowid INTEGER PRIMARY KEY,  -- mirrors spell.id
  v float[384]
);

-- Provenance & versioning
CREATE TABLE artifact (
  id INTEGER PRIMARY KEY,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('pdf','md','docx')),
  path TEXT,
  hash TEXT,
  imported_at TEXT,
  UNIQUE(spell_id, path)
);

CREATE TABLE change_log (
  id INTEGER PRIMARY KEY,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  changed_at TEXT,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  actor TEXT DEFAULT 'local'
);

-- Spellbooks per character
CREATE TABLE character (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE spellbook (
  character_id INTEGER REFERENCES character(id) ON DELETE CASCADE,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  prepared INTEGER DEFAULT 0,
  known INTEGER DEFAULT 1,
  notes TEXT,
  PRIMARY KEY(character_id, spell_id)
);
```

### Import Pipeline
```plantuml
@startuml
actor User
participant FE as "UI"
participant RC as "Rust Core"
participant IMP as "Importer (Python)"
participant DB
participant EMB

User -> FE: Select files (.pdf/.md/.docx)
FE -> RC: start_import(files)
RC -> IMP: parse(files)
IMP -> IMP: detect layout, extract fields (rules/regex + heuristics)
IMP --> RC: normalized spells + artifacts
RC -> DB: upsert spells, provenance; dedupe (name+class+level+source)
RC -> EMB: embed descriptions (MiniLM-L6-v2)
EMB -> DB: INSERT/UPDATE spell_vec(rowid, v)
FE <- RC: import report + conflicts
@enduml
```

**Parsing details**
- PDF: `pdfminer.six` or `pymupdf` fallback when layout is complex (table extraction). DOCX: `python-docx`. Markdown: native parser; fallback `pandoc` for odd flavors. ([pdfminersix.readthedocs.io](https://pdfminersix.readthedocs.io/?utm_source=chatgpt.com))
- Field extraction templates per source; user-assisted mapping UI for unmatched fields.

### Search & Ranking
- **Keyword**: `SELECT * FROM spell_fts WHERE spell_fts MATCH ?` with rank by bm25.
- **Facets**: `WHERE school IN (...) AND level IN (...) AND class_list LIKE '%Cleric%'` using normalized JSON helpers.
- **Semantic**: cosine similarity in `sqlite-vec`: `ORDER BY distance(v, :qvec) ASC LIMIT 50`. Combine with keyword score via linear blend.

### Local Chat (RAG)
1. Convert query to embedding (MiniLM-L6-v2); retrieve top-K spells from `spell_vec` + `spell_fts`.
2. Build a prompt context (spell stat blocks + citations).
3. Run **FLAN-T5-small** in **CTranslate2** (int8) for answer generation grounded only in retrieved text; show citations.
4. Guardrails: if no relevant passages (similarity < threshold), return "I don’t have that locally".

### Export
- **Markdown**: template renderer to GitHub-flavored MD.
- **PDF**: route A) HTML->PDF via Tauri printing; route B) `pandoc` with LaTeX for stable typography, selectable A4/Letter. ([pandoc.org](https://pandoc.org/MANUAL.html?utm_source=chatgpt.com))

### Similar/Adjacent Projects (for inspiration)
- Desktop note apps with local search and export; Tauri apps for small footprint. ([v2.tauri.app](https://v2.tauri.app/?utm_source=chatgpt.com))
- SQLite-based semantic search using `sqlite-vec`. ([github.com](https://github.com/asg017/sqlite-vec?utm_source=chatgpt.com))


## Implementation

### Tech Stack (Pinned for MVP)
- **Shell**: Tauri 2 (Rust backend + WebView UI), React 18 + TypeScript + Vite.
- **DB**: SQLite 3 with FTS5 enabled; `sqlite-vec` extension for vector search.
- **ML sidecar (Python 3.11)**: `sentence-transformers` (MiniLM-L6-v2) for embeddings; `CTranslate2` for FLAN‑T5‑small int8 inference; `pdfminer.six`, `PyMuPDF`, `python-docx`, `pypandoc` (or external Pandoc) for import/export.
- **Styling/UI**: TailwindCSS + Radix UI. State: Zustand. Diagram rendering in exports via fenced PlantUML blocks (optional).

### Project Layout
```
spellbook/
  apps/desktop/                 # Tauri app root
    src/                        # React UI
    src-tauri/                  # Rust core (commands, DB, file I/O)
  services/ml/                  # Python sidecar (uv/venv managed)
  db/                           # Migrations, seeds
  scripts/                      # Dev & packaging scripts
```

### Build the Core
1. **Initialize Tauri + React**: `pnpm create tauri-app` (or `npm create tauri-app`) with React+TS template.
2. **Rust core crates**: `rusqlite`, `r2d2_sqlite` (pool), `serde`, `chrono`, optional `tauri-plugin-sql` for migrations.
3. **Ship SQLite extensions**: load `fts5` (builtin) and bundle `sqlite-vec` as a loadable extension; enable `sqlite3_auto_extension` on startup.
4. **Migrations**: place SQL from the Method section under `db/migrations` (using simple versioned `.sql` files) and run at app start.
5. **FTS and Vector indices**: create triggers for FTS sync; provide a background job to (re)embed un-embedded or changed records.

### Python Sidecar (ML & Import)
- **Process model**: spawn a local Python process on demand via Tauri command; communicate over stdio JSON-RPC.
- **Virtualenv**: create/activate on first run; cache under app data dir.
- **Endpoints**:
  - `embed(texts: string[]) -> float[384][]`
  - `llm_answer(query: string, contexts: [{id, text, citation}]) -> {answer, citations[], meta}`
  - `import(files: path[]) -> {spells[], artifacts[], conflicts[]}`
  - `export(spell_ids[], fmt: 'md'|'pdf', options) -> path`

### UI Flows
- **Library**: table + filters (school, level, class, components, tags, source); search box with `keyword | semantic` toggle.
- **Spell editor**: form for all fields, provenance display, history view, attachments panel.
- **Import wizard**: file pick → preview + field mapper → dedupe resolution → import report.
- **Chat**: side panel; shows retrieved spells (top‑K), final answer, and clickable citations.
- **Export**: select spells or a character’s spellbook → choose Markdown/PDF → options (size, theme, include notes) → generate.

### Query Patterns (Rust)
- **Keyword**: `SELECT s.* FROM spell_fts f JOIN spell s ON s.id=f.rowid WHERE f MATCH ? ORDER BY bm25(f) LIMIT ?;`
- **Facets**: add `AND s.level BETWEEN ? AND ?` etc.; for classes/tags stored as JSON, expose helpers or use LIKE for MVP.
- **Semantic**: compute query embedding via sidecar → `SELECT s.* FROM spell_vec v JOIN spell s ON s.id=v.rowid ORDER BY distance(v.v, ?) ASC LIMIT ?;`
- **Hybrid ranking**: union keyword + semantic with normalized scores, favoring exact title matches.

### Import Details
- **Detection**: sniff by extension; for PDFs try text extraction first (`pdfminer.six`); fallback to layout-aware blocks (PyMuPDF) when columns/tables present.
- **Normalization**: rule-based regex + heuristics mapping common 2e stat-block headings (Name, School, Level, Range, Components, Casting Time, Duration, Area/Target, Saving Throw, Description, Reversible, Source, Class/Level).
- **Dedup**: canonical key `(name_normalized, class, level, source)`; show diff UI when collision.
- **Provenance**: store artifact path+hash; keep original text for reparse.

### Export Details
- **Markdown**: deterministic template that mirrors DB fields, including YAML front‑matter for metadata.
- **PDF**: default HTML→print with system viewer for simplicity; if Pandoc is installed, prefer `pandoc` route for better typography (LaTeX engine selectable), with a bundled CSS.

### Local Chat (RAG) Wiring
- **Retriever**: top 8 by vector similarity + top 8 by keyword; dedupe and cap context tokens.
- **Prompt**: system guideline: “Answer strictly from provided spells; if unknown, say so.” Include stat blocks + citations.
- **Generation**: FLAN‑T5‑small int8 via CTranslate2; temperature 0.2; max new tokens 196.
- **Safety**: no internet tools; display “local-only” badge.

### Packaging & Updates
- Produce `.msi` (Win), `.dmg`/`.app` (macOS, notarization optional for local), `.AppImage`/`.deb` (Linux). All assets (extensions, ML models) stored inside app data dir with checksum verification.
- Optional “model installer” screen to copy pre-downloaded models from a folder/USB.

### Backups
- DB and attachments live under a single root (e.g., `~/SpellbookVault`). Provide `Export Vault` (zip) and `Import Vault` actions.

### Testing
- **Unit**: parsers (Markdown/DOCX/PDF), SQL helpers, dedupe, export templates.
- **Integration**: import-to-chat pipeline on a sample corpus; timing asserts for search latencies.
- **Golden PDFs**: snapshot compare of generated PDFs (hash / visual diff tolerance).

### Performance Targets
- Build embeddings in batches of 256; cache ML results. Use int8 vectors where acceptable to cut disk space (sqlite-vec supports int8) with minimal quality loss for MVP.

### Security & Privacy
- No network egress; guard any accidental HTTP in WebView. Sign installers. Optional local encryption at rest via OS vaults is a later milestone.


## Milestones

**M0 – Project Bootstrap (1 week)**
- Repo scaffold (Tauri+React+TS), CI, code formatting/linting.
- SQLite schema & migrations in place; FTS5 verified; `sqlite-vec` loads on startup.
- App data dir + backup/restore ZIP utilities.

**M1 – Core CRUD & Library (1–2 weeks)**
- Spell list/table with filters (level, school, class, components, tags, source).
- Create/Edit spell form with validation; FTS sync triggers; change log.
- Character + Spellbook linkage UI (prepared/known toggles, notes).

**M2 – Importers (2 weeks)**
- Import wizard for MD/DOCX/PDF; mapping UI; dedupe resolution.
- Provenance storage (artifact table, hashes); reparse-from-artifact command.
- Batch import tests on 1k mixed files; error reports.

**M3 – Semantic Search (1 week)**
- Python sidecar with embeddings endpoint; background embedding job.
- Vector table and hybrid ranking (keyword+semantic) with latency budgets.
- Search UI toggle (keyword/semantic) + facets.

**M4 – Local Chat (RAG) (1–2 weeks)**
- Retriever (top-K vec + FTS union) and prompt assembly with citations.
- **FLAN-T5-small (int8 via CTranslate2)** inference endpoint; streaming UI panel.
- Guardrails: out-of-scope detection; show sources; copy-to-clipboard.

**M5 – Export (1 week)**
- Markdown export (YAML front-matter). Pandoc-based PDF export (A4/Letter), HTML-print fallback.
- Spellbook pack generator (selected character, prepared/known flags, notes).

**M6 – Polish & Packaging (1 week)**
- Theming (light/dark), keyboard shortcuts, high-contrast mode.
- Installers: Windows MSI, macOS DMG/App, Linux AppImage/Deb.
- Smoke tests across OSes; vault export/import UX.

**M7 – Beta & Feedback (ongoing)**
- Dogfood with a 2e corpus; address parsing edge cases; stabilize.

## Gathering Results

**Functional Verification**
- Import 1k mixed files → ≥99% of critical fields parsed or user-mapped; <1% failures require manual retype.
- Search: keyword P95 <150ms; semantic P95 <500ms on CPU-only laptop; verified via automated timing tests.
- Chat: answer 50 curated AD&D 2e questions with ≥90% correctness (manual rubric) and ≥95% citation coverage.
- Export: 100-spell PDF under 5s; Markdown round-trips (export→import) without loss of structured data.

**QA Artifacts**
- Parser golden tests per source type.
- Golden PDF snapshots with hash/visual diff tolerance.
- E2E tests: import→search→chat→export flows on Windows/macOS/Linux.

**User Acceptance**
- Session usability checklist (find X in ≤ 10s; print y-level pack in ≤ 3 clicks).
- Performance logged locally (no telemetry) and shown in a diagnostics panel.

## Need Professional Help in Developing Your Architecture?

Please contact me at [sammuti.com](https://sammuti.com) :)


### Appendix A — Seed Bundle Contents

A downloadable bundle has been generated with:

```
spellbook_seed_bundle.zip
├─ README.md
├─ db/
│  └─ 0001_init.sql          # Schema: tables, FTS5, sqlite-vec, triggers
└─ spells_md/
   ├─ magic_missile.md
   ├─ cure_light_wounds.md
   ├─ fireball.md
   └─ detect_magic.md
```

- Markdown files include YAML front‑matter aligned to the schema.
- The SQL migration matches the Method section and is ready to `.read` into a fresh SQLite DB.


### Appendix B — Tauri + React Scaffold

A runnable scaffold with React screens and Rust command stubs is available as a zip. It includes:

```
tauri_spellbook_scaffold.zip
├─ README.md
└─ apps/
   └─ desktop/
      ├─ package.json (React + Vite + @tauri-apps/api)
      ├─ index.html, src/** (Library, ImportWizard, Chat, ExportPage)
      └─ src-tauri/
         ├─ Cargo.toml (Tauri 2, rusqlite)
         ├─ tauri.conf.json
         └─ src/main.rs (commands: ping, search_keyword, chat_answer)
```

Notes:
- UI calls are mocked; replace with `invoke('search_keyword', { query })` etc., once DB is wired.
- `main.rs` includes `search_keyword` using FTS5; add migrations at startup to create tables.
- You can copy the **seed bundle** SQL (`0001_init.sql`) into the app and execute it on first run.

