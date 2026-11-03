"""Colunas novas em tabelas que já existem.

O create_all só cria tabelas que faltam; não altera as existentes. Para o
banco de produção (Render + Aiven) receber as colunas sem rodar SQL à mão,
elas são adicionadas aqui na subida, se ainda não existirem. O mesmo SQL
está em database/migrations/ para bancos criados do zero.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger("codego.migracoes")

COLUNAS = {
    "usuarios": [
        ("representante_nome", "VARCHAR(255) NULL"),
        ("representante_cpf", "VARCHAR(11) NULL"),
        ("representante_cargo", "VARCHAR(100) NULL"),
        ("privacidade_ciente_em", "DATETIME NULL"),
    ],
    "solicitacoes": [
        ("representante_nome", "VARCHAR(255) NULL"),
        ("representante_cargo", "VARCHAR(100) NULL"),
        ("ocupacao_percentual", "INT NULL"),
        ("obra_inicio", "VARCHAR(7) NULL"),
        ("obra_fim", "VARCHAR(7) NULL"),
        ("declaracao_cidade", "VARCHAR(100) NULL"),
        ("declaracao_uf", "VARCHAR(2) NULL"),
        ("declaracao_aceita_em", "DATETIME NULL"),
        ("conhecimento_objeto_aceito_em", "DATETIME NULL"),
        ("sede_endereco", "VARCHAR(500) NULL"),
        ("liquidacao_prazo_meses", "INT NULL"),
        ("liquidacao_aceita_em", "DATETIME NULL"),
        ("preenchimento_nome", "VARCHAR(255) NULL"),
        ("preenchimento_cpf", "VARCHAR(11) NULL"),
        ("preenchimento_cargo", "VARCHAR(100) NULL"),
        ("liquidacao_forma", "VARCHAR(10) NULL"),
    ],
}


def aplicar(engine: Engine) -> None:
    inspetor = inspect(engine)
    with engine.begin() as conexao:
        for tabela, colunas in COLUNAS.items():
            existentes = {c["name"] for c in inspetor.get_columns(tabela)}
            for nome, tipo in colunas:
                if nome not in existentes:
                    conexao.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {nome} {tipo}"))
                    logger.info("Coluna %s.%s adicionada.", tabela, nome)
