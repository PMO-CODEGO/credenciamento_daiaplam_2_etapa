"""Anexo VI — Cronograma Físico de Obras: formulário (com PDF gerado) ou arquivo próprio."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.orm import Cronograma, Documento, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.cronograma import MAX_MESES, SERVICOS_SUGERIDOS, CronogramaIn
from app.schemas.cronograma_estado import CronogramaEstado
from app.schemas.documentos import DocumentoOut
from app.schemas.validacoes import formatar_numero_br
from app.services import documentos as docs
from app.services.cronograma_pdf import gerar_pdf

router = APIRouter()

TIPO_ARQUIVO = "inciso12"


def _sugestao(usuario: Usuario, sol: Solicitacao | None) -> dict:
    """Valores iniciais do formulário, para a empresa não digitar de novo."""
    s = {"nome_empresa": usuario.nome_empresarial}
    if sol is not None:
        s["endereco"] = sol.endereco_correspondencia
        area = float(sol.area_m2)
        s["area_empresa"] = formatar_numero_br(area)
        if sol.ocupacao_percentual:
            s["area_construida"] = formatar_numero_br(round(area * sol.ocupacao_percentual / 100, 2))
            s["ocupacao_percentual"] = sol.ocupacao_percentual
        if sol.obra_inicio and sol.obra_fim:
            s["inicio_obras"] = sol.obra_inicio
            s["termino_obras"] = sol.obra_fim
    return s


def _arquivos(db: Session, usuario: Usuario) -> list[Documento]:
    return (
        db.query(Documento)
        .filter(Documento.usuario_id == usuario.id, Documento.tipo == TIPO_ARQUIVO)
        .order_by(Documento.data_envio, Documento.id)
        .all()
    )


@router.get("/cronograma/minha", response_model=CronogramaEstado)
def estado(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    arquivos = _arquivos(db, usuario)
    return CronogramaEstado(
        dados=salvo.dados if salvo else None,
        atualizado_em=salvo.data_atualizacao if salvo else None,
        sugestao=_sugestao(usuario, sol),
        servicos_sugeridos=SERVICOS_SUGERIDOS,
        arquivos=[DocumentoOut.model_validate(a) for a in arquivos],
        max_arquivos=docs.MAX_ARQUIVOS_POR_TIPO,
        max_mb=settings.upload_max_mb,
        max_meses=MAX_MESES,
        concluido=bool(salvo or arquivos),
    )


@router.put("/cronograma/minha", response_model=CronogramaEstado)
def salvar(payload: CronogramaIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    if salvo is None:
        salvo = Cronograma(usuario_id=usuario.id, dados={})
        db.add(salvo)
    salvo.dados = payload.model_dump()
    db.commit()
    return estado(usuario, db)


@router.delete("/cronograma/minha", status_code=204)
def apagar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Remove o cronograma do formulário (os arquivos enviados não são afetados)."""
    db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).delete()
    db.commit()


@router.get("/cronograma/minha/pdf")
def baixar_pdf(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Gera o PDF na hora, a partir dos dados salvos."""
    salvo = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    if salvo is None:
        raise HTTPException(status_code=404, detail="Você ainda não salvou o cronograma pelo formulário.")
    # Data de início já passada não impede recriar o PDF de um cronograma salvo antes.
    dados = CronogramaIn.model_validate(salvo.dados, context={"regerar_pdf": True})
    pdf = gerar_pdf(dados, usuario.cnpj)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="cronograma_fisico_obras.pdf"'},
    )
