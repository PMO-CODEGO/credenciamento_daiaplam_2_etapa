-- Documentos do Anexo II (incisos II a X) enviados pela empresa.
-- O arquivo fica no armazenamento (STORAGE_DIR); aqui só os dados dele.

CREATE TABLE IF NOT EXISTS documentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    nome_original VARCHAR(255) NOT NULL,
    arquivo VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    tamanho INT NOT NULL,
    data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_documentos_usuario_id (usuario_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
