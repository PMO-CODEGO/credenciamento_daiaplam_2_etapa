-- Formulário principal salvo automaticamente enquanto ainda está incompleto
-- (um por empresa). Some quando vira a solicitação oficial.
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.

CREATE TABLE IF NOT EXISTS rascunhos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    dados JSON NOT NULL,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
