$ErrorActionPreference = "Stop"
function CheckLastExitCode {
    param ([int[]]$SuccessCodes = @(0), [scriptblock]$CleanupScript=$null)

    if ($SuccessCodes -notcontains $LastExitCode) {
        if ($CleanupScript) {
            "Executing cleanup script: $CleanupScript"
            &$CleanupScript
        }
        $msg = @"
EXE RETURNED EXIT CODE $LastExitCode
CALLSTACK:$(Get-PSCallStack | Out-String)
"@
        throw $msg
    }
}

& docker build -t internal-docker-registry:80/shorinjikempo:latest .
CheckLastExitCode

& docker push internal-docker-registry:80/shorinjikempo:latest
CheckLastExitCode

& ssh admin@dockernode1 -t 'docker pull internal-docker-registry:80/shorinjikempo:latest && cd services/shorinjikempo && docker compose down && docker compose up -d'
CheckLastExitCode