#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the Spellbook Windows NSIS installer via Tauri.

.DESCRIPTION
    Runs `pnpm exec tauri build --bundles nsis` from apps/desktop and places the
    resulting installer under OutputDirectory.

    Tauri normally emits NSIS artifacts under
    <cargo-target-dir>/<profile>/bundle/nsis/. This repo sets
    target-dir = "../../../target" in apps/desktop/src-tauri/.cargo/config.toml,
    so the default path is target/release/bundle/nsis at the repository root.
    When that subfolder is missing, the script searches the rest of
    <cargo-target-dir>/<profile>/bundle/ for installer executables.
    When OutputDirectory differs from the discovered source path, installer file(s)
    are copied there after a successful build.

.PARAMETER OutputDirectory
    Directory that will contain the NSIS installer after the build.
    Defaults to the Cargo target directory for this repo:
    target/release/bundle/nsis at the repository root
    (or target/debug/bundle/nsis when Configuration is Debug).
    The directory is created if it does not exist.

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

function Ensure-Directory {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if (Test-Path -LiteralPath $resolved -PathType Container) {
        return $resolved
    }

    if ($PSCmdlet.ShouldProcess($resolved, 'Create directory')) {
        New-Item -ItemType Directory -Path $resolved -Force | Out-Null
    }

    return $resolved
}

function Get-CargoTargetDir {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [Parameter(Mandatory)]
        [string]$SrcTauriDir
    )

    $cargoConfig = Join-Path $SrcTauriDir '.cargo\config.toml'
    if (-not (Test-Path -LiteralPath $cargoConfig -PathType Leaf)) {
        return (Join-Path $SrcTauriDir 'target')
    }

    $configContent = Get-Content -LiteralPath $cargoConfig -Raw
    if ($configContent -match 'target-dir\s*=\s*"([^"]+)"') {
        $configuredTarget = $Matches[1]
        return [System.IO.Path]::GetFullPath((Join-Path $SrcTauriDir $configuredTarget))
    }

    return (Join-Path $SrcTauriDir 'target')
}

function Test-UsablePythonInterpreterPath {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if ($Path -like '*\WindowsApps\*') {
        return $false
    }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    $item = Get-Item -LiteralPath $Path
    return ($item.Length -gt 0)
}

function Get-PythonForReleaseBuild {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot
    )

    $venvPython = Join-Path $RepoRoot '.venv\Scripts\python.exe'
    $pythonPath = $null

    if (Test-UsablePythonInterpreterPath -Path $venvPython) {
        $pythonPath = $venvPython
        Write-Verbose "Using venv Python: $pythonPath"
    }
    else {
        $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
        if ($pythonCmd -and -not [string]::IsNullOrWhiteSpace($pythonCmd.Source) -and
            (Test-UsablePythonInterpreterPath -Path $pythonCmd.Source)) {
            $pythonPath = $pythonCmd.Source
            Write-Verbose "Using PATH Python: $pythonPath"
        }
    }

    if (-not $pythonPath) {
        throw 'python was not found: .venv\Scripts\python.exe is missing or not a real interpreter, and no usable python is on PATH (Windows Store aliases are ignored).'
    }

    & $pythonPath -c 'import sys; raise SystemExit(0)'
    if ($LASTEXITCODE -ne 0) {
        throw "Python interpreter failed a sanity check (exit code $LASTEXITCODE): $pythonPath"
    }

    return $pythonPath
}

