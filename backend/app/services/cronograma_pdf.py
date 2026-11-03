"""PDF do Cronograma Físico de Obras (Anexo VI A), no modelo do Regulamento.

O PDF não fica guardado no disco: é gerado na hora do download a partir dos
dados salvos no banco (no Render grátis o disco é apagado a cada reinício).
"""
import base64
import os

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.schemas.cronograma import CronogramaIn

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=True)

# Medidas (pt) da tabela do "Modelo do Cronograma": 12 meses por tabela;
# cronogramas mais longos continuam em novas tabelas.
LARGURA_TABELA = 589.6
LARGURA_COLUNA_SERVICO = 122.3
MESES_POR_BLOCO = 12

MESES_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _logo() -> str:
    with open(os.path.join(TEMPLATES_DIR, "assets", "logo_codego_regulamento.png"), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def _mes_ano_por_extenso(mes_ano: str) -> str:
    ano, mes = mes_ano.split("-")
    return f"{MESES_PT[int(mes) - 1]}/{ano}"


def _percentual(valor: float) -> str:
    return f"{valor:g}%".replace(".", ",") if valor else ""


def _cnpj(d: str) -> str:
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else d


def gerar_pdf(dados: CronogramaIn, cnpj: str) -> bytes:
    total = len(dados.servicos[0].percentuais)
    meses = [{"rotulo": f"{i + 1}º mês"} for i in range(total)]
    por_coluna = min(total, MESES_POR_BLOCO)
    largura_mes = round((LARGURA_TABELA - LARGURA_COLUNA_SERVICO) / por_coluna, 2)

    blocos = []
    for ini in range(0, total, MESES_POR_BLOCO):
        fim = min(ini + MESES_POR_BLOCO, total)
        blocos.append({
            "meses": meses[ini:fim],
            "trimestres": [
                {"rotulo": f"{t // 3 + 1}º Trimestre", "colunas": min(t + 3, fim) - t}
                for t in range(ini, fim, 3)
            ],
            "linhas": [
                {"descricao": s.descricao, "celulas": [_percentual(p) for p in s.percentuais[ini:fim]]}
                for s in dados.servicos
            ],
            "largura_mes": largura_mes,
            "largura": round(LARGURA_COLUNA_SERVICO + largura_mes * (fim - ini), 2),
        })

    html = _env.get_template("cronograma.html").render(
        logo_data_uri=_logo(),
        rodape=f"Credenciamento DAIAPLAM 2ª etapa — CNPJ {_cnpj(cnpj)}",
        nome_empresa=dados.nome_empresa,
        endereco=dados.endereco,
        area_empresa=dados.area_empresa,
        area_construida=dados.area_construida,
        inicio_obras=_mes_ano_por_extenso(dados.inicio_obras),
        termino_obras=_mes_ano_por_extenso(dados.termino_obras),
        blocos=blocos,
    )
    # base_url: o @font-face do template acha as fontes em assets/fonts.
    return HTML(string=html, base_url=TEMPLATES_DIR).write_pdf()
