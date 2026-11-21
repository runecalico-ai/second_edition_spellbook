---
name: powershell-scripts
description: Use when writing, reviewing, or refactoring powershell or pwsh .ps1 scripts or .psm1 modules. Also triggers on ParameterBindingException errors, ShouldProcess/WhatIf questions, pipeline-processing problems, PSScriptAnalyzer violations, or converting alias-heavy scripts to approved cmdlet names.
---

# PowerShell Scripts

## Overview

Advanced PowerShell functions behave differently from simple scripts: `[CmdletBinding()]` unlocks common parameters (`-Verbose`, `-ErrorAction`, `-Debug`), and `SupportsShouldProcess` further adds `-WhatIf` and `-Confirm`. The `process {}` block runs once per pipeline object; always emit objects—not formatted text—to remain pipeline-composable.

## When to Use

- Writing or refactoring `.ps1` scripts or `.psm1` modules
- Implementing pipeline-enabled cmdlets or functions
- Adding `SupportsShouldProcess` / `-WhatIf` confirmation to state-changing functions
- Designing parameters with validation attributes and tab completion
- Troubleshooting `ParameterBindingException`, pipeline breakage, or `pwsh` compatibility
- Running PSScriptAnalyzer to enforce style and correctness rules
- Converting aliases to full cmdlet names (`gci` → `Get-ChildItem`)

### When NOT to Use

- Quick ad-hoc one-liners where formality adds no value
- Python, Bash, or other shell scripts (use the relevant skill)
- Pester test authoring (use the **powershell-pesterv5** skill)

## Core Pattern

**Before — procedural, no pipeline support, aliases, wrong output stream:**

```powershell
function removeItem($name) {
    if ($name) {
        rm $name
        write-host "Removed $name"
    }
}
```

**After — idiomatic advanced function with pipeline, ShouldProcess, and structured error handling:**

```powershell
function Remove-CacheEntry {
    <#
    .SYNOPSIS
        Removes a named cache entry.
    .DESCRIPTION
        Removes a named entry from the local temporary cache directory.
        Supports pipeline input and -WhatIf for safe execution.
    .PARAMETER Name
        The cache key to remove. Must match '^[\w\-]+$'.
    .PARAMETER PassThru
        Returns the removed key name on success.
    .EXAMPLE
        Remove-CacheEntry -Name 'session-42' -WhatIf
        Shows what would be removed without making changes.
    .EXAMPLE
        'key1','key2' | Remove-CacheEntry -Verbose
        Removes two cache entries with verbose output.
    .OUTPUTS
        None by default. System.String (key name) when using -PassThru.
    .NOTES
        Uses Remove-Item -ErrorAction Stop internally; errors are caught and re-emitted as
        non-terminating via WriteError so remaining pipeline items continue to process.
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[\w\-]+$')]  # restrict to safe characters for path construction
        [string]$Name,

        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose "Starting Remove-CacheEntry"
    }

    process {
        if (-not $PSCmdlet.ShouldProcess($Name, 'Remove cache entry')) { return }
        try {
            Remove-Item -Path (Join-Path (Join-Path ([System.IO.Path]::GetTempPath()) 'cache') $Name) -ErrorAction Stop
            Write-Verbose "Removed cache entry '$Name'"
            if ($PassThru) { Write-Output $Name }
        } catch {
            $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                $_.Exception,
                'RemoveCacheEntryFailed',
                # Choose the category that best describes the failure; full list in references/guidelines.md
                [System.Management.Automation.ErrorCategory]::InvalidOperation,
                $Name
            )
            $PSCmdlet.WriteError($errorRecord)
        }
    }

    end {
        Write-Verbose "Remove-CacheEntry complete"
    }
}
```

## Quick Reference

| Goal | Pattern |
|------|---------|
| Unlock `-Verbose`, `-ErrorAction`, `-Debug` | `[CmdletBinding()]` |
| Pipeline input | `[Parameter(ValueFromPipeline)]` + `process {}` block |
| `-WhatIf` / `-Confirm` support | `[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]` + `$PSCmdlet.ShouldProcess(...)` |
| Tab-completion for values | `[ValidateSet('Dev','Test','Prod')]` |
| Non-terminating error | `$PSCmdlet.WriteError($errorRecord)` |
| Terminating error | `$PSCmdlet.ThrowTerminatingError($errorRecord)` |
| Return data to pipeline | `Write-Output $obj` (never `Write-Host` for data) |
| Declare output contract | `[OutputType([pscustomobject])]` on the function or script |
| Split mutually exclusive inputs | `[Parameter(ParameterSetName = 'ByName')]` on each relevant parameter |

## Implementation

Full patterns, `OutputType` and `ParameterSetName` guidance, the complete `ErrorCategory` enum reference, comment-based help templates, and output formatting rules are documented in [references/guidelines.md](references/guidelines.md).

**Tools:**

- **RECOMMENDED** [scripts/generate_function.ps1](scripts/generate_function.ps1) — scaffolds a new function with best-practice structure; run `Get-Help .\generate_function.ps1 -Full`
- **RECOMMENDED** [scripts/validate_script.ps1](scripts/validate_script.ps1) — PSScriptAnalyzer analysis with actionable feedback; run `Get-Help .\validate_script.ps1 -Full`

## Common Mistakes

| ❌ Mistake | ✅ Fix |
|-----------|--------|
| `if ($Force -or $PSCmdlet.ShouldProcess(...))` — bypasses `-WhatIf` when `$Force` is set | Remove `-Force`; callers who need to skip prompts should pass `-Confirm:$false` at the call site. If `-Force` has overwrite/skip semantics, call `$PSCmdlet.ShouldProcess(...)` unconditionally first (for `-WhatIf`), then nest `if (-not ($Force -or $PSCmdlet.ShouldContinue($query, $caption))) { return }` inside that block |
| `Write-Warning "Item removed"` as a success message | `Write-Verbose "Item removed"` — warnings are for unexpected conditions, not confirmations |
| `process {}` block in a function that does not accept pipeline input | Omit `begin/process/end`; use a plain function body unless `ValueFromPipeline` or `ValueFromPipelineByPropertyName` is declared |
| `[ErrorCategory]::NotSpecified` | Use a meaningful category (`InvalidOperation`, `ObjectNotFound`, `PermissionDenied`, etc.) — see guidelines.md for the full list |
| Assuming `ConfirmImpact = 'Low'` when the attribute is omitted | Default when omitted is `'Medium'`; set explicitly when High or Low is intended |
| Aliases in scripts (`gci`, `ls`, `dir`, `where`, `select`, `%`, `?`, and `foreach` in pipeline form) | Full cmdlet names: `Get-ChildItem`, `Where-Object`, `ForEach-Object`, `Select-Object`. The `foreach ($x in $y)` keyword form is fine; avoid only the pipeline alias form `| foreach { ... }` |
| `Write-Host` for data output | `Write-Output` — `Write-Host` writes to the information stream, bypassing the pipeline |
