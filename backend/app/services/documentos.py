"""Documentos do Anexo II: tipos aceitos (incisos), validação e armazenamento dos arquivos."""
import os
import uuid

from fastapi import HTTPException, UploadFile

from app.config import settings

# Incisos do Anexo II, na ordem em que aparecem no formulário.
# (chave, rótulo, obrigatório). O Inciso I é o próprio formulário (Anexo IV).
TIPOS = [
    ("inciso2", "Inciso II — Cópia do documento de identidade e CPF do responsável pela administração da sociedade", True),
    ("inciso3", "Inciso III — Em caso do exercício de representação, procuração nos termos do art. 5º do presente regulamento", False),
    ("inciso4", "Inciso IV — Cópia do contrato social e das alterações", True),
    ("inciso5", "Inciso V — Certidão Simplificada da empresa, emitida pela Junta Comercial, em até 30 (trinta) dias corridos", True),
    ("inciso6", "Inciso VI — Certidão negativa de débitos junto à fazenda pública federal", True),
    ("inciso7", "Inciso VII — Certidão negativa de débitos junto à fazenda pública estadual", True),
    ("inciso8", "Inciso VIII — Certidão negativa de débitos junto à fazenda pública municipal", True),
    ("inciso9", "Inciso IX — Certificado de regularidade do FGTS", True),
    ("inciso10", "Inciso X — Certidão negativa de débitos trabalhistas", True),
]
TIPOS_POR_CHAVE = {chave: (rotulo, obrigatorio) for chave, rotulo, obrigatorio in TIPOS}
OBRIGATORIOS = [chave for chave, _r, obrigatorio in TIPOS if obrigatorio]

# Vários arquivos por inciso (ex.: contrato social + alterações).
MAX_ARQUIVOS_POR_TIPO = 5

# Formatos aceitos, conferidos pelo conteúdo do arquivo (não só pela extensão).
FORMATOS = {
    "pdf": (b"%PDF-", "application/pdf"),
    "jpg": (b"\xff\xd8\xff", "image/jpeg"),
    "png": (b"\x89PNG\r\n\x1a\n", "image/png"),
}
EXTENSOES = {".pdf": "pdf", ".jpg": "jpg", ".jpeg": "jpg", ".png": "png"}

# Tipos que não aparecem na lista do Anexo II (têm tela própria), mas usam o mesmo
# envio de arquivos. chave -> (rótulo, formatos extras aceitos além de PDF/JPG/PNG).
FORMATOS_EXTRAS = {
    "xlsx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "xls": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/vnd.ms-excel"),
}
EXTENSOES_EXTRAS = {".xlsx": "xlsx", ".xls": "xls"}
TIPOS_EXTRAS = {
    "inciso12": ("Inciso XII — Cronograma Físico de Obras (arquivo próprio)", True),
    "inciso13": ("Inciso XIII — Memorial de Caracterização do Empreendimento (arquivo próprio)", True),
    "evtf": ("Inciso XI — Estudo de Viabilidade Técnica e Financeira (arquivo próprio)", True),
}


def _pasta() -> str:
    return os.path.join(settings.storage_dir, "documentos")


def caminho_absoluto(relativo: str) -> str:
    return os.path.join(_pasta(), relativo)


def salvar(usuario_id: int, arquivo: UploadFile, aceita_excel: bool = False) -> tuple[str, str, int]:
    """Valida e grava o arquivo. Devolve (caminho relativo, content_type, tamanho)."""
    nome = arquivo.filename or ""
    extensao = os.path.splitext(nome)[1].lower()
    formatos = dict(FORMATOS)
    extensoes = dict(EXTENSOES)
    if aceita_excel:
        formatos.update(FORMATOS_EXTRAS)
        extensoes.update(EXTENSOES_EXTRAS)
    formato = extensoes.get(extensao)
    if formato is None:
        raise HTTPException(
            status_code=422,
            detail="Formato não aceito. Envie PDF, JPG, PNG ou Excel." if aceita_excel else "Formato não aceito. Envie PDF, JPG ou PNG.",
        )

    limite = settings.upload_max_mb * 1024 * 1024
    conteudo = arquivo.file.read(limite + 1)
    if len(conteudo) > limite:
        raise HTTPException(status_code=413, detail=f"Arquivo maior que {settings.upload_max_mb} MB.")
    if not conteudo:
        raise HTTPException(status_code=422, detail="O arquivo está vazio.")
    assinatura, content_type = formatos[formato]
    if not conteudo.startswith(assinatura):
        raise HTTPException(status_code=422, detail="O conteúdo do arquivo não corresponde ao formato informado.")

    relativo = os.path.join(str(usuario_id), f"{uuid.uuid4().hex}.{formato}")
    destino = caminho_absoluto(relativo)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "wb") as f:
        f.write(conteudo)
    return relativo, content_type, len(conteudo)


def remover(relativo: str) -> None:
    try:
        os.remove(caminho_absoluto(relativo))
    except FileNotFoundError:
        pass
