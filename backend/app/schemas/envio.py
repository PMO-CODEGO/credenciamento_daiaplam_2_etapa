from datetime import datetime

from pydantic import BaseModel


class EnvioEstado(BaseModel):
    pendencias: list[str]  # o que falta para poder finalizar
    pode_finalizar: bool
    protocolo: str | None  # do último envio, se já houve
    enviado_em: datetime | None
