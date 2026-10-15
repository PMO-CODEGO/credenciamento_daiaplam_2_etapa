-- Schema inicial: Credenciamento DIANOT 2ª etapa

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    nome_empresarial VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cnaes (
    codigo VARCHAR(7) PRIMARY KEY,
    descricao VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS solicitacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    distrito VARCHAR(100) NOT NULL DEFAULT 'DIANOT 2ª ETAPA',
    area_m2 DECIMAL(14,2) NOT NULL,
    nome_empresarial VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14) NOT NULL,
    endereco_correspondencia VARCHAR(500) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(11) NOT NULL,
    administrador_nome VARCHAR(255) NOT NULL,
    administrador_cpf VARCHAR(11) NOT NULL,
    cnae_codigo VARCHAR(7) NOT NULL,
    cnae_descricao VARCHAR(500) NOT NULL,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (cnae_codigo) REFERENCES cnaes(codigo)
);
