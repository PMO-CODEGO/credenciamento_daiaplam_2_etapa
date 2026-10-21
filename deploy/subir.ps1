# Sobe (ou atualiza) o Credenciamento DIANOT na VM.
# Uso, na pasta do projeto:  .\deploy\subir.ps1
# Depois de um "git pull", rodar de novo: o site e o backend ficam dentro da
# imagem, então só valem depois que ela é montada de novo (--build).

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$envArquivo = Join-Path $raiz '.env'

if (-not (Test-Path $envArquivo)) {
    Write-Host "Arquivo .env não encontrado em $raiz. Copie o .env.example para .env e preencha (ver deploy\README.md)." -ForegroundColor Red
    exit 1
}

docker compose -f (Join-Path $PSScriptRoot 'docker-compose.prod.yml') --env-file $envArquivo up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
docker compose -f (Join-Path $PSScriptRoot 'docker-compose.prod.yml') --env-file $envArquivo ps
