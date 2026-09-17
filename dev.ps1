param(
    [Parameter(Position = 0)]
    [ValidateSet("mobile", "edge", "api")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"

if (-not $Mode) {
    Write-Host "Uso:"
    Write-Host "  .\dev.ps1 mobile"
    Write-Host "  .\dev.ps1 edge"
    Write-Host "  .\dev.ps1 api"
    exit 1
}

$RootDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend   = Join-Path $RootDir "backend"
$ApiPort   = 3333
$HealthUrl = "http://127.0.0.1:$ApiPort/health"
$ApiUrl    = "http://127.0.0.1:$ApiPort/api/v1"

# Ambiente definitivo
$env:JAVA_HOME = "C:\dev\jdk-21"
$env:ANDROID_HOME = "C:\dev\android-sdk"
$env:ANDROID_SDK_ROOT = "C:\dev\android-sdk"

$env:Path = `
    "C:\dev\flutter\bin;" +
    "C:\dev\jdk-21\bin;" +
    "C:\dev\android-sdk\platform-tools;" +
    $env:Path

$backendProc = $null
$startedBackend = $false

function Test-Backend {
    try {
        $result = Invoke-RestMethod `
            -Uri $HealthUrl `
            -TimeoutSec 1 `
            -ErrorAction Stop

        return ($result.status -eq "ok")
    }
    catch {
        return $false
    }
}

function Start-Backend {
    if (Test-Backend) {
        Write-Host "[PlayFind] Backend já está rodando." -ForegroundColor Green
        return
    }

    Write-Host "[PlayFind] Iniciando backend..."

    $script:backendProc = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList "/c", "pnpm run dev" `
        -WorkingDirectory $Backend `
        -PassThru `
        -WindowStyle Hidden

    $script:startedBackend = $true

    Write-Host "[PlayFind] Aguardando API..."

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1

        if (Test-Backend) {
            Write-Host "[PlayFind] API pronta em $HealthUrl" -ForegroundColor Green
            return
        }
    }

    throw "Backend não respondeu na porta $ApiPort."
}

function Stop-Backend {
    if ($script:startedBackend -and $script:backendProc) {
        Write-Host ""
        Write-Host "[PlayFind] Encerrando backend..."

        try {
            & taskkill.exe /F /T /PID $script:backendProc.Id *> $null
        }
        catch {}
    }
}

try {
    Set-Location $RootDir

    if ($Mode -eq "api") {

        Write-Host "======================================="
        Write-Host " PLAYFIND - API"
        Write-Host "======================================="

        Start-Backend

        Write-Host ""
        Write-Host "API rodando:"
        Write-Host $HealthUrl
        Write-Host ""
        Write-Host "Pressione Ctrl+C para encerrar."

        while ($true) {
            Start-Sleep -Seconds 60
        }
    }

    elseif ($Mode -eq "edge") {

        Write-Host "======================================="
        Write-Host " PLAYFIND - EDGE"
        Write-Host "======================================="

        Start-Backend

        Write-Host "[PlayFind] Abrindo Edge..."

        & flutter.bat run -d edge `
            "--dart-define=API_BASE_URL=$ApiUrl"
    }

    elseif ($Mode -eq "mobile") {

        Write-Host "======================================="
        Write-Host " PLAYFIND - ANDROID"
        Write-Host "======================================="

        # Detectar celular automaticamente
        $device = $null

        $adbLines = & adb.exe devices

        foreach ($line in $adbLines) {
            if ($line -match "^([A-Za-z0-9_-]+)\s+device$") {
                $device = $Matches[1]
                break
            }
        }

        if (-not $device) {
            throw "Nenhum celular Android conectado via ADB."
        }

        Write-Host "[PlayFind] Celular detectado: $device" -ForegroundColor Green

        Start-Backend

        Write-Host "[PlayFind] Configurando adb reverse..."

        # Só remove a regra se ela já existir.
        $reverseList = & adb.exe reverse --list

        if ($reverseList -match "tcp:$ApiPort tcp:$ApiPort") {
            Write-Host "[PlayFind] Removendo adb reverse anterior..."
            & adb.exe reverse --remove tcp:$ApiPort
        }

        # Criar regra USB: celular 127.0.0.1:3333 -> PC 127.0.0.1:3333
        & adb.exe reverse tcp:$ApiPort tcp:$ApiPort

        $reverse = & adb.exe reverse --list

        if ($reverse -notmatch "tcp:$ApiPort tcp:$ApiPort") {
            throw "adb reverse não foi configurado corretamente."
        }

        Write-Host "[PlayFind] API USB pronta." -ForegroundColor Green
        Write-Host "[PlayFind] Abrindo app no celular..."

        & flutter.bat run `
            -d $device `
            "--dart-define=API_BASE_URL=$ApiUrl"
    }
}
finally {
    Stop-Backend
}