function Get-NsisInstallerFiles {
    [CmdletBinding()]
    [OutputType([System.IO.FileInfo[]])]
    param(
        [Parameter(Mandatory)]
        [string]$BundleRoot,

        [Parameter()]
        [string]$PreferredNsisDir
    )

    if ($PreferredNsisDir -and (Test-Path -LiteralPath $PreferredNsisDir -PathType Container)) {
        $preferredMatches = @(
            Get-ChildItem -LiteralPath $PreferredNsisDir -Filter '*-setup.exe' -File -ErrorAction SilentlyContinue
        )
        if ($preferredMatches.Count -gt 0) {
            return $preferredMatches
        }
    }

    if (-not (Test-Path -LiteralPath $BundleRoot -PathType Container)) {
        return @()
    }

    return @(
        Get-ChildItem -LiteralPath $BundleRoot -Recurse -Filter '*-setup.exe' -File -ErrorAction SilentlyContinue
    )
}

$repoRoot = Get-RepoRoot
$desktopDir = Join-Path $repoRoot 'apps\desktop'
$srcTauriDir = Join-Path $desktopDir 'src-tauri'
$cargoTargetDir = Get-CargoTargetDir -RepoRoot $repoRoot -SrcTauriDir $srcTauriDir
$isDebugBuild = $Configuration -eq 'Debug'
$profile = if ($isDebugBuild) { 'debug' } else { 'release' }
$bundleRoot = Join-Path $cargoTargetDir "$profile\bundle"
$tauriNsisDir = Join-Path $bundleRoot 'nsis'

if (-not $PSBoundParameters.ContainsKey('OutputDirectory') -or [string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = $tauriNsisDir
}

Write-Verbose "Repository root: $repoRoot"
Write-Verbose "Desktop app directory: $desktopDir"
Write-Verbose "Cargo target directory: $cargoTargetDir"
Write-Verbose "Tauri bundle root: $bundleRoot"
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

$OutputDirectory = Ensure-Directory -Path $OutputDirectory

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

    $prepareScript = Join-Path $repoRoot 'scripts\prepare_release_bundle.py'
    if (-not (Test-Path -LiteralPath $prepareScript -PathType Leaf)) {
        throw "prepare_release_bundle.py not found: $prepareScript"
    }
    Write-Verbose "Running: $prepareScript"
    $pythonPath = Get-PythonForReleaseBuild -RepoRoot $repoRoot
    & $pythonPath $prepareScript
    if ($LASTEXITCODE -ne 0) {
        throw "prepare_release_bundle.py failed with exit code $LASTEXITCODE"
    }

    $tauriArgs = @('exec', 'tauri', 'build', '--bundles', 'nsis')
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

$builtInstallers = @(Get-NsisInstallerFiles -BundleRoot $bundleRoot -PreferredNsisDir $tauriNsisDir)
if ($builtInstallers.Count -eq 0) {
    $searchedPaths = @($tauriNsisDir, $bundleRoot) -join '; '
    $PSCmdlet.ThrowTerminatingError(
        (New-ErrorRecord `
            -Exception ([System.IO.FileNotFoundException]::new(
                "No NSIS installer (*-setup.exe) found after build. Searched: $searchedPaths. " +
                'Ensure NSIS is installed and `pnpm exec tauri build --bundles nsis` completed successfully.'
            )) `
            -ErrorId 'InstallerExeMissing' `
            -Category ObjectNotFound `
            -TargetObject $bundleRoot)
    )
}

$outputResolved = Ensure-Directory -Path $OutputDirectory

$resultFiles = @()
foreach ($installer in ($builtInstallers | Sort-Object -Property FullName -Unique)) {
    $installerDir = (Resolve-Path -LiteralPath $installer.DirectoryName).Path
    $sameDirectory = [string]::Equals($installerDir, $outputResolved, [System.StringComparison]::OrdinalIgnoreCase)

    if ($sameDirectory) {
        $resultFiles += $installer
        continue
    }

    $destination = Join-Path $outputResolved $installer.Name
    if ($PSCmdlet.ShouldProcess($destination, "Copy installer from $($installer.FullName)")) {
        Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
        $resultFiles += Get-Item -LiteralPath $destination
    }
}

Write-Verbose ("Installer(s) available in: {0}" -f $outputResolved)
$resultFiles | Write-Output
