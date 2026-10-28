from datetime import datetime

from pydantic import BaseModel


class CienciaAnexoIn(BaseModel):
    ciente: bool


class CienciaAnexoOut(BaseModel):
    anexo: str
    titulo: str
    rotulo: str
    ciente_em: datetime | None


class CienciasOut(BaseModel):
    anexos: list[CienciaAnexoOut]
