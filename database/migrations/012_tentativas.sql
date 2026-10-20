-- Limite de tentativas de login/cadastro guardado no banco (sobrevive a reinícios do servidor).
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.
CREATE TABLE IF NOT EXISTS tentativas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chave VARCHAR(120) NOT NULL,
  criado_em DATETIME NOT NULL,
  INDEX idx_tentativas_chave (chave),
  INDEX idx_tentativas_criado_em (criado_em)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
