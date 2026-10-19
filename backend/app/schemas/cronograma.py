"""Inciso XII — Cronograma Físico de Obras (CFO): dados do formulário."""
import re

from pydantic import BaseModel, ValidationInfo, field_validator, model_validator

from app.schemas.validacoes import formatar_numero_br, mes_atual, numero_br, regerando_pdf

# Serviços do modelo do cronograma: sugestão inicial; a empresa pode remover/adicionar.
SERVICOS_SUGERIDOS = [
    "Serviços preliminares",
    "Infraestrutura",
    "Paredes e Painéis",
    "Cobertura",
    "Pavimentação",
]

# A declaração de compromisso limita a obra a 2 anos (mês de início e de fim contados).
MAX_MESES = 24

_MES_ANO_RE = re.compile(r"^(\d{4})-(\d{2})$")


def _parse_mes_ano(v: str) -> tuple[int, int]:
    match = _MES_ANO_RE.match(v or "")
    if not match:
        raise ValueError("Use o formato AAAA-MM.")
    ano, mes = int(match.group(1)), int(match.group(2))
    if not 1 <= mes <= 12:
        raise ValueError("Mês inválido.")
    return ano, mes


def total_meses(inicio: str, termino: str) -> int:
    """Meses do cronograma, contando o mês de início e o de término."""
    ano_i, mes_i = _parse_mes_ano(inicio)
    ano_t, mes_t = _parse_mes_ano(termino)
    return (ano_t - ano_i) * 12 + (mes_t - mes_i) + 1


class ServicoCronograma(BaseModel):
    descricao: str
    percentuais: list[float]  # um por mês da obra; mês sem execução = 0

    @field_validator("descricao")
    @classmethod
    def _descricao(cls, v: str):
        v = " ".join((v or "").split())
        if not v:
            raise ValueError("Informe a descrição de cada serviço do cronograma.")
        if len(v) > 120:
            raise ValueError("A descrição do serviço pode ter até 120 caracteres.")
        return v

    @field_validator("percentuais")
    @classmethod
    def _percentuais(cls, v: list[float]):
        if any(p < 0 or p > 100 for p in v):
            raise ValueError("Cada percentual mensal deve estar entre 0% e 100%.")
        return v


class CronogramaIn(BaseModel):
    nome_empresa: str
    endereco: str
    area_empresa: str
    area_construida: str
    inicio_obras: str  # AAAA-MM
    termino_obras: str  # AAAA-MM
    servicos: list[ServicoCronograma]

    @field_validator("nome_empresa", "endereco")
    @classmethod
    def _texto(cls, v: str, info):
        v = " ".join((v or "").split())
        if not v:
            raise ValueError(f"O campo '{info.field_name}' é obrigatório.")
        if len(v) > 500:
            raise ValueError(f"O campo '{info.field_name}' é grande demais.")
        return v

    @field_validator("area_empresa", "area_construida")
    @classmethod
    def _area(cls, v: str, info):
        rotulo = "Área da Empresa" if info.field_name == "area_empresa" else "Área a ser Construída"
        try:
            valor = numero_br(v)
        except ValueError as exc:
            raise ValueError(f"{rotulo}: {exc}") from exc
        if valor <= 0:
            raise ValueError(f"{rotulo} deve ser maior que zero.")
        return formatar_numero_br(valor)

    @model_validator(mode="after")
    def _areas(self):
        if numero_br(self.area_construida) > numero_br(self.area_empresa):
            raise ValueError("A área a ser construída não pode ser maior que a área da empresa.")
        return self

    @field_validator("inicio_obras", "termino_obras")
    @classmethod
    def _mes(cls, v: str, info):
        try:
            _parse_mes_ano(v)
        except ValueError as exc:
            raise ValueError(f"Campo '{info.field_name}': {exc}") from exc
        return v

    @field_validator("servicos")
    @classmethod
    def _servicos(cls, v):
        if not v:
            raise ValueError("Informe ao menos um serviço no cronograma.")
        if len(v) > 30:
            raise ValueError("O cronograma pode ter no máximo 30 serviços.")
        return v

    @model_validator(mode="after")
    def _cronograma(self, info: ValidationInfo):
        # Ao recriar o PDF de um cronograma já salvo, o mês de início pode ter passado.
        if self.inicio_obras < mes_atual() and not regerando_pdf(info):
            raise ValueError("A previsão de início das obras não pode ser um mês que já passou.")
        meses = total_meses(self.inicio_obras, self.termino_obras)
        if meses < 1:
            raise ValueError("A previsão de término das obras deve ser igual ou posterior ao início.")
        if meses > MAX_MESES:
            raise ValueError(f"A obra não pode passar de 2 anos ({MAX_MESES} meses, contando o mês de início e o de fim).")
        for s in self.servicos:
            if len(s.percentuais) != meses:
                raise ValueError(f"O serviço '{s.descricao}' deve ter um percentual para cada um dos {meses} meses.")
            if abs(sum(s.percentuais) - 100) > 0.01:
                raise ValueError(
                    f"Os percentuais do serviço '{s.descricao}' devem somar 100% (atualmente somam {sum(s.percentuais):g}%)."
                )
        return self
