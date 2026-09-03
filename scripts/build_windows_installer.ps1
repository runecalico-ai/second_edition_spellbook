#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Spellbook Windows NSIS installer via Tauri.

.DESCRIPTION
    Runs `pnpm tauri build --bundles nsis` from apps/desktop and places the
    resulting installer under OutputDirectory.

    Tauri always emits NSIS artifacts under
    src-tauri/target/<profile>/bundle/nsis/. When OutputDirectory differs from
    that path, the installer file(s) are copied to OutputDirectory after a
    successful build.

.PARAMETER OutputDirectory
    Directory that will contain the NSIS installer after the build.
    Defaults to the standard Tauri NSIS bundle path for this repo:
    apps/desktop/src-tauri/target/release/bundle/nsis
    (or .../target/debug/bundle/nsis when -Debug is set).

.PARAMETER Configuration
    Build configuration. Release (default) writes under target/release/bundle/nsis;
    Debug writes under target/debug/bundle/nsis and passes --debug to tauri build.

.PARAMETER SkipInstall
    Skip `pnpm install` before building.

.EXAMPLE
    .\scripts\build_windows_installer.ps1
    Builds a release NSIS installer into the default Tauri bundle directory.

.EXAMPLE
    .\scripts\build_windows_installer.ps1 -OutputDirectory 'C:\dist\spellbook'
    Builds the installer and copies it to C:\dist\spellbook.

.EXAMPLE
    .\scripts\build_windows_installer.ps1 -Configuration Debug -Verbose
    Builds a debug NSIS installer with verbose logging.

.OUTPUTS
    System.IO.FileInfo
    The installer file(s) written to OutputDirectory.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Low')]
[OutputType([System.IO.FileInfo])]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory,

    [Parameter()]
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release',

    [Parameter()]
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
    [CmdletBinding()]
    [OutputType([string])]
    param()

    $scriptsDir = $PSScriptRoot
    if (-not $scriptsDir) {
        $scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    return (Resolve-Path (Join-Path $scriptsDir '..')).Path
}

function New-ErrorRecord {
    [CmdletBinding()]
    [OutputType([System.Management.Automation.ErrorRecord])]
    param(
        [Parameter(Mandatory)]
        [System.Exception]$Exception,

        [Parameter(Mandatory)]
        [string]$ErrorId,

        [Parameter(Mandatory)]
        [System.Management.Automation.ErrorCategory]$Category,

        [Parameter()]
        [object]$TargetObject
    )

    return [System.Management.Automation.ErrorRecord]::new(
        $Exception,
        $ErrorId,
        $Category,
        $TargetObject
    )
}

$repoRoot = Get-RepoRoot
$desktopDir = Join-Path $repoRoot 'apps\desktop'
$srcTauriDir = Join-Path $desktopDir 'src-tauri'
$isDebugBuild = $Configuration -eq 'Debug'
$profile = if ($isDebugBuild) { 'debug' } else { 'release' }
$tauriNsisDir = Join-Path $srcTauriDir "target\$profile\bundle\nsis"

if (-not $PSBoundParameters.ContainsKey('OutputDirectory') -or [string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = $tauriNsisDir
}

$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)

Write-Verbose "Repository root: $repoRoot"
Write-Verbose "Desktop app directory: $desktopDir"
Write-Verbose "Tauri NSIS output: $tauriNsisDir"
Write-Verbose "Requested OutputDirectory: $OutputDirectory"

if (-not (Test-Path -LiteralPath $desktopDir -PathType Container)) {
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception ([System.IO.DirectoryNotFoundException]::new("Desktop app directory not found: $desktopDir")) `
            -ErrorId 'DesktopDirectoryMissing' `
            -Category ObjectNotFound `
            -TargetObject $desktopDir)
    )
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception ([System.InvalidOperationException]::new('pnpm is not available on PATH. Install pnpm, then retry.')) `
            -ErrorId 'PnpmMissing' `
            -Category NotInstalled `
            -TargetObject 'pnpm')
    )
}

$buildLabel = $Configuration.ToLowerInvariant()
if (-not $PSCmdlet.ShouldProcess($desktopDir, "Build Windows NSIS installer ($buildLabel)")) {
    return
}

Push-Location -LiteralPath $desktopDir
try {
    if (-not $SkipInstall) {
        Write-Verbose 'Running pnpm install --frozen-lockfile'
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm install failed with exit code $LASTEXITCODE"
        }
    }

    $tauriArgs = @('tauri', 'build', '--bundles', 'nsis')
    if ($isDebugBuild) {
        $tauriArgs += '--debug'
    }

    Write-Verbose ("Running: pnpm {0}" -f ($tauriArgs -join ' '))
    & pnpm @tauriArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm tauri build failed with exit code $LASTEXITCODE"
    }
}
catch {
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception $_.Exception `
            -ErrorId 'WindowsInstallerBuildFailed' `
            -Category InvalidOperation `
            -TargetObject $desktopDir)
    )
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $tauriNsisDir -PathType Container)) {
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception ([System.IO.DirectoryNotFoundException]::new("Tauri NSIS output directory was not created: $tauriNsisDir")) `
            -ErrorId 'NsisOutputMissing' `
            -Category ObjectNotFound `
            -TargetObject $tauriNsisDir)
    )
}

$builtInstallers = @(Get-ChildItem -LiteralPath $tauriNsisDir -Filter '*-setup.exe' -File -ErrorAction Stop)
if ($builtInstallers.Count -eq 0) {
    # Fall back to any .exe Tauri may have emitted in the NSIS folder.
    $builtInstallers = @(Get-ChildItem -LiteralPath $tauriNsisDir -Filter '*.exe' -File -ErrorAction Stop)
}

if ($builtInstallers.Count -eq 0) {
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception ([System.IO.FileNotFoundException]::new("No NSIS installer (.exe) found in $tauriNsisDir")) `
            -ErrorId 'InstallerExeMissing' `
            -Category ObjectNotFound `
            -TargetObject $tauriNsisDir)
    )
}

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
    if ($PSCmdlet.ShouldProcess($OutputDirectory, 'Create output directory')) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }
}

$tauriResolved = (Resolve-Path -LiteralPath $tauriNsisDir).Path
$outputResolved = (Resolve-Path -LiteralPath $OutputDirectory).Path
$sameDirectory = [string]::Equals($tauriResolved, $outputResolved, [System.StringComparison]::OrdinalIgnoreCase)

$resultFiles = @()
foreach ($installer in $builtInstallers) {
    if ($sameDirectory) {
        $resultFiles += $installer
        continue
    }

    $destination = Join-Path $OutputDirectory $installer.Name
    if ($PSCmdlet.ShouldProcess($destination, "Copy installer from $($installer.FullName)")) {
        Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
        $resultFiles += Get-Item -LiteralPath $destination
    }
}

Write-Verbose ("Installer(s) available in: {0}" -f $OutputDirectory)
$resultFiles | Write-Output
