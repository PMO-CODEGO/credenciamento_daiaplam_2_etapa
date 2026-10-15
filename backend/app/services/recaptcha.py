import logging

import requests

from app.config import settings

logger = logging.getLogger("codego.recaptcha")

VERIFICACAO_URL = "https://www.google.com/recaptcha/api/siteverify"


def verificar_recaptcha(token: str) -> tuple[bool, str | None]:
    """
    Verifica o token do reCAPTCHA (preenchido pelo usuário no formulário) com
    a API do Google. Retorna (True, None) se válido, ou (False, motivo) caso
    contrário.

    Se RECAPTCHA_ENABLED=false (padrão, útil pra desenvolvimento local sem
    precisar de chaves reais), sempre retorna (True, None) sem chamar a API —
    ou seja, o reCAPTCHA só é exigido de verdade quando explicitamente ligado.
    """
    if not settings.recaptcha_enabled:
        return True, None

    if not settings.recaptcha_secret_key:
        motivo = "RECAPTCHA_SECRET_KEY não configurada."
        logger.warning(motivo)
        return False, motivo

    if not token:
        return False, "Verificação reCAPTCHA não foi concluída. Marque a caixa e tente novamente."

    try:
        resposta = requests.post(
            VERIFICACAO_URL,
            data={"secret": settings.recaptcha_secret_key, "response": token},
            timeout=10,
        )
        resultado = resposta.json()

        if resultado.get("success"):
            return True, None

        motivo = f"Verificação reCAPTCHA falhou: {resultado.get('error-codes')}"
        logger.warning(motivo)
        return False, "Não foi possível confirmar que você não é um robô. Tente novamente."
    except (requests.RequestException, ValueError) as erro:
        logger.exception("Falha ao verificar reCAPTCHA")
        return False, f"Falha ao verificar reCAPTCHA: {type(erro).__name__}"
