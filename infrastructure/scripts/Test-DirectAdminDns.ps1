<#
Quick smoke test for DirectAdmin's CMD_API_DNS_CONTROL: adds a throwaway TXT record
and lists the zone's current TXT records so you can confirm it landed.

Usage:
  .\Test-DirectAdminDns.ps1 -Server "https://s001.inleed.example:2222" -Domain "shorinjikempo.net"

You'll be prompted for the DirectAdmin username + Login Key (used as the password).
#>
param(
    [Parameter(Mandatory)]
    [string]$Server,

    [Parameter(Mandatory)]
    [string]$Domain,

    [string]$Name = "_claude-api-test",

    [string]$Value = "hello-from-powershell-$(Get-Date -Format o)",

    [PSCredential]$Credential
)

$ErrorActionPreference = 'Stop'

if (-not $Credential) {
    $Credential = Get-Credential -Message "DirectAdmin username + Login Key"
}

$pair = "{0}:{1}" -f $Credential.UserName, $Credential.GetNetworkCredential().Password
$basicAuth = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ Authorization = "Basic $basicAuth" }

function ConvertFrom-DirectAdminResponse {
    param([string]$Raw)
    $result = @{}
    foreach ($pairStr in $Raw -split '&') {
        if ($pairStr -match '^([^=]+)=(.*)$') {
            $key = [System.Uri]::UnescapeDataString($matches[1])
            $val = [System.Uri]::UnescapeDataString(($matches[2] -replace '\+', ' '))
            $result[$key] = $val
        }
    }
    return $result
}

Write-Host "Adding TXT record '$Name' = `"$Value`" on $Domain ..." -ForegroundColor Cyan

$addUri = "$Server/CMD_API_DNS_CONTROL"
$addBody = @{
    domain = $Domain
    action = 'add'
    type   = 'TXT'
    name   = $Name
    value  = "`"$Value`""
}

try {
    $addResp = Invoke-WebRequest -Uri $addUri -Method Post -Headers $headers -Body $addBody -UseBasicParsing
    $parsed = ConvertFrom-DirectAdminResponse -Raw $addResp.Content

    if ($parsed['error'] -eq '0') {
        Write-Host "Add OK: $($parsed['text'])" -ForegroundColor Green
    } else {
        Write-Host "DirectAdmin reported an error:" -ForegroundColor Red
        $parsed.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key) = $($_.Value)" }
        return
    }
}
catch {
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
    return
}

Write-Host "`nCurrent TXT records for $Domain (verify '$Name' shows up):" -ForegroundColor Cyan

$listUri = "$Server/CMD_API_DNS_CONTROL?domain=$Domain&type=TXT"
$listResp = Invoke-WebRequest -Uri $listUri -Method Get -Headers $headers -UseBasicParsing
Write-Host $listResp.Content

Write-Host "`nDone. This test record is harmless but not auto-removed -- delete '$Name' via the DirectAdmin DNS panel once you've confirmed it worked." -ForegroundColor Yellow
