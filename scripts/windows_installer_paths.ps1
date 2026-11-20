#Requires -Version 5.1
<#
.SYNOPSIS
    Cargo target and NSIS installer path helpers for the Windows packaging script.
#>
Set-StrictMode -Version Latest

function Get-CargoTargetDir {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [Parameter(Mandatory)]
        [string]$SrcTauriDir
    )

    $envTarget = $env:CARGO_TARGET_DIR
    if (-not [string]::IsNullOrWhiteSpace($envTarget)) {
        return [System.IO.Path]::GetFullPath($envTarget.Trim())
    }

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

function Get-NsisInstallerFiles {
    [CmdletBinding()]
    [OutputType([System.IO.FileInfo[]])]
    param(
        [Parameter(Mandatory)]
        [string]$BundleRoot,

        [Parameter()]
        [string]$PreferredNsisDir,

        [Parameter()]
        [datetime]$MustBeWrittenAfter
    )

    $candidates = @()

    if ($PreferredNsisDir -and (Test-Path -LiteralPath $PreferredNsisDir -PathType Container)) {
        $candidates += @(
            Get-ChildItem -LiteralPath $PreferredNsisDir -Filter '*-setup.exe' -File -ErrorAction SilentlyContinue
        )
    }

    if (Test-Path -LiteralPath $BundleRoot -PathType Container) {
        $candidates += @(
            Get-ChildItem -LiteralPath $BundleRoot -Recurse -Filter '*-setup.exe' -File -ErrorAction SilentlyContinue
        )
    }

    if ($candidates.Count -eq 0) {
        return @()
    }

    $seen = @{}
    $unique = foreach ($item in $candidates) {
        $key = $item.FullName.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $item
        }
    }
    $unique = @($unique)

    $newestTime = ($unique | Measure-Object -Property LastWriteTime -Maximum).Maximum
    $newest = @(
        $unique | Where-Object { $_.LastWriteTime -eq $newestTime }
    )

    if ($PSBoundParameters.ContainsKey('MustBeWrittenAfter')) {
        $freshEnough = @(
            $newest | Where-Object { $_.LastWriteTime -ge $MustBeWrittenAfter }
        )
        if ($freshEnough.Count -eq 0) {
            $sample = $newest[0]
            throw (
                "NSIS installer is stale relative to the just-finished build. " +
                "Newest *-setup.exe LastWriteTime is $($sample.LastWriteTime); " +
                "required after $MustBeWrittenAfter. Path: $($sample.FullName)"
            )
        }
        return $freshEnough
    }

    return $newest
}
