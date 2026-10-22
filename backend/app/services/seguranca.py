"""Senhas (bcrypt), tokens de sessão (JWT) e limite de tentativas de login."""
import secrets
import string
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.orm import Tentativa

ALGORITMO = "HS256"

# Hash de uma senha qualquer: usado quando o CNPJ não existe, para o login
# levar o mesmo tempo e não revelar quais CNPJs estão cadastrados.
_HASH_FALSO = bcrypt.hashpw(b"senha-falsa-para-igualar-tempo", bcrypt.gensalt()).decode()


def gerar_hash_senha(senha: str) -> str:
    # bcrypt só considera os 72 primeiros bytes; a política limita o tamanho antes.
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, senha_hash: str | None) -> bool:
    alvo = (senha_hash or _HASH_FALSO).encode()
    ok = bcrypt.checkpw(senha.encode("utf-8"), alvo)
    return ok and senha_hash is not None


def criar_token(usuario_id: int, cnpj: str) -> str:
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario_id),
        "cnpj": cnpj,
        "iat": agora,
        "exp": agora + timedelta(minutes=settings.token_expira_minutos),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITMO)


# Sessões da equipe da CODEGO levam este papel e nenhum CNPJ: não servem como
# sessão de empresa, e sessão de empresa não serve na tela da equipe.
PAPEL_EQUIPE = "equipe"


def criar_token_equipe(membro_id: int) -> str:
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(membro_id),
        "papel": PAPEL_EQUIPE,
        "iat": agora,
        "exp": agora + timedelta(minutes=settings.token_expira_minutos),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=ALGORITMO)


def decodificar_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        return None


class LimiteTentativas:
    """Limite de tentativas guardado no banco: no máximo `maximo` por chave dentro de
    `janela_s` segundos. Como fica na tabela `tentativas`, não zera quando o servidor reinicia
    (o Render grátis reinicia com frequência) e vale para vários processos."""

    def __init__(self, escopo: str, maximo: int, janela_s: int):
        self.escopo, self.maximo, self.janela_s = escopo, maximo, janela_s

    def _chave(self, chave: str) -> str:
        return f"{self.escopo}|{chave}"[:120]

    def bloqueado(self, db: Session, chave: str) -> bool:
        desde = datetime.now() - timedelta(seconds=self.janela_s)
        total = (
            db.query(func.count(Tentativa.id))
            .filter(Tentativa.chave == self._chave(chave), Tentativa.criado_em >= desde)
            .scalar()
        )
        return total >= self.maximo

    def registrar(self, db: Session, chave: str) -> None:
        agora = datetime.now()
        db.add(Tentativa(chave=self._chave(chave), criado_em=agora))
        # Faxina: apaga o que já saiu de qualquer janela (24 h), para a tabela não crescer.
        db.query(Tentativa).filter(Tentativa.criado_em < agora - timedelta(hours=24)).delete()
        db.commit()

    def zerar(self, db: Session, chave: str) -> None:
        db.query(Tentativa).filter(Tentativa.chave == self._chave(chave)).delete()
        db.commit()


# Sem caracteres que se confundem na leitura (0/O, 1/l/I).
_LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_NUMEROS = "23456789"


def gerar_senha_aleatoria(tamanho: int = 12) -> str:
    """Senha aleatória (secrets) com letras maiúsculas, minúsculas e números."""
    sorteio = [secrets.choice(string.ascii_uppercase.replace("O", "").replace("I", "")),
               secrets.choice(_LETRAS.lower()), secrets.choice(_NUMEROS)]
    sorteio += [secrets.choice(_LETRAS + _NUMEROS) for _ in range(tamanho - len(sorteio))]
    secrets.SystemRandom().shuffle(sorteio)
    return "".join(sorteio)
