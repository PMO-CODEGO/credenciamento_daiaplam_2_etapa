# Publicação do Credenciamento DIANOT na VM da CODEGO

Guia para colocar o sistema no ar na **mesma máquina virtual do Sistema Cadastral**
(Windows, IP interno `192.168.0.245`), primeiro na rede interna e depois com
domínio próprio e https.

## Como fica

```
Internet ──https──▶ 177.107.60.124 (IP público da CODEGO)
                          │  roteador/firewall encaminha 80 e 443 (já feito para o Cadastral)
                          ▼
                    VM 192.168.0.245
                    └─ Caddy do Sistema Cadastral (portas 80/443, https automático)
                         ├─ sistemacadastral.codego.com.br → Sistema Cadastral
                         └─ <subdomínio do credenciamento>  → porta 8081 ─┐
                                                                         ▼
                    Credenciamento (deploy/docker-compose.prod.yml)
                         ├─ backend (FastAPI): site + /api, porta 8081
                         └─ db (MySQL próprio, separado do Cadastral)
```

- Os dois sistemas ficam na mesma VM, mas **separados**: cada um tem seu banco,
  seus arquivos e seus containers. Atualizar ou reiniciar um não mexe no outro.
- As portas 80/443 da VM são do Caddy do Sistema Cadastral (só um programa pode
  usá-las). Por isso o credenciamento **não tem Caddy próprio**: o backend
  serve o site e a API na porta **8081**, e o Caddy do Cadastral encaminha o
  subdomínio do credenciamento para ela (passo 6).
- Enquanto o subdomínio não existe, o sistema funciona na rede interna em
  `http://192.168.0.245:8081`.
- O banco não fica acessível de fora da VM.

Arquivos desta pasta:

| Arquivo | Para quê |
|---|---|
| `docker-compose.prod.yml` | Serviços de produção: banco e backend |
| `subir.ps1` | Sobe ou atualiza o sistema |
| `backup.ps1` | Backup do banco e dos documentos enviados |
| `credenciamento.caddy` | Site do credenciamento para o Caddy do Cadastral (passo 6) |

---

## 1. Pedir ao TI

Texto pronto para enviar:

> Para publicar o Credenciamento DIANOT na VM **192.168.0.245** (a mesma do
> Sistema Cadastral), precisamos:
>
> 1. Liberar a porta **8081 (TCP)** no firewall do Windows da VM, **só para a
>    rede interna** — é por ela que o sistema é testado antes do domínio.
> 2. Criar um subdomínio para o sistema (ex.: **`credenciamento.codego.com.br`**),
>    registro DNS do tipo A apontando para **177.107.60.124**.
>
> As portas 80 e 443 já estão encaminhadas para a VM por causa do Sistema
> Cadastral; não precisa abrir nada novo para fora.

O item 2 pode vir depois: o passo 5 (teste na rede interna) não depende dele.

---

## 2. Preparar a VM

A VM já tem Git, WSL 2 e Docker Desktop instalados para o Sistema Cadastral
(ver `deploy/README.md` daquele projeto). Conferir no PowerShell:

```powershell
git --version; docker --version; docker compose version
```

Os avisos de lá valem aqui: o Docker Desktop só roda com um usuário logado
(ao sair da Área de Trabalho Remota, **desconecte** em vez de fazer logoff).

---

## 3. Instalar o sistema

No PowerShell da VM:

```powershell
cd C:\
git clone https://github.com/PMO-CODEGO/credenciamento_dianot_2_etapa.git
cd C:\credenciamento_dianot_2_etapa
copy .env.example .env
notepad .env
```

Preencha o `.env` com os valores de **produção**:

