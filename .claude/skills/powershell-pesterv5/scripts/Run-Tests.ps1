<#
    .SYNOPSIS
        Reusable Pester v5 test runner with common configuration options.
    .DESCRIPTION
        Runs Pester tests using New-PesterConfiguration for consistent,
        scriptable execution. Suitable for local dev and CI pipelines.
    .PARAMETER Path
        Directory or file path(s) to run tests from. Defaults to ./tests.
    .PARAMETER Tag
        Only run tests with these tags (e.g. 'CI', 'Feature').
    .PARAMETER ExcludeTag
        Skip tests with these tags.
    .PARAMETER OutputFormat
        Test result XML format: NUnitXml, NUnit3, JUnitXml. Default: JUnitXml (GitHub Actions native).
    .PARAMETER OutputPath
        Where to save the XML test results. Default: ./test-results.xml.
    .PARAMETER CodeCoverage
        When specified, enables code coverage reporting.
    .PARAMETER CoverageSourcePath
        Source file(s)/directories to measure coverage against. Required when -CodeCoverage is used.
        Defaults to ./src. Without this, Pester measures the test files themselves.
    .PARAMETER CoverageOutputPath
        Where to save coverage results. Default: ./coverage.xml.
    .PARAMETER Verbosity
        Output verbosity: None, Normal, Detailed, Diagnostic. Default: Detailed.
    .PARAMETER CI
        Optimizes output for CI environments (Azure DevOps / GitHub Actions).
    .EXAMPLE
        # Run all CI tests
        .\Run-Tests.ps1 -Tag 'CI'

    .EXAMPLE
        # Full run with coverage, JUnit output for GitHub Actions
        .\Run-Tests.ps1 -Path ./src -CodeCoverage -OutputFormat JUnitXml -CI

    .EXAMPLE
        # Quick local run, verbose output, no XML
        .\Run-Tests.ps1 -Verbosity Detailed
#>
[CmdletBinding()]
param(
    [string[]]$Path           = @('./tests'),
    [string[]]$Tag            = @(),
    [string[]]$ExcludeTag     = @(),
    [ValidateSet('NUnitXml', 'NUnit3', 'JUnitXml')]
    [string]$OutputFormat     = 'JUnitXml',
    [string]$OutputPath       = './test-results.xml',
    [switch]$CodeCoverage,
    [string[]]$CoverageSourcePath = @('./src'),
    [string]$CoverageOutputPath = './coverage.xml',
    [ValidateSet('None', 'Normal', 'Detailed', 'Diagnostic')]
    [string]$Verbosity        = 'Detailed',
    [switch]$CI
)

# Verify Pester v5 is available
$pesterModule = Get-Module -Name Pester -ListAvailable | Where-Object { $_.Version.Major -ge 5 } | Select-Object -First 1
if (-not $pesterModule) {
    throw "Pester v5+ is required. Install with: Install-Module Pester -Force"
}
Import-Module $pesterModule -Force

# Build configuration
$config = New-PesterConfiguration

# --- Run ---
$config.Run.Path      = $Path
$config.Run.PassThru  = $true

# --- Filter ---
if ($Tag.Count -gt 0) {
    $config.Filter.Tag = $Tag
}
if ($ExcludeTag.Count -gt 0) {
    $config.Filter.ExcludeTag = $ExcludeTag
}

# --- Output ---
$config.Output.Verbosity = $Verbosity
if ($CI) {
    # Auto-detect CI format: GitHub Actions vs Azure DevOps
    if ($env:GITHUB_ACTIONS -eq 'true') {
        $config.Output.CIFormat = 'GithubActions'
    } elseif ($env:TF_BUILD -eq 'True') {
        $config.Output.CIFormat = 'AzureDevops'
    }
}

# --- Test Results ---
$config.TestResult.Enabled      = $true
$config.TestResult.OutputFormat = $OutputFormat
$config.TestResult.OutputPath   = $OutputPath

# --- Code Coverage ---
if ($CodeCoverage) {
    $config.CodeCoverage.Enabled               = $true
    $config.CodeCoverage.Path                  = $CoverageSourcePath  # source files, not test files
    $config.CodeCoverage.OutputFormat          = 'JaCoCo'
    $config.CodeCoverage.OutputPath            = $CoverageOutputPath
    $config.CodeCoverage.CoveragePercentTarget = 80
    # Note: coverage threshold failures do NOT increment FailedCount.
    # The exit 1 below only fires for test failures. Check $result.CodeCoverage
    # if you need to fail the pipeline on coverage threshold misses.
}

# Run tests
Write-Host "Running Pester tests from: $($Path -join ', ')" -ForegroundColor Cyan
$result = Invoke-Pester -Configuration $config

# Summary
Write-Host ""
Write-Host "Tests: $($result.TotalCount)  Passed: $($result.PassedCount)  Failed: $($result.FailedCount)  Skipped: $($result.SkippedCount)" -ForegroundColor $(
    if ($result.FailedCount -gt 0) { 'Red' } else { 'Green' }
)

if ($config.TestResult.Enabled) {
    Write-Host "Results XML: $OutputPath" -ForegroundColor Gray
}
if ($CodeCoverage) {
    Write-Host "Coverage XML: $CoverageOutputPath" -ForegroundColor Gray
}

# Exit with non-zero code if tests failed (important for CI)
if ($result.FailedCount -gt 0) {
    exit 1
}
