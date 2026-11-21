# Permissions Block: Detailed Guidance

Detailed guidance for configuring the `permissions:` block in GitHub Actions workflows, covering `GITHUB_TOKEN` scoping, common patterns, and when to use a GitHub App instead.

> Source: [Permission guidelines for Action Workflows](https://confluence.jda.com/pages/viewpage.action?pageId=669686264) (WMS Delivery Team, Confluence)

## Core Principles

### Least Privilege by Default

Every workflow must request only the minimal permissions required to complete its tasks.

1. **Short-lived, scoped credentials only** — `GITHUB_TOKEN` is an installation access token for the repo's internal GitHub App, auto-generated per job and expired when the job finishes (max 24h).
2. **Do not use PATs** — use `GITHUB_TOKEN` wherever possible; only GitHub Apps when the token's repo-scoped permissions are insufficient.
3. **Escalate narrowly and visibly** — any permission beyond read-only must be documented in comments and ideally limited to a single job.

### GITHUB_TOKEN: Scope and Limits

- Only the **current repository** (installation scope).
- Permissions depend on: enterprise/org/repo workflow settings, the `permissions:` block, and event type (e.g., PR from fork → mostly read-only).
- New token **per job**, revoked when job ends, max 24h.
- Cannot access other repositories, persist outside the job, or exceed org/repo settings.

**Treat `GITHUB_TOKEN` as a short-lived, repo-local service credential.**

## Repository Default Settings

At **repo** level under *Settings → Actions → General → Workflow permissions*:

- **Workflow permissions:** ✅ *Read repository contents and packages permissions* (read-only default for `GITHUB_TOKEN`).
- **Allow GitHub Actions to create and approve pull requests:** disabled by default.

**Implications:**

- Do **not** set org/repo default to "Read and write" on newly created repositories.
- Existing repos should plan migration to per-workflow permissions and enable recommended defaults once all workflows have a `permissions:` block.

## Style & Best Practices

### 1. Always Declare `permissions:` Explicitly

Every workflow must define `permissions:` at the top level, even if it's only read-only or empty:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

permissions: {}  # No workflow-level permissions

jobs:
  tests:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    permissions:
      contents: read  # Required for local repository checkout
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - run: pytest
```

This makes intent explicit and avoids relying on repository defaults, which may allow more permissions than necessary.

> **CodeQL Warning:** GitHub Advanced Security (CodeQL) will flag any workflow that does not include a `permissions:` block.

### 2. Default to Read-Only at Workflow Level, Escalate at Job Level

```yaml
permissions:
  contents: read  # Safe default for entire workflow

jobs:
  build:
    permissions:
      contents: read  # Inherit and be explicit
    # purely read-only operations

  release:
    # Only this job can modify repo / PRs
    permissions:
      contents: write       # pushes tags, updates files
      packages: write        # publishes packages (if needed)
      pull-requests: write   # comments / updates PRs
```

### 3. Disable Permissions for Jobs That Don't Need Them

If a job doesn't touch GitHub APIs or the repo:

```yaml
jobs:
  release:
    permissions:
      contents: write       # needed to create Git tags and update CHANGELOG.md
      packages: write        # needed to publish to GitHub Packages
      pull-requests: write   # needed to update/create PR status comments

  # This helper job fulfills the required status check
  buildCheck:
    needs: [release]
    permissions: {}
    if: ${{ !cancelled() }}
    steps:
      - name: Check Action Status
        if: ${{ needs.release.result != 'success' }}
        run: exit 1
```

Most jobs doing `checkout` need `contents: read`. For purely compute jobs or matrix fan-out (e.g., Docker build using pre-provided artifacts), `permissions: {}` is ideal.

### 4. Document Non-Read Permissions Inline

For any `write` or special scope, comment the reason:

```yaml
permissions:
  contents: read

jobs:
  release:
    permissions:
      contents: write       # needed to create Git tags and update CHANGELOG.md
      packages: write        # needed to publish to GitHub Packages
      pull-requests: write   # needed to update/create PR status comments
```

### 5. Restrict Permissions for Third-Party Actions

Give third-party actions the **minimum** permissions they require:

```yaml
permissions:
  contents: read
  checks: write  # e.g., for actions that report status checks

jobs:
  quality:
    permissions:
      contents: read
      checks: write
      actions: read  # only if the action actually needs this
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - uses: some/action@SHAHASH # v1.0
```

## Common Permission Patterns

### Pure CI (Tests, Lint) — Read-Only

When all you need is to checkout and run commands:

```yaml
permissions: {}  # see jobs: for per-job overrides

jobs:
  test:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    permissions:
      contents: read
    steps:
      - name: Checkout Code
        id: checkout_code
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          persist-credentials: false
      - name: Run tests
        id: run_tests
        shell: bash
        run: |
          tests_command
```

### Release Job — Git Tag or GitHub Release

Requires `contents: write` to create/modify/publish a GitHub Release:

```yaml
permissions: {}  # see jobs: for per-job overrides

jobs:
  release:
    needs: test
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    permissions:
      contents: write  # create tag, update version files, create GitHub Release
    steps:
      - name: Checkout Code
        id: checkout_code
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          persist-credentials: true
      - name: Create Release
        id: create_release
        uses: ncipollo/release-action@b7eabc95ff50cbeeedec83973935c8f306dfcd0b # v1.2.0
        with:
          artifacts: "release.tar.gz,foo/*.txt"
          bodyFile: "body.md"
```

### Pull Requests — Comments, Labels, Updates

Requires `pull-requests: write` for any PR modification:

```yaml
permissions: {}  # see jobs: for per-job overrides

jobs:
  pr-bot:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    permissions:
      pull-requests: write  # adding/creating/updating PR comments/reviewers/labels
    steps:
      - name: Create Pull Request Comment
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd # v8.0.0
        with:
          script: |
            const pr = context.payload.pull_request;
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: pr.number,
              body: "Thanks for the PR! CI is running 🚀"
            });
      - name: Add Label
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd # v8.0.0
        with:
          script: |
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              labels: ["pull-request"]
            });
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### OIDC (id-token) for Azure Service Principal Authentication

