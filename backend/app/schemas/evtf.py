"""EVTF — Formulário de Viabilidade Técnica e Financeira.

Mesmos campos do formulário do Sistema Cadastral (seções 1, 2 e 4, e o
responsável técnico). As seções 3 (DRE), 5 (Investimentos) e 6 (Custos Anuais)
ainda não estão no formulário: o PDF avisa que devem ser anexadas à parte.
"""
import re
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.validacoes import cnpj_valido, cpf_valido, numero_br, somente_digitos, telefone_valido

UF = Literal[
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
    "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

OBRIGATORIOS = (
    "razao_social", "endereco", "cidade",
    "responsavel_nome", "responsavel_ci_orgao", "responsavel_endereco", "responsavel_cidade_uf",
    "responsavel_cargo", "responsavel_contato",
    "ramo_atividade_cnae", "ramo_atividade_especificacao",
    "projeto_objetivo", "distrito_industrial", "fluxo_producao_descricao",
    "responsavel_tecnico_nome", "responsavel_tecnico_registro",
)

# Opcionais numéricos (formato brasileiro, ex.: 12.500 ou 2.500,50).
NUMEROS_OPCIONAIS = (
    "capital_recursos_proprios", "capital_recursos_incentivos", "capital_recursos_outros",
    "capital_recursos_total", "composicao_nacional_pct", "composicao_estrangeiro_pct",
    "eng_area_construida_implantacao", "eng_area_construida_expansao",
    "eng_area_estocagem_implantacao", "eng_area_estocagem_expansao",
    "eng_estacionamento_implantacao", "eng_estacionamento_expansao",
    "saneamento_consumo_agua", "saneamento_geracao_esgoto", "saneamento_volume_rejeitos",
    "saneamento_consumo_energia", "saneamento_potencia_instalada", "mao_obra_local_pct",
)

MES_ANO = r"^\d{4}-(0[1-9]|1[0-2])$"


class EvtfIn(BaseModel):
    # 1 - Dados cadastrais
    razao_social: str
    cnpj: str
    endereco: str
    cidade: str
    uf: UF
    cep: str
    telefone: str
    email: EmailStr

    conta_corrente: str = ""
    banco: str = ""
    agencia: str = ""
    praca_pagamento: str = ""

    responsavel_nome: str
    responsavel_ci_orgao: str
    responsavel_cpf: str
    responsavel_endereco: str
    responsavel_cidade_uf: str
    responsavel_cep: str
    responsavel_cargo: str
    responsavel_contato: str
    responsavel_email: EmailStr

    ramo_atividade_cnae: str
    ramo_atividade_especificacao: str

    # 2 - Dados econômicos e financeiros (opcionais)
    capital_social_data: str = ""  # "AAAA-MM-DD"
    capital_social_ato: str = ""
    capital_recursos_proprios: str = ""
    capital_recursos_incentivos: str = ""
    capital_recursos_outros: str = ""
    capital_recursos_total: str = ""
    composicao_nacional_pct: str = ""
    composicao_estrangeiro_pct: str = ""
    principais_acionistas: str = ""

    # 4 - Concepção do projeto
    projeto_objetivo: str
    distrito_industrial: str
    area_terreno_m2: str

    prazo_implantacao_inicio: str = ""  # "AAAA-MM"
    prazo_implantacao_termino: str = ""
    prazo_expansao_inicio: str = ""
    prazo_expansao_termino: str = ""

    eng_area_construida_implantacao: str = ""
    eng_area_construida_expansao: str = ""
    eng_area_estocagem_implantacao: str = ""
    eng_area_estocagem_expansao: str = ""
    eng_estacionamento_implantacao: str = ""
    eng_estacionamento_expansao: str = ""

    fluxo_producao_descricao: str

    saneamento_consumo_agua: str = ""
    saneamento_geracao_esgoto: str = ""
    saneamento_volume_rejeitos: str = ""
    saneamento_estado_fisico_rejeitos: str = ""
    saneamento_tratamento_proprio: str = ""
    saneamento_equipamento_controle: str = ""
    saneamento_consumo_energia: str = ""
    saneamento_potencia_instalada: str = ""

    empregos_diretos: int
    empregos_indiretos: int
    mao_obra_local_pct: str = ""

    # Assinaturas
    responsavel_tecnico_nome: str
    responsavel_tecnico_registro: str

    @field_validator("*", mode="before")
    @classmethod
    def _sem_espacos_nas_pontas(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator(*OBRIGATORIOS)
    @classmethod
    def _obrigatorio(cls, v: str, info):
        if not v:
            raise ValueError(f"O campo '{info.field_name}' é obrigatório.")
        return v

    @field_validator("cnpj")
    @classmethod
    def _cnpj(cls, v: str):
        d = somente_digitos(v)
        if not cnpj_valido(d):
            raise ValueError("CNPJ inválido.")
        return d

    @field_validator("responsavel_cpf")
    @classmethod
    def _cpf(cls, v: str):
        d = somente_digitos(v)
        if not cpf_valido(d):
            raise ValueError("CPF do responsável inválido.")
        return d

    @field_validator("cep", "responsavel_cep")
    @classmethod
    def _cep(cls, v: str):
        d = somente_digitos(v)
        if len(d) != 8:
            raise ValueError("CEP deve ter 8 dígitos.")
        return d

    @field_validator("telefone")
    @classmethod
    def _telefone(cls, v: str):
        d = somente_digitos(v)
        if not telefone_valido(d):
            raise ValueError("Telefone inválido (informe DDD + número).")
        return d

    @field_validator("area_terreno_m2")
    @classmethod
    def _area(cls, v: str):
        if numero_br(v) <= 0:
            raise ValueError("A área do terreno deve ser maior que zero.")
        return v

    @field_validator(*NUMEROS_OPCIONAIS)
    @classmethod
    def _numero_opcional(cls, v: str):
        if v:
            numero_br(v)
        return v

    @field_validator("composicao_nacional_pct", "composicao_estrangeiro_pct", "mao_obra_local_pct")
    @classmethod
    def _percentual(cls, v: str):
        if v and not 0 <= numero_br(v) <= 100:
            raise ValueError("O percentual deve estar entre 0 e 100.")
        return v

    @field_validator("prazo_implantacao_inicio", "prazo_implantacao_termino", "prazo_expansao_inicio", "prazo_expansao_termino")
    @classmethod
    def _mes_ano(cls, v: str):
        if v and not re.fullmatch(MES_ANO, v):
            raise ValueError("Informe o mês e o ano.")
        return v

    @field_validator("capital_social_data")
    @classmethod
    def _data(cls, v: str):
        if v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("Data inválida.")
        return v

    @field_validator("empregos_diretos", "empregos_indiretos")
    @classmethod
    def _empregos(cls, v: int):
        if v < 0:
            raise ValueError("Informe um número igual ou maior que zero.")
        return v
