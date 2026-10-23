-- Ciência da empresa nos anexos só de leitura (I, II, III, VIII, X, XI e XIII).
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.

CREATE TABLE IF NOT EXISTS ciencias_anexos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    anexo VARCHAR(5) NOT NULL,
    ciente_em DATETIME NOT NULL,
    UNIQUE KEY uq_ciencia_anexo (usuario_id, anexo),
    INDEX ix_ciencias_anexos_usuario (usuario_id),
    CONSTRAINT fk_ciencias_anexos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
