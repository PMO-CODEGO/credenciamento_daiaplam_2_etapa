# Publicação do Credenciamento DIANOT na VM da CODEGO

Guia para colocar o sistema no ar na máquina virtual Windows da CODEGO
(`CODEGO000001`, IP interno `192.168.0.245`): primeiro na rede interna e
depois, com o TI, para fora (domínio e https).

## Como está a VM

```
VM 192.168.0.245
├─ asent-jur (C:\Users\joao.siviero\asent-jur\projeto)
│    └─ nginx_codego nas portas 80/443 — certificado interno assentjur.codego.local
└─ Credenciamento (C:\credenciamento_dianot_2_etapa, deploy/docker-compose.prod.yml)
     ├─ backend (FastAPI): site + /api na porta 8081
     └─ db (MySQL próprio, separado do asent-jur)
```

- Os sistemas ficam na mesma VM, mas **separados**: cada um tem seu banco, seus
  arquivos e seus containers. Atualizar ou reiniciar um não mexe no outro.
- As portas 80/443 são do nginx do asent-jur. Por isso o credenciamento não
  tem proxy próprio: o backend serve o site e a API na porta **8081**
  (`PORTA_HTTP` no `.env`).
- Na rede interna o sistema fica em **`http://192.168.0.245:8081`**.
- O banco não fica acessível de fora da VM.

Arquivos desta pasta:

| Arquivo | Para quê |
|---|---|
| `docker-compose.prod.yml` | Serviços de produção: banco e backend |
| `subir.ps1` | Sobe ou atualiza o sistema |
| `backup.ps1` | Backup do banco e dos documentos enviados |
| `nginx-credenciamento.conf` | Bloco para o nginx do asent-jur, quando houver domínio público (passo 7) |

