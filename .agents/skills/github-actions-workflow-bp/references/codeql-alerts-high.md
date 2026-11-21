# CodeQL GitHub Actions Alerts — High Severity

High severity alerts (security severity 7.5) are included in the `default` or `security-extended` query suites and should be resolved before merging to production branches.

> Source: [CodeQL query help for GitHub Actions](https://codeql.github.com/codeql-query-help/actions/)

---

## 1. Checkout of Untrusted Code in Trusted Context

| | |
|---|---|
| **ID** | `actions/untrusted-checkout/high` |
| **Severity** | 7.5 |
| **CWE** | CWE-829 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Same pattern as the critical variant — `pull_request_target` or `issue_comment` trigger followed by checkout of PR HEAD — but detected with lower confidence (high precision vs. very-high).

**Recommendation:** Use unprivileged `pull_request` + `workflow_run` pattern. See [codeql-alerts-critical.md](codeql-alerts-critical.md#2-checkout-of-untrusted-code-in-privileged-context) for full examples.

---

## 2. Untrusted Checkout TOCTOU

| | |
|---|---|
| **ID** | `actions/untrusted-checkout-toctou/high` |
| **Severity** | 7.5 |
| **CWE** | CWE-367 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Same TOCTOU pattern as the critical variant — checkout protected by approval/label gate uses a mutable branch ref — detected with slightly lower confidence.

**Fix:** Always use `${{ github.event.pull_request.head.sha }}` (immutable) instead of `${{ github.event.pull_request.head.ref }}` (mutable). See [codeql-alerts-critical.md](codeql-alerts-critical.md#3-untrusted-checkout-toctou-time-of-check-time-of-use) for full examples.

---

## 3. If Expression Always True

| | |
|---|---|
| **ID** | `actions/if-expression-always-true/high` |
| **Severity** | 7.5 |
| **CWE** | CWE-275 |
| **Query Suite** | security-and-quality |

**Overview:** Same bug as the critical variant — extra characters or YAML block scalars around `${{ }}` in `if:` cause the condition to always be true. This variant is detected with slightly lower confidence.

**Fix:** Omit `${{ }}` in `if:` conditions or use `|-` block scalar. See [codeql-alerts-critical.md](codeql-alerts-critical.md#7-if-expression-always-true) for examples.

---

## 4. Cache Poisoning via Caching of Untrusted Files

| | |
|---|---|
| **ID** | `actions/cache-poisoning/direct-cache` |
| **Severity** | 7.5 |
| **CWE** | CWE-349 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** A workflow that runs in the context of the default branch checks out untrusted code and caches files from it. Caches are scoped to branches — entries from `main` are accessible to all feature branches. An attacker can poison the cache to achieve code execution in privileged workflows.

**Recommendation:**
1. Avoid caching in workflows that handle sensitive operations.
2. Use `pull_request` (not `pull_request_target`) so caches are scoped to the PR branch.
3. Validate restored cache contents before use.

### Incorrect Usage

```yaml
name: Vulnerable Workflow
on:
  issue_comment:
    types: [created]
jobs:
  pr-comment:
    permissions: read-all
    runs-on: ubuntu-latest
    steps:
      - uses: xt0rted/pull-request-comment-branch@v2
        id: comment-branch
      - uses: actions/checkout@v3
        with:
          ref: ${{ steps.comment-branch.outputs.head_sha }}
      - uses: actions/setup-python@v5
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/pyproject.toml') }}
          restore-keys: ${{ runner.os }}-pip-
```

### Correct Usage

Use `pull_request` trigger so cache is scoped to the PR:

```yaml
name: Secure Workflow
on:
  pull_request:
jobs:
  pr-comment:
    permissions: read-all
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v5
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/pyproject.toml') }}
          restore-keys: ${{ runner.os }}-pip-
```

If secrets are needed from forks, use `pull_request_target` with label gates and manual review:

```yaml
name: Secure Workflow
on:
  pull_request_target:
    types: [labeled]
jobs:
  pr-comment:
    if: contains(github.event.pull_request.labels.*.name, 'safe to test')
    permissions: read-all
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-python@v5
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/pyproject.toml') }}
          restore-keys: ${{ runner.os }}-pip-
```

**References:**
- [The Monsters in Your Build Cache](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)
- [GitHub Actions Caching Documentation](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

---

## 5. Cache Poisoning via Execution of Untrusted Code

| | |
|---|---|
| **ID** | `actions/cache-poisoning/poisonable-step` |
| **Severity** | 7.5 |
| **CWE** | CWE-349 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** A workflow runs untrusted code (e.g., via `pull_request_target` + checkout of PR HEAD) in a job that has cache access on the default branch. The attacker can steal the cache token and poison entries.

### Incorrect Usage

```yaml
name: Vulnerable Workflow
on:
  pull_request_target:
    branches: [main]
permissions: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: ./run_tests.sh  # attacker-controlled script
```

### Correct Usage

```yaml
name: Secure Workflow
on:
  pull_request:
    branches: [main]
permissions: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: ./run_tests.sh
```

**References:**
- [The Monsters in Your Build Cache](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)
- [Cache Poisoning in GitHub Actions (Scribe Security)](https://scribesecurity.com/blog/github-cache-poisoning/)

---

## 6. Cache Poisoning via Low-Privileged Code Injection

| | |
|---|---|
| **ID** | `actions/cache-poisoning/code-injection` |
| **Severity** | 7.5 |
| **CWE** | CWE-349, CWE-094 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** A non-privileged job running on the default branch has a code injection vulnerability (e.g., unsanitized `${{ }}` in `run:`). An attacker exploits the injection to steal cache tokens and poison caches for privileged workflows.

### Incorrect Usage

```yaml
name: Vulnerable Workflow
on:
  issue_comment:
    types: [created]
jobs:
  pr-comment:
    permissions: {}
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo ${{ github.event.comment.body }}
```

### Correct Usage

```yaml
name: Secure Workflow
on:
  issue_comment:
    types: [created]
jobs:
  pr-comment:
    permissions: {}
    runs-on: ubuntu-latest
    steps:
      - env:
          BODY: ${{ github.event.comment.body }}
        run: |
          echo "$BODY"
```

**References:**
- [The Monsters in Your Build Cache](https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/)

---

## 7. Storage of Sensitive Information in Artifacts

| | |
|---|---|
| **ID** | `actions/secrets-in-artifacts` |
| **Severity** | 7.5 |
| **CWE** | CWE-312 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** `actions/checkout` stores the `GITHUB_TOKEN` in `.git/config`. Uploading the entire workspace (including `.git/`) as an artifact leaks credentials.

### Incorrect Usage

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/upload-artifact@1746f4ab65b179e0ea60a494b83293b640dd5bba # v4.3.2
    with:
      name: file
      path: .  # includes .git/ with GITHUB_TOKEN
```

### Correct Usage

Use `actions/upload-artifact@v4+` which excludes hidden files/directories by default:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/upload-artifact@v4
    with:
      name: file
      path: .  # v4+ excludes .git/ by default
```

---

## 8. Use of a Known Vulnerable Action

| | |
|---|---|
| **ID** | `actions/vulnerable-action` |
| **Severity** | 7.5 |
| **CWE** | CWE-1395 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** A workflow uses a GitHub Action with known security vulnerabilities.

**Recommendation:** Remove the vulnerable action or upgrade to a patched version. Use Dependabot to keep actions up to date:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

**References:**
- [Keeping your actions up to date with Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot)
