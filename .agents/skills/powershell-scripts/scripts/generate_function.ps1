#!/usr/bin/env pwsh
<#
.SYNOPSIS
Generates PowerShell function template with best practices

.DESCRIPTION
Creates a PowerShell function template following Microsoft cmdlet development guidelines.
Includes proper parameter blocks, comment-based help, and pipeline support options.

.PARAMETER FunctionName
Name of the function in Verb-Noun format (e.g., Get-UserData)

.PARAMETER IncludePipeline
Include pipeline support (ValueFromPipeline)

.PARAMETER IncludeShouldProcess
Include ShouldProcess support for confirmation

.PARAMETER OutputPath
Path where the generated function should be saved. If not specified, outputs to console.

.EXAMPLE
.\generate_function.ps1 -FunctionName "Get-UserData"
Generates basic function template

.EXAMPLE
.\generate_function.ps1 -FunctionName "Update-Configuration" -IncludePipeline -IncludeShouldProcess
Generates function with pipeline and ShouldProcess support

.EXAMPLE
.\generate_function.ps1 -FunctionName "New-Resource" -OutputPath .\NewResource.ps1
Generates function and saves to file

.OUTPUTS
Function template as string or file

.NOTES
Use Get-Verb to see approved PowerShell verbs
#>
[CmdletBinding(SupportsShouldProcess)]
[OutputType([string])]  # Declare output type(s) so callers and tools know what this script emits
param(
    [Parameter(Mandatory)]
    [ValidateScript({
        $verb = ($_ -split '-')[0]
        if (Get-Verb -Verb $verb) { $true }
        else { throw "'$verb' is not an approved PowerShell verb. Run Get-Verb to see the full list." }
    })]
    [ValidatePattern('^[A-Z][a-zA-Z0-9]+-[A-Z][a-zA-Z0-9]+$')]
    [string]$FunctionName,

    [Parameter()]
    [switch]$IncludePipeline,

    [Parameter()]
    [switch]$IncludeShouldProcess,

    [Parameter()]
    [string]$OutputPath
)

# Build CmdletBinding attributes
$cmdletBinding = '[CmdletBinding('
if ($IncludeShouldProcess) {
    # Include ConfirmImpact in the generated template so the author sees it explicitly.
    # Default when omitted is 'Medium'; adjust to 'High' for irreversible ops or 'Low' for trivial ones.
    $cmdletBinding += "SupportsShouldProcess, ConfirmImpact = 'Medium'"
}
$cmdletBinding += ')]'

# Build a TODO comment for the generated file when ConfirmImpact is included
$confirmImpactNote = if ($IncludeShouldProcess) {
    "    # TODO: Adjust ConfirmImpact — 'High' for irreversible/destructive ops, 'Low' for trivial-reversible ones`n"
} else {
    ''
}

# Build parameter attributes
$paramAttributes = '[Parameter(Mandatory'
if ($IncludePipeline) {
    $paramAttributes += ",`n            ValueFromPipeline,`n            ValueFromPipelineByPropertyName"
}
$paramAttributes += ')]'

# Build function template
$nameComma = if ($IncludeShouldProcess) { ',' } else { '' }
$template = @"
function $FunctionName {
    <#
    .SYNOPSIS
        Brief description of what the function does

    .DESCRIPTION
        Detailed explanation of the function's purpose and behavior

    .PARAMETER Name
        Description of the Name parameter
"@

if ($IncludeShouldProcess) {
    $template += @"

    .PARAMETER PassThru
        Returns the processed object. By default, this function produces no output.
"@
}

$template += @"

    .EXAMPLE
        $FunctionName -Name "example"
        Description of this example
"@

if ($IncludePipeline) {
    $template += @"


    .EXAMPLE
        "item1", "item2" | $FunctionName
        Description of pipeline example
"@
}

$template += @"


    .OUTPUTS
        System.Management.Automation.PSCustomObject
        Description of output

    .NOTES
        Additional notes or requirements
    #>
$confirmImpactNote    $cmdletBinding
    [OutputType([System.Management.Automation.PSCustomObject])]
    param(
        $paramAttributes
        [ValidateNotNullOrEmpty()]
        [string]`$Name$nameComma
"@

if ($IncludeShouldProcess) {
    $template += @"

        [Parameter()]
        [switch]`$PassThru
"@
}

if ($IncludePipeline) {
    $template += @"

    )

    begin {
        Write-Verbose 'Starting $FunctionName process'
    }

    process {
"@
} else {
    $template += @"

    )
"@
}

