from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import Cnae, Documento, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.solicitacao import CnaeOut, SolicitacaoIn, SolicitacaoOut
from app.schemas.validacoes import somente_digitos
from app.services import cnae as cnae_service
from app.services import documentos as docs

router = APIRouter()


def _cnae_out(c: Cnae) -> CnaeOut:
    return CnaeOut(codigo=c.codigo, codigo_formatado=cnae_service.formatar(c.codigo), descricao=c.descricao)


@router.get("/cnae/{codigo:path}", response_model=CnaeOut)
def validar_cnae(codigo: str, _u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Confere se o CNAE existe na tabela aceita e devolve a descrição."""
    c = cnae_service.buscar(db, codigo)
    if c is None:
        raise HTTPException(status_code=404, detail="CNAE não encontrado na tabela de CNAEs aceitos.")
    return _cnae_out(c)


@router.get("/cnae", response_model=list[CnaeOut])
def buscar_cnaes(q: str = "", _u: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Sugestões por código ou trecho da descrição (até 15)."""
    q = q.strip()
    if len(q) < 2:
        return []
    consulta = db.query(Cnae)
    digitos = somente_digitos(q)
    if digitos and digitos == q.replace("-", "").replace("/", ""):
        consulta = consulta.filter(Cnae.codigo.like(f"{digitos}%"))
    else:
        consulta = consulta.filter(Cnae.descricao.ilike(f"%{q[:80]}%"))
    return [_cnae_out(c) for c in consulta.order_by(Cnae.codigo).limit(15).all()]


@router.get("/solicitacoes/minha", response_model=SolicitacaoOut | None)
def minha_solicitacao(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()


@router.put("/solicitacoes/minha", response_model=SolicitacaoOut)
def salvar_solicitacao(
    payload: SolicitacaoIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)
):
    """Cria ou atualiza a solicitação da empresa logada."""
    if payload.cnpj != usuario.cnpj:
        raise HTTPException(status_code=422, detail="O CNPJ do formulário deve ser o mesmo do seu login.")
    c = cnae_service.buscar(db, payload.cnae)
    if c is None:
        raise HTTPException(status_code=422, detail="CNAE inválido: não consta na tabela de CNAEs aceitos.")
    enviados = {t for (t,) in db.query(Documento.tipo).filter(Documento.usuario_id == usuario.id).distinct()}
    faltando = [docs.TIPOS_POR_CHAVE[t][0].split(" — ")[0] for t in docs.OBRIGATORIOS if t not in enviados]
    if faltando:
        raise HTTPException(status_code=422, detail=f"Envie os documentos obrigatórios: {', '.join(faltando)}.")

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
    sol.representante_nome = payload.representante_nome
    sol.representante_cargo = payload.representante_cargo
    sol.ocupacao_percentual = payload.ocupacao_percentual
    sol.obra_inicio = payload.obra_inicio
    sol.obra_fim = payload.obra_fim
    sol.declaracao_cidade = payload.declaracao_cidade
    # Cada salvamento reassina a declaração com os dados atuais.
    sol.declaracao_aceita_em = datetime.now()
    db.commit()
    db.refresh(sol)
    return sol
