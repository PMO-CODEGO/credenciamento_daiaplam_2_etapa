"""Ciência nos anexos que a empresa só visualiza (sem formulário nem envio de arquivo)."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.orm import CienciaAnexo, Usuario

# (anexo, título), na ordem em que aparecem no formulário.
ANEXOS = [
    ("I", "Mapa das áreas disponíveis"),
    ("II", "Documentos de apresentação integral e obrigatória"),
    ("III", "Critérios de pontuação para definição do subsídio locacional"),
    ("VIII", "Fator para cálculo do subsídio do valor da área"),
    ("X", "Tabelas de pontuação e CNAEs"),
    ("XI", "Minuta de contrato CDRU"),
    ("XIII", "Regulamento para Alienações e Empreendimentos da CODEGO 2026"),
]
TITULOS = dict(ANEXOS)


def listar(db: Session, usuario: Usuario) -> list[dict]:
    """Todos os anexos, com a data da ciência (ou None)."""
    feitas = {
        c.anexo: c.ciente_em
        for c in db.query(CienciaAnexo).filter(CienciaAnexo.usuario_id == usuario.id).all()
    }
    return [{"anexo": a, "titulo": t, "ciente_em": feitas.get(a)} for a, t in ANEXOS]


def registrar(db: Session, usuario: Usuario, anexo: str, ciente: bool) -> None:
    reg = (
        db.query(CienciaAnexo)
        .filter(CienciaAnexo.usuario_id == usuario.id, CienciaAnexo.anexo == anexo)
        .first()
    )
    if ciente and reg is None:
        db.add(CienciaAnexo(usuario_id=usuario.id, anexo=anexo, ciente_em=datetime.now()))
    elif not ciente and reg is not None:
        db.delete(reg)
    db.commit()


def pendentes(db: Session, usuario: Usuario) -> list[str]:
    return [c["anexo"] for c in listar(db, usuario) if c["ciente_em"] is None]
