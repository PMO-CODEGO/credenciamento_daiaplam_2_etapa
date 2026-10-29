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
from app.services import assinatura as selo
from app.services import ciencias
from app.services import documentos as docs
from app.services import rascunho as rascunhos

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


# Nomes curtos dos itens 1 a 9 para o checklist (o rótulo completo fica nos campos de envio).
NOMES_CURTOS = {
    "inciso2": "Item 1 — Identidade e CPF do administrador",
    "inciso3": "Item 2 — Procuração",
    "inciso4": "Item 3 — Contrato social e alterações",
    "inciso5": "Item 4 — Certidão simplificada (Junta Comercial)",
    "inciso6": "Item 5 — Certidão negativa federal",
    "inciso7": "Item 6 — Certidão negativa estadual",
    "inciso8": "Item 7 — Certidão negativa municipal",
    "inciso9": "Item 8 — Certificado do FGTS",
    "inciso10": "Item 9 — Certidão negativa trabalhista",
}


def checklist(db: Session, usuario: Usuario) -> list[dict]:
    """Tudo o que a empresa precisa fazer, na ordem do formulário, com o que já foi feito.

    Cada item: rotulo, feito, obrigatorio, detalhe (opcional) e pendencia — a mensagem
    que aparece em "o que falta" quando o item obrigatório não foi feito (None quando
    outro item já cobre, ex.: as declarações enquanto o formulário está incompleto).
    """
    sol, arquivos, evtf, crono, mce = _carregar(db, usuario)
    rasc = rascunhos.rascunho(db, usuario)
    form_ok = sol is not None and rasc is None
    por_tipo: dict[str, int] = {}
    for a in arquivos:
        por_tipo[a.tipo] = por_tipo.get(a.tipo, 0) + 1
    cientes = {c["anexo"]: c for c in ciencias.listar(db, usuario)}
    itens: list[dict] = []

    def item(rotulo: str, feito, pendencia: str | None, obrigatorio: bool = True, detalhe: str | None = None):
        itens.append({"rotulo": rotulo, "feito": bool(feito), "obrigatorio": obrigatorio,
                      "detalhe": detalhe, "pendencia": pendencia})

    def ciencia(anexo: str):
        c = cientes[anexo]
        item(ciencias.nome_da_ciencia(anexo), c["ciente_em"],
             "Declare ciência do texto de responsabilidade pelo preenchimento, no início do formulário."
             if anexo == ciencias.RESPONSABILIDADE
             else f"Anexo {anexo}: declare ciência (abra o anexo e marque a ciência).")

    def declaracao(rotulo: str, campo: str, nome: str):
        # Com o formulário incompleto, quem avisa é o item do Anexo IV.
        item(rotulo, form_ok and getattr(sol, campo) is not None,
             f"Assine a declaração do {nome}." if form_ok else None)

    ciencia(ciencias.RESPONSABILIDADE)
    for anexo in ("I", "II", "III"):
        ciencia(anexo)
    if rasc is not None:
        faltando = rascunhos.conferir(db, usuario, rasc.dados)[2] or ["revisar os dados"]
        item("Anexo IV — Requerimento", False,
             "Formulário principal (Anexo IV e declarações dos Anexos VI, IX e XII): falta " + ", ".join(faltando) + ".",
             detalhe="Falta: " + ", ".join(faltando[:3])
             + (f" e mais {len(faltando) - 3}." if len(faltando) > 3 else "."))
    else:
        item("Anexo IV — Requerimento", sol is not None,
             "Preencha o formulário principal (Anexo IV e declarações dos Anexos VI, IX e XII).")
    for chave, rotulo, obrigatorio in docs.TIPOS:
        item(NOMES_CURTOS.get(chave, rotulo), por_tipo.get(chave),
             rotulo.split(" — ")[0] + ": envie o documento." if obrigatorio else None, obrigatorio=obrigatorio)
    # Opção 1 do EVTF: o arquivo assinado e o mesmo formulário em Excel editável.
    evtf_falta = [nome for chave, nome in (("evtf", "o EVTF assinado"), ("evtf_excel", "o EVTF em Excel"))
                  if not por_tipo.get(chave)]
    so_metade = not evtf and len(evtf_falta) == 1
    item("Anexo V — EVTF", evtf or not evtf_falta,
         f"Anexo V (EVTF): envie também {evtf_falta[0]}." if so_metade
         else "Anexo V (EVTF): preencha o formulário ou envie o arquivo assinado e o Excel.",
         detalhe=f"Falta {evtf_falta[0]}." if so_metade else None)
    declaracao("Anexo VI — POA (declaração da taxa de ocupação)",
               "declaracao_aceita_em", "Anexo VI - POA (taxa de ocupação)")
    item("Anexo VI A — CFO",
         crono or por_tipo.get("inciso12"),
         "Anexo VI A (CFO, Cronograma Físico de Obras): preencha o formulário ou envie o arquivo.")
    item("Anexo VII — MCE",
         (mce and mce.dados) or por_tipo.get("inciso13"), "Anexo VII (MCE): preencha o formulário ou envie o arquivo.")
    item("Anexo VII — Ciência da rede de água e esgoto",
         mce and mce.ciencia_rede == "aceito", "Anexo VII: declare ciência da rede de água e esgoto.")
    ciencia("VIII")
    declaracao("Anexo IX — Declaração de pleno conhecimento e responsabilidade",
               "conhecimento_objeto_aceito_em", "Anexo IX (pleno conhecimento, responsabilidade e aceitação)")
    ciencia("X")
    ciencia("XI")
    declaracao("Anexo XII — Declaração de liquidação",
               "liquidacao_aceita_em", "Anexo XII (liquidação)")
    ciencia("XIII")
    item(docs.ROTULO_COMPLEMENTAR, por_tipo.get(docs.TIPO_COMPLEMENTAR), None, obrigatorio=False)
    return itens