if ($IncludeShouldProcess) {
    $template += @"

        # TODO: Validate preconditions before prompting (e.g., check target exists)
        # On failure: `$PSCmdlet.WriteError(...); return

        if (-not `$PSCmdlet.ShouldProcess(`$Name, 'TODO: describe the action, e.g. ''Remove cache entry''')) { return }
        try {
            Write-Verbose "Processing: `$Name"

            # TODO: Add main logic here

            `$result = [PSCustomObject]@{
                Name      = `$Name
                Processed = Get-Date
            }

            if (`$PassThru) {
                Write-Output `$result
            }
        } catch {
            `$errorRecord = [System.Management.Automation.ErrorRecord]::new(
                `$_.Exception,
                'ProcessingFailed',
                [System.Management.Automation.ErrorCategory]::InvalidOperation, # Choose the category that best describes the failure; see references/guidelines.md
                `$Name
            )
            `$PSCmdlet.ThrowTerminatingError(`$errorRecord)
        }
"@
} else {
    $template += @"

        Write-Verbose "Processing: `$Name"

        # TODO: Add main logic here
        try {
            `$result = [PSCustomObject]@{
                Name      = `$Name
                Processed = Get-Date
            }

            Write-Output `$result
        } catch {
            `$errorRecord = [System.Management.Automation.ErrorRecord]::new(
                `$_.Exception,
                'ProcessingFailed',
                [System.Management.Automation.ErrorCategory]::InvalidOperation, # Choose the category that best describes the failure; see references/guidelines.md
                `$Name
            )
            `$PSCmdlet.ThrowTerminatingError(`$errorRecord)
        }
"@
}

if ($IncludePipeline) {
    $template += @"

    }

    end {
        Write-Verbose '$FunctionName process completed'
    }
}
"@
} else {
    $template += @"

}
"@
}

# Normalize indentation for non-pipeline functions: body code is at 8 spaces in the
# shared template (written for inside process{}), but should be at 4 in a plain function.
# Only normalize AFTER the param block closes to preserve the conventional 8-space param indent.
if (-not $IncludePipeline) {
    # Handle both LF and CRLF line endings in the here-string
    $splitMatch = [regex]::Match($template, '\r?\n    \)\r?\n')
    if ($splitMatch.Success) {
        $splitEnd   = $splitMatch.Index + $splitMatch.Length
        $paramSection = $template.Substring(0, $splitEnd)
        $bodySection  = $template.Substring($splitEnd) -replace '(?m)^        ', '    '
        $template = $paramSection + $bodySection
    } else {
        $template = $template -replace '(?m)^        ', '    '
    }
}

# Use WriteError for pipeline functions (to allow remaining items to process)
if ($IncludePipeline) {
    $template = $template -replace '\$PSCmdlet\.ThrowTerminatingError\(', '$$PSCmdlet.WriteError('
}

# Output or save template
if ($OutputPath) {
    $parentDir = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($OutputPath))
    if ($PSCmdlet.ShouldProcess($OutputPath, 'Write function template')) {
        if ($parentDir -and -not (Test-Path -Path $parentDir -PathType Container)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        $template | Set-Content -Path $OutputPath -Encoding UTF8
        Write-Verbose "Function template saved to: $OutputPath"
    }
} else {
    Write-Output $template
}
