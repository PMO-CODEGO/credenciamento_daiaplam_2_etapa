from datetime import datetime

from pydantic import BaseModel


class ItemChecklist(BaseModel):
    rotulo: str
    feito: bool
    obrigatorio: bool
    detalhe: str | None = None


class EnvioIn(BaseModel):
    li_e_concordo: bool = False  # "Li e Concordo" da declaração final de responsabilidade


class EnvioEstado(BaseModel):
    checklist: list[ItemChecklist]  # tudo o que a empresa precisa fazer, na ordem do formulário
    pendencias: list[str]  # o que falta para poder finalizar
    pode_finalizar: bool
    protocolo: str | None  # do último envio, se já houve
    enviado_em: datetime | None
