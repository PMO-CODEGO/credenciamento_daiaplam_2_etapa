from datetime import datetime

from pydantic import BaseModel

from app.schemas.documentos import DocumentoOut


class CienciaIn(BaseModel):
    resposta: str  # "aceito" ou "recuso"


class MceEstado(BaseModel):
    dados: dict | None  # MCE salvo pelo formulário
    atualizado_em: datetime | None
    sugestao: dict | None  # valores iniciais, vindos da solicitação
    arquivos: list[DocumentoOut]  # MCE próprio, enviado em arquivo
    max_arquivos: int
    max_mb: int
    ciencia: str | None  # "aceito", "recuso" ou None (ainda não respondeu)
    ciencia_em: datetime | None
    concluido: bool  # tem MCE (formulário ou arquivo) e a ciência foi aceita
