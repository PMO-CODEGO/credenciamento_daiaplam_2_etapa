"""Tela da equipe da CODEGO (equipe.html): acompanhar os credenciamentos.

Login próprio (tabela equipe, usuários criados por app.scripts.equipe): lista todas as
empresas cadastradas com a situação de cada uma e, em cada empresa, os dados, os
documentos, os PDFs dos incisos e os comprovantes. A única alteração possível é apagar um
cadastro (ex.: de teste), com o CNPJ digitado para confirmar.
"""
import logging
import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import (
    CienciaAnexo, Cronograma, Documento, Envio, Equipe, Evtf, Mce, Rascunho, Solicitacao, Usuario,
)
from app.routers import cronograma as cronograma_rotas
from app.routers import documentos as documentos_rotas
from app.routers import evtf as evtf_rotas
from app.routers import mce as mce_rotas
from app.schemas.solicitacao import SolicitacaoOut
from app.services import ciencias
from app.services import documentos as docs
from app.config import settings
from app.services import envio as envio_servico
from app.services.email_service import email_ativo, enviar_para_codego
from app.services.seguranca import (
    PAPEL_EQUIPE,
    LimiteTentativas,
    criar_token_equipe,
    decodificar_token,
    verificar_senha,
)

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

_falhas = LimiteTentativas("login_equipe", maximo=5, janela_s=15 * 60)
ERRO_LOGIN = "E-mail ou senha incorretos."


class LoginEquipeIn(BaseModel):
    email: str
    senha: str


