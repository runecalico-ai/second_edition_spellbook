# AGENTS.md

This document defines **mandatory security rules** for AI agents operating in this repository.

Its primary purpose is to prevent **typosquatting, dependency confusion, and supply-chain compromise**, especially from **misspelled or squatted package names**.

These rules apply to **planning, recommending, adding, or modifying dependencies** in any language.

---

## Absolute principles

1. **Do not guess dependency names. Ever.**
2. **Misspellings are treated as malicious until proven otherwise.**
3. **No new dependency is “minor” or “obvious.”**
4. **When uncertain, stop and escalate instead of proceeding.**

Failure mode preference:  
**Reject the change rather than risk introducing an unverified package.**

---

## Global rules (all ecosystems)

### 1. No implicit dependency additions
- Do not introduce new third-party dependencies unless explicitly required.
- Prefer existing dependencies already present in the repository.
- If a new dependency is needed:
  - Explain why existing dependencies are insufficient.
  - Wait for explicit approval before modifying manifests or lockfiles.

### 2. Exact-name verification is mandatory
For any dependency not already present in this repo:

- You must verify the **exact canonical package name** from:
  - Official project documentation **or**
  - The official upstream repository referenced by that documentation
- Registry spellings must **exactly match** the authoritative source:
  - Character-for-character
  - Including hyphens, underscores, scope prefixes, and case (where relevant)

### 3. Close spellings are presumed hostile
Treat as suspicious and **do not use**:
- Transposed letters (`reqeusts` vs `requests`)
- Missing or extra characters
- Hyphen/underscore substitutions
- Singular/plural variants
- Look-alike Unicode characters
- Scoped vs unscoped variants with similar names

If encountered, flag and stop.

### 4. Approved registries only
- Node: **npm registry**
- Python: **PyPI**
- Rust: **crates.io**

Do **not**:
- Add alternate registries
- Add direct URLs, tarballs, or git dependencies
- Bypass normal resolution or signature checks

Unless the repository explicitly documents an exception.

### 5. Lockfiles are mandatory and authoritative
- Never remove lockfiles.
- Never regenerate lockfiles opportunistically.
- Preserve deterministic resolution:
  - `package-lock.json`, `pnpm-lock.yaml`
  - `poetry.lock`, `uv.lock`, `requirements.lock`
  - `Cargo.lock`

---

## Ecosystem-specific enforcement

### Node.js (npm / pnpm)

**Before using a new package name:**
1. Locate the package name in the project’s official docs or README.
2. Confirm the npm package page:
   - Exact name match
   - Repository URL points to the official upstream repo
   - Homepage/issues URLs are consistent

**Required practices**
- Prefer existing dependencies already present.
- Use lockfile-respecting install flows (`npm ci`, `pnpm install --frozen-lockfile`).
- Keep dependency graphs minimal.

**Prohibited**
- Installing from:
  - Git URLs
  - Tarball URLs
  - Forks or mirrors
- Adding “helper” or “tiny” packages without strong justification.

---

### Python (pip / Poetry / uv)

**Before using a new package name:**
1. Verify the exact PyPI name from official documentation or upstream repo.
2. Confirm PyPI metadata:
   - Project links back to the official repository
   - Maintainer identity is consistent with the project
3. Treat similarly named packages as malicious until proven otherwise.

**Required practices**
- Respect existing dependency tooling (Poetry, uv, requirements files).
- Preserve lockfiles and pinned versions.
- Prefer hash-verified installs where applicable.

**Prohibited**
- Guessing PyPI names from import paths.
- Replacing constraints with looser versions.
- Installing directly from VCS or URLs without approval.

---

### Rust (Cargo)

**Before using a new crate:**
1. Verify the crate name from official project documentation.
2. Confirm crates.io metadata:
   - Repository URL points to the canonical upstream
   - Crate description matches the documented project

**Required practices**
- Use crates.io only.
- Keep `Cargo.lock` in sync with policy.
- Prefer stable, well-maintained crates.

**Prohibited**
- Git dependencies without explicit approval.
- Similarly named crates not endorsed by official docs.

---

## Mandatory provenance check

For any newly proposed dependency, the agent must validate:

- Registry page exists and is not newly squatted
- Repository URL matches the official project
- No unexplained divergence in naming or ownership
- No suspicious publish history (e.g., sudden new maintainer or burst release)

If **any check fails**, stop and escalate.

---

## Red flags requiring immediate stop

Do **not** proceed if you observe:

- Near-miss spellings of well-known packages
- Registry page links to unrelated or low-signal repositories
- Empty, placeholder, or auto-generated README content
- Recently created packages mimicking popular ones
- Instructions requiring registry changes or security bypasses

---

## Required behavior when uncertain

If you are not fully confident:

1. Present findings without modifying code:
   - Exact package name
   - Registry link
   - Upstream repository link
   - Why it appears legitimate or suspicious
2. Ask for explicit human approval.

---

## Required documentation when approved

When adding or updating a dependency, you must document:

- Why the dependency is needed
- Where the canonical name was verified
- That the registry package links to the official upstream

Keep changes minimal and scoped.

---

## Scope

These rules apply to:
- Dependency additions
- Dependency upgrades
- Dependency recommendations
- Build, tooling, and test dependencies

AI agents must follow this document exactly.
