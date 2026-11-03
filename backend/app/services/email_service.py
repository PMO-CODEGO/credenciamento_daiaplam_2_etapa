"""Envio de e-mails pela API HTTPS da Brevo (api.brevo.com).

Usa a API em vez de SMTP porque o Render (plano grátis) bloqueia conexões SMTP de saída.
Nunca levanta erro: se o e-mail falhar, o cadastro/envio do credenciamento continua valendo
e o motivo vai para o log. Desligado por padrão (EMAIL_PROVIDER vazio) para rodar local.
"""
import base64
import logging
import os
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
        '<p style="color:#666;font-size:12px;">Mensagem automática do Credenciamento DAIAPLAM — 2ª etapa. '
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
        "<strong>Credenciamento DAIAPLAM — 2ª etapa</strong> foi realizado com sucesso.</p>"
        f"<p>Login (CNPJ): <strong>{escape(_cnpj(cnpj))}</strong><br>"
        f'Senha: <span style="font-family:monospace;background:#f2f2f2;padding:2px 8px;">{escape(senha)}</span></p>'
        f"{site}"
        "<p>Guarde este e-mail em local seguro e não compartilhe a senha.</p>"
    )
    return enviar_email(email, "Credenciamento DAIAPLAM — cadastro realizado", _moldura(corpo))


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
    return enviar_email(email, f"Credenciamento DAIAPLAM — comprovante de envio — Protocolo {protocolo}",
                        _moldura(corpo), anexos)


# A Brevo aceita até 20 MB por mensagem, e o anexo cresce 1/3 ao virar base64. Acima disto
# os arquivos seguem em mais de um e-mail ("parte 2 de 3").
LIMITE_POR_EMAIL = 14 * 1024 * 1024


def _telefone(d: str) -> str:
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return d


def _tabela(linhas: list[tuple[str, str]]) -> str:
    celulas = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;">{escape(rotulo)}</td>'
        f'<td style="padding:4px 0;">{escape(valor)}</td></tr>'
        for rotulo, valor in linhas if valor
    )
    return f'<table style="border-collapse:collapse;font-size:14px;">{celulas}</table>'


def _em_partes(pdf: bytes | None, protocolo: str, arquivos: list[tuple[str, str]]):
    """Divide os anexos em e-mails de até LIMITE_POR_EMAIL. Devolve (partes, não anexados).
    Cada parte é uma lista de (nome, caminho ou bytes); o relatório em PDF vai na primeira."""
    partes: list[list] = [[]]
    usado = 0
    if pdf:
        partes[0].append((f"Relatorio_{protocolo}.pdf", pdf))
        usado = len(pdf)
    fora = []
    for nome, caminho in arquivos:
        try:
            tamanho = os.path.getsize(caminho)
        except OSError:
            fora.append((nome, "arquivo não encontrado no servidor"))
            continue
        if tamanho > LIMITE_POR_EMAIL:
            fora.append((nome, "grande demais para o e-mail"))
            continue
        if usado + tamanho > LIMITE_POR_EMAIL and partes[-1]:
            partes.append([])
            usado = 0
        partes[-1].append((nome, caminho))
        usado += tamanho
    return partes, fora


def enviar_para_codego(destino: str, resumo: dict, protocolo: str, enviado_em: str,
                       pdf: bytes | None, arquivos: list[tuple[str, str]]) -> None:
    """Cópia do envio finalizado para a CODEGO: as respostas no corpo e, como anexos, o relatório
    final em PDF e todos os arquivos que a empresa enviou."""
    emp = resumo["empresa"]
    razao = emp.get("razao_social", "")
    dados = _tabela([
        ("Razão social", razao),
        ("CNPJ", _cnpj(emp.get("cnpj", ""))),
        ("E-mail", emp.get("email", "")),
        ("Telefone", _telefone(emp.get("telefone", ""))),
        ("Endereço para correspondência", emp.get("endereco", "")),
        ("Distrito", emp.get("distrito", "")),
        ("Área solicitada", f"{emp['area_m2']} m²" if emp.get("area_m2") else ""),
        ("CNAE", emp.get("cnae", "")),
        ("Administrador / representante legal", emp.get("administrador", "")),
        ("Cargo", emp.get("cargo", "")),
        ("Responsável pelo preenchimento", emp.get("preenchimento", "")),
    ])
    declaracoes = "".join(
        f"<li>{escape(d['rotulo'])}{' — ' + escape(d['detalhe']) if d.get('detalhe') else ''}</li>"
        for d in resumo.get("declaracoes", [])
    )

    def situacao(item: dict) -> str:
        if item["arquivos"]:
            return ", ".join(a["nome"] for a in item["arquivos"])
        return "preenchido no formulário" if item.get("situacao") == "formulario" else "não enviado"

    documentos = "".join(
        f"<li>{escape(i['rotulo'])}: {escape(situacao(i))}</li>" for i in resumo.get("incisos", [])
    )
    partes, fora = _em_partes(pdf, protocolo, arquivos)
    aviso_fora = (
        "<p><strong>Arquivos que não foram anexados</strong> (baixe na tela da equipe do sistema):</p><ul>"
        + "".join(f"<li>{escape(n)} ({escape(m)})</li>" for n, m in fora) + "</ul>"
    ) if fora else ""
    corpo = (
        f"<p>A empresa <strong>{escape(razao)}</strong> finalizou o envio do "
        f"Credenciamento DAIAPLAM — 2ª etapa em {escape(enviado_em)}.</p>"
        '<p style="font-family:monospace;background:#f2f2f2;padding:8px 12px;display:inline-block;">'
        f"Protocolo: <strong>{escape(protocolo)}</strong></p>"
        f"<h3>Dados da empresa</h3>{dados}"
        f"<h3>Declarações e ciências</h3><ul>{declaracoes}</ul>"
        f"<h3>Documentos e formulários</h3><ul>{documentos}</ul>"
        "<p>Seguem em anexo o relatório final em PDF (comprovante e anexos preenchidos pelo formulário) "
        "e os arquivos enviados pela empresa.</p>"
        f"{aviso_fora}"
    )
    assunto = f"Credenciamento DAIAPLAM — envio finalizado — {razao} — Protocolo {protocolo}"
    for n, parte in enumerate(partes, start=1):
        anexos = []
        for nome, conteudo in parte:
            if isinstance(conteudo, bytes):
                anexos.append((nome, conteudo))
                continue
            try:
                with open(conteudo, "rb") as f:
                    anexos.append((nome, f.read()))
            except OSError:
                logger.warning("Arquivo não encontrado para o e-mail da CODEGO: %s", nome)
        if len(partes) == 1:
            enviar_email(destino, assunto, _moldura(corpo), anexos or None)
            continue
        texto = corpo if n == 1 else (
            f"<p>Continuação dos anexos do envio da empresa <strong>{escape(razao)}</strong> "
            f"(Protocolo {escape(protocolo)}).</p>"
        )
        enviar_email(destino, f"{assunto} (parte {n} de {len(partes)})", _moldura(texto), anexos or None)