def membro_atual(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> Equipe:
    dados = decodificar_token(cred.credentials) if cred else None
    membro = db.get(Equipe, int(dados["sub"])) if dados and dados.get("papel") == PAPEL_EQUIPE else None
    if membro is None or not membro.ativo:
        raise HTTPException(status_code=401, detail="Sessão expirada. Entre novamente.")
    return membro


def _empresa(db: Session, empresa_id: int) -> Usuario:
    empresa = db.get(Usuario, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return empresa


@router.post("/equipe/login")
def login(payload: LoginEquipeIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    chave = f"{request.client.host if request.client else '?'}|{email}"
    if _falhas.bloqueado(db, chave):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde 15 minutos e tente novamente.")
    membro = db.query(Equipe).filter(Equipe.email == email).first()
    if not verificar_senha(payload.senha[:72], membro.senha_hash if membro else None) or not membro.ativo:
        _falhas.registrar(db, chave)
        raise HTTPException(status_code=401, detail=ERRO_LOGIN)
    _falhas.zerar(db, chave)
    membro.ultimo_acesso = datetime.now()
    db.commit()
    return {"access_token": criar_token_equipe(membro.id), "membro": {"nome": membro.nome, "email": membro.email}}


@router.get("/equipe/me")
def me(membro: Equipe = Depends(membro_atual)):
    return {"nome": membro.nome, "email": membro.email}


# ------------------------------------------------------------------ situação
def _ultima_atividade(db: Session, empresa: Usuario) -> datetime | None:
    datas = [empresa.data_criacao]
    for modelo, coluna in (
        (Solicitacao, Solicitacao.data_atualizacao), (Rascunho, Rascunho.data_atualizacao),
        (Documento, Documento.data_envio), (Evtf, Evtf.data_atualizacao),
        (Cronograma, Cronograma.data_atualizacao), (Mce, Mce.data_atualizacao), (Mce, Mce.ciencia_em),
    ):
        datas.append(db.query(func.max(coluna)).filter(modelo.usuario_id == empresa.id).scalar())
    datas = [d for d in datas if d]
    return max(datas) if datas else None


def _resumo(db: Session, empresa: Usuario) -> dict:
    ultimo = db.query(Envio).filter(Envio.usuario_id == empresa.id).order_by(Envio.id.desc()).first()
    atividade = _ultima_atividade(db, empresa)
    if ultimo is not None:
        situacao = "finalizado"
    elif atividade and atividade > empresa.data_criacao:
        situacao = "preenchendo"
    else:
        situacao = "cadastrado"
    return {
        "id": empresa.id,
        "cnpj": empresa.cnpj,
        "nome_empresarial": empresa.nome_empresarial,
        "email": empresa.email,
        "cadastrado_em": empresa.data_criacao,
        "situacao": situacao,
        "protocolo": ultimo.protocolo if ultimo else None,
        "enviado_em": ultimo.enviado_em if ultimo else None,
        # Mudou algo depois do último envio (o comprovante não mostra essa mudança).
        "alterado_apos_envio": bool(ultimo and atividade and atividade > ultimo.enviado_em),
        "pendencias": len(envio_servico.pendencias(db, empresa)),
        "ultima_atividade": atividade,
    }


@router.get("/equipe/empresas")
def empresas(_m: Equipe = Depends(membro_atual), db: Session = Depends(get_db)):
    lista = db.query(Usuario).order_by(Usuario.data_criacao.desc()).all()
    return [_resumo(db, e) for e in lista]


@router.get("/equipe/empresas/{empresa_id}")
def empresa(empresa_id: int, _m: Equipe = Depends(membro_atual), db: Session = Depends(get_db)):
    e = _empresa(db, empresa_id)
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == e.id).first()
    rasc = db.query(Rascunho).filter(Rascunho.usuario_id == e.id).first()
    evtf = evtf_rotas.estado(usuario=e, db=db)
    crono = cronograma_rotas.estado(usuario=e, db=db)
    mce = mce_rotas.estado(usuario=e, db=db)
    envios = db.query(Envio).filter(Envio.usuario_id == e.id).order_by(Envio.id.desc()).all()
    docs_empresa = documentos_rotas.listar(usuario=e, db=db).model_dump()

    def inciso(estado, rotulo: str) -> dict:
        return {
            "rotulo": rotulo,
            "formulario": estado.dados is not None,
            "atualizado_em": estado.atualizado_em,
            "arquivos": [a.model_dump() for a in estado.arquivos],
            "concluido": estado.concluido,
        }

    return {
        "resumo": _resumo(db, e),
        "cadastro": {
            "cnpj": e.cnpj, "nome_empresarial": e.nome_empresarial, "email": e.email,
            "representante_nome": e.representante_nome, "representante_cpf": e.representante_cpf,
            "representante_cargo": e.representante_cargo,
            "cadastrado_em": e.data_criacao,
            "privacidade_ciente_em": e.privacidade_ciente_em,
        },
        "solicitacao": SolicitacaoOut.model_validate(sol).model_dump() if sol else None,
        "rascunho_em": rasc.data_atualizacao if rasc else None,
        "documentos": [*docs_empresa["tipos"], docs_empresa["complementar"]],
        "incisos": {
            "evtf": {**inciso(evtf, "Anexo V — Estudo de Viabilidade Técnica e Financeira (EVTF)"),
                     "arquivos": [a.model_dump() for a in [*evtf.arquivos, *evtf.arquivos_excel]]},
            "cronograma": inciso(crono, "Anexo VI A — CFO (Cronograma Físico de Obras)"),
            "mce": {**inciso(mce, "Anexo VII — Memorial de Caracterização do Empreendimento (MCE)"),
                    "ciencia": mce.ciencia, "ciencia_em": mce.ciencia_em},
        },
        "ciencias": ciencias.listar(db, e),
        # Do mais recente para o mais antigo; cada um com o que mudou em relação ao anterior.
        "envios": [{"id": v.id, "protocolo": v.protocolo, "enviado_em": v.enviado_em,
                    "mudancas": envio_servico.diferencas(envios[k + 1].resumo, v.resumo) if k + 1 < len(envios) else None}
                   for k, v in enumerate(envios)],
        "pendencias": envio_servico.pendencias(db, e),
    }


class ApagarEmpresaIn(BaseModel):
    cnpj: str  # digitado pela equipe para confirmar


@router.post("/equipe/empresas/{empresa_id}/apagar", status_code=204)
def apagar_empresa(empresa_id: int, payload: ApagarEmpresaIn, membro: Equipe = Depends(membro_atual),
                   db: Session = Depends(get_db)):
    """Apaga o cadastro da empresa (ex.: cadastros de teste): todos os dados, os envios e os
    arquivos enviados. Só com o CNPJ da empresa digitado para confirmar. Não tem volta."""
    e = _empresa(db, empresa_id)
    if "".join(c for c in payload.cnpj if c.isdigit()) != e.cnpj:
        raise HTTPException(status_code=422, detail="O CNPJ digitado não é o desta empresa.")
    arquivos = [d.arquivo for d in db.query(Documento).filter(Documento.usuario_id == e.id)]
    for modelo in (CienciaAnexo, Rascunho, Envio, Documento, Evtf, Cronograma, Mce, Solicitacao):
        db.query(modelo).filter(modelo.usuario_id == e.id).delete(synchronize_session=False)
    db.delete(e)
    db.commit()
    for relativo in arquivos:
        docs.remover(relativo)
    logging.getLogger("credenciamento.equipe").warning(
        "Cadastro apagado por %s: %s (CNPJ %s, %s arquivo(s)).", membro.email, e.nome_empresarial, e.cnpj, len(arquivos))


# ------------------------------------------------------------------ downloads
@router.get("/equipe/documentos/{documento_id}/arquivo")
def documento(documento_id: int, _m: Equipe = Depends(membro_atual), db: Session = Depends(get_db)):
    d = db.get(Documento, documento_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    caminho = docs.caminho_absoluto(d.arquivo)
    if not os.path.isfile(caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no armazenamento.")
    return FileResponse(caminho, media_type=d.content_type, filename=d.nome_original, content_disposition_type="inline")


@router.get("/equipe/empresas/{empresa_id}/{inciso}.pdf")
def pdf_inciso(empresa_id: int, inciso: str, _m: Equipe = Depends(membro_atual), db: Session = Depends(get_db)):
    rotas = {"evtf": evtf_rotas, "cronograma": cronograma_rotas, "mce": mce_rotas}.get(inciso)
    if rotas is None:
        raise HTTPException(status_code=404, detail="PDF não encontrado.")
    return rotas.baixar_pdf(usuario=_empresa(db, empresa_id), db=db)


@router.get("/equipe/envios/{envio_id}/comprovante.pdf")
def comprovante(envio_id: int, _m: Equipe = Depends(membro_atual), db: Session = Depends(get_db)):
    envio = db.get(Envio, envio_id)
    if envio is None:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return Response(
        content=envio_servico.gerar_pdf(envio),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="comprovante_{envio.protocolo}.pdf"'},
    )


@router.post("/equipe/envios/{envio_id}/enviar-codego", status_code=202)
def enviar_codego(envio_id: int, tarefas: BackgroundTasks, membro: Equipe = Depends(membro_atual),
                  db: Session = Depends(get_db)):
    """Manda (de novo) para a CODEGO o e-mail do envio finalizado, com as respostas e os arquivos.
    Serve para os envios feitos antes do e-mail automático, ou se o automático falhou."""
    envio = db.get(Envio, envio_id)
    if envio is None:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    if not email_ativo() or not settings.email_codego:
        raise HTTPException(status_code=503, detail="O envio de e-mail não está ligado no servidor (EMAIL_PROVIDER / EMAIL_CODEGO).")
    pdf = envio_servico.gerar_pdf(envio, db)
    tarefas.add_task(enviar_para_codego, settings.email_codego, envio.resumo, envio.protocolo,
                     envio_servico.data_hora(envio.enviado_em), pdf, envio_servico.arquivos_enviados(db, envio.usuario_id))
    logging.getLogger("credenciamento.equipe").info(
        "E-mail do protocolo %s pedido por %s para %s.", envio.protocolo, membro.email, settings.email_codego)
    return {"destino": settings.email_codego}
