"""Anexo VII — MCE: formulário com PDF gerado ou arquivo próprio,
mais a ciência da rede de água e esgoto fornecida pela CODEGO (Aceito/Recuso)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.orm import Cronograma, Documento, Mce, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.documentos import DocumentoOut
from app.schemas.mce import MceIn
from app.schemas.mce_estado import CienciaIn, MceEstado
from app.schemas.validacoes import formatar_numero_br
from app.services import documentos as docs
from app.services.mce_pdf import gerar_pdf

router = APIRouter()

TIPO_ARQUIVO = "inciso13"


def _sugestao(usuario: Usuario, sol: Solicitacao | None, crono: Cronograma | None) -> dict:
    """Valores iniciais do formulário, para a empresa não digitar de novo.
    A previsão de funcionamento é o término da obra no Cronograma (Anexo VI), se já preenchido."""
    s = {"razao_social": usuario.nome_empresarial, "cnpj": usuario.cnpj,
         "responsavel_nome": usuario.representante_nome or "", "responsavel_cargo": usuario.representante_cargo or ""}
    if sol is not None:
        s.update(
            endereco=sol.endereco_correspondencia,
            telefone=sol.telefone,
            email=sol.email,
            responsavel_nome=sol.representante_nome or sol.administrador_nome,
            responsavel_cargo=sol.representante_cargo or usuario.representante_cargo or "",
            cnae_principal=sol.cnae_codigo,
            atividade_principal=sol.cnae_descricao,
            area_total_terreno=formatar_numero_br(float(sol.area_m2)),
            local_cidade_uf=sol.declaracao_cidade or "",
        )
        if sol.ocupacao_percentual:
            s["area_construida"] = formatar_numero_br(round(float(sol.area_m2) * sol.ocupacao_percentual / 100, 2))
    if crono is not None and crono.dados.get("termino_obras"):
        s["previsao_funcionamento"] = crono.dados["termino_obras"]
    return s


def _registro(db: Session, usuario: Usuario) -> Mce | None:
    return db.query(Mce).filter(Mce.usuario_id == usuario.id).first()


def _montar_estado(db: Session, usuario: Usuario) -> MceEstado:
    reg = _registro(db, usuario)
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    arquivos = (
        db.query(Documento)
        .filter(Documento.usuario_id == usuario.id, Documento.tipo == TIPO_ARQUIVO)
        .order_by(Documento.data_envio, Documento.id)
        .all()
    )
    tem_mce = bool((reg and reg.dados) or arquivos)
    ciencia = reg.ciencia_rede if reg else None
    return MceEstado(
        dados=reg.dados if reg else None,
        atualizado_em=reg.data_atualizacao if reg and reg.dados else None,
        sugestao=_sugestao(usuario, sol, db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()),
        arquivos=[DocumentoOut.model_validate(a) for a in arquivos],
        max_arquivos=docs.MAX_ARQUIVOS_POR_TIPO,
        max_mb=settings.upload_max_mb,
        ciencia=ciencia,
        ciencia_em=reg.ciencia_em if reg else None,
        concluido=tem_mce and ciencia == "aceito",
    )


def _obter_ou_criar(db: Session, usuario: Usuario) -> Mce:
    reg = _registro(db, usuario)
    if reg is None:
        reg = Mce(usuario_id=usuario.id)
        db.add(reg)
    return reg


@router.get("/mce/minha", response_model=MceEstado)
def estado(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return _montar_estado(db, usuario)


@router.put("/mce/minha", response_model=MceEstado)
def salvar(payload: MceIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    reg = _obter_ou_criar(db, usuario)
    reg.dados = payload.model_dump()
    db.commit()
    return _montar_estado(db, usuario)


@router.delete("/mce/minha", status_code=204)
def apagar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Remove o MCE do formulário (arquivos enviados e ciência não são afetados)."""
    reg = _registro(db, usuario)
    if reg is not None:
        reg.dados = None
        db.commit()


@router.put("/mce/minha/ciencia", response_model=MceEstado)
def registrar_ciencia(payload: CienciaIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    resposta = payload.resposta.strip().lower()
    if resposta not in ("aceito", "recuso"):
        raise HTTPException(status_code=422, detail="Responda Aceito ou Recuso.")
    reg = _obter_ou_criar(db, usuario)
    reg.ciencia_rede = resposta
    reg.ciencia_em = datetime.now()
    db.commit()
    return _montar_estado(db, usuario)


@router.get("/mce/minha/pdf")
def baixar_pdf(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    reg = _registro(db, usuario)
    if reg is None or not reg.dados:
        raise HTTPException(status_code=404, detail="Você ainda não salvou o MCE pelo formulário.")
    dados = MceIn.model_validate(reg.dados, context={"regerar_pdf": True})
    return Response(
        content=gerar_pdf(dados, usuario.cnpj),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="mce.pdf"'},
    )
