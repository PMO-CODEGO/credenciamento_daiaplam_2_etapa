-- Inciso XII: Cronograma Físico de Obras preenchido no formulário (um por empresa).
-- O arquivo próprio (alternativa ao formulário) fica na tabela documentos (tipo 'inciso12').

CREATE TABLE IF NOT EXISTS cronogramas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    dados JSON NOT NULL,
    data_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