Add `id-token: write` for OIDC cloud credentials:

```yaml
permissions: {}  # see jobs: for per-job overrides

jobs:
  oidc:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    permissions:
      contents: read     # Checkout local repository
      id-token: write    # required for Azure SPN OIDC auth
    steps:
      - name: Checkout Code
        id: checkout_code
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          persist-credentials: false
      - name: Azure login
        uses: azure/login@a457da9ea143d694b1b9c7c869ebb04ebe844ef5 # v2.3.0
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          allow-no-subscriptions: true
```

### GitHub Application Usage

Set no permissions for `GITHUB_TOKEN` when using a GitHub App token instead:

```yaml
permissions: {}

jobs:
  cross-repo-automation:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    steps:
      - name: Get GitHub App Token
        uses: actions/create-github-app-token@29824e69f54612133e76f7eaac726eef6c875baf # v2.2.1
        id: get_workflow_token
        with:
          app-id: ${{ secrets.GITHUB_APP_ID }}
          private-key: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
          owner: BY-Product-Development
      - name: Checkout Code
        id: checkout_code
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          repository: BY-Product-Development/remote-repository
          token: ${{ steps.get_workflow_token.outputs.token }}
          persist-credentials: false
```

## When a GitHub App Is Required

`GITHUB_TOKEN` is limited to the current repository and current job lifetime. Use a **GitHub App** when you need:

1. **Cross-repository or organization-wide access** — workflows in repo A must manage issues/PRs in repo B.
2. **Automation outside Actions** — long-running external services, scheduled tasks, Jenkins jobs.
3. **Stricter, account-independent security** — GitHub Apps authenticate as the app installation with more granular permissions than PATs.
4. **Fine-grained delegation** — grant access to just issues/PRs in selected repos, not full contents.

### Using a GitHub App from a Workflow

1. Create a GitHub App with minimal required repo/org permissions.
2. Install it on the relevant org/repos.
3. Store the App ID as a **configuration variable** and the private key as a **secret**.
4. Use `actions/create-github-app-token` to mint an installation access token:

```yaml
permissions: {}

jobs:
  cross-repo-automation:
    runs-on: az-dev-ubuntu-latest
    environment: rnd-interop-na
    steps:
      - name: Get GitHub App Token
        uses: actions/create-github-app-token@29824e69f54612133e76f7eaac726eef6c875baf # v2.2.1
        id: get_workflow_token
        with:
          app-id: ${{ secrets.GITHUB_APP_ID }}
          private-key: ${{ secrets.GITHUB_APP_PRIVATE_KEY }}
          owner: BY-Product-Development
      - name: Use app token against another repo
        id: use_app_token
        shell: bash
        env:
          GH_TOKEN: ${{ steps.get_workflow_token.outputs.token }}
        run: |
          gh api repos/other-org/other-repo/issues \
            --jq '.[0].title'
```

## Anti-Patterns

- **No `permissions:` block** — relying on implicit defaults.
- **`permissions: write-all`** — without documented justification.
- **Using PATs** — where `GITHUB_TOKEN` + GitHub App would suffice.
- **Logging or storing tokens** — in artifacts, caches, or external services.
- **Excessive third-party action permissions** — e.g., `contents: write` when only `read` is needed.

## Quick Checklist

Before merging any new or changed workflow:

1. `permissions:` is explicitly set at workflow top level.
2. Default is no more than `contents: read` (plus `id-token: write` if OIDC is needed).
3. Job-level `permissions:` blocks exist only where necessary.
4. Any `write` permission has an inline comment justifying it.
5. Third-party actions receive the minimum permissions they need.
6. No PATs are used.
7. Cross-repo/org access uses a GitHub App with minimum necessary permissions.

## Further Reading

- [Security practices for writing workflows and using GitHub Actions features](https://docs.github.com/en/actions/reference/security/secure-use)
- [`permissions` workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [GITHUB_TOKEN — What is it?](https://docs.github.com/en/actions/concepts/security/github_token)
- [Authenticating with GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Manage GitHub Actions Settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
