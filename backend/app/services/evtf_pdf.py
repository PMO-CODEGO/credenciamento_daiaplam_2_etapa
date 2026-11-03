"""PDF do EVTF (Formulário de Viabilidade Técnica e Financeira), no modelo do Sistema Cadastral.

Como o do cronograma, o PDF é gerado na hora do download a partir dos dados salvos.
"""
import base64
import os
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.schemas.evtf import EvtfIn

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)


def _logo() -> str:
    with open(os.path.join(TEMPLATES_DIR, "assets", "logo_codego_regulamento.png"), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def _cnpj(d: str) -> str:
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else d


def _cpf(d: str) -> str:
    return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}" if len(d) == 11 else d


def _cep(d: str) -> str:
    return f"{d[:5]}-{d[5:]}" if len(d) == 8 else d


def _telefone(d: str) -> str:
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def _mes_ano(v: str) -> str:
    return f"{v[5:]}/{v[:4]}" if v else ""


def gerar_pdf(dados: EvtfIn, local: str) -> bytes:
    v = dados.model_dump()
    v["cnpj"] = _cnpj(dados.cnpj)
    v["cep"] = _cep(dados.cep)
    v["telefone"] = _telefone(dados.telefone)
    v["responsavel_cpf"] = _cpf(dados.responsavel_cpf)
    v["responsavel_cep"] = _cep(dados.responsavel_cep)
    for campo in ("prazo_implantacao_inicio", "prazo_implantacao_termino", "prazo_expansao_inicio", "prazo_expansao_termino"):
        v[campo] = _mes_ano(v[campo])
    if dados.capital_social_data:
        v["capital_social_data"] = datetime.strptime(dados.capital_social_data, "%Y-%m-%d").strftime("%d/%m/%Y")

    html = _env.get_template("evtf.html").render(
        logo_data_uri=_logo(),
        rodape=f"Credenciamento DAIAPLAM 2ª etapa — CNPJ {v['cnpj']}",
        cidade_data=f"{local}, {datetime.now():%d/%m/%Y}",
        **v,
    )
    return HTML(string=html, base_url=TEMPLATES_DIR).write_pdf()
