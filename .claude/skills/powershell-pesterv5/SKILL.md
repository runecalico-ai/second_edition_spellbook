---
name: powershell-pesterv5
description: Use when writing, reviewing, or debugging PowerShell unit tests with Pester v5 — including flaky/failing tests, mock setup, parameterized tests, and CI configuration with New-PesterConfiguration.
---

# PowerShell Pester v5

## When to Use This Skill

- Writing new Pester test files
- Debugging failing or flaky tests
- Setting up mocks and verifying invocations
- Parameterizing tests with `-ForEach` or `-TestCases`
- Configuring Pester runs with `New-PesterConfiguration`
- Reviewing existing test structure and quality
- Adding code coverage reporting

## Installation & Setup

```powershell
# Install/update Pester v5
# -Scope CurrentUser avoids needing elevation (Windows ships with Pester 3.4 built-in)
Install-Module Pester -Force -SkipPublisherCheck -Scope CurrentUser
Import-Module Pester -PassThru  # verify version shows 5.x — if 3.x, the built-in is loading
```

> **Windows gotcha:** Windows ships with Pester 3.4 in `$env:windir`. Without `-Scope CurrentUser`, the install may fail silently for non-admins, leaving the old version active. Always verify with `Import-Module Pester -PassThru`.

## Core Principles

- **One test, one behavior** — each `It` block validates a single expectation
- **Arrange-Act-Assert (AAA)** — three clear phases inside every `It`
- **ALL code inside Pester blocks** — never at file scope or bare in `Describe`/`Context`
- **Use `$PSScriptRoot`** for relative paths when dot-sourcing files
- **Independent tests** — no shared mutable state, no order dependencies
- **Use full cmdlet names** — no aliases in test code

## Test File Structure

```powershell
# MyFunction.Tests.ps1
BeforeAll {
    # Dot-source the function under test
    . "$PSScriptRoot/../src/MyFunction.ps1"
}

Describe 'MyFunction' -Tag 'CI' {

    Context 'When called with valid input' {

        BeforeEach {
            # Per-test setup — use $script: prefix to share across It blocks
            $script:TestInput = 'hello'
        }

        It 'Returns uppercased output' {
            # Act  ($script:TestInput set by BeforeEach)
            $result = MyFunction -Value $script:TestInput

            # Assert
            $result | Should -Be 'HELLO'
        }
    }

    Context 'When called with invalid input' {

        It 'Throws for null input' {
            { MyFunction -Value $null } | Should -Throw -ExpectedMessage '*cannot be null*'
        }
    }
}
```

**File naming:** `<FunctionName>.Tests.ps1` — Pester discovers `*.Tests.ps1` automatically.

## Block Reference

| Block | Runs | Use For |
|-------|------|---------|
| `BeforeDiscovery` | Discovery phase | Compute data for `Describe`/`Context -ForEach` (must run at discovery time) |
| `BeforeAll` | Once per `Describe`/`Context` | Import modules, create shared test data |
| `BeforeEach` | Before each `It` | Per-test isolation (each `It` gets fresh state) |
| `AfterEach` | After each `It` | Per-test cleanup (runs even if test fails) |
| `AfterAll` | Once at end of block | Resource teardown, disconnect sessions |
| `Describe` | Discovery | Top-level grouping — typically the function name |
| `Context` | Discovery | Sub-grouping by scenario or condition |
| `It` | Run | Single test case with assertions |

**Variable scoping:** Variables created in `BeforeAll` are accessible (read) in child `It` and `BeforeEach` blocks. Use `$script:` scope to mutate them.

## Assertions (Should)

All operators support `-Not` for negation and `-Because 'reason'` for custom messages.

```powershell
$result | Should -Be 'expected'                              # equality (case-insensitive)
$result | Should -BeExactly 'Expected'                       # case-sensitive
$list   | Should -Contain 'item'
$list   | Should -HaveCount 3
$str    | Should -Match 'regex\d+'                           # regex (case-insensitive)
$str    | Should -BeLike '*wildcard*'
$num    | Should -BeGreaterThan 5
$val    | Should -BeNullOrEmpty
$obj    | Should -BeOfType [System.IO.FileInfo]
'C:\f'  | Should -Exist

{ Invoke-Risky } | Should -Throw -ExpectedMessage '*denied*' # wraps call in scriptblock
{ Invoke-Risky } | Should -Throw -ExceptionType ([System.IO.IOException])

$result | Should -Be 42 -Because 'the answer is always 42'
```

See [resources/assertions-reference.md](resources/assertions-reference.md) for all operators.

## Mocking

