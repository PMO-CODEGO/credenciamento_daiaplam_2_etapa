"""Regras de coerência compartilhadas pelos formulários (CPF, CNPJ, RG, telefone,
números no formato brasileiro e datas)."""
import re
from datetime import date


def somente_digitos(v: str) -> str:
    # [0-9] e não str.isdigit(): isdigit aceita "²", "³" etc. (ex.: "m²").
    return "".join(re.findall(r"[0-9]", v or ""))


def cpf_valido(digits: str) -> bool:
    """Confere os dois dígitos verificadores do CPF (11 dígitos, só números)."""
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    for tamanho in (9, 10):
        soma = sum(int(digits[i]) * (tamanho + 1 - i) for i in range(tamanho))
        dv = (soma * 10) % 11 % 10
        if dv != int(digits[tamanho]):
            return False
    return True


def cnpj_valido(digits: str) -> bool:
    """Confere os dois dígitos verificadores do CNPJ (14 dígitos, só números)."""
    if len(digits) != 14 or digits == digits[0] * 14:
        return False
    pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    for tamanho in (12, 13):
        p = pesos if tamanho == 12 else [6] + pesos
        soma = sum(int(digits[i]) * p[i] for i in range(tamanho))
        resto = soma % 11
        dv = 0 if resto < 2 else 11 - resto
        if dv != int(digits[tamanho]):
            return False
    return True


def rg_valido(v: str) -> bool:
    """RG muda de formato por estado (pode ter letras e o órgão emissor, ex.:
    "4.567.890 SSP-GO"); exige entre 5 e 14 números."""
    return 5 <= len(somente_digitos(v)) <= 14


def telefone_valido(digits: str) -> bool:
    """Fixo (10 dígitos) ou celular (11 dígitos), sempre com DDD."""
    return len(digits) in (10, 11)


def numero_br(v: str) -> float:
    """Converte um número escrito no formato brasileiro ("12.500", "2.500,75",
    "12500 m²") em float. Levanta ValueError se não for um número."""
    texto = (v or "").strip()
    texto = re.sub(r"\s*m\s*[²2]\s*$", "", texto, flags=re.IGNORECASE)
    if not re.fullmatch(r"\d{1,3}(\.\d{3})*(,\d+)?|\d+(,\d+)?", texto):
        raise ValueError("Informe apenas números (ex.: 12.500 ou 2.500,50).")
    return float(texto.replace(".", "").replace(",", "."))


def formatar_numero_br(valor: float) -> str:
    """12500.0 -> "12.500"; 2500.75 -> "2.500,75"."""
    inteiro, _, decimal = f"{valor:,.2f}".partition(".")
    inteiro = inteiro.replace(",", ".")
    decimal = decimal.rstrip("0")
    return f"{inteiro},{decimal}" if decimal else inteiro


def mes_atual() -> str:
    return date.today().strftime("%Y-%m")


def regerando_pdf(info) -> bool:
    """
    Se a validação é da recriação do PDF de um processo já existente (ver
    services/regerar_pdf.py). Nesse caso as regras que dependem da data de hoje
    (ex.: "não pode ser um mês que já passou") não se aplicam: valiam no dia
    em que o formulário foi preenchido.
    """
    return bool(info is not None and info.context and info.context.get("regerar_pdf"))
