"""Envio final do credenciamento: gera o protocolo e o comprovante em PDF."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import Envio, Usuario
from app.routers.auth import usuario_atual
from app.schemas.envio import EnvioEstado, EnvioIn
from app.services import envio as servico

router = APIRouter()


def _ultimo(db: Session, usuario: Usuario) -> Envio | None:
    return db.query(Envio).filter(Envio.usuario_id == usuario.id).order_by(Envio.id.desc()).first()


def _estado(db: Session, usuario: Usuario) -> EnvioEstado:
    itens = servico.checklist(db, usuario)
    falta = servico.pendencias_de(itens)
    ultimo = _ultimo(db, usuario)
    return EnvioEstado(
        checklist=itens,
        pendencias=falta,
        pode_finalizar=not falta,
        protocolo=ultimo.protocolo if ultimo else None,
        enviado_em=ultimo.enviado_em if ultimo else None,
    )


@router.get("/envio/minha", response_model=EnvioEstado)
def estado(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return _estado(db, usuario)


@router.post("/envio", response_model=EnvioEstado, status_code=201)
def finalizar(payload: EnvioIn | None = None, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Registra o envio: confere as pendências e o "Li e Concordo", gera o protocolo e guarda o
    retrato do que foi entregue (com o aceite da declaração final de responsabilidade)."""
    falta = servico.pendencias(db, usuario)
    if falta:
        raise HTTPException(status_code=422, detail="Ainda há pendências: " + " ".join(falta))
    if not (payload and payload.li_e_concordo):
        raise HTTPException(status_code=422, detail='Marque "Li e Concordo" na declaração de responsabilidade para finalizar.')
    agora = datetime.now()
    resumo = servico.montar_resumo(db, usuario)
    resumo["declaracoes"].append(servico.declaracao_final(db, usuario, agora))
    db.add(Envio(
        usuario_id=usuario.id,
        protocolo=servico.gerar_protocolo(db),
        enviado_em=agora,
        resumo=resumo,
    ))
    db.commit()
    return _estado(db, usuario)


@router.get("/envio/minha/pdf")
def comprovante(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    ultimo = _ultimo(db, usuario)
    if ultimo is None:
        raise HTTPException(status_code=404, detail="Você ainda não finalizou o envio.")
    return Response(
        content=servico.gerar_pdf(ultimo),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="comprovante_{ultimo.protocolo}.pdf"'},
    )
