-- Responsável pelo preenchimento do formulário (Anexo IV), logo depois do representante legal.
-- O servidor também adiciona esta coluna sozinho ao iniciar (services/migracoes.py).

ALTER TABLE solicitacoes ADD COLUMN preenchimento_nome VARCHAR(255) NULL;
