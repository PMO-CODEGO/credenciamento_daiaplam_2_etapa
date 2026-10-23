from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.validacoes import cnpj_valido, cpf_valido, somente_digitos, telefone_valido


class SolicitacaoIn(BaseModel):
    area_m2: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    nome_empresarial: str = Field(min_length=3, max_length=255)
    cnpj: str
    endereco_correspondencia: str = Field(min_length=5, max_length=500)
    email: EmailStr
    telefone: str
    administrador_nome: str = Field(min_length=3, max_length=255)
    administrador_cpf: str
    cnae: str  # código; a descrição vem sempre da tabela de CNAEs

    # Declaração de compromisso
    representante_nome: str = Field(min_length=3, max_length=255)
    representante_cargo: str = Field(min_length=2, max_length=100)
    ocupacao_percentual: int = Field(ge=33, le=80)
    declaracao_cidade: str = Field(min_length=2, max_length=100)
    declaracao_uf: Literal[
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
        "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
    ]
    declaracao_aceita: bool
    # Anexo IX — Declaração de Pleno Conhecimento do Objeto
    conhecimento_objeto_aceito: bool
    # Anexo XII — Declaração Liquidação Alienação de Áreas
    sede_endereco: str = Field(min_length=5, max_length=500)
    liquidacao_prazo_meses: int = Field(ge=1, le=36)
    liquidacao_aceita: bool

    @field_validator("nome_empresarial", "endereco_correspondencia", "administrador_nome",
                     "representante_nome", "representante_cargo", "declaracao_cidade", "sede_endereco")
    @classmethod
    def _espacos(cls, v):
        return " ".join(v.split())

    @field_validator("cnpj")
    @classmethod
    def _cnpj(cls, v):
        d = somente_digitos(v)
        if not cnpj_valido(d):
            raise ValueError("CNPJ inválido.")
        return d

    @field_validator("administrador_cpf")
    @classmethod
    def _cpf(cls, v):
        d = somente_digitos(v)
        if not cpf_valido(d):
            raise ValueError("CPF inválido.")
        return d

    @field_validator("telefone")
    @classmethod
    def _tel(cls, v):
        d = somente_digitos(v)
        if not telefone_valido(d):
            raise ValueError("Telefone inválido (informe DDD + número).")
        return d

    @field_validator("declaracao_aceita", "conhecimento_objeto_aceito", "liquidacao_aceita")
    @classmethod
    def _aceite(cls, v):
        if not v:
            raise ValueError("É preciso aceitar a declaração.")
        return v


class SolicitacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    distrito: str
    area_m2: Decimal
    nome_empresarial: str
    cnpj: str
    endereco_correspondencia: str
    email: str
    telefone: str
    administrador_nome: str
    administrador_cpf: str
    cnae_codigo: str
    cnae_descricao: str
    representante_nome: str | None = None
    representante_cargo: str | None = None
    ocupacao_percentual: int | None = None
    declaracao_cidade: str | None = None
    declaracao_uf: str | None = None
    declaracao_aceita_em: datetime | None = None
    conhecimento_objeto_aceito_em: datetime | None = None
    sede_endereco: str | None = None
    liquidacao_prazo_meses: int | None = None
    liquidacao_aceita_em: datetime | None = None
    data_atualizacao: datetime | None = None


class CnaeOut(BaseModel):
    codigo: str
    codigo_formatado: str
    descricao: str


class RascunhoOut(BaseModel):
    dados: dict
    atualizado_em: datetime | None = None


class AutoSalvarOut(BaseModel):
    situacao: str  # "salvo" (virou a solicitação oficial) ou "rascunho" (ainda falta algo)
    faltando: list[str]
    salvo_em: datetime
    solicitacao: SolicitacaoOut | None = None
