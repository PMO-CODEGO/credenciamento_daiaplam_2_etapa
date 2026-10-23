from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: str
    nome_original: str
    content_type: str
    tamanho: int
    data_envio: datetime | None = None


class TipoDocumentoOut(BaseModel):
    tipo: str
    rotulo: str
    obrigatorio: bool
    arquivos: list[DocumentoOut]


class DocumentosOut(BaseModel):
    tipos: list[TipoDocumentoOut]
    complementar: TipoDocumentoOut  # documentação complementar (opcional)
    max_arquivos_por_tipo: int
    max_arquivos_complementar: int
    max_mb: int
