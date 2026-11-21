#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }
<#
    .SYNOPSIS
        Advanced Pester v5 test patterns:
        - Mocking with Mock and Should -Invoke
        - ParameterFilter for conditional mocks
        - TestDrive for isolated file system
        - Verifiable mocks
        - Scoping: BeforeAll vs BeforeEach mocks
#>

BeforeAll {
    . "$PSScriptRoot/Invoke-FileProcessor.ps1"
}

Describe 'Invoke-FileProcessor' -Tag 'CI' {

    Context 'Successful processing without API notification' {

        BeforeEach {
            # Create a real input file in the isolated TestDrive
            $script:InputFile  = "$TestDrive/input.json"
            $script:OutputFile = "$TestDrive/output.json"

            @{ name = 'test'; value = 42 } | ConvertTo-Json | Set-Content -Path $script:InputFile

            # Mock the REST call so no network required
            Mock Invoke-RestMethod {}
        }

        It 'Creates the output file' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile

            $script:OutputFile | Should -Exist
        }

        It 'Output file contains original data' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile

            $script:OutputFile | Should -FileContentMatch '"name"'
            $script:OutputFile | Should -FileContentMatch '"value"'
        }

        It 'Does not call API when no ApiUrl provided' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile

            Should -Invoke Invoke-RestMethod -Times 0 -Exactly
        }
    }

    Context 'API notification on completion' {

        BeforeAll {
            # Shared test data for all tests in this context
            $script:ApiUrl = 'https://hooks.example.com/notify'
        }

        BeforeEach {
            $script:InputFile  = "$TestDrive/api-input.json"
            $script:OutputFile = "$TestDrive/api-output.json"

            '{"status":"raw"}' | Set-Content -Path $script:InputFile

            # Mark as verifiable - test will fail if not called
            Mock Invoke-RestMethod {} -Verifiable
        }

        It 'Calls the API once after processing' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl $script:ApiUrl

            Should -Invoke Invoke-RestMethod -Times 1 -Exactly
        }

        It 'Calls the API with POST method' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl $script:ApiUrl

            Should -Invoke Invoke-RestMethod -ParameterFilter { $Method -eq 'Post' }
        }

        It 'Calls the API with correct URL' {
            # Capture to local var — $script: scope is unreliable inside ParameterFilter
            $expectedUrl = $script:ApiUrl
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl $expectedUrl

            Should -Invoke Invoke-RestMethod -ParameterFilter { $Uri -eq $expectedUrl }
        }

        It 'All verifiable mocks were called' {
            Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl $script:ApiUrl

            Should -InvokeVerifiable
        }
    }

    Context 'Error handling' {

        It 'Throws when input file does not exist' {
            # Use TestDrive path — cross-platform, avoids hard-coded Windows paths
            { Invoke-FileProcessor -InputPath "$TestDrive/nonexistent/file.json" -OutputPath "$TestDrive/out.json" } |
                Should -Throw -ExpectedMessage '*Input file not found*'
        }
    }

    Context 'Conditional mock based on parameter value' {

        BeforeEach {
            $script:InputFile  = "$TestDrive/cond-input.json"
            $script:OutputFile = "$TestDrive/cond-output.json"
            '{"x":1}' | Set-Content -Path $script:InputFile

            # Return different results for different URLs
            Mock Invoke-RestMethod { return @{ ok = $true } }  -ParameterFilter { $Uri -like '*success*' }
            Mock Invoke-RestMethod { throw 'Bad gateway' }      -ParameterFilter { $Uri -like '*fail*' }
        }

        It 'Succeeds when API URL contains success' {
            { Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl 'https://success.example.com' } |
                Should -Not -Throw
        }

        It 'Throws when API URL contains fail' {
            { Invoke-FileProcessor -InputPath $script:InputFile -OutputPath $script:OutputFile -ApiUrl 'https://fail.example.com' } |
                Should -Throw -ExpectedMessage '*Bad gateway*'
        }
    }
}
