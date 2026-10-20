from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

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
    obra_inicio: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    obra_fim: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    declaracao_cidade: str = Field(min_length=2, max_length=100)
    declaracao_aceita: bool
    # Anexo IX — Declaração de Pleno Conhecimento do Objeto
    conhecimento_objeto_aceito: bool

    @field_validator("nome_empresarial", "endereco_correspondencia", "administrador_nome",
                     "representante_nome", "representante_cargo", "declaracao_cidade")
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

    @field_validator("declaracao_aceita", "conhecimento_objeto_aceito")
    @classmethod
    def _aceite(cls, v):
        if not v:
            raise ValueError("É preciso aceitar a declaração.")
        return v

    @model_validator(mode="after")
    def _cronograma(self):
        ai, mi = map(int, self.obra_inicio.split("-"))
        af, mf = map(int, self.obra_fim.split("-"))
        meses = (af - ai) * 12 + (mf - mi) + 1  # conta o mês de início e o de fim
        if meses < 1:
            raise ValueError("O fim da obra deve ser igual ou posterior ao início.")
        if meses > 24:
            raise ValueError("A obra não pode passar de 2 anos (24 meses, contando o mês de início e o de fim).")
        return self


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
    obra_inicio: str | None = None
    obra_fim: str | None = None
    declaracao_cidade: str | None = None
    declaracao_aceita_em: datetime | None = None
    conhecimento_objeto_aceito_em: datetime | None = None
    data_atualizacao: datetime | None = None


class CnaeOut(BaseModel):
    codigo: str
    codigo_formatado: str
    descricao: str
