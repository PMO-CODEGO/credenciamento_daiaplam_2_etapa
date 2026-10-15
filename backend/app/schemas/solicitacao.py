from datetime import datetime
from decimal import Decimal

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

    @field_validator("nome_empresarial", "endereco_correspondencia", "administrador_nome")
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
    data_atualizacao: datetime | None = None


class CnaeOut(BaseModel):
    codigo: str
    codigo_formatado: str
    descricao: str
