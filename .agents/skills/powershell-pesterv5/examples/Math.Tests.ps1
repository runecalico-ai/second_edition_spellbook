#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }
<#
    .SYNOPSIS
        Demonstrates parameterized tests using -ForEach and -TestCases.
        Also shows Should -Throw with specific error conditions.
#>

BeforeAll {
    function Add-Numbers {
        param([double]$A, [double]$B)
        return $A + $B
    }

    function Get-Quotient {
        param([double]$Numerator, [double]$Denominator)
        if ($Denominator -eq 0) {
            throw [System.DivideByZeroException]::new('Cannot divide by zero')
        }
        return $Numerator / $Denominator
    }

    function Get-AbsoluteValue {
        param([double]$Value)
        return [Math]::Abs($Value)
    }
}

Describe 'Add-Numbers' -Tag 'CI' {

    # -ForEach: modern v5 syntax, preferred
    It 'Adds <A> + <B> = <Expected>' -ForEach @(
        @{ A = 1;    B = 2;    Expected = 3 }
        @{ A = -1;   B = 1;    Expected = 0 }
        @{ A = 0;    B = 0;    Expected = 0 }
        @{ A = 1.5;  B = 2.5;  Expected = 4 }
        @{ A = -5;   B = -3;   Expected = -8 }
    ) {
        Add-Numbers -A $A -B $B | Should -Be $Expected
    }
}

Describe 'Get-Quotient' -Tag 'CI' {

    It 'Divides <Numerator> / <Denominator> = <Expected>' -ForEach @(
        @{ Numerator = 10;  Denominator = 2;   Expected = 5 }
        @{ Numerator = 9;   Denominator = 3;   Expected = 3 }
        @{ Numerator = 1;   Denominator = 4;   Expected = 0.25 }
        @{ Numerator = -6;  Denominator = 2;   Expected = -3 }
    ) {
        Get-Quotient -Numerator $Numerator -Denominator $Denominator | Should -Be $Expected
    }

    It 'Throws DivideByZeroException when denominator is 0' {
        { Get-Quotient -Numerator 10 -Denominator 0 } |
            Should -Throw -ExceptionType ([System.DivideByZeroException])
    }

    It 'Throw message contains "Cannot divide by zero"' {
        { Get-Quotient -Numerator 10 -Denominator 0 } |
            Should -Throw -ExpectedMessage '*Cannot divide by zero*'
    }
}

Describe 'Get-AbsoluteValue' -Tag 'CI' {

    # -TestCases: legacy syntax, still supported in v5
    It 'Returns absolute value of <Value> as <Expected>' -TestCases @(
        @{ Value = -5;  Expected = 5 }
        @{ Value = 5;   Expected = 5 }
        @{ Value = 0;   Expected = 0 }
        @{ Value = -0.1; Expected = 0.1 }
    ) {
        Get-AbsoluteValue -Value $Value | Should -Be $Expected
    }

    It 'Result is always non-negative' -ForEach @(
        @{ Value = -100 }
        @{ Value = -1 }
        @{ Value = 0 }
        @{ Value = 1 }
    ) {
        Get-AbsoluteValue -Value $Value | Should -BeGreaterOrEqual 0
    }
}
