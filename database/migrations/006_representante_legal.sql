-- Cadastro: Representante Legal (nome e CPF). A senha passou a ser gerada pelo sistema.
-- O servidor também adiciona estas colunas sozinho ao iniciar; este arquivo serve de referência.
ALTER TABLE usuarios ADD COLUMN representante_nome VARCHAR(255) NULL;
ALTER TABLE usuarios ADD COLUMN representante_cpf VARCHAR(11) NULL;
