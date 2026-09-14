# ==============================================================================
# run_backend_lan.ps1 - Inicia o backend NextPlay para testes na rede local (LAN)
# ==============================================================================
# Detecta automaticamente o IPv4 da maquina no roteador local, configura
# HOST=0.0.0.0 para aceitar conexoes do celular e executa o servidor Fastify.
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

# 1. Determina o IP
if (-not [string]::IsNullOrWhiteSpace($IpAddress)) {
    $lanIp = $IpAddress
} else {
    $lanIp = Get-LanIPv4
}

$apiUrl = "http://${lanIp}:${Port}/api/v1"

# 2. Configura variaveis de ambiente
$env:HOST = '0.0.0.0'
$env:PORT = [string]$Port

# 3. Exibe informacoes detalhadas
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '   NextPlay Backend - Modo Rede Local (LAN)' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host "  IPv4 Detectado no PC : $lanIp" -ForegroundColor Green
Write-Host "  Porta do Servidor    : $Port" -ForegroundColor Green
Write-Host "  URL Base da API      : $apiUrl" -ForegroundColor Yellow
Write-Host '  Bind Host            : 0.0.0.0 (aceita conexoes externas da LAN)' -ForegroundColor DarkGray
Write-Host '-----------------------------------------------------------------' -ForegroundColor Cyan
Write-Host "  DICA: Certifique-se de que a porta $Port esteja liberada no" -ForegroundColor Gray
Write-Host '  Firewall do Windows para redes Privadas/Domesticas.' -ForegroundColor Gray
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

# 4. Executa o servidor no diretorio do backend
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $projectRoot 'backend'

Push-Location $backendDir
try {
    & pnpm.cmd --config.verify-deps-before-run=false run dev
} finally {
    Pop-Location
}
