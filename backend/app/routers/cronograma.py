"""Inciso XII — Cronograma Físico de Obras: formulário (com PDF gerado) ou arquivo próprio.

Nome da empresa, endereço, áreas e período da obra vêm sempre do formulário
principal (Inciso I e declaração do Inciso XII): a empresa só preenche os
serviços e os percentuais mensais.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.orm import Cronograma, Documento, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.cronograma import (
    MAX_MESES,
    SERVICOS_SUGERIDOS,
    CronogramaIn,
    dados_da_declaracao,
    desatualizado,
)
from app.schemas.cronograma_estado import CronogramaEstado
from app.schemas.documentos import DocumentoOut
from app.services import documentos as docs
from app.services.cronograma_pdf import gerar_pdf

router = APIRouter()

TIPO_ARQUIVO = "inciso12"

SEM_DECLARACAO = (
    "Preencha e salve primeiro a declaração do Inciso XII no formulário principal "
    "(percentual de ocupação e início e fim da obra): o cronograma usa esses dados."
)
PERIODO_MUDOU = (
    "O período da obra mudou na declaração do Inciso XII. Ajuste os percentuais "
    "mensais do cronograma e salve de novo."
)


def _arquivos(db: Session, usuario: Usuario) -> list[Documento]:
    return (
        db.query(Documento)
        .filter(Documento.usuario_id == usuario.id, Documento.tipo == TIPO_ARQUIVO)
        .order_by(Documento.data_envio, Documento.id)
        .all()
    )


def _declaracao(db: Session, usuario: Usuario) -> dict | None:
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    return dados_da_declaracao(sol)


@router.get("/cronograma/minha", response_model=CronogramaEstado)
def estado(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    declaracao = _declaracao(db, usuario)
    arquivos = _arquivos(db, usuario)
    velho = desatualizado(salvo.dados if salvo else None, declaracao)
    return CronogramaEstado(
        dados=salvo.dados if salvo else None,
        atualizado_em=salvo.data_atualizacao if salvo else None,
        sugestao=declaracao,
        declaracao_ok=declaracao is not None,
        desatualizado=velho,
        servicos_sugeridos=SERVICOS_SUGERIDOS,
        arquivos=[DocumentoOut.model_validate(a) for a in arquivos],
        max_arquivos=docs.MAX_ARQUIVOS_POR_TIPO,
        max_mb=settings.upload_max_mb,
        max_meses=MAX_MESES,
        concluido=bool((salvo and not velho) or arquivos),
    )


@router.put("/cronograma/minha", response_model=CronogramaEstado)
def salvar(payload: CronogramaIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    declaracao = _declaracao(db, usuario)
    if declaracao is None:
        raise HTTPException(status_code=422, detail=SEM_DECLARACAO)
    # Os campos da declaração valem sempre, seja o que for que veio do navegador.
    dados = CronogramaIn.model_validate({**payload.model_dump(), **declaracao})
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    if salvo is None:
        salvo = Cronograma(usuario_id=usuario.id, dados={})
        db.add(salvo)
    salvo.dados = dados.model_dump()
    db.commit()
    return estado(usuario, db)


@router.delete("/cronograma/minha", status_code=204)
def apagar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Remove o cronograma do formulário (os arquivos enviados não são afetados)."""
    db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).delete()
    db.commit()


@router.get("/cronograma/minha/pdf")
def baixar_pdf(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Gera o PDF na hora, a partir dos dados salvos e da declaração atual."""
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    if salvo is None:
        raise HTTPException(status_code=404, detail="Você ainda não salvou o cronograma pelo formulário.")
    declaracao = _declaracao(db, usuario)
    if declaracao is None:
        raise HTTPException(status_code=409, detail=SEM_DECLARACAO)
    if desatualizado(salvo.dados, declaracao):
        raise HTTPException(status_code=409, detail=PERIODO_MUDOU)
    # Data de início já passada não impede recriar o PDF de um cronograma salvo antes.
    dados = CronogramaIn.model_validate({**salvo.dados, **declaracao}, context={"regerar_pdf": True})
    pdf = gerar_pdf(dados, usuario.cnpj)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="cronograma_fisico_obras.pdf"'},
    )
