-- Cargo do Representante Legal, pedido no cadastro da empresa.
-- O servidor também adiciona esta coluna sozinho ao iniciar (services/migracoes.py).

ALTER TABLE usuarios ADD COLUMN representante_cargo VARCHAR(100) NULL;
