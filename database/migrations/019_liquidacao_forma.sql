-- Forma de pagamento da área no Anexo XII: "a_vista" (prazo de 1 mês) ou "parcelado".
-- O servidor também adiciona esta coluna sozinho ao iniciar (services/migracoes.py).

ALTER TABLE solicitacoes ADD COLUMN liquidacao_forma VARCHAR(10) NULL;
