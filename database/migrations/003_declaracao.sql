-- Declaração de compromisso (Anexo V do Regulamento), aceita no formulário.
-- Bancos já existentes recebem estas colunas na subida do backend
-- (app/services/migracoes.py); este arquivo vale para bancos criados do zero.

ALTER TABLE solicitacoes
    ADD COLUMN representante_nome VARCHAR(255) NULL,
    ADD COLUMN representante_cargo VARCHAR(100) NULL,
    ADD COLUMN ocupacao_percentual INT NULL,
    ADD COLUMN obra_inicio VARCHAR(7) NULL,
    ADD COLUMN obra_fim VARCHAR(7) NULL,
    ADD COLUMN declaracao_cidade VARCHAR(100) NULL,
    ADD COLUMN declaracao_aceita_em DATETIME NULL;
