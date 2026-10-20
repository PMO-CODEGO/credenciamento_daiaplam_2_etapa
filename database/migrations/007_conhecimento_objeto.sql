-- Anexo IX: Declaração de Pleno Conhecimento do Objeto, aceita no formulário.
-- Bancos já existentes recebem esta coluna na subida do backend
-- (app/services/migracoes.py); este arquivo vale para bancos criados do zero.

ALTER TABLE solicitacoes ADD COLUMN conhecimento_objeto_aceito_em DATETIME NULL;
