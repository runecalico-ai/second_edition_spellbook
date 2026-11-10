#Requires -Version 5.1
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

BeforeAll {
    . "$PSScriptRoot\windows_installer_paths.ps1"
    $script:HadCargoTargetDir = Test-Path Env:\CARGO_TARGET_DIR
    $script:OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
}

Describe 'Get-CargoTargetDir' -Tag 'CI' {

    AfterEach {
        if ($script:HadCargoTargetDir) {
            $env:CARGO_TARGET_DIR = $script:OriginalCargoTargetDir
        }
        else {
            Remove-Item Env:\CARGO_TARGET_DIR -ErrorAction SilentlyContinue
        }
    }

    BeforeEach {
        $script:SrcTauriDir = Join-Path $TestDrive 'apps\desktop\src-tauri'
        $cargoDir = Join-Path $script:SrcTauriDir '.cargo'
        New-Item -ItemType Directory -Path $cargoDir -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $cargoDir 'config.toml') -Value @"
[build]
target-dir = "../../../target"
"@
    }

    Context 'When CARGO_TARGET_DIR is set' {

        It 'Returns the CARGO_TARGET_DIR path ahead of config.toml' {
            $envTarget = Join-Path $TestDrive 'cursor-sandbox-cache\cargo-target'
            New-Item -ItemType Directory -Path $envTarget -Force | Out-Null
            $env:CARGO_TARGET_DIR = $envTarget

            $result = Get-CargoTargetDir -RepoRoot $TestDrive -SrcTauriDir $script:SrcTauriDir

            $result | Should -Be ([System.IO.Path]::GetFullPath($envTarget))
        }
    }

    Context 'When CARGO_TARGET_DIR is unset' {

        BeforeEach {
            Remove-Item Env:\CARGO_TARGET_DIR -ErrorAction SilentlyContinue
        }

        It 'Returns the config.toml target-dir resolved against src-tauri' {
            $result = Get-CargoTargetDir -RepoRoot $TestDrive -SrcTauriDir $script:SrcTauriDir

            $expected = [System.IO.Path]::GetFullPath((Join-Path $script:SrcTauriDir '../../../target'))
            $result | Should -Be $expected
        }

        It 'Returns src-tauri/target when config.toml is missing' {
            Remove-Item -LiteralPath (Join-Path $script:SrcTauriDir '.cargo\config.toml') -Force

            $result = Get-CargoTargetDir -RepoRoot $TestDrive -SrcTauriDir $script:SrcTauriDir

            $result | Should -Be (Join-Path $script:SrcTauriDir 'target')
        }
    }

    Context 'When CARGO_TARGET_DIR is whitespace' {

        It 'Falls back to config.toml' {
            $env:CARGO_TARGET_DIR = '   '

            $result = Get-CargoTargetDir -RepoRoot $TestDrive -SrcTauriDir $script:SrcTauriDir

            $expected = [System.IO.Path]::GetFullPath((Join-Path $script:SrcTauriDir '../../../target'))
            $result | Should -Be $expected
        }
    }
}

Describe 'Get-NsisInstallerFiles' -Tag 'CI' {

    BeforeEach {
        $script:PreferredNsisDir = Join-Path $TestDrive 'repo-root-target\release\bundle\nsis'
        $script:BundleRoot = Join-Path $TestDrive 'cargo-target\release\bundle'
        $script:CargoNsisDir = Join-Path $script:BundleRoot 'nsis'
        New-Item -ItemType Directory -Path $script:PreferredNsisDir -Force | Out-Null
        New-Item -ItemType Directory -Path $script:CargoNsisDir -Force | Out-Null
    }

    It 'Prefers a newer setup.exe under the cargo target bundle dir over a stale preferred-dir file' {
        $stalePath = Join-Path $script:PreferredNsisDir 'Spellbook_0.1.0_x64-setup.exe'
        $freshPath = Join-Path $script:CargoNsisDir 'Spellbook_0.1.0_x64-setup.exe'
        Set-Content -LiteralPath $stalePath -Value 'stale-14mb-placeholder'
        Set-Content -LiteralPath $freshPath -Value 'fresh-nsis-payload'
        (Get-Item -LiteralPath $stalePath).LastWriteTime = (Get-Date).AddDays(-10)
        (Get-Item -LiteralPath $freshPath).LastWriteTime = Get-Date

        $result = @(Get-NsisInstallerFiles -BundleRoot $script:BundleRoot -PreferredNsisDir $script:PreferredNsisDir)

        $result | Should -HaveCount 1
        $result[0].FullName | Should -Be (Get-Item -LiteralPath $freshPath).FullName
    }

    It 'Throws when every candidate is older than MustBeWrittenAfter' {
        $stalePath = Join-Path $script:PreferredNsisDir 'Spellbook_0.1.0_x64-setup.exe'
        Set-Content -LiteralPath $stalePath -Value 'stale-14mb-placeholder'
        (Get-Item -LiteralPath $stalePath).LastWriteTime = (Get-Date).AddDays(-10)
        $floor = Get-Date

        {
            Get-NsisInstallerFiles `
                -BundleRoot $script:PreferredNsisDir `
                -PreferredNsisDir $script:PreferredNsisDir `
                -MustBeWrittenAfter $floor
        } | Should -Throw -ExpectedMessage '*stale*'
    }
}
