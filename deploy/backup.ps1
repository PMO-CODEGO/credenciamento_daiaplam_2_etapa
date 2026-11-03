# Backup do Credenciamento DAIAPLAM: banco de dados + documentos enviados.
# Uso:  .\deploy\backup.ps1 [-Destino C:\backups\credenciamento-daiaplam] [-ManterDias 30]
# Cria uma pasta por data com banco.sql e arquivos.tgz e apaga as pastas de
# backup com mais de -ManterDias dias. Agendamento diário: ver deploy\README.md.
#
# Importante: um backup na mesma VM não protege contra perda da VM. Copie a
# pasta de destino para outro lugar (compartilhamento de rede, outro servidor).

param(
    [string]$Destino = 'C:\backups\credenciamento-daiaplam',
    [int]$ManterDias = 30
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$compose = @('compose', '-f', (Join-Path $PSScriptRoot 'docker-compose.prod.yml'), '--env-file', (Join-Path $raiz '.env'))

$pasta = Join-Path $Destino (Get-Date -Format 'yyyy-MM-dd_HHmm')
New-Item -ItemType Directory -Force $pasta | Out-Null

function Exec-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Falhou: docker $($args -join ' ')" }
}

# 1) Banco: o dump é gerado dentro do container e copiado para fora
#    (evita o PowerShell mexer na codificação do arquivo).
$db = (& docker @compose ps -q db).Trim()
Exec-Docker @compose exec -T db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --no-tablespaces "$MYSQL_DATABASE" > /tmp/banco.sql'
Exec-Docker cp "${db}:/tmp/banco.sql" (Join-Path $pasta 'banco.sql')
Exec-Docker @compose exec -T db rm -f /tmp/banco.sql

# 2) Arquivos: documentos enviados pelas empresas.
$backend = (& docker @compose ps -q backend).Trim()
Exec-Docker @compose exec -T backend tar czf /tmp/arquivos.tgz -C /app storage
Exec-Docker cp "${backend}:/tmp/arquivos.tgz" (Join-Path $pasta 'arquivos.tgz')
Exec-Docker @compose exec -T backend rm -f /tmp/arquivos.tgz

# 3) Remove backups antigos.
Get-ChildItem $Destino -Directory |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$ManterDias) } |
    Remove-Item -Recurse -Force

Write-Host "Backup concluído em $pasta"
