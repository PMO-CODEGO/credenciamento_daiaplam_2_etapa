import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine, wait_for_db

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)

# Espera o MySQL estar realmente pronto (evita crash na corrida de
# inicialização do container) e cria as tabelas caso ainda não existam
# (em produção, prefira gerenciar via Alembic/migrations)
wait_for_db()
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Credenciamento DIANOT 2ª etapa",
    description="API do Credenciamento DIANOT 2ª etapa (CODEGO).",
    version="0.1.0",
    # Documentação interativa (/docs) só fora de produção.
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None if settings.app_env == "production" else "/redoc",
    openapi_url=None if settings.app_env == "production" else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    # CORS_ORIGINS no .env: "*" (padrão) ou os endereços do site separados por
    # vírgula. Com o site e a API no mesmo endereço (deploy/ com Caddy), o CORS
    # nem é usado; só importa se o site ficar num endereço diferente da API.
    allow_origins=[origem.strip() for origem in settings.cors_origins.split(",") if origem.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# HEAD também: monitores como o UptimeRobot verificam com HEAD por padrão.
@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok"}


@app.api_route("/health/banco", methods=["GET", "HEAD"])
def health_check_banco():
    """
    Como o /health, mas também consulta o banco. Usado pelo monitor externo
    (UptimeRobot) que acessa o sistema a cada poucos minutos: mantém acordados
    o Render e o banco grátis do Aiven (que desligam sem uso) e avisa quando o
    banco cai. O healthCheckPath do Render continua sendo o /health, para uma
    queda do banco não fazer o Render reiniciar o serviço sem parar.
    """
    try:
        with engine.connect() as conexao:
            conexao.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — qualquer falha de conexão = banco fora do ar
        logging.getLogger("codego").exception("Banco de dados indisponível no /health/banco")
        return JSONResponse(status_code=503, content={"status": "erro", "banco": "indisponível"})
    return {"status": "ok", "banco": "ok"}


@app.get("/api/config")
def configuracao_publica():
    """Configurações que o site precisa saber (nada sigiloso)."""
    return {"recaptcha_enabled": settings.recaptcha_enabled}



# Rotas (autenticação etc.) entram nas próximas etapas.

# Site servido pelo próprio backend (SERVIR_FRONTEND=true, ex.: no Render). Fica
# por último para as rotas da API e o /health terem prioridade.
if settings.servir_frontend and os.path.isdir(settings.frontend_dir):
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
