-- Estado (UF) da assinatura das declarações ("Local e data" do Anexo XIII).
-- Bancos já existentes recebem esta coluna na subida do backend
-- (app/services/migracoes.py); este arquivo vale para bancos criados do zero.

ALTER TABLE solicitacoes ADD COLUMN declaracao_uf VARCHAR(2) NULL;
