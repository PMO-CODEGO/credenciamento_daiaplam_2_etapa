from datetime import datetime

from pydantic import BaseModel

from app.schemas.documentos import DocumentoOut


class EvtfEstado(BaseModel):
    dados: dict | None  # EVTF salvo pelo formulário
    atualizado_em: datetime | None
    sugestao: dict | None  # valores iniciais, vindos do cadastro e da solicitação
    arquivos: list[DocumentoOut]  # EVTF próprio assinado (PDF ou imagem)
    arquivos_excel: list[DocumentoOut]  # o mesmo EVTF em Excel editável
    max_arquivos: int
    max_mb: int
    concluido: bool  # preencheu o formulário, ou enviou o assinado e o Excel
