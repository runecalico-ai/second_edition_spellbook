#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates PowerShell script quality and best practices compliance

.DESCRIPTION
    Analyzes PowerShell scripts for common issues, anti-patterns, and style violations.
    Uses PSScriptAnalyzer if available, otherwise performs basic validation.

.PARAMETER Path
    Path to the PowerShell script file to validate

.PARAMETER Severity
    One or more severity levels to include in the report. Valid values: Error, Warning,
    Information, ParseError. Can be combined: -Severity Error, Warning. Defaults to all levels.
    Note: Results matching any specified severity level are included (OR logic).
    In basic mode, only Warning records are emitted regardless of this parameter.

.EXAMPLE
    .\validate_script.ps1 -Path .\MyScript.ps1

.EXAMPLE
    .\validate_script.ps1 -Path .\MyScript.ps1 -Severity Error
    Reports only Error-severity violations (does not include Warnings)

.EXAMPLE
    Get-ChildItem -Filter '*.ps1' | .\validate_script.ps1
    Validate all scripts in a directory by piping file paths

.OUTPUTS
    Validation results with issues found

.NOTES
    Install PSScriptAnalyzer for comprehensive analysis:
    Install-Module -Name PSScriptAnalyzer -Scope CurrentUser
#>
[CmdletBinding()]
[OutputType('Microsoft.Windows.PowerShell.ScriptAnalyzer.Generic.DiagnosticRecord')]  # when PSScriptAnalyzer is installed
[OutputType([PSCustomObject])]                                                         # basic validation fallback
param(
    [Parameter(Mandatory, ValueFromPipeline)]
    [ValidateScript({
        if (Test-Path -Path $_ -PathType Leaf) { $true }
        else { throw "File not found or is not a file: '$_'" }
    })]
    [string]$Path,

    [Parameter()]
    [ValidateSet('Error', 'Warning', 'Information', 'ParseError')]
    [string[]]$Severity = @('Error', 'Warning', 'Information', 'ParseError')
)

begin {
    Write-Verbose "Starting PowerShell script validation"
    $severityExplicitlyBound = $PSBoundParameters.ContainsKey('Severity')

    # Check if PSScriptAnalyzer is available
    $hasPSScriptAnalyzer = $null -ne (Get-Module -ListAvailable -Name PSScriptAnalyzer)
    if ($hasPSScriptAnalyzer) {
        Import-Module -Name PSScriptAnalyzer -ErrorAction Stop
    } else {
        Write-Warning "PSScriptAnalyzer not found. Performing basic validation only."
        Write-Warning "Install with: Install-Module -Name PSScriptAnalyzer -Scope CurrentUser"
        Write-Warning "Basic mode strips full-line # comments only; block comments (<# ... #>) and inline comments are retained and may cause false positives."
        if ($severityExplicitlyBound) {
            Write-Warning "Basic validation emits Warning records only; the requested -Severity filter cannot be fully honored without PSScriptAnalyzer."
        }
    }
}

process {
    $resolvedPath = Resolve-Path -Path $Path
    Write-Verbose "Validating script: $resolvedPath"

    if ($hasPSScriptAnalyzer) {
        Write-Verbose "Using PSScriptAnalyzer for comprehensive analysis"
        $results = Invoke-ScriptAnalyzer -Path $resolvedPath -Severity $Severity

        if ($results) {
            Write-Verbose "Found $($results.Count) issue(s) in $resolvedPath"
            Write-Output $results
        } else {
            Write-Verbose "No issues found in $resolvedPath"
        }
    } else {
        # Basic validation (PSScriptAnalyzer not available)
        $issues = @()
        $content = Get-Content -Path $resolvedPath -Raw

        # Strip comment-only lines once; use for all checks to avoid false positives
        # from scripts that document anti-patterns in comments (e.g., # avoid gci)
        $contentNoComments = ($content -split '\r?\n') -notmatch '^\s*#' -join "`n"

        # Check for common aliases — run on comment-stripped content
        # Word-character aliases - use word boundaries with negative lookahead for full cmdlet names
        $wordAliases = @(
            @{ Pattern = '(?<!\$)\bgci\b'; Name = 'gci' },
            @{ Pattern = '(?<!\$)\bls\b'; Name = 'ls' },
            @{ Pattern = '(?<!\$)\bdir\b'; Name = 'dir' },
            @{ Pattern = '(?<!\$)\bwhere\b(?!-Object)'; Name = 'where' },
            @{ Pattern = '(?<!\$)(?<!-)\bforeach\b(?!-Object|\s*\()'; Name = 'foreach' },
            @{ Pattern = '(?<!\$)(?<!\.)\bselect\b(?!-\w)'; Name = 'select' },
            @{ Pattern = '(?<!\$)\brm\b'; Name = 'rm' }
        )
        foreach ($aliasInfo in $wordAliases) {
            if ($contentNoComments -match $aliasInfo.Pattern) {
                $issues += "Found alias: $($aliasInfo.Name) (use full cmdlet name)"
            }
        }

        # Symbol aliases - only detect pipeline-context uses to avoid false positives
        # '%' as alias always appears after a pipe: '| %' or '|%'
        # '?' as alias always appears after a pipe: '| ?' or '|?'
        if ($contentNoComments -match '\|\s*%(\s|\{)') {
            $issues += "Found alias: % in pipeline context (use ForEach-Object)"
        }
        if ($contentNoComments -match '\|\s*\?(\s|\{)') {
            $issues += "Found alias: ? in pipeline context (use Where-Object)"
        }

        # Check for Write-Host usage (should not be used for data output)
        if ($contentNoComments -match '\bWrite-Host\b') {
            $issues += 'PSAvoidUsingWriteHost: Write-Host writes directly to the console, bypassing the pipeline — use Write-Output for data, Write-Verbose for operational status, Write-Warning for unexpected conditions'
        }

        if ($issues) {
            Write-Verbose "Found $($issues.Count) issue(s) in basic validation:"
            $issueObjects = $issues | ForEach-Object {
                [PSCustomObject]@{
                    Severity = 'Warning'
                    Line     = 0
                    RuleName = 'BasicValidation'
                    Message  = $_
                }
            }
            $filteredIssueObjects = $issueObjects | Where-Object { $_.Severity -in $Severity }
            if ($filteredIssueObjects) {
                Write-Output $filteredIssueObjects
            } else {
                Write-Verbose "Basic validation found issues, but none matched the requested severity filter."
            }
        } else {
            Write-Verbose "Basic validation passed"
        }
    }
}

end {
    Write-Verbose "Validation completed"
}
