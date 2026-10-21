from datetime import datetime

from pydantic import BaseModel

from app.schemas.documentos import DocumentoOut


class CronogramaEstado(BaseModel):
    dados: dict | None  # cronograma salvo pelo formulário
    atualizado_em: datetime | None
    sugestao: dict | None  # campos que vêm da declaração do Inciso XII (sempre iguais a ela)
    declaracao_ok: bool  # a declaração já tem percentual de ocupação e período da obra
    desatualizado: bool  # o período da obra mudou depois que o cronograma foi salvo
    servicos_sugeridos: list[str]
    arquivos: list[DocumentoOut]  # cronograma próprio, enviado em arquivo
    max_arquivos: int
    max_mb: int
    max_meses: int
    concluido: bool
