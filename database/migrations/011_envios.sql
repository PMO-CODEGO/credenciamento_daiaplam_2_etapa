-- Envio final do credenciamento: protocolo + retrato (JSON) do que foi anexado/preenchido.
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.
CREATE TABLE IF NOT EXISTS envios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  protocolo VARCHAR(30) NOT NULL UNIQUE,
  enviado_em DATETIME NOT NULL,
  resumo JSON NOT NULL,
  INDEX idx_envios_usuario (usuario_id),
  CONSTRAINT fk_envios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
