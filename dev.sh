#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# PlayFind — Script unificado de desenvolvimento (Edge e Mobile)
# Suporta:
#   ./dev.sh edge
#   ./dev.sh mobile
# ==============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
BACKEND_LOG="$ROOT/.backend.log"
API_PORT="3333"
HEALTH_URL="http://127.0.0.1:${API_PORT}/health"

# Garantir ambiente sem caminhos com acentuação ou OneDrive
if [ -d "/c/dev/flutter/bin" ]; then
  export PATH="/c/dev/flutter/bin:/c/dev/jdk-21/bin:/c/dev/android-sdk/platform-tools:/c/dev/android-sdk/cmdline-tools/latest/bin:$PATH"
fi
export JAVA_HOME="${JAVA_HOME:-C:\\dev\\jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-C:\\dev\\android-sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

# Encontrar comando pnpm / npm
PNPM_CMD=""
if command -v pnpm.cmd >/dev/null 2>&1; then
  PNPM_CMD="pnpm.cmd"
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD="pnpm"
elif command -v npm.cmd >/dev/null 2>&1; then
  PNPM_CMD="npm.cmd"
elif command -v npm >/dev/null 2>&1; then
  PNPM_CMD="npm"
fi

BACKEND_PID=""
STARTED_BACKEND=false

cleanup() {
  echo ""
  echo "[PlayFind] Encerrando processos..."

  if [ "$STARTED_BACKEND" = true ] && [ -n "$BACKEND_PID" ]; then
    echo "[PlayFind] Finalizando backend (PID $BACKEND_PID)..."
    # No Windows, encerra a árvore completa de processos
    taskkill //F //T //PID "$BACKEND_PID" >/dev/null 2>&1 || true
    kill -9 "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  # Garantir que nada continue prendendo a porta 3333
  if [ "$STARTED_BACKEND" = true ]; then
    WIN_PORT_PIDS=$(netstat -ano 2>/dev/null | grep ":${API_PORT}[[:space:]]" | grep "LISTENING" | awk '{print $NF}' | sort -u || true)
    for p in $WIN_PORT_PIDS; do
      if [ -n "$p" ] && [ "$p" -ne 0 ]; then
        taskkill //F //PID "$p" >/dev/null 2>&1 || true
      fi
    done
  fi

  echo "[PlayFind] Concluído."
}

trap cleanup EXIT INT TERM

start_backend_if_needed() {
  echo "[PlayFind] Verificando backend na porta $API_PORT..."

  if curl -s -f "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[PlayFind] Backend já está em execução em $HEALTH_URL."
    return 0
  fi

  if [ -z "$PNPM_CMD" ]; then
    echo "ERRO: pnpm ou npm não foi encontrado para iniciar o backend."
    exit 1
  fi

  echo "[PlayFind] Iniciando backend em segundo plano..."
  (cd "$BACKEND_DIR" && "$PNPM_CMD" run dev > "$BACKEND_LOG" 2>&1) &
  BACKEND_PID=$!
  STARTED_BACKEND=true

  # Aguardar inicialização e resposta em /health
  echo "[PlayFind] Aguardando API responder em $HEALTH_URL..."
  local attempts=0
  local max_attempts=30
  until curl -s -f "$HEALTH_URL" >/dev/null 2>&1; do
    if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      echo ""
      echo "ERRO: O processo do backend encerrou prematuramente."
      echo "=== Log do backend ($BACKEND_LOG) ==="
      cat "$BACKEND_LOG"
      exit 1
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$max_attempts" ]; then
      echo "ERRO: Timeout aguardando backend em $HEALTH_URL."
      echo "=== Log do backend ($BACKEND_LOG) ==="
      cat "$BACKEND_LOG"
      exit 1
    fi
    sleep 1
  done

  echo "[PlayFind] Backend pronto e saudável."
}

# ==============================================================================
# Execução por modo
# ==============================================================================

MODE="${1:-}"

if [ -z "$MODE" ]; then
  echo "Uso: ./dev.sh [edge|mobile]"
  echo ""
  echo "Comandos disponíveis:"
  echo "  ./dev.sh edge    - Inicia backend e executa Flutter no Microsoft Edge"
  echo "  ./dev.sh mobile  - Inicia backend, configura adb reverse e executa Flutter no Android conectado"
  exit 1
fi

case "$MODE" in
  edge)
    echo "========================================"
    echo "       PLAYFIND — EDGE DEV"
    echo "========================================"
    start_backend_if_needed
    echo "[PlayFind] Iniciando Flutter no Edge..."
    cd "$ROOT"
    flutter.bat run -d edge
    ;;

  mobile)
    echo "========================================"
    echo "       PLAYFIND — MOBILE DEV"
    echo "========================================"

    if ! command -v adb >/dev/null 2>&1 && ! command -v adb.exe >/dev/null 2>&1; then
      echo "ERRO: ADB não encontrado no PATH."
      exit 1
    fi

    # Iniciar adb server se necessário
    adb start-server >/dev/null 2>&1 || true

    # Detectar dispositivo conectado
    DEVICE_ID=$(adb devices | awk '$2=="device"{print $1; exit}')
    if [ -z "$DEVICE_ID" ]; then
      echo ""
      echo "ERRO: Nenhum dispositivo Android conectado ou autorizado via ADB."
      echo "Dispositivos detectados:"
      adb devices
      exit 1
    fi

    echo "[PlayFind] Dispositivo detectado: $DEVICE_ID"

    # Subir backend
    start_backend_if_needed

    # Configurar adb reverse para o celular acessar a API local do PC
    echo "[PlayFind] Configurando adb reverse tcp:$API_PORT tcp:$API_PORT..."
    adb -s "$DEVICE_ID" reverse "tcp:$API_PORT" "tcp:$API_PORT"

    echo "[PlayFind] Iniciando Flutter no dispositivo $DEVICE_ID..."
    cd "$ROOT"
    flutter.bat run -d "$DEVICE_ID"
    ;;

  *)
    echo "ERRO: Modo desconhecido '$MODE'."
    echo "Uso: ./dev.sh [edge|mobile]"
    exit 1
    ;;
esac
