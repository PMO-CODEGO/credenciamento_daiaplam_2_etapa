FROM python:3.12-slim-bookworm

WORKDIR /app

# Horário de Brasília: datas impressas nos PDFs ("Goiânia, dd/mm/aaaa"), ano do
# protocolo, horário do envio do assinado etc. Sem isso o container usa UTC
# (3h à frente) e, depois das 21h, os documentos saem com a data do dia seguinte.
ENV TZ=America/Sao_Paulo

# Dependências de sistema necessárias para geração de PDF (WeasyPrint) e MySQL client.
# Fixado em "bookworm" (Debian 12) porque a tag "python:3.12-slim" passou a apontar
# para o Debian "trixie", que renomeou/removeu alguns desses pacotes (ex.: libgdk-pixbuf2.0-0).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    fonts-liberation \
    shared-mime-info \
    default-libmysqlclient-dev \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# Site (usado quando SERVIR_FRONTEND=true, ex.: no Render; na VM quem serve é o Caddy)
COPY frontend ./frontend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
