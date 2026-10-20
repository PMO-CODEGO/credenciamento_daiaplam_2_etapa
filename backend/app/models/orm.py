from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, func

from app.database import Base


class Usuario(Base):
    """Empresa credenciada. O login é o CNPJ (só dígitos)."""

    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    cnpj = Column(String(14), nullable=False, unique=True, index=True)
    nome_empresarial = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    representante_nome = Column(String(255))  # Representante Legal (nulo nos cadastros antigos)
    representante_cpf = Column(String(11))
    senha_hash = Column(String(255), nullable=False)
    ativo = Column(Boolean, nullable=False, default=True)
    data_criacao = Column(DateTime, server_default=func.now())


class Cnae(Base):
    """Tabela de CNAEs aceitos (Anexo X). Código com 7 dígitos, só números."""

    __tablename__ = "cnaes"

    codigo = Column(String(7), primary_key=True)
    descricao = Column(String(500), nullable=False)


class Solicitacao(Base):
    """Formulário de solicitação de área (Anexo IV) — uma por empresa."""

    __tablename__ = "solicitacoes"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    distrito = Column(String(100), nullable=False, default="DIANOT 2ª ETAPA")
    area_m2 = Column(Numeric(14, 2), nullable=False)

    # Dados cadastrais da empresa
    nome_empresarial = Column(String(255), nullable=False)
    cnpj = Column(String(14), nullable=False)
    endereco_correspondencia = Column(String(500), nullable=False)
    email = Column(String(255), nullable=False)
    telefone = Column(String(11), nullable=False)

    # Dados cadastrais do administrador da sociedade
    administrador_nome = Column(String(255), nullable=False)
    administrador_cpf = Column(String(11), nullable=False)

    cnae_codigo = Column(String(7), ForeignKey("cnaes.codigo"), nullable=False)
    cnae_descricao = Column(String(500), nullable=False)

    # Declaração de compromisso (Anexo V do Regulamento), aceita no formulário.
    # Colunas aceitam nulo só por causa das solicitações salvas antes dela.
    representante_nome = Column(String(255))
    representante_cargo = Column(String(100))
    ocupacao_percentual = Column(Integer)  # 33 a 80
    obra_inicio = Column(String(7))  # "AAAA-MM"
    obra_fim = Column(String(7))  # "AAAA-MM"
    declaracao_cidade = Column(String(100))
    declaracao_aceita_em = Column(DateTime)  # data da assinatura (aceite) mais recente
    # Anexo IX — Declaração de Pleno Conhecimento do Objeto (aceite no formulário)
    conhecimento_objeto_aceito_em = Column(DateTime)
    # Anexo XIII — Declaração Liquidação Alienação de Áreas (aceite no formulário)
    sede_endereco = Column(String(500))
    liquidacao_prazo_meses = Column(Integer)  # 1 a 36
    liquidacao_aceita_em = Column(DateTime)

    data_criacao = Column(DateTime, server_default=func.now())
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Documento(Base):
    """Arquivo enviado pela empresa para um dos incisos do Anexo II."""

    __tablename__ = "documentos"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    tipo = Column(String(30), nullable=False)  # chave do inciso (ex.: "inciso2")
    nome_original = Column(String(255), nullable=False)
    arquivo = Column(String(255), nullable=False)  # caminho relativo no armazenamento
    content_type = Column(String(100), nullable=False)
    tamanho = Column(Integer, nullable=False)
    data_envio = Column(DateTime, server_default=func.now())


class Cronograma(Base):
    """Cronograma Físico de Obras (Inciso XII) preenchido no formulário — um por empresa."""

    __tablename__ = "cronogramas"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON, nullable=False)  # campos do formulário (ver schemas/cronograma.py)
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Mce(Base):
    """MCE (Inciso XIII, Anexo VII) preenchido no formulário + ciência da rede de água e esgoto."""

    __tablename__ = "mce"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON)  # campos do formulário (ver schemas/mce.py); nulo se só enviou arquivo
    ciencia_rede = Column(String(10))  # "aceito" ou "recuso"
    ciencia_em = Column(DateTime)
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())
