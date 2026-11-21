# PowerShell Cmdlet Development Guidelines

This guide provides comprehensive PowerShell best practices aligned with Microsoft's cmdlet development guidelines.

## Naming Conventions

### Verb-Noun Format

- Use approved PowerShell verbs (check with `Get-Verb`)
- Use singular nouns
- PascalCase for both verb and noun
- Avoid special characters and spaces

### Parameter Names

- Use PascalCase
- Choose clear, descriptive names
- Use singular form unless always multiple
- Follow PowerShell standard names (`Path`, `Name`, `Force`, etc.)

### Variable Names

- Use PascalCase for public variables
- Use camelCase for private variables
- Avoid abbreviations
- Use meaningful names

### Alias Avoidance

- Use full cmdlet names in scripts
- Avoid aliases like `gci`, `?`, `%`, `where`
- Document any custom aliases
- Use full parameter names

## Parameter Design

### Standard Parameters

- Use common parameter names (`Path`, `Name`, `Force`)
- Follow built-in cmdlet conventions
- Use aliases for specialized terms
- Document parameter purpose

### Type Selection

- Use common .NET types
- Implement proper validation
- Consider `ValidateSet` for limited options
- Enable tab completion where possible

### Switch Parameters

- Use `[switch]` for boolean flags
- Avoid `$true`/`$false` parameters
- Default to `$false` when omitted
- Use clear action names

### Validation Attributes

Common validation attributes:
- `[ValidateSet('Option1', 'Option2')]` - Limit to specific values
- `[ValidateRange(1, 100)]` - Numeric range validation
- `[ValidateNotNullOrEmpty()]` - Ensure non-null/non-empty
- `[ValidatePattern('regex')]` - Regex pattern matching
- `[ValidateScript({...})]` - Custom validation logic
- `[ValidateLength(1, 50)]` - String length validation
- `[ValidateCount(1, 10)]` - Array count validation

### Parameter Sets

- Use `ParameterSetName` when callers must choose between mutually exclusive input shapes
- Put every parameter in the set on the matching `Parameter(...)` attribute
- Use `$PSCmdlet.ParameterSetName` when execution logic depends on the chosen set
- Document the valid combinations in comment-based help

Example:

```powershell
function Get-ServerInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ParameterSetName = 'ByName')]
        [string]$ComputerName,

        [Parameter(Mandatory, ParameterSetName = 'ById')]
        [int]$ServerId,

        [Parameter()]
        [switch]$Detailed
    )

    switch ($PSCmdlet.ParameterSetName) {
        'ByName' { Get-ServerByName -ComputerName $ComputerName -Detailed:$Detailed }
        'ById' { Get-ServerById -ServerId $ServerId -Detailed:$Detailed }
    }
}
```

## Pipeline and Output

### Pipeline Input

- Use `ValueFromPipeline` for direct object input
- Use `ValueFromPipelineByPropertyName` for property mapping
- Implement Begin/Process/End blocks for pipeline handling
- Document pipeline input requirements

### Output Objects

- Return rich objects, not formatted text
- Use `PSCustomObject` for structured data
- Avoid `Write-Host` for data output
- Enable downstream cmdlet processing

### Pipeline Streaming

- Output one object at a time
- Use `process` block for streaming
- Avoid collecting large arrays
- Enable immediate processing

### PassThru Pattern

- Default to no output for action cmdlets
- Implement `-PassThru` switch for object return
- Return modified/created object with `-PassThru`
- Use verbose/warning for status updates

### Output Type Declaration

- Use `[OutputType(...)]` to document what the command writes to the pipeline
- Keep the declared types aligned with actual output behavior
- Declare multiple types only when the command genuinely emits multiple object shapes

Example:

```powershell
function Get-Configuration {
    [CmdletBinding()]
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    [PSCustomObject]@{
        Path   = $Path
        Server = 'prod-01'
        Port   = 443
    }
}
```

Example:

```powershell
function Update-ResourceStatus {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [string]$Name,

        [Parameter(Mandatory)]
        [ValidateSet('Active', 'Inactive', 'Maintenance')]
        [string]$Status,

        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose 'Starting resource status update process'
        $timestamp = Get-Date
    }

    process {
        if (-not $PSCmdlet.ShouldProcess($Name, "Update status to '$Status'")) { return }

        try {
            Write-Verbose "Processing resource: $Name"

            # Actual state-changing operation — what try/catch guards:
            Set-ResourceProperty -Name $Name -Status $Status -ErrorAction Stop

            $resource = [PSCustomObject]@{
                Name        = $Name
                Status      = $Status
                LastUpdated = $timestamp
                UpdatedBy   = [System.Environment]::UserName
            }

            if ($PassThru) {
                Write-Output $resource
            }
        } catch {
            $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                $_.Exception,
                'UpdateResourceStatusFailed',
                [System.Management.Automation.ErrorCategory]::InvalidOperation,
                $Name
            )
            $PSCmdlet.WriteError($errorRecord)
        }
    }

    end {
        Write-Verbose 'Resource status update process completed'
    }
}
```

## Error Handling and Safety

### ShouldProcess Implementation

- Use `[CmdletBinding(SupportsShouldProcess)]`
- Set appropriate `ConfirmImpact` level:
  - `Low`: Minimal risk (set explicitly for reversible, low-consequence operations)
  - `Medium`: Moderate risk (**default when omitted**)
  - `High`: Significant risk (deletions, critical or irreversible changes)
- Call `$PSCmdlet.ShouldProcess()` for system changes
- Use `ShouldContinue()` **inside** a `ShouldProcess` block for a second-level confirmation; `ShouldContinue` does not check `-WhatIf`, so it must be nested within the `ShouldProcess` guard to remain WhatIf-safe

Example with nested `ShouldContinue()`:

```powershell
function Remove-CriticalResource {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Name
    )

    process {
        if (-not $PSCmdlet.ShouldProcess($Name, 'Remove resource')) { return }

        $proceed = $PSCmdlet.ShouldContinue(
            'This operation cannot be undone. Do you want to continue?',
            'Confirm permanent deletion'
        )
        if (-not $proceed) { return }

        Write-Verbose "Removing resource: $Name"
        Remove-Item -Path $Name -Force
    }
}
```

### Message Streams

- `Write-Verbose`: Operational details (visible with `-Verbose`)
- `Write-Warning`: Warning conditions
- `$PSCmdlet.WriteError($errorRecord)`: Non-terminating errors (prefer over `Write-Error` in advanced functions)
- `$PSCmdlet.ThrowTerminatingError($errorRecord)`: Terminating errors (prefer over `throw` in advanced functions)
- Avoid `Write-Host` except for user interface text

### Error Handling Pattern

In advanced functions with `[CmdletBinding()]`:
- Prefer `$PSCmdlet.WriteError()` over `Write-Error`
- Prefer `$PSCmdlet.ThrowTerminatingError()` over `throw`
- Construct proper ErrorRecord objects with category, target, and exception details

Example:

```powershell
function Remove-UserAccount {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[\w\.\-]+$')]  # restrict to safe characters for -Identity resolution and direct use in string-form AD filters
        [string]$Username
    )

    begin {
        Write-Verbose 'Starting user account removal process'
        # Use -ErrorAction Stop on individual cmdlets rather than setting the preference globally
    }

    process {
        try {
            # Validation
            $adUser = Get-ADUser -Filter { SamAccountName -eq $Username } -ErrorAction SilentlyContinue
            if (-not $adUser) {
                $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                    [System.Exception]::new("User account '$Username' not found"),
                    'UserNotFound',
                    [System.Management.Automation.ErrorCategory]::ObjectNotFound,
                    $Username
                )
                $PSCmdlet.WriteError($errorRecord)
                return
            }

            # Confirmation
            $shouldProcessMessage = "Remove user account '$Username'"
            if (-not $PSCmdlet.ShouldProcess($Username, $shouldProcessMessage)) { return }

            Write-Verbose "Removing user account: $Username"
            Remove-ADUser -Identity $Username -ErrorAction Stop
            Write-Verbose "User account '$Username' has been removed"
        } catch [Microsoft.ActiveDirectory.Management.ADException] {
            $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                $_.Exception,
                'ActiveDirectoryError',
                [System.Management.Automation.ErrorCategory]::PermissionDenied,
                $Username
            )
            # ThrowTerminatingError: AD/system errors are not per-item failures; abort the pipeline.
            # For per-item failures, use $PSCmdlet.WriteError($errorRecord) instead.
            $PSCmdlet.ThrowTerminatingError($errorRecord)
        } catch {
            $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                $_.Exception,
                'UnexpectedError',
                [System.Management.Automation.ErrorCategory]::InvalidOperation,
                $Username
            )
            # ThrowTerminatingError: unexpected failures are systemic; abort the pipeline.
            $PSCmdlet.ThrowTerminatingError($errorRecord)
        }
    }

    end {
        Write-Verbose 'User account removal process completed'
    }
}
```

### Non-Interactive Design

- Accept input via parameters
- Avoid `Read-Host` in scripts
- Support automation scenarios
- Document all required inputs

## Documentation and Style

### Comment-Based Help

Include comment-based help for all public-facing functions. Place inside the function with a `<# ... #>` block containing:

- `.SYNOPSIS`: Brief description
- `.DESCRIPTION`: Detailed explanation
- `.PARAMETER`: Description for each parameter
- `.EXAMPLE`: Practical usage examples (multiple recommended)
- `.OUTPUTS`: Type of output returned
- `.NOTES`: Additional information

Example:

```powershell
function Get-UserProfile {
    <#
    .SYNOPSIS
        Retrieves user profile information

    .DESCRIPTION
        Gets detailed user profile information from Active Directory or local system.
        Supports pipeline input and filtering by profile type.

    .PARAMETER Username
        The username to retrieve profile information for

    .PARAMETER ProfileType
        The type of profile information to retrieve. Valid values are Basic or Detailed.

    .EXAMPLE
        Get-UserProfile -Username "jdoe"
        Retrieves basic profile information for user jdoe

    .EXAMPLE
        "jdoe", "asmith" | Get-UserProfile -ProfileType Detailed
        Retrieves detailed profile information for multiple users via pipeline

    .OUTPUTS
        System.Management.Automation.PSCustomObject
        Returns custom object with user profile properties

    .NOTES
        Requires appropriate permissions to query Active Directory
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Username,

        [Parameter()]
        [ValidateSet('Basic', 'Detailed')]
        [string]$ProfileType = 'Basic'
    )

    process {
        # Logic here
    }
}
```

### Consistent Formatting

- Follow consistent PowerShell style
- Use proper indentation (4 spaces recommended)
- Opening braces on same line as statement
- Closing braces on new line
- Use line breaks after pipeline operators
- PascalCase for function and parameter names
- Avoid unnecessary whitespace

### Avoid Aliases in Scripts

Use full cmdlet names and parameters:
- Use `Where-Object` instead of `?` or `where`
- Use `ForEach-Object` instead of the `foreach` alias (i.e., `| foreach { }` in pipeline context); the `foreach ($x in $y) { }` keyword form is not an alias and is acceptable in scripts
- Use `Get-ChildItem` instead of `ls`, `dir`, or `gci`
- Use `Select-Object` instead of `select`
- Use full parameter names instead of abbreviations

Aliases are acceptable for interactive shell use but should not appear in scripts.

## Full Example: Complete Cmdlet Pattern