| Variável | Valor |
|---|---|
| `APP_ENV` | `production` |
| `APP_SECRET_KEY` | senha **nova e forte**, com pelo menos 32 caracteres (o sistema não sobe sem isso em produção) |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | senhas **novas e fortes** (não reutilizar as do Cadastral nem as de desenvolvimento) |
| `MYSQL_HOST` | `db` |
| `MYSQL_SSL` | `false` (o banco é o da própria VM) |
| `CORS_ORIGINS` | `*` (em produção, isso quer dizer "só o próprio site") |
| `RECAPTCHA_ENABLED`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | `false` e vazio no teste interno; ver passo 7 |
| `PORTA_HTTP` | não precisa: o padrão é `8081`. Só mude se essa porta já estiver em uso na VM |

`SERVIR_FRONTEND` e `MYSQL_HOST` já são definidos pelo `docker-compose.prod.yml`.

Para gerar uma senha forte (rodar uma vez para cada senha):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

> O `.env` tem senhas: nunca enviar para o GitHub (ele já está no
> `.gitignore`) nem por e-mail/WhatsApp.

---

## 4. Subir o sistema

```powershell
.\deploy\subir.ps1
```

Na primeira vez demora alguns minutos (baixa as imagens e monta o backend).
No final aparecem os serviços `db` e `backend` como `Up`.

> Se o PowerShell bloquear o script ("execução de scripts foi desabilitada"),
> rode antes, na mesma janela:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

## 5. Testar na rede interna (sem domínio)

1. Na própria VM, abrir <http://localhost:8081>.
2. De outro computador da CODEGO, abrir <http://192.168.0.245:8081>.
3. <http://192.168.0.245:8081/health/banco> deve responder `{"status":"ok","banco":"ok"}`.

Teste o ciclo completo: cadastro (anote a senha gerada), login, formulário,
envio de documentos, incisos XI/XII/XIII, declarações e envio final com o
comprovante em PDF.

> **CNAEs:** o banco começa com a tabela de CNAEs de exemplo
> (`backend/app/data/cnaes.csv`). Antes de abrir para as empresas, carregue a
> Tabela de CNAEs do Anexo X.

---

## 6. Ativar o domínio e o https (depois do TI)

O https é feito pelo Caddy do **Sistema Cadastral**, que já está na VM.

1. Confirmar que o DNS já responde com o IP público:
   ```powershell
   Resolve-DnsName credenciamento.codego.com.br
   ```
