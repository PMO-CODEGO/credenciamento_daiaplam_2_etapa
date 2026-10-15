import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.validacoes import cnpj_valido, somente_digitos


def _cnpj(v: str) -> str:
    digitos = somente_digitos(v)
    if not cnpj_valido(digitos):
        raise ValueError("CNPJ inválido.")
    return digitos


class CadastroUsuarioIn(BaseModel):
    cnpj: str
    nome_empresarial: str = Field(min_length=3, max_length=255)
    email: EmailStr
    senha: str = Field(max_length=72)
    g_recaptcha_response: str = ""

    @field_validator("cnpj")
    @classmethod
    def _v_cnpj(cls, v):
        return _cnpj(v)

    @field_validator("nome_empresarial")
    @classmethod
    def _v_nome(cls, v):
        return " ".join(v.split())

    @field_validator("senha")
    @classmethod
    def _v_senha(cls, v):
        if len(v) < 8:
            raise ValueError("A senha deve ter pelo menos 8 caracteres.")
        if not re.search(r"[A-Za-z]", v) or not re.search(r"[0-9]", v):
            raise ValueError("A senha deve ter letras e números.")
        return v


class LoginIn(BaseModel):
    cnpj: str
    senha: str = Field(max_length=72)
    g_recaptcha_response: str = ""

    @field_validator("cnpj")
    @classmethod
    def _v_cnpj(cls, v):
        return somente_digitos(v)


class UsuarioOut(BaseModel):
    id: int
    cnpj: str
    nome_empresarial: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut
