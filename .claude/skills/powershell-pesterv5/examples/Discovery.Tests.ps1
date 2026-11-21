#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }
<#
    .SYNOPSIS
        Demonstrates data-driven Describe/Context blocks using BeforeDiscovery and -ForEach.

        Key patterns shown:
        - BeforeDiscovery: compute data that drives Describe/Context generation
        - Describe -ForEach: generate one Describe block per data entry
        - Context -ForEach: generate one Context per entry inside a Describe
        - $_ vs named keys in ForEach hashtables

        Use this when you need the same test suite executed against multiple
        environments, configurations, modules, or input files.
#>

# BeforeDiscovery runs during the Discovery phase — BEFORE any BeforeAll/It blocks.
# Use it to build arrays that drive -ForEach on Describe or Context.
# Do NOT put general setup here; use BeforeAll for that.
BeforeDiscovery {
    $Converters = @(
        @{ Name = 'UpperCase'; InputStr = 'hello'; Expected = 'HELLO' }
        @{ Name = 'LowerCase'; InputStr = 'WORLD'; Expected = 'world' }
        @{ Name = 'TitleCase'; InputStr = 'foo bar'; Expected = 'Foo Bar' }
    )
}

# One Describe block is generated per hashtable entry in $Converters.
# Keys are directly available as $Name, $InputStr, $Expected inside the block.
Describe 'Convert-String: <Name>' -ForEach $Converters -Tag 'CI' {

    BeforeAll {
        # Define the simple converter inline for this self-contained example
        function Convert-String {
            param(
                [string]$Value,
                [ValidateSet('UpperCase', 'LowerCase', 'TitleCase')]
                [string]$Mode
            )
            switch ($Mode) {
                'UpperCase' { return $Value.ToUpper() }
                'LowerCase' { return $Value.ToLower() }
                'TitleCase' {
                    $ti = [System.Globalization.CultureInfo]::InvariantCulture.TextInfo
                    return $ti.ToTitleCase($Value.ToLower())
                }
            }
        }
    }

    It 'Converts input correctly' {
        # $Name, $InputStr, $Expected come from the -ForEach hashtable
        Convert-String -Value $InputStr -Mode $Name | Should -Be $Expected
    }

    It 'Returns a string type' {
        Convert-String -Value $InputStr -Mode $Name | Should -BeOfType [string]
    }

    It 'Does not return null or empty' {
        Convert-String -Value $InputStr -Mode $Name | Should -Not -BeNullOrEmpty
    }
}

# Context -ForEach: generate multiple contexts within a single Describe
Describe 'Convert-String error handling' -Tag 'CI' {

    BeforeAll {
        function Convert-String {
            param([string]$Value, [ValidateSet('UpperCase', 'LowerCase', 'TitleCase')][string]$Mode)
            switch ($Mode) {
                'UpperCase' { return $Value.ToUpper() }
                'LowerCase' { return $Value.ToLower() }
                'TitleCase' {
                    $ti = [System.Globalization.CultureInfo]::InvariantCulture.TextInfo
                    return $ti.ToTitleCase($Value.ToLower())
                }
            }
        }
    }

    BeforeDiscovery {
        $InvalidModes = @('Reverse', 'Base64', '')
    }

    Context 'When Mode is invalid: "<_>"' -ForEach $InvalidModes {

        It 'Throws a validation error' {
            # $_ is the current scalar value from the ForEach array
            { Convert-String -Value 'test' -Mode $_ } | Should -Throw
        }
    }
}