> **Rode os scripts dentro da sessão logada da VM** (Área de Trabalho Remota).
> Por SSH o Docker Desktop não consegue usar o gerenciador de credenciais do
> Windows e o `subir.ps1` falha ao baixar as imagens ("A sessão de logon
> especificada não existe"). Comandos de leitura (`docker ps`, logs) funcionam
> por SSH normalmente.

---

## 1. O que já está pronto na VM

Feito em 21/10/2026:

- Repositório clonado em `C:\credenciamento_dianot_2_etapa`.
- Acesso de leitura ao GitHub por uma chave só deste repositório
  (`~\.ssh\credenciamento_deploy`, apelido `github-credenciamento` no
  `~\.ssh\config`; cadastrada como *deploy key* somente leitura). O
  `git pull` usa essa chave sozinho.
- `.env` de produção com senhas geradas na própria VM (`APP_ENV=production`,
  reCAPTCHA desligado para o teste interno).

Para instalar do zero em outra máquina, ver o passo 9.

---

## 2. Subir o sistema

No PowerShell da VM (Área de Trabalho Remota):

```powershell
cd C:\credenciamento_dianot_2_etapa
.\deploy\subir.ps1
```

Na primeira vez demora alguns minutos (baixa as imagens e monta o backend).
No final aparecem os serviços `db` e `backend` como `Up`.

> Se o PowerShell bloquear o script ("execução de scripts foi desabilitada"),
> rode antes, na mesma janela:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

## 3. Testar na rede interna

1. Na própria VM: <http://localhost:8081>.
2. De outro computador da CODEGO: <http://192.168.0.245:8081>. Se não abrir, o
   firewall do Windows da VM está bloqueando a porta: pedir ao TI para liberar
   a **8081 (TCP) só para a rede interna**.
3. <http://192.168.0.245:8081/health/banco> deve responder `{"status":"ok","banco":"ok"}`.

Teste o ciclo completo: cadastro (anote a senha gerada), login, formulário,
envio de documentos, incisos XI/XII/XIII, declarações e envio final com o
comprovante em PDF.

> **CNAEs:** o banco começa com a tabela de CNAEs de exemplo
> (`backend/app/data/cnaes.csv`). Antes de abrir para as empresas, carregue a
> Tabela de CNAEs do Anexo X.

---

## 4. Atualizar o sistema

Quando houver mudanças no GitHub (na VM, Área de Trabalho Remota):

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

## 5. Backup

```powershell
.\deploy\backup.ps1
```

Cria `C:\backups\credenciamento-dianot\<data>\` com:
- `banco.sql` — o banco inteiro;
- `arquivos.tgz` — os documentos enviados pelas empresas.

Backups com mais de 30 dias são apagados (`-ManterDias` muda isso;
`-Destino` muda a pasta).

**Agendar todo dia às 2h30** (PowerShell como administrador):

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

## 6. Comandos úteis

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

## 7. Abrir para fora da CODEGO (domínio e https)

As empresas acessam de fora da rede da CODEGO, então o sistema precisa de um
endereço público com https. Hoje a VM **não está publicada para a internet**: o
nginx do asent-jur usa um certificado interno (`assentjur.codego.local`).

Texto pronto para o TI:

> Para publicar o Credenciamento DIANOT, que está na VM **192.168.0.245**
> (porta interna 8081), precisamos:
>
> 1. Um subdomínio (ex.: **`credenciamento.codego.com.br`**) com registro DNS
>    apontando para o IP público da CODEGO.
> 2. Encaminhar as portas **80 e 443 (TCP)** desse IP público para a VM
>    **192.168.0.245** e liberá-las no firewall.
> 3. Um **certificado https válido** para o subdomínio (da CODEGO, um coringa
>    `*.codego.com.br`, ou Let's Encrypt — que exige a porta 80 aberta).

Com isso pronto, o credenciamento entra no nginx que já ocupa as portas 80/443
(o do asent-jur), como um site a mais, sem mexer no asent-jur:

1. Copiar o certificado e a chave para
   `C:\Users\joao.siviero\asent-jur\projeto\nginx\certs\` como
   `credenciamento.crt` e `credenciamento.key`.
2. Colar o conteúdo de `deploy/nginx-credenciamento.conf` dentro do bloco
   `http { ... }` do `C:\Users\joao.siviero\asent-jur\projeto\nginx\nginx.conf`
   (antes do `server` de `listen 443` do asent-jur) e ajustar o domínio.
3. Conferir e recarregar o nginx (não derruba o asent-jur):
   ```powershell
   docker exec nginx_codego nginx -t
   docker exec nginx_codego nginx -s reload
   ```
4. Abrir o subdomínio com https — de preferência de fora da rede (ex.: celular no 4G).
5. Ligar o reCAPTCHA (passo 8).

> O `nginx.conf` é do projeto asent-jur: combine a mudança com quem cuida dele,
> e registre-a no repositório do asent-jur para não se perder numa atualização.

---

## 8. reCAPTCHA

Em <https://www.google.com/recaptcha/admin>, com uma conta da CODEGO:

1. Criar (ou usar) uma chave **reCAPTCHA v2 "Não sou um robô"** e adicionar o
   subdomínio do credenciamento à lista de domínios.
2. No `.env` da VM:
   ```
   RECAPTCHA_ENABLED=true
   RECAPTCHA_SITE_KEY=<chave do site>
   RECAPTCHA_SECRET_KEY=<chave secreta>
   ```
3. Rodar `.\deploy\subir.ps1`.

Com o reCAPTCHA ligado e as chaves vazias ou erradas, **ninguém consegue fazer
login nem se cadastrar**. No acesso por IP (passo 3), deixe desligado: a chave
não reconhece o endereço `192.168.0.245`.

---

## 9. Instalar do zero (outra máquina)

1. Git, WSL 2 e Docker Desktop instalados (Docker Desktop iniciando com o
   login do Windows; ele só roda com um usuário logado).
2. Acesso de leitura ao repositório (privado): uma *deploy key* como a do passo 1.
3. ```powershell
   cd C:\
   git clone git@github-credenciamento:PMO-CODEGO/credenciamento_dianot_2_etapa.git
   cd C:\credenciamento_dianot_2_etapa
   copy .env.example .env
   notepad .env
   ```
4. No `.env`: `APP_ENV=production`; `APP_SECRET_KEY` (32+ caracteres),
   `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD` com senhas **novas e fortes**;
   `MYSQL_HOST=db`; `MYSQL_SSL=false`; `CORS_ORIGINS=*`. Para gerar uma senha:
   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
   ```
5. `.\deploy\subir.ps1` e testar (passo 3).

> O `.env` tem senhas: nunca enviar para o GitHub (ele já está no
> `.gitignore`) nem por e-mail/WhatsApp.

---

## 10. Checklist de publicação

- [x] Código, chave de leitura do GitHub e `.env` de produção na VM
- [x] Sistema no ar e teste completo na rede interna (`http://192.168.0.245:8081`) — 21/10/2026
- [x] Porta 8081 acessível de outros computadores da rede interna
- [ ] Tabela de CNAEs do Anexo X carregada
- [ ] TI: subdomínio, portas 80/443 encaminhadas e certificado válido
- [ ] Bloco do credenciamento no nginx; https funcionando de fora da rede
- [ ] reCAPTCHA com o subdomínio adicionado e `RECAPTCHA_ENABLED=true`
- [ ] Backup agendado e copiado para fora da VM
- [ ] Restauração de um backup testada pelo menos uma vez
