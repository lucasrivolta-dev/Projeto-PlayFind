# ==============================================================================
# build_android_lan.ps1 - Compila o APK NextPlay apontando para a API local (LAN)
# ==============================================================================
# Detecta automaticamente o IPv4 da maquina no roteador local, injeta
# --dart-define=API_BASE_URL=http://<IP>:3333/api/v1 e compila o APK de Release.
# ==============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$IpAddress,

    [Parameter(Mandatory = $false)]
    [int]$Port = 3333
)

$ErrorActionPreference = 'Stop'

function Get-LanIPv4 {
    try {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
            Sort-Object { $_.RouteMetric + $_.InterfaceMetric } |
            Select-Object -First 1

        if ($route) {
            $ipObj = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object -First 1
            if ($ipObj) {
                return $ipObj.IPAddress
            }
        }
    } catch {
        # Continua para fallback
    }

    $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*')
        } |
        Select-Object -First 1

    if ($fallback) {
        return $fallback.IPAddress
    }

    throw 'Nao foi possivel detectar o endereco IPv4 da rede local (LAN). Verifique sua conexao de rede.'
}

# 1. Determina o IP e a URL da API
if (-not [string]::IsNullOrWhiteSpace($IpAddress)) {
    $lanIp = $IpAddress
} else {
    $lanIp = Get-LanIPv4
}

$apiUrl = "http://${lanIp}:${Port}/api/v1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$flutterPs1 = Join-Path $projectRoot 'flutter.ps1'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '   NextPlay Android Build - Modo Rede Local (LAN)' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "  IPv4 Detectado no PC : $lanIp" -ForegroundColor Green
Write-Host "  Porta do Backend     : $Port" -ForegroundColor Green
Write-Host "  API_BASE_URL Injetada: $apiUrl" -ForegroundColor Yellow
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

Push-Location $projectRoot
try {
    Write-Host '[1/2] Compilando APK Release com Flutter...' -ForegroundColor Cyan
    $dartDefineArg = "--dart-define=API_BASE_URL=$apiUrl"
    & powershell.exe -ExecutionPolicy Bypass -File $flutterPs1 build apk --release $dartDefineArg

    if ($LASTEXITCODE -ne 0) {
        throw "O comando 'flutter build apk' falhou com codigo de saida $LASTEXITCODE."
    }

    $apkPath = Join-Path $projectRoot 'build\app\outputs\flutter-apk\app-release.apk'

    if (-not (Test-Path $apkPath)) {
        throw "Arquivo APK nao encontrado no caminho esperado: $apkPath"
    }

    $apkItem = Get-Item $apkPath
    $apkSizeMB = [math]::Round($apkItem.Length / 1MB, 2)

    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host '   APK GERADO COM SUCESSO!' -ForegroundColor Green
    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host "  Arquivo : $($apkItem.FullName)" -ForegroundColor White
    Write-Host "  Tamanho : $apkSizeMB MB" -ForegroundColor White
    Write-Host "  Alvo API: $apiUrl" -ForegroundColor Yellow
    Write-Host '-----------------------------------------------------------------' -ForegroundColor Green
    Write-Host '  COMO INSTALAR NO CELULAR:' -ForegroundColor Cyan
    Write-Host '  1. Envie o arquivo app-release.apk para o celular via:' -ForegroundColor Gray
    Write-Host '     - Cabo USB (copiar para a pasta Downloads do celular)' -ForegroundColor Gray
    Write-Host '     - Google Drive / WhatsApp / Mensageiro' -ForegroundColor Gray
    Write-Host "     - ADB: adb install -r `"$($apkItem.FullName)`"" -ForegroundColor Gray
    Write-Host '  2. No celular, toque no APK para instalar (permita fontes desconhecidas se solicitado).' -ForegroundColor Gray
    Write-Host '  3. Certifique-se de que o backend esteja rodando no PC via:' -ForegroundColor Gray
    Write-Host '     powershell -ExecutionPolicy Bypass -File .\scripts\run_backend_lan.ps1' -ForegroundColor Yellow
    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host ''
} finally {
    Pop-Location
}
