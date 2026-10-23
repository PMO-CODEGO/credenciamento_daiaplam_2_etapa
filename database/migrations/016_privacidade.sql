-- Ciência do Aviso de Privacidade (LGPD), marcada no cadastro da empresa.
-- O servidor também adiciona esta coluna sozinho ao iniciar (services/migracoes.py).

ALTER TABLE usuarios ADD COLUMN privacidade_ciente_em DATETIME NULL;
