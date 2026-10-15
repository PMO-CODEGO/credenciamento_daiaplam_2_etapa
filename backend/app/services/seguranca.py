"""Senhas (bcrypt), tokens de sessão (JWT) e limite de tentativas de login."""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

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


def decodificar_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        return None


class LimiteTentativas:
    """Limite simples em memória (por processo): no máximo `maximo` tentativas
    por chave dentro de `janela_s` segundos."""

    def __init__(self, maximo: int, janela_s: int):
        self.maximo, self.janela_s = maximo, janela_s
        self._eventos: dict[str, deque] = defaultdict(deque)

    def _limpar(self, chave: str) -> deque:
        fila = self._eventos[chave]
        limite = time.monotonic() - self.janela_s
        while fila and fila[0] < limite:
            fila.popleft()
        return fila

    def bloqueado(self, chave: str) -> bool:
        return len(self._limpar(chave)) >= self.maximo

    def registrar(self, chave: str) -> None:
        self._limpar(chave).append(time.monotonic())

    def zerar(self, chave: str) -> None:
        self._eventos.pop(chave, None)
