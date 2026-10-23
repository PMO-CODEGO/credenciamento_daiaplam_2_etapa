# Credenciamento DIANOT — 2ª etapa (CODEGO)

Sistema de credenciamento (2ª etapa) da CODEGO, no mesmo estilo e formato do
[sistema_cadastral_codego](https://github.com/PMO-CODEGO/sistema_cadastral_codego).

## Stack
- Backend: FastAPI + SQLAlchemy (Python 3.12)
- Banco: MySQL 8.4 (`pymysql`)
- Frontend: HTML/CSS/JS estático (mesmo visual do Sistema Cadastral)
- reCAPTCHA v2 nas telas públicas
- Docker Compose (backend, db, frontend/nginx) e `render.yaml` para o Render

## Estrutura
```
backend/app/     config, database, main, models, routers, schemas, services (recaptcha)
frontend/        index.html, css/style.css, js/config.js, assets/
database/migrations/
docker/Dockerfile
docker-compose.yml, render.yaml, .env.example
```

## Setup local
```
cp .env.example .env        # (PowerShell: Copy-Item .env.example .env)
docker compose up --build
```
- Site: http://localhost:8080 · API: http://localhost:8000/health · Docs: http://localhost:8000/docs (só fora de produção)

## Publicação na VM da CODEGO
Na VM `192.168.0.245` (junto com o asent-jur), com banco e containers próprios, porta 8081 na rede
interna; para fora, https pelo nginx da VM quando o TI publicar um subdomínio. Passo a passo em
[deploy/README.md](deploy/README.md) (`deploy/subir.ps1` sobe/atualiza, `deploy/backup.ps1` faz o backup).

## Equipe da CODEGO
Tela `/equipe.html` (login próprio, só leitura) para acompanhar os credenciamentos: todas as empresas com a situação,
dados, documentos, PDFs dos incisos e comprovantes. Usuários criados com `python -m app.scripts.equipe` (ver deploy/README.md).

## Autenticação
- `POST /api/auth/cadastro` (CNPJ validado, e-mail, senha) · `POST /api/auth/login` · `GET /api/auth/me`
- Login = CNPJ; senha com bcrypt; sessão por JWT (`APP_SECRET_KEY`, `TOKEN_EXPIRA_MINUTOS`).
- reCAPTCHA nas duas telas (`RECAPTCHA_ENABLED`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`).
- Limite de tentativas: 5 logins errados/15 min por IP+CNPJ; 10 cadastros/hora por IP.

## Formulário de solicitação de área (tela após o login)
- `frontend/home.html` + `js/solicitacao.js`: Anexos I (mapa) e II (lista de documentos) em painéis com imagem e PDF (`frontend/assets/anexo-i-*`, `anexo-ii-*`), área em m² (2 casas), dados da empresa, do administrador e CNAE.
- `GET /api/cnae/{codigo}`, `GET /api/cnae?q=` · `GET/PUT /api/solicitacoes/minha` (uma solicitação por empresa, editável).
- CNAE validado contra a tabela `cnaes`, que é sincronizada a cada início com `backend/app/data/cnaes.csv` (formato `codigo;descricao;setor_ocde;pontuacao`): as 433 subclasses da Tabela de CNAEs do Anexo X. Quando o Anexo X lista uma classe inteira, entram todas as subclasses dela.

## Segurança
- LGPD: Aviso de Privacidade em `frontend/privacidade.html` (link no rodapé das telas); a empresa declara ciência no cadastro (`usuarios.privacidade_ciente_em`). O texto deve ser revisado pelo jurídico/encarregado de dados da CODEGO.
- `.env` nunca vai para o Git; em produção `APP_ENV=production` (docs fechadas) e `APP_SECRET_KEY` próprio.

## Convenção de branches
`main` (produção), `dev` (integração), `feature/*`.

## Roadmap
1. Base do projeto ✅
2. Tela de login (CNPJ + senha, reCAPTCHA) e cadastro de usuário ✅
3. Formulário de solicitação de área (Anexo IV) ✅
4. Próximas telas (envio de documentos)
