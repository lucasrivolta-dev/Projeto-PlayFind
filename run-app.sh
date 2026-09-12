#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "== NextPlay: preparando ambiente =="

# Remove referências antigas a unidades temporárias usadas pelo Flutter.
rm -rf .dart_tool build

echo "== Baixando dependências Flutter =="
powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" pub get

echo "== Verificando backend =="
if curl.exe -s --max-time 2 "http://127.0.0.1:3333/health" >/dev/null 2>&1; then
  echo "Backend já está rodando em http://127.0.0.1:3333"
else
  echo "Backend não está rodando. Iniciando em segundo plano..."

  (
    cd "$ROOT/backend"
    pnpm.cmd run dev
  ) > "$ROOT/backend-dev.log" 2>&1 &

  BACKEND_PID=$!

  echo "Aguardando backend iniciar..."
  BACKEND_OK=0
  for i in {1..30}; do
    if curl.exe -s --max-time 2 "http://127.0.0.1:3333/health" >/dev/null 2>&1; then
      BACKEND_OK=1
      echo "Backend online."
      break
    fi

    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      echo "O backend encerrou antes de ficar disponível."
      echo "Veja o arquivo backend-dev.log para detalhes."
      exit 1
    fi

    sleep 1
  done

  if [ "$BACKEND_OK" -ne 1 ]; then
    echo "O backend não respondeu em até 30 segundos."
    echo "Veja o arquivo backend-dev.log para detalhes."
    exit 1
  fi
fi

echo "== Abrindo app no Edge =="
powershell.exe -ExecutionPolicy Bypass -File "./flutter.ps1" run -d edge