```powershell
function New-Resource {
    <#
    .SYNOPSIS
        Creates a new resource in the specified environment

    .DESCRIPTION
        Creates a new resource with the specified name and environment settings.
        Supports WhatIf and Confirm for safe execution.

    .PARAMETER Name
        The name of the resource to create

    .PARAMETER Environment
        The environment to create the resource in. Valid values are Development or Production.
        Defaults to Development.

    .PARAMETER PassThru
        Returns the created resource object

    .EXAMPLE
        New-Resource -Name "WebApp1" -Environment Production
        Creates a new resource named WebApp1 in the Production environment

    .EXAMPLE
        "App1", "App2" | New-Resource -PassThru
        Creates multiple resources via pipeline and returns the created objects

    .OUTPUTS
        None by default. System.Management.Automation.PSCustomObject when using -PassThru

    .NOTES
        Requires appropriate permissions to create resources
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory,
            ValueFromPipeline,
            ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter()]
        [ValidateSet('Development', 'Production')]
        [string]$Environment = 'Development',

        [Parameter()]
        [switch]$PassThru
    )

    begin {
        Write-Verbose 'Starting resource creation process'
        $created = 0
    }

    process {
        if (-not $PSCmdlet.ShouldProcess($Name, "Create new resource in $Environment environment")) { return }
        try {
            Write-Verbose "Creating resource: $Name"

            # Resource creation logic here
            $resource = [PSCustomObject]@{
                PSTypeName  = 'Custom.Resource'
                Name        = $Name
                Environment = $Environment
                Created     = Get-Date
                CreatedBy   = [System.Environment]::UserName
            }
            $created++
            if ($PassThru) { Write-Output $resource }
        } catch {
            $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                $_.Exception,
                'ResourceCreationFailed',
                [System.Management.Automation.ErrorCategory]::InvalidOperation,
                $Name
            )
            $PSCmdlet.WriteError($errorRecord)
        }
    }

    end {
        Write-Verbose "Completed resource creation process. Created $created resource(s)."
    }
}
```

## ErrorRecord Categories

Reference for `[System.Management.Automation.ErrorCategory]` values:

- `NotSpecified`: Last resort only - avoid in practice. Use the most specific applicable category above.
- `OpenError`: Error opening file/resource
- `CloseError`: Error closing file/resource
- `DeviceError`: Device error
- `DeadlockDetected`: Deadlock detected
- `InvalidArgument`: Invalid argument
- `InvalidData`: Invalid data
- `InvalidOperation`: Invalid operation
- `InvalidResult`: Invalid result
- `InvalidType`: Invalid type
- `MetadataError`: Metadata error
- `NotImplemented`: Not implemented
- `NotInstalled`: Not installed
- `ObjectNotFound`: Object not found
- `OperationStopped`: Operation stopped
- `OperationTimeout`: Operation timeout
- `SyntaxError`: Syntax error
- `ParserError`: Parser error
- `PermissionDenied`: Permission denied
- `ResourceBusy`: Resource busy
- `ResourceExists`: Resource exists
- `ResourceUnavailable`: Resource unavailable
- `ReadError`: Read error
- `WriteError`: Write error
- `FromStdErr`: From standard error
- `SecurityError`: Security error
- `ProtocolError`: Protocol error
- `ConnectionError`: Connection error
- `AuthenticationError`: Authentication failure
- `LimitsExceeded`: Limits exceeded
- `QuotaExceeded`: Quota exceeded
- `NotEnabled`: Functionality not enabled

## Best Practices Summary

✅ **Do:**
- Use `[CmdletBinding()]` for advanced functions
- Implement Begin/Process/End blocks for pipeline functions
- Return rich objects with `PSCustomObject`
- Use `SupportsShouldProcess` for state-changing operations
- Include comprehensive comment-based help
- Use full cmdlet names (no aliases)
- Implement proper error handling with ErrorRecord objects
- Use `Write-Verbose` for operational details
- Validate parameters with appropriate attributes
- Support pipeline input where appropriate

❌ **Don't:**
- Use aliases in scripts
- Use `Write-Host` for data output
- Use `Read-Host` in automation scripts
- Return formatted text instead of objects
- Skip error handling
- Forget comment-based help
- Use generic `throw` instead of proper ErrorRecord
- Ignore pipeline patterns
- Hard-code values that should be parameters
