from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mysql_host: str = "db"
    mysql_port: int = 3306
    mysql_database: str = "credenciamento_dianot"
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
