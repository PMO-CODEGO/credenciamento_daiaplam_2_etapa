"""Envio final do credenciamento: pendências, protocolo, retrato do que foi entregue e PDF do comprovante."""
import base64
import hashlib
import os
import random
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session
from weasyprint import HTML

from app.models.orm import Cronograma, Documento, Envio, Evtf, Mce, Solicitacao, Usuario
from app.services import documentos as docs

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

PREFIXO_PROTOCOLO = "DIANOT"
MESES_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _cnpj(d: str) -> str:
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else d


def _cpf_mascarado(d: str) -> str:
    return f"{d[:3]}.***.***-{d[-2:]}" if len(d) == 11 else "***"


def _tel(d: str) -> str:
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def _iso(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%dT%H:%M:%S") if dt else None


def data_hora(valor: str | datetime | None) -> str:
    """'2026-10-20T17:30:00' -> '20/10/2026 às 17:30'."""
    if not valor:
        return ""
    dt = datetime.fromisoformat(valor) if isinstance(valor, str) else valor
    return dt.strftime("%d/%m/%Y às %H:%M")


# ---------------------------------------------------------------- dados da empresa
def _carregar(db: Session, usuario: Usuario):
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    arquivos = db.query(Documento).filter(Documento.usuario_id == usuario.id).order_by(Documento.data_envio, Documento.id).all()
    evtf = db.query(Evtf).filter(Evtf.usuario_id == usuario.id).first()
    crono = db.query(Cronograma).filter(Cronograma.usuario_id == usuario.id).first()
    mce = db.query(Mce).filter(Mce.usuario_id == usuario.id).first()
    return sol, arquivos, evtf, crono, mce


def pendencias(db: Session, usuario: Usuario) -> list[str]:
    sol, arquivos, evtf, crono, mce = _carregar(db, usuario)
    falta = []
    if sol is None:
        falta.append("Preencha e salve o formulário principal (Inciso I e declarações dos Anexos VI, IX e XIII).")
    else:
        for campo, nome in (
            ("declaracao_aceita_em", "Anexo VI (taxa de ocupação)"),
            ("conhecimento_objeto_aceito_em", "Anexo IX (pleno conhecimento do objeto)"),
            ("liquidacao_aceita_em", "Anexo XIII (liquidação)"),
        ):
            if getattr(sol, campo) is None:
                falta.append(f"Assine a declaração do {nome}.")
    por_tipo: dict[str, int] = {}
    for a in arquivos:
        por_tipo[a.tipo] = por_tipo.get(a.tipo, 0) + 1
    for chave in docs.OBRIGATORIOS:
        if not por_tipo.get(chave):
            falta.append(docs.TIPOS_POR_CHAVE[chave][0].split(" — ")[0] + ": envie o documento.")
    if not (evtf or por_tipo.get("evtf")):
        falta.append("Inciso XI (EVTF): preencha o formulário ou envie o arquivo.")
    if not (crono or por_tipo.get("inciso12")):
        falta.append("Inciso XII (Cronograma Físico de Obras): preencha o formulário ou envie o arquivo.")
    if not ((mce and mce.dados) or por_tipo.get("inciso13")):
        falta.append("Inciso XIII (MCE): preencha o formulário ou envie o arquivo.")
    if not mce or mce.ciencia_rede != "aceito":
        falta.append("Inciso XIII: responda \"Aceito\" na ciência da rede de água e esgoto.")
    return falta


# ---------------------------------------------------------------- retrato do envio
def _sha256(relativo: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(docs.caminho_absoluto(relativo), "rb") as f:
            for bloco in iter(lambda: f.read(1024 * 1024), b""):
                h.update(bloco)
        return h.hexdigest()
    except OSError:
        return None


def _itens(arquivos: list[Documento], tipo: str) -> list[dict]:
    return [
        {
            "nome": a.nome_original,
            "tamanho": a.tamanho,
            "enviado_em": _iso(a.data_envio),
            "sha256": _sha256(a.arquivo),
        }
        for a in arquivos
        if a.tipo == tipo
    ]


def montar_resumo(db: Session, usuario: Usuario) -> dict:
    sol, arquivos, evtf, crono, mce = _carregar(db, usuario)
    incisos = [{
        "rotulo": "Inciso I — Formulário Padrão para Solicitação de Área (Anexo IV)",
        "situacao": "formulario", "formulario_em": _iso(sol.data_atualizacao), "arquivos": [],
    }]
    for chave, rotulo, obrigatorio in docs.TIPOS:
        itens = _itens(arquivos, chave)
        incisos.append({
            "rotulo": rotulo,
            "situacao": "arquivos" if itens else "nao_enviado",
            "obrigatorio": obrigatorio,
            "arquivos": itens,
        })
    for chave, rotulo, reg in (
        ("evtf", "Inciso XI — Estudo de Viabilidade Técnica e Financeira — EVTF (Anexo V)", evtf),
        ("inciso12", "Inciso XII — Cronograma Físico de Obras (Anexo VI)", crono),
        ("inciso13", "Inciso XIII — Memorial de Caracterização do Empreendimento — MCE (Anexo VII)", mce if mce and mce.dados else None),
    ):
        itens = _itens(arquivos, chave)
        incisos.append({
            "rotulo": rotulo,
            "situacao": "ambos" if (itens and reg) else "arquivos" if itens else "formulario",
            "formulario_em": _iso(reg.data_atualizacao) if reg else None,
            "arquivos": itens,
        })
    declaracoes = [
        {"rotulo": "Declaração de compromisso com a Taxa de Ocupação de Área (Anexo VI)",
         "detalhe": f"Ocupação de {sol.ocupacao_percentual}% da área; obra de {sol.obra_inicio} a {sol.obra_fim}.",
         "assinada_em": _iso(sol.declaracao_aceita_em)},
        {"rotulo": "Declaração de Pleno Conhecimento do Objeto (Anexo IX)", "detalhe": "",
         "assinada_em": _iso(sol.conhecimento_objeto_aceito_em)},
        {"rotulo": "Declaração Liquidação Alienação de Áreas (Anexo XIII)",
         "detalhe": f"Prazo de liquidação declarado: {sol.liquidacao_prazo_meses} meses.",
         "assinada_em": _iso(sol.liquidacao_aceita_em)},
        {"rotulo": "Ciência da rede de água e esgoto fornecida pela CODEGO (Inciso XIII)",
         "detalhe": "Resposta: Aceito.", "assinada_em": _iso(mce.ciencia_em) if mce else None},
    ]
    return {
        "empresa": {
            "razao_social": usuario.nome_empresarial,
            "cnpj": usuario.cnpj,
            "email": sol.email,
            "telefone": sol.telefone,
            "endereco": sol.endereco_correspondencia,
            "distrito": sol.distrito,
            "area_m2": f"{float(sol.area_m2):,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "cnae": f"{sol.cnae_codigo} — {sol.cnae_descricao}",
            "administrador": f"{sol.administrador_nome} (CPF {_cpf_mascarado(sol.administrador_cpf)})",
            "representante": sol.representante_nome or "",
            "cargo": sol.representante_cargo or "",
        },
        "incisos": incisos,
        "declaracoes": declaracoes,
    }


def gerar_protocolo(db: Session) -> str:
    ano = datetime.now().year
    while True:
        protocolo = f"{PREFIXO_PROTOCOLO}-{ano}-{random.randint(10000, 99999)}"
        if not db.query(Envio).filter(Envio.protocolo == protocolo).first():
            return protocolo


# ---------------------------------------------------------------- PDF
def _tamanho(b: int) -> str:
    return f"{max(1, round(b / 1024))} KB" if b < 1048576 else f"{b / 1048576:.1f} MB".replace(".", ",")


def gerar_pdf(envio: Envio) -> bytes:
    with open(os.path.join(TEMPLATES_DIR, "assets", "logo_codego_regulamento.png"), "rb") as f:
        logo = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    resumo = envio.resumo
    emp = dict(resumo["empresa"])
    emp["cnpj"] = _cnpj(emp["cnpj"])
    emp["telefone"] = _tel(emp["telefone"])
    total_arquivos = sum(len(i["arquivos"]) for i in resumo["incisos"])
    html = _env.get_template("comprovante.html").render(
        logo=logo,
        protocolo=envio.protocolo,
        enviado_em=data_hora(envio.enviado_em),
        empresa=emp,
        incisos=resumo["incisos"],
        declaracoes=[{**d, "assinada_em": data_hora(d["assinada_em"])} for d in resumo["declaracoes"]],
        total_arquivos=total_arquivos,
        formatar_data=data_hora,
        tamanho=_tamanho,
    )
    return HTML(string=html, base_url=TEMPLATES_DIR).write_pdf()
