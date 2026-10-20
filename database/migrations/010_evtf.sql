-- EVTF (Formulário de Viabilidade Técnica e Financeira) preenchido no formulário (um por empresa).
-- O arquivo próprio (alternativa ao formulário) fica na tabela documentos (tipo 'evtf').
-- O servidor também cria esta tabela sozinho ao iniciar; este arquivo serve de referência.

CREATE TABLE IF NOT EXISTS evtf (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    dados JSON NOT NULL,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
