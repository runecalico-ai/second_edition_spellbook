# Pester v5 New-PesterConfiguration — Complete Reference

Use `New-PesterConfiguration` for scripted, repeatable test execution.
Always prefer this over inline `Invoke-Pester` parameters in CI/scripts.

```powershell
$config = New-PesterConfiguration
# ... set properties ...
Invoke-Pester -Configuration $config
```

---

## Run Section — `$config.Run`

Controls test discovery and execution.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Path` | string[] | `'.'` | Test directories or specific `.Tests.ps1` files |
| `ExcludePath` | string[] | `@()` | Paths to exclude from discovery |
| `TestExtension` | string | `'.Tests.ps1'` | File extension filter for test discovery |
| `Exit` | bool | `$false` | Call `exit 1` when tests fail (CI) |
| `Throw` | bool | `$false` | Throw terminating error on test failure |
| `PassThru` | bool | `$false` | Return result object from `Invoke-Pester` |
| `SkipRun` | bool | `$false` | Run discovery only, do not execute tests |
| `SkipRemainingOnFailure` | string | `'None'` | Stop on first failure: `'None'`, `'Block'`, `'Container'`, `'Run'` |

```powershell
$config.Run.Path      = @('./tests', './integration')
$config.Run.PassThru  = $true
$config.Run.Throw     = $true   # useful in CI; raises exception on failure
```

---

## Filter Section — `$config.Filter`

Narrows which tests are executed.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Tag` | string[] | `@()` | Only run tests with these tags |
| `ExcludeTag` | string[] | `@()` | Skip tests with these tags |
| `FullName` | string[] | `@()` | Wildcard filter on full test name |
| `Line` | string[] | `@()` | Filter by `<file>:<line>` (programmatic use) |
| `ExcludeLine` | string[] | `@()` | Exclude tests by `<file>:<line>` |

```powershell
$config.Filter.Tag        = @('CI')
$config.Filter.ExcludeTag = @('Slow', 'RequireAdminOnWindows')
$config.Filter.FullName   = @('*Get-Config*')
```

---

## Output Section — `$config.Output`

Controls console and log output.

| Property | Type | Default | Options |
|----------|------|---------|---------|
| `Verbosity` | string | `'Normal'` | `None`, `Normal`, `Detailed`, `Diagnostic` |
| `StackTraceVerbosity` | string | `'Filtered'` | `None`, `FirstLine`, `Filtered`, `Full` |
| `CIFormat` | string | `'Auto'` | `Auto`, `AzureDevops`, `GithubActions`, `None` |
| `CILogLevel` | string | `'Warning'` | Log level for CI format messages |
| `RenderMode` | string | `'Auto'` | `Auto`, `Ansi`, `ConsoleColor`, `Plaintext` |

```powershell
$config.Output.Verbosity = 'Detailed'
$config.Output.CIFormat  = 'GithubActions'   # set explicitly if auto-detect fails
```

---

## TestResult Section — `$config.TestResult`

Generates XML test result reports for CI integration.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Enabled` | bool | `$false` | Enable test result file generation |
| `OutputFormat` | string | `'NUnitXml'` | `NUnitXml`, `NUnit2.5`, `NUnit3`, `JUnitXml` |
| `OutputPath` | string | `'testResults.xml'` | Output file path |
| `OutputEncoding` | string | `'UTF8'` | File encoding |
| `TestSuiteName` | string | `'Pester'` | Root element name in report |

```powershell
$config.TestResult.Enabled      = $true
$config.TestResult.OutputFormat = 'JUnitXml'        # GitHub Actions native
$config.TestResult.OutputPath   = './results/tests.xml'
```

---

## CodeCoverage Section — `$config.CodeCoverage`

Tracks which lines/branches were exercised by tests.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Enabled` | bool | `$false` | Enable coverage analysis |
| `Path` | string[] | `@()` | Source files/directories to measure |
| `ExcludePath` | string[] | `@()` | Paths to exclude from coverage |
| `ExcludeTests` | bool | `$true` | Exclude `*.Tests.ps1` files from coverage |
| `RecursePaths` | bool | `$true` | Recurse into subdirectories when collecting paths |
| `OutputFormat` | string | `'JaCoCo'` | `JaCoCo`, `CoverageGutters`, `Cobertura` |
| `OutputPath` | string | `'coverage.xml'` | Output file path |
| `OutputEncoding` | string | `'UTF8'` | File encoding |
| `CoveragePercentTarget` | double | `75` | Minimum coverage % (fails run if below) |
| `UseBreakpoints` | bool | `$true` | `$false` = profiler-based tracer (experimental, faster) |
| `SingleHitBreakpoints` | bool | `$true` | Each line counted once — performance optimization |

```powershell
$config.CodeCoverage.Enabled               = $true
$config.CodeCoverage.Path                  = @('./src')
$config.CodeCoverage.OutputFormat          = 'JaCoCo'
$config.CodeCoverage.OutputPath            = './coverage/coverage.xml'
$config.CodeCoverage.CoveragePercentTarget = 80
```

---

## Should Section — `$config.Should`

Controls assertion behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ErrorAction` | string | `'Stop'` | `Stop` halts on first failure; `Continue` accumulates failures |

```powershell
$config.Should.ErrorAction = 'Continue'   # collect all assertion failures per test
```

---

## TestDrive Section — `$config.TestDrive`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Enabled` | bool | `$true` | Enable `TestDrive:` PSDrive. Cleanup is per-block-exit (Describe/Context), not per-It. |

---

## TestRegistry Section — `$config.TestRegistry`

Windows only. Provides an isolated registry hive per test (analogous to `TestDrive:`).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Enabled` | bool | `$true` | Enable `TestRegistry:` PSDrive for isolated registry per test |

---

## Debug Section — `$config.Debug`

Advanced diagnostics. Rarely needed outside of troubleshooting Pester itself.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ShowFullErrors` | bool | `$false` | Show full error records (not just message) |
| `WriteDebugMessages` | bool | `$false` | Enable Pester internal debug messages |
| `WriteDebugMessagesFrom` | string[] | `@('*')` | Filter debug message sources |
| `ShowNavigationMarkers` | bool | `$false` | Output markers useful for editor navigation |
| `ReturnRawResultObject` | bool | `$false` | Return the raw result without processing |

---

## Full CI Pipeline Example

```powershell
$config = New-PesterConfiguration

$config.Run.Path      = './tests'
$config.Run.PassThru  = $true

$config.Filter.Tag    = @('CI', 'Feature')

$config.Output.Verbosity = 'Detailed'
$config.Output.CIFormat  = 'GithubActions'

$config.TestResult.Enabled      = $true
$config.TestResult.OutputFormat = 'JUnitXml'
$config.TestResult.OutputPath   = './results/test-results.xml'

$config.CodeCoverage.Enabled               = $true
$config.CodeCoverage.Path                  = @('./src')
$config.CodeCoverage.OutputPath            = './results/coverage.xml'
$config.CodeCoverage.CoveragePercentTarget = 80

$result = Invoke-Pester -Configuration $config

if ($result.FailedCount -gt 0) { exit 1 }
```