```powershell
Describe 'Invoke-Deploy' {

    BeforeAll {
        . "$PSScriptRoot/../src/Invoke-Deploy.ps1"
    }

    Context 'Successful deployment' {

        BeforeEach {
            # Replace real command with mock
            Mock Invoke-WebRequest { return [PSCustomObject]@{ StatusCode = 200 } }
            Mock Write-Log {}
        }

        It 'Calls Invoke-WebRequest once' {
            Invoke-Deploy -Url 'https://example.com'

            Should -Invoke Invoke-WebRequest -Times 1 -Exactly
        }

        It 'Logs success message' {
            Invoke-Deploy -Url 'https://example.com'

            Should -Invoke Write-Log -ParameterFilter { $Message -like '*success*' }
        }
    }

    Context 'Failed deployment' {

        BeforeEach {
            Mock Invoke-WebRequest { throw 'Connection refused' }
        }

        It 'Throws when web request fails' {
            { Invoke-Deploy -Url 'https://example.com' } | Should -Throw -ExpectedMessage '*Connection refused*'
        }
    }
}
```

**Mock scoping (v5):** Mocks are scoped to the block they are defined in. A mock in `BeforeAll` applies to all `It` blocks in that `Describe`/`Context`. A mock in `BeforeEach` is re-registered for each `It` (that `It` gets its own scope). A mock in `It` applies only to that `It`.

**Conditional mocks:**
```powershell
Mock Get-Item { return 'found' } -ParameterFilter { $Path -eq 'C:\exists.txt' }
Mock Get-Item { return $null }   # fallback for all other calls
```

**Verifiable mocks:**
```powershell
Mock Send-Email {} -Verifiable
# ... run code ...
Should -InvokeVerifiable  # fails if Send-Email was never called
```

## Parameterized Tests

```powershell
Describe 'ConvertTo-UpperCase' {

    It 'Converts <Input> to <Expected>' -ForEach @(
        @{ Input = 'hello';   Expected = 'HELLO' }
        @{ Input = 'World';   Expected = 'WORLD' }
        @{ Input = '';        Expected = '' }
    ) {
        ConvertTo-UpperCase -Value $Input | Should -Be $Expected
    }
}
```

`-ForEach` generates one `It` per hashtable entry. Test names auto-expand `<Variable>` tokens.

**`Describe`/`Context -ForEach`** generates multiple blocks from an array — useful for testing the same behavior across multiple inputs or files. Data must exist at Discovery time; use `BeforeDiscovery` to compute it:

```powershell
BeforeDiscovery {
    $Environments = @('dev', 'staging', 'prod')
}

Describe 'Get-Config for <_>' -ForEach $Environments -Tag 'CI' {

    It 'Returns non-null config' {
        Get-Config -Environment $_ | Should -Not -BeNullOrEmpty
    }
}
```

## Running Tests

```powershell
# Run all tests in a directory
Invoke-Pester -Path ./tests -Output Detailed

# Run specific file
Invoke-Pester -Path ./tests/MyFunction.Tests.ps1

# Filter by tag
Invoke-Pester -Path ./tests -Tag 'CI'

# With configuration object (recommended for CI/scripting)
$config = New-PesterConfiguration
$config.Run.Path     = './tests'
$config.Output.Verbosity = 'Detailed'
$config.Filter.Tag   = @('CI')
$config.TestResult.Enabled = $true
$config.TestResult.OutputFormat = 'JUnitXml'   # JUnit is natively parsed by GitHub Actions
$config.TestResult.OutputPath   = './test-results.xml'
Invoke-Pester -Configuration $config
```

See [scripts/Run-Tests.ps1](scripts/Run-Tests.ps1) for a reusable runner script.

## Tagging Strategy

Apply tags to `Describe` blocks for selective execution:

| Tag | Purpose |
|-----|---------|
| `CI` | Fast unit tests (<1s each), run on every commit |
| `Feature` | Feature-level tests with broader scope |
| `Scenario` | Integration/E2E tests, run less frequently |
| `RequireAdminOnWindows` | Needs elevation on Windows |
| `RequireSudoOnUnix` | Needs sudo on Unix/Linux |

```powershell
Describe 'Get-Config' -Tag 'CI' { ... }
Describe 'Connect-Database' -Tag 'Feature', 'RequireAdminOnWindows' { ... }
```

## TestDrive for File Tests

```powershell
Describe 'Write-Report' {

    It 'Creates report file' {
        $path = "$TestDrive/report.txt"

        Write-Report -OutputPath $path

        $path | Should -Exist
        $path | Should -FileContentMatch 'Summary'
    }
}
```

