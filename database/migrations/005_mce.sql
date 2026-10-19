-- Inciso XIII: MCE (Anexo VII) preenchido no formulário + ciência da rede de água e esgoto.
-- O servidor também cria/atualiza esta tabela sozinho ao iniciar; este arquivo serve de referência.
CREATE TABLE IF NOT EXISTS mce (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL UNIQUE,
  dados JSON NULL,
  ciencia_rede VARCHAR(10) NULL,
  ciencia_em DATETIME NULL,
  data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mce_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
