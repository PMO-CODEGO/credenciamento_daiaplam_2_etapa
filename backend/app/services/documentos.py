"""Documentos do Anexo II: tipos aceitos (incisos), validação e armazenamento dos arquivos."""
import os
import uuid

from fastapi import HTTPException, UploadFile

from app.config import settings

# Documentos do Anexo II (incisos II a X do edital), mostrados como "Item 1" a "Item 9",
# na ordem em que aparecem no formulário.
# (chave, rótulo, obrigatório). O Inciso I é o próprio formulário (Anexo IV).
TIPOS = [
    ("inciso2", "Item 1 — Cópia do documento de identidade e CPF do responsável pela administração da sociedade", True),
    ("inciso3", "Item 2 — Em caso do exercício de representação, procuração nos termos do art. 5º do presente regulamento", False),
    ("inciso4", "Item 3 — Cópia do contrato social e das alterações", True),
    ("inciso5", "Item 4 — Certidão Simplificada da empresa, emitida pela Junta Comercial, em até 30 (trinta) dias corridos", True),
    ("inciso6", "Item 5 — Certidão negativa de débitos junto à fazenda pública federal", True),
    ("inciso7", "Item 6 — Certidão negativa de débitos junto à fazenda pública estadual", True),
    ("inciso8", "Item 7 — Certidão negativa de débitos junto à fazenda pública municipal", True),
    ("inciso9", "Item 8 — Certificado de regularidade do FGTS", True),
    ("inciso10", "Item 9 — Certidão negativa de débitos trabalhistas", True),
]
TIPOS_POR_CHAVE = {chave: (rotulo, obrigatorio) for chave, rotulo, obrigatorio in TIPOS}
OBRIGATORIOS = [chave for chave, _r, obrigatorio in TIPOS if obrigatorio]

# Vários arquivos por inciso (ex.: contrato social + alterações).
MAX_ARQUIVOS_POR_TIPO = 5

# Documentação complementar (opcional), depois do Anexo XIII: o que a empresa quiser
# apresentar além dos itens pedidos. Aceita os mesmos formatos dos itens, com mais arquivos.
TIPO_COMPLEMENTAR = "complementar"
ROTULO_COMPLEMENTAR = "Documentação complementar"
MAX_ARQUIVOS_COMPLEMENTAR = 4


def limite_de_arquivos(tipo: str) -> int:
    return MAX_ARQUIVOS_COMPLEMENTAR if tipo == TIPO_COMPLEMENTAR else MAX_ARQUIVOS_POR_TIPO

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
    "inciso12": ("Anexo VI A — CFO, Cronograma Físico de Obras (arquivo próprio)", True),
    "inciso13": ("Anexo VII — Memorial de Caracterização do Empreendimento (arquivo próprio)", True),
    "evtf": ("Anexo V — Estudo de Viabilidade Técnica e Financeira (arquivo próprio)", True),
    "evtf_excel": ("Anexo V — Estudo de Viabilidade Técnica e Financeira em Excel editável", True),
}
# Formatos aceitos por tipo, quando diferem do padrão (PDF/JPG/PNG; Excel nos TIPOS_EXTRAS):
# o EVTF assinado vai em PDF ou imagem e a cópia editável, só em Excel.
FORMATOS_DO_TIPO = {
    "evtf": {"pdf", "jpg", "png"},
    "evtf_excel": {"xlsx", "xls"},
}


def formatos_aceitos(tipo: str) -> set[str]:
    if tipo in FORMATOS_DO_TIPO:
        return FORMATOS_DO_TIPO[tipo]
    return set(FORMATOS) | (set(FORMATOS_EXTRAS) if tipo in TIPOS_EXTRAS else set())


_NOMES_FORMATO = {"pdf": "PDF", "jpg": "JPG", "png": "PNG", "excel": "Excel (.xlsx ou .xls)"}


def _pasta() -> str:
    return os.path.join(settings.storage_dir, "documentos")


def caminho_absoluto(relativo: str) -> str:
    return os.path.join(_pasta(), relativo)


def salvar(usuario_id: int, arquivo: UploadFile, aceitos: set[str]) -> tuple[str, str, int]:
    """Valida e grava o arquivo (só os formatos em `aceitos`). Devolve (caminho relativo, content_type, tamanho)."""
    nome = arquivo.filename or ""
    extensao = os.path.splitext(nome)[1].lower()
    formatos = {k: v for k, v in {**FORMATOS, **FORMATOS_EXTRAS}.items() if k in aceitos}
    formato = {**EXTENSOES, **EXTENSOES_EXTRAS}.get(extensao)
    if formato not in formatos:
        nomes = [_NOMES_FORMATO[f] for f in ("pdf", "jpg", "png") if f in aceitos]
        if aceitos & {"xlsx", "xls"}:
            nomes.append(_NOMES_FORMATO["excel"])
        lista = ", ".join(nomes[:-1]) + " ou " + nomes[-1] if len(nomes) > 1 else nomes[0]
        raise HTTPException(status_code=422, detail=f"Formato não aceito. Envie {lista}.")

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
