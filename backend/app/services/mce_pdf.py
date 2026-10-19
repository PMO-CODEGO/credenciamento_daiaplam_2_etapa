"""PDF do Memorial de Caracterização do Empreendimento (Inciso XIII), no modelo oficial (Rev. 2).

Como o do cronograma, o PDF é gerado na hora do download a partir dos dados salvos.
"""
import base64
import os
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.schemas.mce import MCE_ESTRUTURA, MceIn

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

MESES_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _fundo() -> str:
    with open(os.path.join(TEMPLATES_DIR, "assets", "fundo_mce_codego.png"), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def _cnpj(d: str) -> str:
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else d


def _cep(d: str) -> str:
    return f"{d[:5]}-{d[5:]}" if len(d) == 8 else d


def _telefone(d: str) -> str:
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def gerar_pdf(dados: MceIn, cnpj_usuario: str) -> bytes:
    valores = dados.model_dump()
    valores["cnpj"] = _cnpj(dados.cnpj)
    valores["cep"] = _cep(dados.cep)
    valores["telefone"] = _telefone(dados.telefone)
    valores["mao_obra_total"] = dados.mao_obra_total
    for campo in ("area_total_terreno", "area_construida", "area_verde"):
        if valores[campo]:
            valores[campo] = f"{valores[campo]} m²"
    if dados.previsao_funcionamento:
        ano, mes = dados.previsao_funcionamento.split("-")
        valores["previsao_funcionamento"] = f"{MESES_PT[int(mes) - 1]}/{ano}"
    for campo in ("data_inicio_operacoes", "pca_data_revisao"):
        if valores[campo]:
            valores[campo] = datetime.strptime(valores[campo], "%Y-%m-%d").strftime("%d/%m/%Y")

    # Campos opcionais em branco aparecem como "Não informado", como no modelo.
    secoes = []
    for secao in MCE_ESTRUTURA:
        subsecoes = []
        for sub in secao["subsecoes"]:
            itens = []
            for campo, rotulo in sub["campos"]:
                valor = valores[campo]
                if isinstance(valor, str):
                    valor = valor.strip()
                itens.append({"rotulo": rotulo, "valor": valor if valor != "" else "Não informado"})
            subsecoes.append({**sub, "itens": itens})
        secoes.append({"titulo": secao["titulo"], "subsecoes": subsecoes})

    agora = datetime.now()
    html = _env.get_template("mce.html").render(
        fundo_data_uri=_fundo(),
        rodape=f"DIANOT 2ª etapa — CNPJ {_cnpj(cnpj_usuario)}",
        secoes=secoes,
        local=dados.local_cidade_uf,
        data=f"{agora.day:02d} de {MESES_PT[agora.month - 1]} de {agora.year}",
        responsavel_nome=dados.responsavel_nome,
        responsavel_cargo=dados.responsavel_cargo,
        razao_social=dados.razao_social,
        cnpj=_cnpj(dados.cnpj),
    )
    return HTML(string=html, base_url=TEMPLATES_DIR).write_pdf()
