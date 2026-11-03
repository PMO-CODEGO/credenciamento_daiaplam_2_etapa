"""EVTF — Formulário de Viabilidade Técnica e Financeira: formulário (com PDF gerado) ou arquivo próprio."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.orm import Cronograma, Documento, Evtf, Solicitacao, Usuario
from app.routers.auth import usuario_atual
from app.schemas.documentos import DocumentoOut
from app.schemas.evtf import EvtfIn
from app.schemas.evtf_estado import EvtfEstado
from app.schemas.validacoes import formatar_numero_br
from app.services import documentos as docs
from app.services.cnae import formatar as formatar_cnae
from app.services.evtf_pdf import gerar_pdf

router = APIRouter()

TIPO_ARQUIVO = "evtf"  # EVTF próprio assinado (PDF ou imagem)
TIPO_EXCEL = "evtf_excel"  # o mesmo EVTF em Excel editável, pedido pelo modelo do Anexo V


def _sugestao(usuario: Usuario, sol: Solicitacao | None, crono: Cronograma | None) -> dict:
    """Valores iniciais do formulário, para a empresa não digitar de novo.
    Os prazos da obra vêm do Cronograma Físico de Obras (Anexo VI A), se já preenchido."""
    s = {
        "razao_social": usuario.nome_empresarial,
        "cnpj": usuario.cnpj,
        "email": usuario.email,
        "responsavel_nome": usuario.representante_nome or "",
        "responsavel_cpf": usuario.representante_cpf or "",
        "responsavel_cargo": usuario.representante_cargo or "",
        "distrito_industrial": "DAIAPLAM 2ª etapa",
    }
    if sol is not None:
        s.update(
            endereco=sol.sede_endereco or sol.endereco_correspondencia,
            telefone=sol.telefone,
            email=sol.email,
            responsavel_cargo=sol.representante_cargo or usuario.representante_cargo or "",
            responsavel_email=sol.email,
            responsavel_contato=sol.telefone,
            ramo_atividade_cnae=formatar_cnae(sol.cnae_codigo),
            ramo_atividade_especificacao=sol.cnae_descricao,
            area_terreno_m2=formatar_numero_br(float(sol.area_m2)),
        )
        # O representante da declaração vale mais que o do cadastro (pode ter mudado).
        if sol.representante_nome:
            s["responsavel_nome"] = sol.representante_nome
            if sol.representante_nome != usuario.representante_nome:
                s["responsavel_cpf"] = ""
        if sol.ocupacao_percentual:
            s["eng_area_construida_implantacao"] = formatar_numero_br(
                round(float(sol.area_m2) * sol.ocupacao_percentual / 100, 2)
            )
    if crono is not None:
        s["prazo_implantacao_inicio"] = crono.dados.get("inicio_obras", "")
        s["prazo_implantacao_termino"] = crono.dados.get("termino_obras", "")
    return s


def _registro(db: Session, usuario: Usuario) -> Evtf | None:
    return db.query(Evtf).filter(Evtf.usuario_id == usuario.id).first()


def _montar_estado(db: Session, usuario: Usuario) -> EvtfEstado:
    reg = _registro(db, usuario)
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    enviados = (
        db.query(Documento)
        .filter(Documento.usuario_id == usuario.id, Documento.tipo.in_([TIPO_ARQUIVO, TIPO_EXCEL]))
        .order_by(Documento.data_envio, Documento.id)
        .all()
    )
    arquivos = [d for d in enviados if d.tipo == TIPO_ARQUIVO]
    excel = [d for d in enviados if d.tipo == TIPO_EXCEL]
    return EvtfEstado(
        dados=reg.dados if reg else None,
        atualizado_em=reg.data_atualizacao if reg else None,
        sugestao=_sugestao(usuario, sol, db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()),
        arquivos=[DocumentoOut.model_validate(a) for a in arquivos],
        arquivos_excel=[DocumentoOut.model_validate(a) for a in excel],
        max_arquivos=docs.MAX_ARQUIVOS_POR_TIPO,
        max_mb=settings.upload_max_mb,
        concluido=bool(reg or (arquivos and excel)),
    )


@router.get("/evtf/minha", response_model=EvtfEstado)
def estado(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return _montar_estado(db, usuario)


@router.put("/evtf/minha", response_model=EvtfEstado)
def salvar(payload: EvtfIn, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if payload.cnpj != usuario.cnpj:
        raise HTTPException(status_code=422, detail="O CNPJ do EVTF deve ser o mesmo do seu login.")
    reg = _registro(db, usuario)
    if reg is None:
        reg = Evtf(usuario_id=usuario.id, dados={})
        db.add(reg)
    reg.dados = payload.model_dump()
    db.commit()
    return _montar_estado(db, usuario)


@router.delete("/evtf/minha", status_code=204)
def apagar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Remove o EVTF do formulário (os arquivos enviados não são afetados)."""
    db.query(Evtf).filter(Evtf.usuario_id == usuario.id).delete()
    db.commit()


@router.get("/evtf/minha/pdf")
def baixar_pdf(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Gera o PDF na hora, a partir dos dados salvos."""
    reg = _registro(db, usuario)
    if reg is None:
        raise HTTPException(status_code=404, detail="Você ainda não salvou o EVTF pelo formulário.")
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    local = "Goiânia"
    if sol is not None and sol.declaracao_cidade:
        local = f"{sol.declaracao_cidade}/{sol.declaracao_uf}" if sol.declaracao_uf else sol.declaracao_cidade
    return Response(
        content=gerar_pdf(EvtfIn.model_validate(reg.dados), local),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="evtf.pdf"'},
    )
