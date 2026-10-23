"""CNAE: normalização, validação contra a tabela do banco e carga a partir do Anexo X."""
import csv
import logging
import os

from sqlalchemy.orm import Session

from app.models.orm import Cnae, Solicitacao
from app.schemas.validacoes import somente_digitos

logger = logging.getLogger("codego.cnae")

# Tabela de CNAEs do Anexo X do edital (subclasses), gerada a partir do PDF do anexo.
ARQUIVO_PADRAO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "cnaes.csv")


def normalizar(valor: str) -> str:
    """'1091-1/02' -> '1091102' (só dígitos)."""
    return somente_digitos(valor)


def formatar(codigo: str) -> str:
    """'1091102' -> '1091-1/02'."""
    return f"{codigo[:4]}-{codigo[4]}/{codigo[5:]}" if len(codigo) == 7 else codigo


def buscar(db: Session, valor: str) -> Cnae | None:
    codigo = normalizar(valor)
    if len(codigo) != 7:
        return None
    return db.get(Cnae, codigo)


def importar_csv(db: Session, caminho: str = ARQUIVO_PADRAO, substituir: bool = False) -> int:
    """Carrega 'codigo;descricao' (UTF-8; colunas extras são ignoradas). Retorna quantos CNAEs foram gravados."""
    if not os.path.isfile(caminho):
        return 0
    if substituir:
        # só é seguro se nenhuma solicitação referencia CNAEs removidos
        db.query(Cnae).delete()
    existentes = {c for (c,) in db.query(Cnae.codigo).all()}
    total = 0
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            codigo = normalizar(linha.get("codigo", ""))
            descricao = (linha.get("descricao") or "").strip()
            if len(codigo) != 7 or not descricao:
                continue
            if codigo in existentes:
                db.query(Cnae).filter(Cnae.codigo == codigo).update({"descricao": descricao})
            else:
                db.add(Cnae(codigo=codigo, descricao=descricao))
                existentes.add(codigo)
            total += 1
    db.commit()
    return total


def sincronizar(db: Session) -> None:
    """Deixa a tabela igual ao arquivo padrão: grava/atualiza os CNAEs dele e remove os
    que saíram, exceto os que alguma solicitação já usa (a chave estrangeira exige)."""
    n = importar_csv(db)
    if not n:
        return
    no_arquivo = set()
    with open(ARQUIVO_PADRAO, encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            no_arquivo.add(normalizar(linha.get("codigo", "")))
    usados = {c for (c,) in db.query(Solicitacao.cnae_codigo).distinct().all()}
    sobras = [c for (c,) in db.query(Cnae.codigo).all() if c not in no_arquivo and c not in usados]
    if sobras:
        db.query(Cnae).filter(Cnae.codigo.in_(sobras)).delete(synchronize_session=False)
        db.commit()
    logger.info("CNAEs: %s do arquivo padrão; %s fora dele removido(s).", n, len(sobras))
