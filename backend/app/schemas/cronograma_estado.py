from datetime import datetime

from pydantic import BaseModel

from app.schemas.documentos import DocumentoOut


class CronogramaEstado(BaseModel):
    dados: dict | None  # cronograma salvo pelo formulário
    atualizado_em: datetime | None
    sugestao: dict | None  # valores iniciais, vindos da solicitação e da declaração
    servicos_sugeridos: list[str]
    arquivos: list[DocumentoOut]  # cronograma próprio, enviado em arquivo
    max_arquivos: int
    max_mb: int
    max_meses: int
    concluido: bool
