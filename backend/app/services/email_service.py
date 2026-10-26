"""Envio de e-mails pela API HTTPS da Brevo (api.brevo.com).

Usa a API em vez de SMTP porque o Render (plano grátis) bloqueia conexões SMTP de saída.
Nunca levanta erro: se o e-mail falhar, o cadastro/envio do credenciamento continua valendo
e o motivo vai para o log. Desligado por padrão (EMAIL_PROVIDER vazio) para rodar local.
"""
import base64
import logging
from html import escape

import requests

from app.config import settings

logger = logging.getLogger("credenciamento.email")

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def email_ativo() -> bool:
    return settings.email_provider == "brevo_api"


def enviar_email(
    destinatario: str,
    assunto: str,
    html: str,
    anexos: list[tuple[str, bytes]] | None = None,
) -> tuple[bool, str | None]:
    """Envia um e-mail. Devolve (ok, motivo_da_falha)."""
    if not email_ativo():
        return False, "Envio de e-mail desligado (EMAIL_PROVIDER)."
    if not settings.brevo_api_key or not settings.brevo_sender_email:
        motivo = "BREVO_API_KEY ou BREVO_SENDER_EMAIL não configurados."
        logger.warning(motivo)
        return False, motivo

    payload: dict = {
        "sender": {"name": settings.brevo_sender_name, "email": settings.brevo_sender_email},
        "to": [{"email": destinatario}],
        "subject": assunto,
        "htmlContent": html,
    }
    if anexos:
        # A Brevo recusa "attachment": [] -- só entra quando há anexo de verdade.
        payload["attachment"] = [
            {"name": nome, "content": base64.b64encode(conteudo).decode("ascii")} for nome, conteudo in anexos
        ]
    try:
        resp = requests.post(
            BREVO_API_URL,
            json=payload,
            headers={"api-key": settings.brevo_api_key, "Content-Type": "application/json", "Accept": "application/json"},
            timeout=30,
        )
    except requests.RequestException as erro:
        motivo = f"Falha de rede ao chamar a Brevo: {erro.__class__.__name__}"
        logger.warning(motivo)
        return False, motivo
    if resp.status_code in (200, 201):
        logger.info("E-mail enviado (%s).", assunto)
        return True, None
    motivo = f"Brevo respondeu HTTP {resp.status_code}: {resp.text[:200]}"
    logger.warning(motivo)
    return False, motivo


# ---------- Modelos de mensagem ----------

def _moldura(corpo: str) -> str:
    return (
        '<div style="font-family:Arial,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.6;">'
        f"{corpo}"
        "<p>Atenciosamente,<br>Companhia de Desenvolvimento Econômico de Goiás (CODEGO)</p>"
        '<p style="color:#666;font-size:12px;">Mensagem automática do Credenciamento DIANOT — 2ª etapa. '
        "Não responda a este e-mail.</p></div>"
    )


def _cnpj(d: str) -> str:
    d = "".join(c for c in d if c.isdigit())
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if len(d) == 14 else d


def enviar_boas_vindas(email: str, nome_empresarial: str, cnpj: str, senha: str) -> tuple[bool, str | None]:
    """Confirma o cadastro e guarda uma cópia da senha gerada (ela só aparece uma vez na tela)."""
    site = (f'<p>Acesso: <a href="{escape(settings.site_url)}">{escape(settings.site_url)}</a></p>'
            if settings.site_url else "")
    corpo = (
        f"<p>Olá,</p><p>O cadastro da empresa <strong>{escape(nome_empresarial)}</strong> no "
        "<strong>Credenciamento DIANOT — 2ª etapa</strong> foi realizado com sucesso.</p>"
        f"<p>Login (CNPJ): <strong>{escape(_cnpj(cnpj))}</strong><br>"
        f'Senha: <span style="font-family:monospace;background:#f2f2f2;padding:2px 8px;">{escape(senha)}</span></p>'
        f"{site}"
        "<p>Guarde este e-mail em local seguro e não compartilhe a senha.</p>"
    )
    return enviar_email(email, "Credenciamento DIANOT — cadastro realizado", _moldura(corpo))


def enviar_comprovante(email: str, nome_empresarial: str, protocolo: str, pdf: bytes | None) -> tuple[bool, str | None]:
    corpo = (
        f"<p>Olá,</p><p>Confirmamos o recebimento do credenciamento da empresa "
        f"<strong>{escape(nome_empresarial)}</strong>.</p>"
        '<p style="font-family:monospace;background:#f2f2f2;padding:8px 12px;display:inline-block;">'
        f"Protocolo: <strong>{escape(protocolo)}</strong></p>"
        + ("<p>O comprovante com a lista dos documentos e declarações enviados segue em anexo (PDF).</p>" if pdf else
           "<p>O comprovante em PDF pode ser baixado no sistema, na tela de envio final.</p>")
    )
    anexos = [(f"comprovante_{protocolo}.pdf", pdf)] if pdf else None
    return enviar_email(email, f"Credenciamento DIANOT — comprovante de envio — Protocolo {protocolo}",
                        _moldura(corpo), anexos)
