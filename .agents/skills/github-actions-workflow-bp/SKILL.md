---
name: github-actions-workflow-bp
description: Expert guidance for creating secure, efficient Github Actions workflows. Use when writing, reviewing, or refactoring .github/workflows/*.yml files. Provides security best practices, OIDC authentication patterns, proper secret handling, job optimization, and common pitfalls to avoid.
---

# Github Actions Workflow Best Practices and Security

Expert guidance for creating secure, efficient, and maintainable Github Actions workflows.

## When to Use This Skill

- Creating new workflow files in `.github/workflows/`
- Reviewing existing workflows for security issues or optimization
- Implementing CI/CD pipelines with Github Actions
- Troubleshooting workflow failures or performance issues
- Migrating from other CI/CD platforms to Github Actions

## Quick Security Checklist

Before deploying any workflow, verify:

- [ ] No hardcoded secrets or credentials
- [ ] Third-party actions pinned to commit SHA (not tags)
- [ ] Workflow permissions explicitly limited (not default `write-all`)
- [ ] Pull request triggers use `pull_request` not `pull_request_target` (unless necessary)
- [ ] Sensitive outputs are masked with `::add-mask::`
- [ ] Environment protection rules configured for production deployments

## Core Principles

### 1. Principle of Least Privilege

Always grant minimum required permissions:

```yaml
permissions:
  contents: read      # Default to read-only
  pull-requests: write  # Grant only what's needed
```

**Never use:**
```yaml
permissions: write-all  # Anti-pattern: overly permissive
```

### 2. Pin Actions to Commit SHA

**Secure:**
```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
```

**Insecure:**
```yaml
- uses: actions/checkout@v4  # Tag can be force-pushed
- uses: actions/checkout@main  # Branch moves over time
```

### 3. Never Trust User Input in Scripts

**Insecure:**
```yaml
- name: Comment on PR
  run: echo "${{ github.event.comment.body }}" >> comment.txt
  # Vulnerable to script injection
```

**Secure:**
```yaml
- name: Comment on PR
  env:
    COMMENT_BODY: ${{ github.event.comment.body }}
  run: echo "$COMMENT_BODY" >> comment.txt
  # Environment variable prevents injection
```

## Security Best Practices

### Secret Management

**Store secrets in Github Secrets (Settings → Secrets):**

```yaml
- name: Deploy to AWS
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: aws s3 sync ./dist s3://my-bucket
```

**For cloud deployments, prefer OIDC over long-lived credentials:**

See [references/oidc-patterns.md](references/oidc-patterns.md) for AWS, Azure, and GCP examples.

**Mask sensitive values in logs:**

```yaml
- name: Process API response
  run: |
    API_TOKEN=$(generate-token)
    echo "::add-mask::$API_TOKEN"
    echo "TOKEN=$API_TOKEN" >> $GITHUB_ENV
```

### Workflow Permissions

The `permissions:` block controls `GITHUB_TOKEN` scopes. Misconfigured permissions are a leading source of supply-chain risk.

**Required practices:**

1. **Always declare `permissions:` explicitly** — every workflow, no exceptions. CodeQL flags missing blocks.
2. **Default to least privilege** — use `permissions: {}` or `contents: read` at workflow level.
3. **Escalate at job level only** — grant `write` scopes to individual jobs that need them.
4. **Document every write permission inline** — comment the reason next to each `write` scope.
5. **Never use `permissions: write-all`** or rely on implicit repository defaults.
6. **Never use PATs** — use `GITHUB_TOKEN` or a GitHub App.

```yaml
permissions:
  contents: read  # Safe default for entire workflow

jobs:
  build:
    permissions:
      contents: read
    steps: [...]

  release:
    permissions:
      contents: write       # needed to create Git tags
      packages: write        # needed to publish to GitHub Packages
      pull-requests: write   # needed to update PR status comments
    steps: [...]
```

**When a GitHub App is required** instead of `GITHUB_TOKEN`:

- Cross-repository or organization-wide access
- Automation outside of workflow job lifetime
- Fine-grained delegation to specific repos/scopes

See [references/permissions-block.md](references/permissions-block.md) for common permission patterns (CI, releases, PRs, OIDC, GitHub Apps) with full examples.

### Pull Request Triggers

**Default choice (safe for public repos):**

```yaml
on:
  pull_request:  # Runs in PR context with read-only permissions
    branches: [main]
```

**Use with extreme caution:**

```yaml
on:
  pull_request_target:  # Runs in base branch context with write permissions
    branches: [main]

# Only use pull_request_target when:
# - You need write access to comment on PRs from forks
# - You NEVER checkout PR code (or carefully validate it first)
# - See references/pull-request-security.md for safe patterns
```

### Dependency Security

**Review and audit third-party actions:**

1. Check the action's source code repository
2. Review recent commits and maintainers
3. Pin to specific commit SHA
4. Use Dependabot to track updates

**Configure Dependabot for workflow dependencies:**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## Performance Optimization

### Caching Dependencies

**Node.js example:**

```yaml
- uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8  # v4.0.2
  with:
    node-version: '20'
    cache: 'npm'

- run: npm ci
```

**Custom caching:**

```yaml
- uses: actions/cache@13aacd865c20de90d75de3b17ebe84f7a17d57d2  # v4.0.0
  with:
    path: |
      ~/.cargo
      target/
    key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      ${{ runner.os }}-cargo-
```

### Job Parallelization

**Run independent jobs concurrently:**

```yaml
jobs:
  test-unit:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps: [...]

  test-integration:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps: [...]

  lint:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps: [...]

  deploy:
    needs: [test-unit, test-integration, lint]  # Wait for all tests
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps: [...]
```

### Matrix Builds

**Test across multiple versions efficiently:**

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
      fail-fast: false  # Continue other jobs if one fails
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/setup-node@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

## Common Patterns

### Conditional Execution

**Run steps based on conditions:**

```yaml
- name: Deploy to production
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: ./deploy.sh

- name: Comment on PR
  if: github.event_name == 'pull_request'
  run: ./pr-comment.sh
```

### Reusable Workflows

**Extract common workflows to reduce duplication:**

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow

on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string

jobs:
  test:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
      - uses: actions/setup-node@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - run: npm test
```

**Call from other workflows:**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test-node-18:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '18'

  test-node-20:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: '20'
```

### Environment Variables

**Set at different scopes:**

```yaml
env:
  GLOBAL_VAR: value  # Available to all jobs

jobs:
  build:
    env:
      JOB_VAR: value  # Available to all steps in this job
    steps:
      - name: Build
        env:
          STEP_VAR: value  # Available only in this step
        run: make build
```

## Troubleshooting

### Debug Logging

**Enable step debugging:**

```yaml
- name: Debug environment
  run: |
    echo "Runner OS: ${{ runner.os }}"
    echo "Github ref: ${{ github.ref }}"
    echo "Event name: ${{ github.event_name }}"
    env | sort
```

**Enable runner diagnostic logging:**
Add repository secrets:
- `ACTIONS_RUNNER_DEBUG` = `true`
- `ACTIONS_STEP_DEBUG` = `true`

### Common Issues

**Issue: Workflow doesn't trigger**
- Check trigger conditions match your event
- Verify workflow file is in `.github/workflows/` directory
- Ensure YAML syntax is valid
- Check branch protection rules

**Issue: Permission denied errors**
- Review `permissions:` block
- Check if GITHUB_TOKEN has required scopes
- Verify repository settings allow workflow to make changes

**Issue: Secrets not available**
- Confirm secret names match exactly (case-sensitive)
- Check secret is defined at correct level (repo/org/environment)
- For forked PRs, secrets are not available by default

## CodeQL GitHub Actions Alerts

GitHub Advanced Security (CodeQL) includes queries specifically for GitHub Actions workflows. These detect security vulnerabilities, misconfigurations, and anti-patterns. Fix all critical and high alerts before merging.

### Alert Summary by Severity

| Severity | Count | Key Alerts |
|----------|-------|------------|
| **Critical** (9.0–9.3) | 9 | Code injection, untrusted checkout, artifact poisoning, TOCTOU, improper access control, env/PATH injection, unmasked secrets, if-expression bugs |
| **High** (7.5) | 8 | Untrusted checkout (lower precision), TOCTOU, cache poisoning (3 variants), secrets in artifacts, vulnerable actions |
| **Medium** (5.0) | 8 | Lower-precision variants of critical alerts, excessive secrets, missing permissions, unpinned tags |
| **Recommendation** | 1 | Unnecessary advanced CodeQL config |

### Top Rules to Know

1. **Always declare `permissions:`** — missing blocks are flagged (`actions/missing-workflow-permissions`)
2. **Pin actions to commit SHA** — unpinned tags are flagged (`actions/unpinned-tag`)
3. **Never interpolate user input in `run:`** — use env vars instead (`actions/code-injection`)
4. **Avoid `pull_request_target` with checkout** — use `pull_request` + `workflow_run` (`actions/untrusted-checkout`)
5. **Use immutable refs (SHA)** for PR checkouts to prevent TOCTOU (`actions/untrusted-checkout-toctou`)
6. **Don't expose all secrets** — avoid `toJSON(secrets)` (`actions/excessive-secrets-exposure`)
7. **Mask derived secrets** — `fromJson(secrets.X).field` won't be masked automatically (`actions/unmasked-secret-exposure`)

See detailed alert documentation with correct/incorrect usage examples:

- **Critical alerts**: [references/codeql-alerts-critical.md](references/codeql-alerts-critical.md)
- **High alerts**: [references/codeql-alerts-high.md](references/codeql-alerts-high.md)
- **Medium & recommendation alerts**: [references/codeql-alerts-medium.md](references/codeql-alerts-medium.md)

## Reference Files

For deeper guidance on specific topics:

- **Permissions Block**: [references/permissions-block.md](references/permissions-block.md) - Detailed `permissions:` patterns, GITHUB_TOKEN scoping, and GitHub App guidance
- **CodeQL Critical Alerts**: [references/codeql-alerts-critical.md](references/codeql-alerts-critical.md) - Severity 9.0–9.3 alerts with examples
- **CodeQL High Alerts**: [references/codeql-alerts-high.md](references/codeql-alerts-high.md) - Severity 7.5 alerts with examples
- **CodeQL Medium Alerts**: [references/codeql-alerts-medium.md](references/codeql-alerts-medium.md) - Severity 5.0 alerts and recommendations
- **OIDC Authentication**: [references/oidc-patterns.md](references/oidc-patterns.md) - AWS, Azure, GCP setup
- **Pull Request Security**: [references/pull-request-security.md](references/pull-request-security.md) - Safe patterns for fork contributions
- **Advanced Caching**: [references/caching-strategies.md](references/caching-strategies.md) - Complex cache patterns
- **Self-Hosted Runners**: [references/self-hosted-runners.md](references/self-hosted-runners.md) - Security and setup

## Additional Resources

Official documentation: https://docs.github.com/en/actions
Security hardening: https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