`TestDrive:` is an isolated temp path scoped to `Describe`/`Context` blocks. Files are removed when the block they were created in **exits** — not per-`It`. Files created in a parent `Describe` persist through all nested `It` and `Context` blocks. Files created inside a `Context` are removed when that `Context` exits. Parent-block modifications are not reversed.

## Skipping Tests

```powershell
It 'Windows-only test' -Skip:($IsLinux -or $IsMacOS) {
    # ...
}

# Skip entire block conditionally
BeforeAll {
    $PSDefaultParameterValues['It:Skip'] = $IsLinux
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Code at file/Describe scope (runs during Discovery) | Move all logic into `BeforeAll`, `BeforeEach`, or `It` |
| `Should` outside `It` block | Always assert inside `It` |
| Multiple unrelated assertions in one `It` | Split into separate `It` blocks |
| Hard-coded absolute paths | Use `$PSScriptRoot` and `TestDrive:` |
| Mocking wrong scope | Place mock in `BeforeAll` (block-wide) or `BeforeEach` (per-test) |
| Expecting specific error text without `-ExpectedMessage` | Use `Should -Throw -ExpectedMessage '*partial*'` — uses wildcard (`-like`) matching, not regex |
| Not using `$script:` to mutate `BeforeAll` vars | Use `$script:VarName` for writable shared state |
| Aliases in test code (`gci`, `?`, `%`) | Use full names: `Get-ChildItem`, `Where-Object`, `ForEach-Object` |

## Troubleshooting

**Test discovered but not running:** Code at file scope (outside blocks) runs in Discovery and fails silently. Move all code into Pester blocks.

**"The term 'MyFunction' is not recognized" in every test:** The dot-source in `BeforeAll` is failing silently. Double-check the `$PSScriptRoot`-relative path. Add `Write-Host (Resolve-Path "$PSScriptRoot/…")` temporarily to see what path is being resolved.

**Mock not taking effect:** Check mock scope — a mock in `It` only applies to that `It`. Move to `BeforeEach` or `BeforeAll`.

**Tests pass alone but fail together:** Likely a shared state or mock scope issue. Check: (1) a mock from a previous test is leaking — move it to `BeforeEach` so it resets; (2) a `$script:` variable is being mutated and not reset — use `BeforeEach` to reinitialize it; (3) `Should -Invoke` counts are accumulating across tests — add `-Scope It` to count only the current test's calls.

**Variable is `$null` in `It` after `BeforeAll`:** Variables from `BeforeAll` are accessible but you cannot reassign them. Use `$script:` scope prefix.

**"Command not found" inside mock ParameterFilter:** In `-ParameterFilter`, bound parameters are directly in scope as variables (`$Path`, `$Message`, etc.) — reference them directly, no `$PSBoundParameters` needed. `$PesterBoundParameters` (v5.2+) is for use inside the mock's **body scriptblock**, not the filter.

**PowerShell class mocking fails:** Classes don't support Pester mocking. Run tests in a fresh job: `Start-Job { Invoke-Pester ... } | Receive-Job -Wait`.

**Line ending mismatches in string assertions:** Normalize before comparing:
```powershell
$result -replace "`r`n", "`n" | Should -Be ($expected -replace "`r`n", "`n")
```

## Supporting Files

| Path | Contents |
|------|----------|
| [resources/assertions-reference.md](resources/assertions-reference.md) | Complete `Should` operator reference |
| [resources/configuration-reference.md](resources/configuration-reference.md) | `New-PesterConfiguration` all sections |
| [examples/Get-Greeting.ps1](examples/Get-Greeting.ps1) | Simple function under test |
| [examples/Get-Greeting.Tests.ps1](examples/Get-Greeting.Tests.ps1) | Basic test patterns |
| [examples/Invoke-FileProcessor.ps1](examples/Invoke-FileProcessor.ps1) | Function with dependencies |
| [examples/Invoke-FileProcessor.Tests.ps1](examples/Invoke-FileProcessor.Tests.ps1) | Mocking + TestDrive patterns |
| [examples/Math.Tests.ps1](examples/Math.Tests.ps1) | Parameterized tests with `-ForEach` and `-TestCases` |
| [examples/Discovery.Tests.ps1](examples/Discovery.Tests.ps1) | `BeforeDiscovery` + `Describe`/`Context -ForEach` |
| [scripts/Run-Tests.ps1](scripts/Run-Tests.ps1) | Reusable test runner |
| [scripts/New-TestFile.ps1](scripts/New-TestFile.ps1) | Scaffold a new test file |
