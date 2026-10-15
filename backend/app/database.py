import os
import tempfile
import time

from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings


def _argumentos_conexao() -> dict:
    """
    Conexão criptografada (SSL) com o MySQL, para bancos gerenciados fora da
    máquina (ex.: Aiven, que exige SSL). Com MYSQL_SSL_CA (conteúdo do
    certificado CA em PEM) o certificado do servidor também é verificado.
    """
    if not settings.mysql_ssl:
        return {}
    ca = settings.mysql_ssl_ca.strip().replace("\\n", "\n")
    if not ca:
        return {"ssl": {"check_hostname": False}}
    caminho_ca = os.path.join(tempfile.gettempdir(), "mysql-ca.pem")
    with open(caminho_ca, "w", encoding="utf-8") as f:
        f.write(ca + "\n")
    return {"ssl": {"ca": caminho_ca}}


engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=280, connect_args=_argumentos_conexao())


@event.listens_for(engine, "connect")
def _usar_horario_de_brasilia(conexao, _registro):
    """
    Datas gravadas pelo próprio banco (data_geracao, data_criacao, data_envio)
    no horário de Brasília, igual ao backend (TZ no Dockerfile). Bancos
    gerenciados (ex.: Aiven) usam UTC por padrão. O Brasil não tem horário de
    verão desde 2019, então o deslocamento fixo -03:00 vale o ano todo.
    """
    cursor = conexao.cursor()
    cursor.execute("SET time_zone = '-03:00'")
    cursor.close()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wait_for_db(max_retries: int = 30, delay_seconds: float = 2.0) -> None:
    """
    Espera o MySQL ficar pronto para conexões antes de seguir.

    Necessário porque, durante a inicialização, o container do MySQL sobe
    um servidor temporário (só para rodar os scripts de schema em
    /docker-entrypoint-initdb.d) que responde normalmente ao healthcheck
    do Docker e depois se desliga para iniciar o servidor definitivo.
    Nesse intervalo, uma tentativa de conexão no momento errado falha
    mesmo com o container já marcado como "healthy".
    """
    ultimo_erro: Exception | None = None
    for tentativa in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as erro:
            ultimo_erro = erro
            time.sleep(delay_seconds)

    raise RuntimeError(
        f"Não foi possível conectar ao banco de dados após {max_retries} tentativas."
    ) from ultimo_erro
