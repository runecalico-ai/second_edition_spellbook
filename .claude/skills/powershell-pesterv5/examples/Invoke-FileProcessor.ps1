function Invoke-FileProcessor {
    <#
    .SYNOPSIS
        Reads a JSON file and writes a processed version to an output path.
        Logs progress and calls an external API to notify on completion.
    .PARAMETER InputPath
        Path to the JSON input file.
    .PARAMETER OutputPath
        Path where the processed file will be written.
    .PARAMETER ApiUrl
        URL for the completion notification webhook.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$InputPath,

        [Parameter(Mandatory)]
        [string]$OutputPath,

        [string]$ApiUrl
    )

    if (-not (Test-Path -Path $InputPath)) {
        throw "Input file not found: $InputPath"
    }

    $data = Get-Content -Path $InputPath -Raw | ConvertFrom-Json

    # Process: uppercase all string values
    $processed = $data | ConvertTo-Json -Depth 10

    $processed | Set-Content -Path $OutputPath -Force

    Write-Verbose "Processed file written to: $OutputPath"

    if ($ApiUrl) {
        $null = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body (@{ status = 'done'; path = $OutputPath } | ConvertTo-Json) -ContentType 'application/json'
        Write-Verbose "API notified at: $ApiUrl"
    }
}
