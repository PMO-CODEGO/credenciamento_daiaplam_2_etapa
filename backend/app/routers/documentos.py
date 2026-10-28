import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.orm import Documento, Usuario
from app.routers.auth import usuario_atual
from app.schemas.documentos import DocumentoOut, DocumentosOut, TipoDocumentoOut
from app.services import documentos as docs

router = APIRouter()


def _do_usuario(db: Session, usuario: Usuario, documento_id: int) -> Documento:
    d = db.get(Documento, documento_id)
    if d is None or d.usuario_id != usuario.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    return d


@router.get("/documentos", response_model=DocumentosOut)
def listar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    """Itens do Anexo II e documentação complementar, com os arquivos já enviados pela empresa."""
    enviados = (
        db.query(Documento).filter(Documento.usuario_id == usuario.id).order_by(Documento.data_envio, Documento.id).all()
    )
    return DocumentosOut(
        tipos=[
            TipoDocumentoOut(
                tipo=chave,
                rotulo=rotulo,
                obrigatorio=obrigatorio,
                arquivos=[DocumentoOut.model_validate(d) for d in enviados if d.tipo == chave],
            )
            for chave, rotulo, obrigatorio in docs.TIPOS
        ],
        complementar=TipoDocumentoOut(
            tipo=docs.TIPO_COMPLEMENTAR,
            rotulo=docs.ROTULO_COMPLEMENTAR,
            obrigatorio=False,
            arquivos=[DocumentoOut.model_validate(d) for d in enviados if d.tipo == docs.TIPO_COMPLEMENTAR],
        ),
        max_arquivos_por_tipo=docs.MAX_ARQUIVOS_POR_TIPO,
        max_arquivos_complementar=docs.MAX_ARQUIVOS_COMPLEMENTAR,
        max_mb=settings.upload_max_mb,
    )


@router.post("/documentos/{tipo}", response_model=DocumentoOut, status_code=201)
def enviar(
    tipo: str,
    arquivo: UploadFile = File(...),
    usuario: Usuario = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    if tipo not in docs.TIPOS_POR_CHAVE and tipo not in docs.TIPOS_EXTRAS and tipo != docs.TIPO_COMPLEMENTAR:
        raise HTTPException(status_code=404, detail="Tipo de documento desconhecido.")
    # Itens 1 a 9 em ordem: só aceita depois dos itens obrigatórios anteriores (como na tela).
    if tipo in docs.TIPOS_POR_CHAVE:
        for chave, rotulo, obrigatorio in docs.TIPOS:
            if chave == tipo:
                break
            if obrigatorio and not db.query(Documento).filter(
                Documento.usuario_id == usuario.id, Documento.tipo == chave
            ).count():
                raise HTTPException(status_code=422, detail=f"Envie primeiro o {rotulo.split(' — ')[0]}.")
    ja_enviados = db.query(Documento).filter(Documento.usuario_id == usuario.id, Documento.tipo == tipo).count()
    limite = docs.limite_de_arquivos(tipo)
    if ja_enviados >= limite:
        raise HTTPException(
            status_code=422, detail=f"Limite de {limite} arquivos neste item. Remova um para enviar outro."
        )
    relativo, content_type, tamanho = docs.salvar(usuario.id, arquivo, docs.formatos_aceitos(tipo))
    d = Documento(
        usuario_id=usuario.id,
        tipo=tipo,
        nome_original=os.path.basename(arquivo.filename or "arquivo")[:255],
        arquivo=relativo,
        content_type=content_type,
        tamanho=tamanho,
    )
    db.add(d)
    try:
        db.commit()
    except Exception:
        docs.remover(relativo)
        raise
    db.refresh(d)
    return d


@router.get("/documentos/{documento_id}/arquivo")
def baixar(documento_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    d = _do_usuario(db, usuario, documento_id)
    caminho = docs.caminho_absoluto(d.arquivo)
    if not os.path.isfile(caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no armazenamento.")
    return FileResponse(caminho, media_type=d.content_type, filename=d.nome_original, content_disposition_type="inline")


@router.delete("/documentos/{documento_id}", status_code=204)
def remover(documento_id: int, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    d = _do_usuario(db, usuario, documento_id)
    relativo = d.arquivo
    db.delete(d)
    db.commit()
    docs.remover(relativo)
