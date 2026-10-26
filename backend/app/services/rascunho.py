"""Salvamento automático do formulário principal (Inciso I e declarações dos incisos XII, XIV e XV).

O formulário salva sozinho a cada alteração. Se os dados estão completos e
válidos, viram a solicitação oficial; se não, ficam guardados como rascunho
(nada se perde) e a lista do que falta aparece nas pendências do envio final.
"""
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.orm import Cnae, Rascunho, Solicitacao, Usuario
from app.schemas.solicitacao import SolicitacaoIn
from app.services import cnae as cnae_service

# Nome de cada campo como aparece na tela, na ordem do formulário.
ROTULOS = {
    "area_m2": "Área solicitada",
    "nome_empresarial": "Nome empresarial",
    "cnpj": "CNPJ",
    "endereco_correspondencia": "Endereço para correspondência",
    "email": "E-mail",
    "telefone": "Telefone",
    "administrador_nome": "Nome do administrador",
    "administrador_cpf": "CPF do administrador",
    "cnae": "CNAE",
    "representante_nome": "Nome do representante legal",
    "representante_cargo": "Cargo do representante",
    "preenchimento_nome": "Responsável pelo preenchimento",
    "ocupacao_percentual": "Percentual de ocupação",
    "declaracao_cidade": "Cidade da assinatura",
    "declaracao_uf": "Estado",
    "declaracao_aceita": "Aceite da declaração do Anexo VI - POA",
    "conhecimento_objeto_aceito": "Aceite da declaração do Anexo IX",
    "sede_endereco": "Endereço completo da sede",
    "liquidacao_forma": "Forma de pagamento (à vista ou parcelado)",
    "liquidacao_prazo_meses": "Prazo de liquidação",
    "liquidacao_aceita": "Aceite da declaração do Anexo XII",
}


def limpar(dados: dict) -> dict:
    """Só os campos do formulário, com textos de tamanho razoável."""
    limpo = {}
    for campo in ROTULOS:
        valor = dados.get(campo)
        if isinstance(valor, str):
            valor = valor[:1000]
        elif not isinstance(valor, (int, float, bool, type(None))):
            valor = None
        limpo[campo] = valor
    return limpo


def com_dados_do_cadastro(dados: dict, usuario: Usuario) -> dict:
    """Os campos que vêm do cadastro valem sempre os do cadastro (na tela ficam bloqueados).
    O administrador da sociedade é o representante legal do cadastro, e quem assina as
    declarações é ele. Cadastro antigo sem o dado: vale o que veio no formulário."""
    fixos = {
        "nome_empresarial": usuario.nome_empresarial,
        "email": usuario.email,
        "administrador_nome": usuario.representante_nome,
        "administrador_cpf": usuario.representante_cpf,
        "representante_cargo": usuario.representante_cargo,
    }
    dados = {**dados, **{campo: valor for campo, valor in fixos.items() if valor}}
    dados["representante_nome"] = dados.get("administrador_nome")
    return dados


def conferir(db: Session, usuario: Usuario, dados: dict) -> tuple[SolicitacaoIn | None, Cnae | None, list[str]]:
    """Valida o formulário. Devolve (dados validados, CNAE, o que falta); só há
    dados validados quando não falta nada."""
    faltando: list[str] = []
    try:
        payload = SolicitacaoIn.model_validate(dados)
    except ValidationError as erro:
        campos = set()
        for e in erro.errors():
            if e["loc"] and e["loc"][0] in ROTULOS:
                campos.add(e["loc"][0])
            else:  # regra entre campos (ex.: período da obra)
                faltando.append(e["msg"].replace("Value error, ", ""))
        faltando = [ROTULOS[c] for c in ROTULOS if c in campos] + faltando
        return None, None, faltando
    if payload.cnpj != usuario.cnpj:
        return None, None, ["CNPJ (deve ser o mesmo do seu login)"]
    c = cnae_service.buscar(db, payload.cnae)
    if c is None:
        return None, None, ["CNAE (não consta na tabela de CNAEs aceitos)"]
    return payload, c, []


def gravar(db: Session, usuario: Usuario, payload: SolicitacaoIn, c: Cnae) -> Solicitacao:
    """Grava a solicitação oficial e descarta o rascunho."""
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    if sol is None:
        sol = Solicitacao(usuario_id=usuario.id)
        db.add(sol)
    sol.area_m2 = payload.area_m2
    sol.nome_empresarial = payload.nome_empresarial
    sol.cnpj = payload.cnpj
    sol.endereco_correspondencia = payload.endereco_correspondencia
    sol.email = payload.email
    sol.telefone = payload.telefone
    sol.administrador_nome = payload.administrador_nome
    sol.administrador_cpf = payload.administrador_cpf
    sol.cnae_codigo = c.codigo
    sol.cnae_descricao = c.descricao
    sol.preenchimento_nome = payload.preenchimento_nome
    sol.representante_nome = payload.representante_nome
    sol.representante_cargo = payload.representante_cargo
    sol.ocupacao_percentual = payload.ocupacao_percentual
    sol.declaracao_cidade = payload.declaracao_cidade
    sol.declaracao_uf = payload.declaracao_uf
    # Cada salvamento reassina as declarações com os dados atuais.
    sol.declaracao_aceita_em = datetime.now()
    sol.conhecimento_objeto_aceito_em = sol.declaracao_aceita_em
    sol.sede_endereco = payload.sede_endereco
    sol.liquidacao_forma = payload.liquidacao_forma
    sol.liquidacao_prazo_meses = payload.liquidacao_prazo_meses
    sol.liquidacao_aceita_em = sol.declaracao_aceita_em
    db.query(Rascunho).filter(Rascunho.usuario_id == usuario.id).delete()
    db.commit()
    db.refresh(sol)
    return sol


def rascunho(db: Session, usuario: Usuario) -> Rascunho | None:
    return db.query(Rascunho).filter(Rascunho.usuario_id == usuario.id).first()


def guardar_rascunho(db: Session, usuario: Usuario, dados: dict) -> Rascunho:
    r = rascunho(db, usuario)
    if r is None:
        r = Rascunho(usuario_id=usuario.id, dados={})
        db.add(r)
    r.dados = dados
    r.data_atualizacao = datetime.now()
    db.commit()
    db.refresh(r)
    return r
