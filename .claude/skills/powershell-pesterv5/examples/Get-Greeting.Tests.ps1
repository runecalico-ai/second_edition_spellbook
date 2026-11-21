#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }
<#
    .SYNOPSIS
        Basic Pester v5 test patterns:
        - BeforeAll / BeforeEach / AfterAll
        - Describe / Context / It structure
        - Should assertions
        - Parameterized tests with -ForEach
#>

BeforeAll {
    # Dot-source the function under test using $PSScriptRoot for portability
    . "$PSScriptRoot/Get-Greeting.ps1"
}

Describe 'Get-Greeting' -Tag 'CI' {

    Context 'Informal greeting (default)' {

        It 'Returns hello message for a valid name' {
            # Arrange
            $name = 'Alice'

            # Act
            $result = Get-Greeting -Name $name

            # Assert
            $result | Should -Be 'Hello, Alice!'
        }

        It 'Returns greeting containing the name' {
            $result = Get-Greeting -Name 'Bob'

            $result | Should -Match 'Bob'
        }

        It 'Is case-preserving in the name' {
            $result = Get-Greeting -Name 'cArOl'

            $result | Should -BeExactly 'Hello, cArOl!'
        }
    }

    Context 'Formal greeting (-Formal switch)' {

        It 'Returns formal message when -Formal is set' {
            $result = Get-Greeting -Name 'Alice' -Formal

            $result | Should -Be 'Good day, Alice.'
        }

        It 'Formal greeting does not contain exclamation mark' {
            $result = Get-Greeting -Name 'Alice' -Formal

            $result | Should -Not -Match '!'
        }
    }

    Context 'Input validation' {

        It 'Throws when Name is empty string' {
            { Get-Greeting -Name '' } | Should -Throw
        }

        It 'Throws when Name is null' {
            { Get-Greeting -Name $null } | Should -Throw
        }
    }

    Context 'Parameterized - multiple names' {

        It 'Greets <Name> informally as <Expected>' -ForEach @(
            @{ Name = 'Alice';   Expected = 'Hello, Alice!' }
            @{ Name = 'Bob';     Expected = 'Hello, Bob!' }
            @{ Name = 'Charlie'; Expected = 'Hello, Charlie!' }
        ) {
            Get-Greeting -Name $Name | Should -Be $Expected
        }

        It 'Greets <Name> formally as <Expected>' -ForEach @(
            @{ Name = 'Alice';   Expected = 'Good day, Alice.' }
            @{ Name = 'Bob';     Expected = 'Good day, Bob.' }
        ) {
            Get-Greeting -Name $Name -Formal | Should -Be $Expected
        }
    }
}
