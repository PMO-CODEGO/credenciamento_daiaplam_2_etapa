from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func

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
    privacidade_ciente_em = Column(DateTime)  # ciência do Aviso de Privacidade (LGPD) no cadastro
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
    # Datas da obra: não são mais pedidas no Anexo VI (ficam no Cronograma); colunas mantidas pelos dados antigos.
    obra_inicio = Column(String(7))  # "AAAA-MM"
    obra_fim = Column(String(7))  # "AAAA-MM"
    declaracao_cidade = Column(String(100))
    declaracao_uf = Column(String(2))  # estado da assinatura (ex.: "GO")
    declaracao_aceita_em = Column(DateTime)  # data da assinatura (aceite) mais recente
    # Anexo IX — Declaração de Pleno Conhecimento do Objeto (aceite no formulário)
    conhecimento_objeto_aceito_em = Column(DateTime)
    # Anexo XII — Declaração Liquidação Alienação de Áreas (aceite no formulário)
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
    """Cronograma Físico de Obras (Anexo VI) preenchido no formulário — um por empresa."""

    __tablename__ = "cronogramas"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON, nullable=False)  # campos do formulário (ver schemas/cronograma.py)
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Mce(Base):
    """MCE (Anexo VII) preenchido no formulário + ciência da rede de água e esgoto."""

    __tablename__ = "mce"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON)  # campos do formulário (ver schemas/mce.py); nulo se só enviou arquivo
    ciencia_rede = Column(String(10))  # "aceito" ou "recuso"
    ciencia_em = Column(DateTime)
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Evtf(Base):
    """EVTF (Formulário de Viabilidade Técnica e Financeira) preenchido no formulário — um por empresa."""

    __tablename__ = "evtf"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON, nullable=False)  # campos do formulário (ver schemas/evtf.py)
    data_atualizacao = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CienciaAnexo(Base):
    """Ciência da empresa em um anexo só de leitura (I, II, III, VIII, X, XI e XIII)."""

    __tablename__ = "ciencias_anexos"
    __table_args__ = (UniqueConstraint("usuario_id", "anexo"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    anexo = Column(String(5), nullable=False)  # "I", "II", ... (ver services/ciencias.py)
    ciente_em = Column(DateTime, nullable=False)


class Envio(Base):
    """Envio final do credenciamento: protocolo + retrato do que estava anexado/preenchido na hora."""

    __tablename__ = "envios"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    protocolo = Column(String(30), nullable=False, unique=True)
    enviado_em = Column(DateTime, nullable=False)
    resumo = Column(JSON, nullable=False)  # ver services/envio.py (montar_resumo)


class Tentativa(Base):
    """Tentativas de login/cadastro, para o limite continuar valendo depois de reiniciar o servidor."""

    __tablename__ = "tentativas"

    id = Column(Integer, primary_key=True, index=True)
    chave = Column(String(120), nullable=False, index=True)  # ex.: "login|IP|CNPJ"
    criado_em = Column(DateTime, nullable=False, index=True)


class Rascunho(Base):
    """Formulário principal ainda incompleto, salvo automaticamente (um por empresa).
    Some quando o formulário fica completo e vira a solicitação oficial."""

    __tablename__ = "rascunhos"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, unique=True)
    dados = Column(JSON, nullable=False)  # mesmos campos do PUT /api/solicitacoes/minha
    data_atualizacao = Column(DateTime, server_default=func.now())


class Equipe(Base):
    """Pessoa da equipe da CODEGO que acompanha os credenciamentos (tela equipe.html).
    Criada pelo comando app.scripts.equipe; não tem relação com as empresas."""

    __tablename__ = "equipe"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    senha_hash = Column(String(255), nullable=False)
    ativo = Column(Boolean, nullable=False, default=True)
    data_criacao = Column(DateTime, server_default=func.now())
    ultimo_acesso = Column(DateTime)
