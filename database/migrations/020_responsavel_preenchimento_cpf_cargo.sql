-- CPF e cargo do responsável pelo preenchimento do formulário (Anexo IV).
-- O servidor também adiciona estas colunas sozinho ao iniciar (services/migracoes.py).

ALTER TABLE solicitacoes ADD COLUMN preenchimento_cpf VARCHAR(11) NULL;
ALTER TABLE solicitacoes ADD COLUMN preenchimento_cargo VARCHAR(100) NULL;
