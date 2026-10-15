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

## Autenticação
- `POST /api/auth/cadastro` (CNPJ validado, e-mail, senha) · `POST /api/auth/login` · `GET /api/auth/me`
- Login = CNPJ; senha com bcrypt; sessão por JWT (`APP_SECRET_KEY`, `TOKEN_EXPIRA_MINUTOS`).
- reCAPTCHA nas duas telas (`RECAPTCHA_ENABLED`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`).
- Limite de tentativas: 5 logins errados/15 min por IP+CNPJ; 10 cadastros/hora por IP.

## Segurança
- `.env` nunca vai para o Git; em produção `APP_ENV=production` (docs fechadas) e `APP_SECRET_KEY` próprio.

## Convenção de branches
`main` (produção), `dev` (integração), `feature/*`.

## Roadmap
1. Base do projeto ✅
2. Tela de login (CNPJ + senha, reCAPTCHA) e cadastro de usuário ✅
3. Próximas telas do credenciamento
