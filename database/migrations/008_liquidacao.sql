-- Anexo XIII: Declaração Liquidação Alienação de Áreas, aceita no formulário.
-- Bancos já existentes recebem estas colunas na subida do backend
-- (app/services/migracoes.py); este arquivo vale para bancos criados do zero.

ALTER TABLE solicitacoes
    ADD COLUMN sede_endereco VARCHAR(500) NULL,
    ADD COLUMN liquidacao_prazo_meses INT NULL,
    ADD COLUMN liquidacao_aceita_em DATETIME NULL;
