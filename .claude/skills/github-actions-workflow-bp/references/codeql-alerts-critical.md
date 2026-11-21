# CodeQL GitHub Actions Alerts — Critical Severity

Critical alerts (security severity 9.0–9.3) represent the most dangerous vulnerabilities. These are included in the `default` code scanning query suite and **must be resolved before merging**.

> Source: [CodeQL query help for GitHub Actions](https://codeql.github.com/codeql-query-help/actions/)

---

## 1. Code Injection

| | |
|---|---|
| **ID** | `actions/code-injection/critical` |
| **Severity** | 9.0 |
| **CWE** | CWE-094, CWE-095, CWE-116 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Using user-controlled input directly in `run:` or `script:` contexts allows attackers to inject arbitrary shell commands, exfiltrate secrets, and modify the repository.

**Recommendation:** Set untrusted input to an intermediate environment variable and reference it with native shell syntax (not `${{ env.VAR }}`).

### Incorrect Usage

```yaml
on: issue_comment

jobs:
  echo-body:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo '${{ github.event.comment.body }}'
```

Using `${{ env.BODY }}` in `run:` is also vulnerable — it still expands before the shell:

```yaml
steps:
  - env:
      BODY: ${{ github.event.issue.body }}
    run: |
      echo '${{ env.BODY }}'
```

### Correct Usage

Use the shell's native variable syntax:

```yaml
jobs:
  echo-body:
    runs-on: ubuntu-latest
    steps:
      - env:
          BODY: ${{ github.event.issue.body }}
        run: |
          echo "$BODY"
```

In `actions/github-script`, use `process.env`:

```yaml
steps:
  - uses: actions/github-script@v4
    env:
      BODY: ${{ github.event.issue.body }}
    with:
      script: |
        const { BODY } = process.env
```

**References:**
- [GitHub Security Lab: Untrusted input](https://securitylab.github.com/research/github-actions-untrusted-input)
- [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

---

## 2. Checkout of Untrusted Code in Privileged Context

| | |
|---|---|
| **ID** | `actions/untrusted-checkout/critical` |
| **Severity** | 9.3 |
| **CWE** | CWE-829 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Using `pull_request_target` or `issue_comment` triggers followed by checkout of the PR HEAD runs untrusted code with write permissions and access to secrets.

**Recommendation:** Use unprivileged `pull_request` workflow + `workflow_run` for privileged operations.

### Incorrect Usage

```yaml
on: pull_request_target

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@v1
      - run: |
          npm install
          npm build
      - uses: completely/fakeaction@v2
        with:
          arg1: ${{ secrets.supersecret }}
```

### Correct Usage

Split into two workflows:

**ReceivePR.yml** (unprivileged):

```yaml
name: Receive PR
on:
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: /bin/bash ./build.sh
      - run: |
          mkdir -p ./pr
          echo ${{ github.event.number }} > ./pr/NR
      - uses: actions/upload-artifact@v2
        with:
          name: pr
          path: pr/
```

**CommentPR.yml** (privileged, triggered by `workflow_run`):

```yaml
name: Comment on the pull request
on:
  workflow_run:
    workflows: ["Receive PR"]
    types:
      - completed
jobs:
  upload:
    runs-on: ubuntu-latest
    if: >
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion == 'success'
    steps:
      - name: "Download artifact"
        uses: actions/github-script@v3.1.0
        with:
          script: |
            var artifacts = await github.actions.listWorkflowRunArtifacts({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: ${{ github.event.workflow_run.id }},
            });
            var matchArtifact = artifacts.data.artifacts.filter((a) => a.name == "pr")[0];
            var download = await github.actions.downloadArtifact({
                owner: context.repo.owner,
                repo: context.repo.repo,
                artifact_id: matchArtifact.id,
                archive_format: 'zip',
            });
            var fs = require('fs');
            fs.writeFileSync('${{ github.workspace }}/pr.zip', Buffer.from(download.data));
      - run: unzip -d tmp/ pr.zip
      - name: "Comment on PR"
        uses: actions/github-script@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            var fs = require('fs');
            var issue_number = Number(fs.readFileSync('./tmp/NR'));
            const contains_numeric = /\d/.test(issue_number);
            if (contains_numeric) {
                await github.issues.createComment({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: issue_number,
                  body: 'Everything is OK. Thank you for the PR!'
                });
            }
```

**References:**
- [Preventing pwn requests](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)

---

## 3. Untrusted Checkout TOCTOU (Time-of-Check Time-of-Use)

| | |
|---|---|
| **ID** | `actions/untrusted-checkout-toctou/critical` |
| **Severity** | 9.3 |
| **CWE** | CWE-367 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** A checkout protected by a security check (environment approval, label gate) uses a mutable ref. An attacker can modify the branch after the check passes but before execution.

**Recommendation:** Always use immutable references (commit SHA) instead of branch refs.

### Incorrect Usage (Environment Approval)

```yaml
on:
  pull_request_target:
    types: [Created]
jobs:
  test:
    environment: NeedsApproval
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.ref }}  # MUTABLE!
      - run: ./cmd
```

### Correct Usage (Environment Approval)

```yaml
on:
  pull_request_target:
    types: [Created]
jobs:
  test:
    environment: NeedsApproval
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.sha }}  # IMMUTABLE
      - run: ./cmd
```

### Incorrect Usage (Label Gates)

```yaml
on:
  pull_request_target:
    types: [labeled]
jobs:
  test:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'safe-to-test')
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}  # MUTABLE!
          repository: ${{ github.event.pull_request.head.repo.full_name }}
      - run: ./cmd
```

### Correct Usage (Label Gates)

```yaml
on:
  pull_request_target:
    types: [labeled]
jobs:
  test:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'safe-to-test')
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # IMMUTABLE
          repository: ${{ github.event.pull_request.head.repo.full_name }}
      - run: ./cmd
```

**References:**
- [ActionsTOCTOU](https://github.com/AdnaneKhan/ActionsTOCTOU)

---

## 4. Artifact Poisoning

| | |
|---|---|
| **ID** | `actions/artifact-poisoning/critical` |
| **Severity** | 9.0 |
| **CWE** | CWE-829 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Downloaded artifacts from a previous workflow may be attacker-controlled. Extracting them to the workspace can override existing files (e.g., `cmd.sh`) leading to code execution.

**Recommendation:** Extract artifacts to a temporary folder. Verify contents before use.

### Incorrect Usage

```yaml
name: Insecure Workflow
on:
  workflow_run:
    workflows: ["Prev"]
    types: [completed]
jobs:
  Download:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: dawidd6/action-download-artifact@v2
        with:
          name: pr_number
      - run: sh cmd.sh  # cmd.sh could be overridden by artifact!
```

### Correct Usage

```yaml
name: Secure Workflow
on:
  workflow_run:
    workflows: ["Prev"]
    types: [completed]
jobs:
  Download:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: mkdir -p ${{ runner.temp }}/artifacts/
      - uses: dawidd6/action-download-artifact@v2
        with:
          name: pr_number
          path: ${{ runner.temp }}/artifacts/
      - run: sh cmd.sh  # workspace cmd.sh is untouched
```

**References:**
- [Preventing pwn requests](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)

---

## 5. Environment Variable Injection

| | |
|---|---|
| **ID** | `actions/envvar-injection/critical` |
| **Severity** | 9.0 |
| **CWE** | CWE-077, CWE-020 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Writing untrusted data to `$GITHUB_ENV` allows attackers to inject additional environment variables via newlines or heredoc delimiters. Injecting `LD_PRELOAD`, `BASH_ENV`, etc. leads to arbitrary code execution.

**Recommendation:**
1. Don't assign untrusted data to environment variables.
2. Strip newlines for single-line vars: `echo "BODY=$(echo "$BODY" | tr -d '\n')" >> "$GITHUB_ENV"`
3. Use unique delimiters (UUID) for multi-line vars.

### Incorrect Usage

```yaml
steps:
  - name: Set the value
    env:
      BODY: ${{ github.event.comment.body }}
    run: |
      REPLACED=$(echo "$BODY" | sed 's/FOO/BAR/g')
      echo "MYVAR=$REPLACED" >> "$GITHUB_ENV"
```

An attacker can write a comment like `FOO\nNEW_ENV_VAR=MALICIOUS_VALUE`.

### Correct Usage (UUID delimiter)

```yaml
steps:
  - name: Set the value in bash
    run: |
      UUID=$(uuidgen)
      {
        echo "JSON_RESPONSE<<EOF$UUID"
        curl https://example.com
        echo "EOF$UUID"
      } >> "$GITHUB_ENV"
```

**References:**
- [Workflow commands for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions)
- [Synacktiv: GitHub Actions Exploitation](https://www.synacktiv.com/publications/github-actions-exploitation-repo-jacking-and-environment-manipulation)

---

## 6. PATH Environment Variable Injection

| | |
|---|---|
| **ID** | `actions/envpath-injection/critical` |
| **Severity** | 9.0 |
| **CWE** | CWE-077, CWE-020 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Writing attacker-controlled data to `$GITHUB_PATH` lets them prepend directories to PATH, hijacking commands in subsequent steps.

**Recommendation:** Never use untrusted data sources to define the system PATH.

### Incorrect Usage

```yaml
steps:
  - name: Set the path
    env:
      BODY: ${{ github.event.comment.body }}
    run: |
      PATH=$(echo "$BODY" | grep -oP 'system path: \K\S+')
      echo "$PATH" >> "$GITHUB_PATH"
```

**References:**
- [Workflow commands for GitHub Actions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions)

---

## 7. If Expression Always True

| | |
|---|---|
| **ID** | `actions/if-expression-always-true/critical` |
| **Severity** | 9.0 |
| **CWE** | CWE-275 |
| **Query Suite** | security-and-quality |

**Overview:** Extra characters, spaces, or YAML block scalars (`|`, `>`, `|+`, `>+`) around `${{ }}` in `if:` conditions cause them to always evaluate to `true`, bypassing security gates.

### Incorrect Usage

```yaml
# Mixing expression with un-delimited expression
if: ${{ steps.checks.outputs.safe_to_run }} == true

# Trailing newlines / block scalars
if: |
  ${{ steps.checks.outputs.safe_to_run == true }}
if: >
  ${{ steps.checks.outputs.safe_to_run == true }}
if: " ${{ steps.checks.outputs.safe_to_run == true }}"
```

### Correct Usage

```yaml
# Omit ${{ }} entirely (recommended)
if: steps.checks.outputs.safe_to_run == true

# Or use |- (strip trailing newline)
if: |-
    ${{ steps.checks.outputs.safe_to_run == true }}

# Or inline with proper delimiters
if: ${{ steps.checks.outputs.safe_to_run == true }}
```

**References:**
- [actions/runner#1173 - Expression Always True](https://github.com/actions/runner/issues/1173)

---

## 8. Improper Access Control

| | |
|---|---|
| **ID** | `actions/improper-access-control` |
| **Severity** | 9.3 |
| **CWE** | CWE-285 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Using labels to gate PR workflows is vulnerable when (1) the workflow triggers on `synchronize` (attacker can push after label is set) and (2) checkout uses a mutable branch ref.

### Incorrect Usage

```yaml
on:
  pull_request_target:
    types: [opened, synchronize]  # triggers on every push!
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        if: contains(github.event.pull_request.labels.*.name, 'safe to test')
        with:
          ref: ${{ github.event.pull_request.head.ref }}  # mutable ref
      - run: ./cmd
```

### Correct Usage

```yaml
on:
  pull_request_target:
    types: [labeled]  # only triggers when label is applied
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        if: contains(github.event.pull_request.labels.*.name, 'safe to test')
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # immutable SHA
      - run: ./cmd
```

**References:**
- [Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request_target)

---

## 9. Unmasked Secret Exposure

| | |
|---|---|
| **ID** | `actions/unmasked-secret-exposure` |
| **Severity** | 9.0 |
| **CWE** | CWE-312 |
| **Query Suite** | default, security-extended, security-and-quality |

**Overview:** Secrets derived from other secrets (e.g., `fromJson(secrets.X).field`) are not automatically masked by the runner, and will appear in plain text in logs.

### Incorrect Usage

```yaml
- env:
    username: ${{ fromJson(secrets.AZURE_CREDENTIALS).clientId }}
    password: ${{ fromJson(secrets.AZURE_CREDENTIALS).clientSecret }}
  run: |
    echo "$username"
    echo "$password"
```

### Correct Usage

Store each value as a separate, named secret:

```yaml
- env:
    username: ${{ secrets.AZURE_CREDENTIALS_CLIENT_ID }}
    password: ${{ secrets.AZURE_CREDENTIALS_CLIENT_SECRET }}
  run: |
    echo "$username"
    echo "$password"
```

**References:**
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
