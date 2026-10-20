import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine, wait_for_db
from app.models import orm  # noqa: F401 — registra as tabelas no create_all
from app.routers import auth, cronograma, documentos, envio, evtf, mce, solicitacao
from app.database import SessionLocal
from app.services.cnae import carga_inicial
from app.services import migracoes

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s - %(message)s",
)

# Espera o MySQL estar realmente pronto (evita crash na corrida de
# inicialização do container) e cria as tabelas caso ainda não existam
# (em produção, prefira gerenciar via Alembic/migrations)
wait_for_db()
Base.metadata.create_all(bind=engine)
migracoes.aplicar(engine)
with SessionLocal() as _db:
    carga_inicial(_db)

app = FastAPI(
    title="Credenciamento DIANOT 2ª etapa",
    description="API do Credenciamento DIANOT 2ª etapa (CODEGO).",
    version="0.1.0",
    # Documentação interativa (/docs) só fora de produção.
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None if settings.app_env == "production" else "/redoc",
    openapi_url=None if settings.app_env == "production" else "/openapi.json",
)

_origens = [origem.strip() for origem in settings.cors_origins.split(",") if origem.strip()]
if settings.app_env == "production" and "*" in _origens:
    # Produção sem lista de endereços: só o próprio site (mesmo endereço) fala com a API.
    # Se o site ficar em outro endereço, defina CORS_ORIGINS com ele.
    _origens = []
app.add_middleware(
    CORSMiddleware,
    # CORS_ORIGINS no .env: os endereços do site separados por vírgula ("*" só em desenvolvimento).
    # Com o site e a API no mesmo endereço, o CORS nem é usado. A sessão vai no cabeçalho
    # Authorization (não em cookie), então não precisa de allow_credentials.
    allow_origins=_origens,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Política de conteúdo: só scripts do próprio site (e do reCAPTCHA do Google), nada de objetos
# externos e ninguém pode embutir o site em outro (o iframe dos painéis é do mesmo site).
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://viacep.com.br",
    "frame-src 'self' blob: https://www.google.com",
    "object-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
])


@app.middleware("http")
async def cabecalhos_de_seguranca(request: Request, call_next):
    resposta = await call_next(request)
    resposta.headers.setdefault("Content-Security-Policy", _CSP)
    resposta.headers.setdefault("X-Content-Type-Options", "nosniff")
    resposta.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resposta.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resposta.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if settings.app_env == "production":
        resposta.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return resposta


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
    return {
        "recaptcha_enabled": settings.recaptcha_enabled,
        "recaptcha_site_key": settings.recaptcha_site_key if settings.recaptcha_enabled else "",
    }



app.include_router(auth.router, prefix="/api/auth", tags=["Autenticação"])
app.include_router(solicitacao.router, prefix="/api", tags=["Solicitação de área"])
app.include_router(documentos.router, prefix="/api", tags=["Documentos"])
app.include_router(cronograma.router, prefix="/api", tags=["Cronograma físico de obras"])
app.include_router(mce.router, prefix="/api", tags=["Memorial de caracterização (MCE)"])
app.include_router(evtf.router, prefix="/api", tags=["Viabilidade técnica e financeira (EVTF)"])
app.include_router(envio.router, prefix="/api", tags=["Envio final e comprovante"])

# Site servido pelo próprio backend (SERVIR_FRONTEND=true, ex.: no Render). Fica
# por último para as rotas da API e o /health terem prioridade.
class _SiteSemCache(StaticFiles):
    """
    O navegador sempre confere com o servidor antes de reusar um arquivo do site
    (no-cache + ETag: se não mudou, a resposta é um 304 sem conteúdo). Sem isso,
    depois de um deploy ele podia juntar o HTML novo com um JS antigo do cache.
    """

    async def get_response(self, path, scope):
        resposta = await super().get_response(path, scope)
        resposta.headers["Cache-Control"] = "no-cache"
        return resposta


if settings.servir_frontend and os.path.isdir(settings.frontend_dir):
    app.mount("/", _SiteSemCache(directory=settings.frontend_dir, html=True), name="frontend")