def pendencias_de(itens: list[dict]) -> list[str]:
    return [i["pendencia"] for i in itens if i["obrigatorio"] and not i["feito"] and i["pendencia"]]


def pendencias(db: Session, usuario: Usuario) -> list[str]:
    return pendencias_de(checklist(db, usuario))


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
        "rotulo": "Anexo IV — Requerimento para solicitação de áreas",
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
    complementares = _itens(arquivos, docs.TIPO_COMPLEMENTAR)
    incisos.append({
        "rotulo": docs.ROTULO_COMPLEMENTAR,
        "situacao": "arquivos" if complementares else "nao_enviado",
        "obrigatorio": False,
        "arquivos": complementares,
    })
    for chaves, rotulo, reg in (
        (("evtf", "evtf_excel"), "Anexo V — Estudo de Viabilidade Técnica e Financeira — EVTF", evtf),
        (("inciso12",), "Anexo VI A — CFO, Cronograma Físico de Obras", crono),
        (("inciso13",), "Anexo VII — Memorial de Caracterização do Empreendimento — MCE", mce if mce and mce.dados else None),
    ):
        itens = [i for chave in chaves for i in _itens(arquivos, chave)]
        incisos.append({
            "rotulo": rotulo,
            "situacao": "ambos" if (itens and reg) else "arquivos" if itens else "formulario",
            "formulario_em": _iso(reg.data_atualizacao) if reg else None,
            "arquivos": itens,
        })
    declaracoes = [
        {"rotulo": "Anexo VI - POA — Declaração de compromisso com a Taxa de Ocupação de Área",
         "detalhe": f"Ocupação de {sol.ocupacao_percentual}% da área.",
         "assinada_em": _iso(sol.declaracao_aceita_em)},
        {"rotulo": "Anexo IX — Declaração de Pleno Conhecimento, Responsabilidade e Aceitação das Condições do Edital", "detalhe": "",
         "assinada_em": _iso(sol.conhecimento_objeto_aceito_em)},
        {"rotulo": "Anexo XII — Declaração Liquidação Alienação de Áreas",
         "detalhe": ("Pagamento à vista (prazo de liquidação de 1 mês)." if sol.liquidacao_forma == "a_vista"
                     else f"Pagamento parcelado; prazo de liquidação declarado: {sol.liquidacao_prazo_meses} "
                          f"{'mês' if sol.liquidacao_prazo_meses == 1 else 'meses'}."),
         "assinada_em": _iso(sol.liquidacao_aceita_em)},
        {"rotulo": "Ciência da rede de água e esgoto fornecida pela CODEGO (Anexo VII)",
         "detalhe": "Declarou ciência.", "assinada_em": _iso(mce.ciencia_em) if mce else None},
    ] + [
        {"rotulo": f"Ciência: {c['rotulo']}", "detalhe": "",
         "assinada_em": _iso(c["ciente_em"])}
        for c in ciencias.listar(db, usuario)
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
            "preenchimento": sol.preenchimento_nome or "",
        },
        "incisos": incisos,
        "declaracoes": declaracoes,
    }


def declaracao_final(db: Session, usuario: Usuario, aceita_em: datetime) -> dict:
    """Linha do comprovante para o "Li e Concordo" da declaração final de responsabilidade."""
    sol = db.query(Solicitacao).filter(Solicitacao.usuario_id == usuario.id).first()
    quem = sol.preenchimento_nome if sol and sol.preenchimento_nome else ""
    return {
        "rotulo": 'Declaração de responsabilidade pelo preenchimento ("Li e Concordo")',
        "detalhe": f"Responsável pelo preenchimento: {quem}." if quem else "",
        "assinada_em": _iso(aceita_em),
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
    with open(os.path.join(TEMPLATES_DIR, "assets", "assinatura_codego.png"), "rb") as f:
        fundo_assinatura = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    assinatura = selo.calcular(envio.id, envio.protocolo, resumo["empresa"]["cnpj"], envio.enviado_em, resumo)
    html = _env.get_template("comprovante.html").render(
        logo=logo,
        assinatura=assinatura,
        fundo_assinatura=fundo_assinatura,
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
