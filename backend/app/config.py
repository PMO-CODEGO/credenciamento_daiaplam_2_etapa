from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mysql_host: str = "db"
    mysql_port: int = 3306
    mysql_database: str = "credenciamento_daiaplam"
    mysql_user: str = "codego_app"
    mysql_password: str = "change_me"
    # Banco gerenciado fora da máquina (ex.: Aiven): conexão com SSL.
    mysql_ssl: bool = False
    mysql_ssl_ca: str = ""  # conteúdo do certificado CA (PEM)

    # Serve o site (pasta frontend/) pelo próprio backend (ex.: Render).
    servir_frontend: bool = False
    frontend_dir: str = "/app/frontend"

    app_env: str = "development"
    # Assina os tokens de sessão. Em produção, SEMPRE definir um valor próprio e longo.
    app_secret_key: str = "change_me_secret"

    # Endereços do site que podem chamar a API, separados por vírgula ("*" = qualquer um)
    cors_origins: str = "*"

    # reCAPTCHA (desligado por padrão para rodar local sem chaves reais).
    recaptcha_enabled: bool = False
    recaptcha_secret_key: str = ""
    # Chave PÚBLICA do site (pode ir ao navegador); a secreta nunca.
    recaptcha_site_key: str = ""

    # Sessão (JWT)
    token_expira_minutos: int = 60

    # E-mail pela API da Brevo. Vazio = desligado; "brevo_api" = liga.
    email_provider: str = ""
    brevo_api_key: str = ""
    brevo_sender_email: str = ""  # remetente verificado na Brevo
    brevo_sender_name: str = "Credenciamento DAIAPLAM - CODEGO"
    # Cópia de cada envio finalizado (respostas + arquivos) para a CODEGO. Vazio = não manda.
    email_codego: str = "edital@codego.com.br"
    # Endereço público do site (aparece no e-mail de cadastro). Opcional.
    site_url: str = ""

    # Documentos enviados (uploads): pasta no disco e tamanho máximo por arquivo.
    storage_dir: str = "/app/storage"
    upload_max_mb: int = 10

    @model_validator(mode="after")
    def _exigir_chave_em_producao(self):
        # Em produção, a chave que assina as sessões não pode ser o valor de exemplo nem curta:
        # quem a conhecesse poderia forjar sessões de qualquer empresa.
        if self.app_env == "production" and (
            self.app_secret_key in ("", "change_me_secret") or len(self.app_secret_key) < 32
        ):
            raise ValueError(
                "APP_SECRET_KEY precisa ser definido com um valor próprio de pelo menos 32 caracteres "
                "quando APP_ENV=production."
            )
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )


settings = Settings()
