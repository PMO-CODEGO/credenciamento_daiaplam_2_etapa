from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import Cnae, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.solicitacao import AutoSalvarOut, CnaeOut, RascunhoOut, SolicitacaoIn, SolicitacaoOut
from app.schemas.validacoes import somente_digitos
from app.services import cnae as cnae_service
from app.services import rascunho as rascunhos

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
    """Cria ou atualiza a solicitação da empresa logada (dados completos).
    Os documentos obrigatórios são cobrados no envio final, não aqui."""
    if payload.cnpj != usuario.cnpj:
        raise HTTPException(status_code=422, detail="O CNPJ do formulário deve ser o mesmo do seu login.")
    c = cnae_service.buscar(db, payload.cnae)
    if c is None:
        raise HTTPException(status_code=422, detail="CNAE inválido: não consta na tabela de CNAEs aceitos.")
    return rascunhos.gravar(db, usuario, payload, c)


@router.get("/solicitacoes/minha/rascunho", response_model=RascunhoOut | None)
def meu_rascunho(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    r = rascunhos.rascunho(db, usuario)
    return RascunhoOut(dados=r.dados, atualizado_em=r.data_atualizacao) if r else None


@router.put("/solicitacoes/minha/automatico", response_model=AutoSalvarOut)
def salvar_automatico(
    dados: dict = Body(...), usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)
):
    """Salvamento automático: completo e válido vira a solicitação oficial;
    senão fica como rascunho e devolve o que falta."""
    dados = rascunhos.limpar(dados)
    payload, c, faltando = rascunhos.conferir(db, usuario, dados)
    if payload is not None:
        sol = rascunhos.gravar(db, usuario, payload, c)
        return AutoSalvarOut(situacao="salvo", faltando=[], salvo_em=sol.data_atualizacao, solicitacao=sol)
    r = rascunhos.guardar_rascunho(db, usuario, dados)
    return AutoSalvarOut(situacao="rascunho", faltando=faltando, salvo_em=r.data_atualizacao)
