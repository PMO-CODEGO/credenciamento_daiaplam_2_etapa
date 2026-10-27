"""Selo de autenticidade do comprovante ("assinatura digital" da CODEGO).

Gera um ID e um token a partir dos dados do envio. O token é um HMAC-SHA256 calculado com a
chave secreta do sistema (APP_SECRET_KEY) sobre o protocolo, o CNPJ, o momento do envio e o
retrato do que foi entregue. Qualquer alteração nesses dados muda o token, e só o sistema
consegue recalculá-lo. NÃO é uma assinatura com certificado ICP-Brasil.
"""
import hashlib
import hmac
import json
from datetime import datetime

from app.config import settings


def _momento(dt: datetime) -> datetime:
    return dt.replace(microsecond=0)


def calcular(envio_id: int, protocolo: str, cnpj: str, enviado_em: datetime, resumo: dict) -> dict:
    momento = _momento(enviado_em)
    retrato = json.dumps(resumo, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    mensagem = "|".join([
        str(envio_id), protocolo, "".join(c for c in cnpj if c.isdigit()),
        momento.strftime("%Y-%m-%dT%H:%M:%S"), hashlib.sha256(retrato.encode("utf-8")).hexdigest(),
    ])
    hexa = hmac.new(settings.app_secret_key.encode("utf-8"), mensagem.encode("utf-8"), hashlib.sha256).hexdigest()
    token = "-".join(hexa[i:i + 4] for i in range(0, 32, 4)).upper()
    return {
        "id": f"ASS-{momento.year}-{envio_id:06d}",
        "token": token,
        "data": momento.strftime("%d/%m/%Y"),
        "hora": momento.strftime("%H:%M:%S"),
    }
