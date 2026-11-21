<#
    .SYNOPSIS
        Scaffolds a new Pester v5 test file for a given PowerShell function or script.
    .DESCRIPTION
        Creates a .Tests.ps1 file next to the source file (or in a specified directory)
        with the standard Pester v5 structure pre-populated.
    .PARAMETER SourcePath
        Path to the .ps1 file containing the function(s) to test.
    .PARAMETER OutputDirectory
        Directory to write the test file. Defaults to same directory as SourcePath.
    .PARAMETER FunctionNames
        Names of functions to generate test stubs for. Auto-detected if not specified.
    .EXAMPLE
        # Scaffold tests next to the source file
        .\New-TestFile.ps1 -SourcePath ./src/Get-Config.ps1

    .EXAMPLE
        # Scaffold into a tests/ directory
        .\New-TestFile.ps1 -SourcePath ./src/Get-Config.ps1 -OutputDirectory ./tests

    .EXAMPLE
        # Specify which functions to stub
        .\New-TestFile.ps1 -SourcePath ./src/Utils.ps1 -FunctionNames 'Get-Foo','Set-Bar'
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$SourcePath,

    [string]$OutputDirectory,

    [string[]]$FunctionNames
)

$sourceFile     = Get-Item -Path $SourcePath
$sourceBaseName = $sourceFile.BaseName

# Determine output location
if (-not $OutputDirectory) {
    $OutputDirectory = $sourceFile.Directory.FullName
}

$testFileName = "$sourceBaseName.Tests.ps1"
$testFilePath = Join-Path -Path $OutputDirectory -ChildPath $testFileName

if (Test-Path -Path $testFilePath) {
    Write-Warning "Test file already exists: $testFilePath"
    return
}

# Auto-detect function names if not provided
if (-not $FunctionNames) {
    $FunctionNames = Select-String -Path $SourcePath -Pattern '^function\s+(\S+)' |
        ForEach-Object { $_.Matches.Groups[1].Value } |
        Where-Object { $_ -notmatch '^_' }  # skip private helpers
}

if (-not $FunctionNames) {
    # Fall back to source base name
    $FunctionNames = @($sourceBaseName)
}

# Build test stubs
$stubs = foreach ($fn in $FunctionNames) {
    @"

Describe '$fn' -Tag 'CI' {

    Context 'Happy path' {

        BeforeEach {
            # Per-test setup — use `$script:` prefix to share mutable state across It blocks
            `$script:TestValue = 'value'
        }

        It 'Returns expected result for valid input' {
            # Act  (`$script:TestValue set by BeforeEach)
            `$result = $fn -Parameter `$script:TestValue

            # Assert
            `$result | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Error handling' {

        It 'Throws for invalid input' {
            { $fn -Parameter `$null } | Should -Throw -ExpectedMessage '*'
        }
    }

    Context 'Parameterized' {

        It 'Handles <Input> returning <Expected>' -ForEach @(
            @{ Input = 'a'; Expected = 'expected-a' }
            @{ Input = 'b'; Expected = 'expected-b' }
        ) {
            $fn -Parameter `$Input | Should -Be `$Expected
        }
    }
}
"@
}

# Calculate relative path from test file to source file
$testDir     = [System.IO.Path]::GetFullPath($OutputDirectory)
$sourceFull  = [System.IO.Path]::GetFullPath($SourcePath)
$relativeSource = [System.IO.Path]::GetRelativePath($testDir, $sourceFull) -replace '\\', '/'

$content = @"
#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

BeforeAll {
    . "`$PSScriptRoot/$relativeSource"
}
$($stubs -join "`n")
"@

if ($PSCmdlet.ShouldProcess($testFilePath, 'Create test file')) {
    $content | Set-Content -Path $testFilePath -Force
    Write-Host "Created: $testFilePath" -ForegroundColor Green
    Write-Host "Functions stubbed: $($FunctionNames -join ', ')" -ForegroundColor Cyan
}
