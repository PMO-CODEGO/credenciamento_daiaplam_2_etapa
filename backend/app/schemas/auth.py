import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.validacoes import cnpj_valido, cpf_valido, somente_digitos


def _cnpj(v: str) -> str:
    digitos = somente_digitos(v)
    if not cnpj_valido(digitos):
        raise ValueError("CNPJ inválido.")
    return digitos


class CadastroUsuarioIn(BaseModel):
    cnpj: str
    nome_empresarial: str = Field(min_length=3, max_length=255)
    email: EmailStr
    representante_nome: str = Field(min_length=3, max_length=255)
    representante_cpf: str
    # Ciência do Aviso de Privacidade (LGPD); validado mesmo quando não vem no pedido.
    privacidade_ciente: bool = Field(default=False, validate_default=True)
    g_recaptcha_response: str = ""

    @field_validator("cnpj")
    @classmethod
    def _v_cnpj(cls, v):
        return _cnpj(v)

    @field_validator("privacidade_ciente")
    @classmethod
    def _v_privacidade(cls, v):
        if not v:
            raise ValueError("É preciso declarar ciência do Aviso de Privacidade.")
        return v

    @field_validator("nome_empresarial", "representante_nome")
    @classmethod
    def _v_nome(cls, v):
        return " ".join(v.split())

    @field_validator("representante_nome")
    @classmethod
    def _v_nome_pessoa(cls, v):
        if not re.fullmatch(r"[^\W\d_]+(?:[ '.-][^\W\d_]+)*\.?", v):
            raise ValueError("Informe o nome completo do Representante Legal (apenas letras).")
        return v

    @field_validator("representante_cpf")
    @classmethod
    def _v_cpf(cls, v):
        digitos = somente_digitos(v)
        if not cpf_valido(digitos):
            raise ValueError("CPF do Representante Legal inválido.")
        return digitos


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
    # Só no cadastro: a senha gerada aparece uma única vez (no banco fica só o hash).
    senha_gerada: str | None = None
