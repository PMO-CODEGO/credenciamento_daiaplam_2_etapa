from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from app.database import Base


class Usuario(Base):
    """Empresa credenciada. O login é o CNPJ (só dígitos)."""

    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    cnpj = Column(String(14), nullable=False, unique=True, index=True)
    nome_empresarial = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    senha_hash = Column(String(255), nullable=False)
    ativo = Column(Boolean, nullable=False, default=True)
    data_criacao = Column(DateTime, server_default=func.now())
