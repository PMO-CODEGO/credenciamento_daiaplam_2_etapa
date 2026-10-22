-- Equipe da CODEGO que acompanha os credenciamentos (tela equipe.html).
-- Usuários criados pelo comando: python -m app.scripts.equipe criar --nome "..." --email ...
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.

CREATE TABLE IF NOT EXISTS equipe (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_acesso DATETIME NULL
);
