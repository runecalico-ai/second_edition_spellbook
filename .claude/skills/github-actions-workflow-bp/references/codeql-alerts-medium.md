# CodeQL GitHub Actions Alerts — Medium Severity & Recommendations

Medium severity alerts (security severity 5.0) are included in the `security-extended` and `security-and-quality` query suites. Recommendation-level alerts are style/maintainability issues.

> Source: [CodeQL query help for GitHub Actions](https://codeql.github.com/codeql-query-help/actions/)

---

## Medium Severity (5.0)

### 1. Artifact Poisoning (Medium)

| | |
|---|---|
| **ID** | `actions/artifact-poisoning/medium` |
| **Severity** | 5.0 |
| **CWE** | CWE-829 |
| **Query Suite** | security-extended, security-and-quality |

Same vulnerability as the critical variant but detected with lower confidence (medium precision). Downloaded artifacts may override workspace files.

**Fix:** Extract artifacts to `${{ runner.temp }}/artifacts/`. See [codeql-alerts-critical.md](codeql-alerts-critical.md#4-artifact-poisoning) for full examples.

---

### 2. Checkout of Untrusted Code in Trusted Context (Medium)

| | |
|---|---|
| **ID** | `actions/untrusted-checkout/medium` |
| **Severity** | 5.0 |
| **CWE** | CWE-829 |
| **Query Suite** | security-extended, security-and-quality |

Same vulnerability as the critical/high variants but detected with lower confidence. `pull_request_target` + checkout of PR HEAD in a privileged context.

**Fix:** Use `pull_request` + `workflow_run` pattern. See [codeql-alerts-critical.md](codeql-alerts-critical.md#2-checkout-of-untrusted-code-in-privileged-context) for full examples.

---

### 3. Code Injection (Medium)

| | |
|---|---|
| **ID** | `actions/code-injection/medium` |
| **Severity** | 5.0 |
| **CWE** | CWE-094, CWE-095, CWE-116 |
| **Query Suite** | security-extended, security-and-quality |

Same vulnerability as the critical variant but detected with lower confidence. User input interpolated directly in `run:` or `script:`.

**Fix:** Use env vars with native shell syntax. See [codeql-alerts-critical.md](codeql-alerts-critical.md#1-code-injection) for full examples.

---

### 4. Environment Variable Injection (Medium)

| | |
|---|---|
| **ID** | `actions/envvar-injection/medium` |
| **Severity** | 5.0 |
| **CWE** | CWE-077, CWE-020 |
| **Query Suite** | security-extended, security-and-quality |

Same vulnerability as the critical variant but detected with lower confidence. Untrusted data written to `$GITHUB_ENV` without sanitization.

**Fix:** Strip newlines and use UUID delimiters. See [codeql-alerts-critical.md](codeql-alerts-critical.md#5-environment-variable-injection) for full examples.

---

### 5. PATH Environment Variable Injection (Medium)

| | |
|---|---|
| **ID** | `actions/envpath-injection/medium` |
| **Severity** | 5.0 |
| **CWE** | CWE-077, CWE-020 |
| **Query Suite** | security-extended, security-and-quality |

Same vulnerability as the critical variant but detected with lower confidence. Untrusted data written to `$GITHUB_PATH`.

**Fix:** Never use untrusted data sources to define system PATH. See [codeql-alerts-critical.md](codeql-alerts-critical.md#6-path-environment-variable-injection).

---

### 6. Excessive Secrets Exposure

| | |
|---|---|
| **ID** | `actions/excessive-secrets-exposure` |
| **Severity** | 5.0 |
| **CWE** | CWE-312 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Expressions like `toJSON(secrets)` or dynamically accessed secrets (`secrets[format('GH_PAT_%s', matrix.env)]`) cause the runner to receive **all** secrets, violating least privilege.

#### Incorrect Usage

```yaml
env:
  ALL_SECRETS: ${{ toJSON(secrets) }}
```

```yaml
strategy:
  matrix:
    env: [PROD, DEV]
env:
  GH_TOKEN: ${{ secrets[format('GH_PAT_%s', matrix.env)] }}
```

#### Correct Usage

Reference individual secrets explicitly:

```yaml
env:
  NEEDED_SECRET: ${{ secrets.GH_PAT }}
```

For matrix builds, use conditional steps instead of dynamic secret lookups:

```yaml
strategy:
  matrix:
    env: [PROD, DEV]
steps:
  - if: matrix.env == 'PROD'
    env:
      GH_TOKEN: ${{ secrets.GH_PAT_PROD }}
    run: ./deploy.sh
  - if: matrix.env == 'DEV'
    env:
      GH_TOKEN: ${{ secrets.GH_PAT_DEV }}
    run: ./deploy.sh
```

**References:**
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)

---

### 7. Workflow Does Not Contain Permissions

| | |
|---|---|
| **ID** | `actions/missing-workflow-permissions` |
| **Severity** | 5.0 |
| **CWE** | CWE-275 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Workflows without an explicit `permissions:` block inherit repository or organization defaults, which may be overly permissive (especially repos created before February 2023).

#### Incorrect Usage

```yaml
name: "My workflow"
# No permissions block
```

#### Correct Usage

```yaml
name: "My workflow"
permissions:
  contents: read
  pull-requests: write
```

Or at job level:

```yaml
jobs:
  my-job:
    permissions:
      contents: read
      pull-requests: write
```

**References:**
- [Assigning permissions to jobs](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/assigning-permissions-to-jobs)
- See also [permissions-block.md](permissions-block.md) for comprehensive patterns

---

### 8. Unpinned Tag for a Non-Immutable Action

| | |
|---|---|
| **ID** | `actions/unpinned-tag` |
| **Severity** | 5.0 |
| **CWE** | CWE-829 |
| **Query Suite** | security-extended, security-and-quality |

**Overview:** Using a mutable tag (e.g., `@v44`) for a third-party action allows supply-chain attacks. Tags can be force-pushed to point to malicious commits.

#### Incorrect Usage

```yaml
- uses: tj-actions/changed-files@v44
```

#### Correct Usage

Pin to a full commit SHA and add a version comment:

```yaml
- uses: tj-actions/changed-files@c65cd883420fd2eb864698a825fc4162dd94482c # v44
```

**References:**
- [Using third-party actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)

---

## Recommendation Level

### Workflow Should Use Default Setup

| | |
|---|---|
| **ID** | `actions/unnecessary-use-of-advanced-config` |
| **Severity** | N/A (recommendation) |
| **Query Suite** | security-and-quality |

**Overview:** The CodeQL workflow uses no custom settings and could be simplified by switching to CodeQL default setup.

**Recommendation:** If no custom configuration is needed, switch to default setup via *Settings → Code security → Code scanning → CodeQL analysis → Configure default setup*.

**References:**
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)
