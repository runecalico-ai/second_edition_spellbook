function Get-Greeting {
    <#
    .SYNOPSIS
        Returns a greeting string for the given name.
    .PARAMETER Name
        The name to greet. Must not be null or empty.
    .PARAMETER Formal
        When specified, returns a formal greeting.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [switch]$Formal
    )

    if ($Formal) {
        return "Good day, $Name."
    }

    return "Hello, $Name!"
}