2. O Caddyfile do Cadastral precisa importar os sites extras da pasta
   `deploy\sites\` (mudança feita uma vez no repositório do Sistema Cadastral:
   uma linha `import /etc/caddy/sites/*.caddy` no Caddyfile e a pasta montada
   no serviço `caddy` do `docker-compose.prod.yml` dele).
3. Copiar o site do credenciamento para lá e ajustar o domínio:
   ```powershell
   New-Item -ItemType Directory -Force C:\sistema_cadastral_codego\deploy\sites | Out-Null
   copy C:\credenciamento_dianot_2_etapa\deploy\credenciamento.caddy C:\sistema_cadastral_codego\deploy\sites\
   notepad C:\sistema_cadastral_codego\deploy\sites\credenciamento.caddy
   ```
   Troque `credenciamento.codego.com.br` pelo subdomínio criado (se for outro).
4. Aplicar no Cadastral (recria só o Caddy dele; o Cadastral continua no ar):
   ```powershell
   cd C:\sistema_cadastral_codego
   .\deploy\subir.ps1
   ```
5. Abrir o subdomínio com https — de preferência de fora da rede da CODEGO
   (ex.: celular no 4G).

O Caddy obtém o certificado sozinho no primeiro acesso. Se não funcionar, veja
os logs do Caddy **do Cadastral** (passo 10 do guia dele): os erros mais comuns
são o DNS ainda não propagado ou o domínio digitado errado no
`credenciamento.caddy`.

---

## 7. reCAPTCHA

Em <https://www.google.com/recaptcha/admin>, com uma conta da CODEGO:

1. Criar (ou usar) uma chave **reCAPTCHA v2 "Não sou um robô"** e adicionar o
   subdomínio do credenciamento à lista de domínios.
2. No `.env`:
   ```
   RECAPTCHA_ENABLED=true
   RECAPTCHA_SITE_KEY=<chave do site>
   RECAPTCHA_SECRET_KEY=<chave secreta>
   ```
3. Rodar `.\deploy\subir.ps1`.

Com o reCAPTCHA ligado e as chaves vazias ou erradas, **ninguém consegue fazer
login nem se cadastrar**. No teste por IP (passo 5), deixe desligado: a chave
não reconhece o endereço `192.168.0.245`.

---

## 8. Atualizar o sistema

Quando houver mudanças no GitHub:

```powershell
cd C:\credenciamento_dianot_2_etapa
.\deploy\backup.ps1
git pull
.\deploy\subir.ps1
```

- O site e o backend ficam dentro da imagem: **tudo** só vale depois do `subir.ps1`.
- Tabelas e colunas novas são criadas sozinhas quando o backend inicia
  (`backend/app/services/migracoes.py`). Mudanças de outro tipo nas tabelas
  existentes precisam ser aplicadas à mão. **Faça o backup antes.**

---

## 9. Backup

```powershell
.\deploy\backup.ps1
```

Cria `C:\backups\credenciamento-dianot\<data>\` com:
- `banco.sql` — o banco inteiro;
- `arquivos.tgz` — os documentos enviados pelas empresas.

Backups com mais de 30 dias são apagados (`-ManterDias` muda isso;
`-Destino` muda a pasta).

**Agendar todo dia às 2h30** (PowerShell como administrador; meia hora depois
do backup do Cadastral, para não rodarem juntos):

```powershell
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\credenciamento_dianot_2_etapa\deploy\backup.ps1'
$quando = New-ScheduledTaskTrigger -Daily -At 2:30am
Register-ScheduledTask -TaskName 'Backup Credenciamento DIANOT' -Action $acao -Trigger $quando -User $env:USERNAME -RunLevel Highest
```

> Backup na mesma VM não protege contra perda da VM. Use `-Destino
> \\servidor\pasta` (pasta de rede pedida ao TI) ou copie a pasta de backups
> para outro lugar.

**Restaurar** (substitui os dados atuais):

```powershell
$compose = @('compose','-f','deploy\docker-compose.prod.yml','--env-file','.env')
$pasta = 'C:\backups\credenciamento-dianot\<data>'
# banco
docker cp "$pasta\banco.sql" "$(docker @compose ps -q db):/tmp/banco.sql"
docker @compose exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/banco.sql'
# arquivos
docker cp "$pasta\arquivos.tgz" "$(docker @compose ps -q backend):/tmp/arquivos.tgz"
docker @compose exec -T backend tar xzf /tmp/arquivos.tgz -C /app
```

---

## 10. Comandos úteis

Na pasta `C:\credenciamento_dianot_2_etapa`:

```powershell
$compose = @('compose','-f','deploy\docker-compose.prod.yml','--env-file','.env')

docker @compose ps                             # situação dos serviços
docker @compose logs -f --tail 100 backend     # logs do backend (Ctrl+C sai)
docker @compose restart backend                # reiniciar o backend
docker @compose down                           # parar tudo (os dados continuam salvos)
```

> Nunca use `down -v`: o `-v` **apaga** o banco e os documentos.

---

## 11. Checklist de publicação

- [ ] TI: porta 8081 liberada na rede interna; subdomínio criado
- [ ] `.env` de produção com senhas novas e `APP_ENV=production`
- [ ] Teste completo na rede interna (`http://192.168.0.245:8081`)
- [ ] Tabela de CNAEs do Anexo X carregada
- [ ] Site do credenciamento no Caddy do Cadastral; https funcionando de fora da rede
- [ ] reCAPTCHA com o subdomínio adicionado e `RECAPTCHA_ENABLED=true`
- [ ] Backup agendado e copiado para fora da VM
- [ ] Restauração de um backup testada pelo menos uma vez
