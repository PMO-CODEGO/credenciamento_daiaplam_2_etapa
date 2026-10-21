from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import Usuario
from app.schemas.auth import CadastroUsuarioIn, LoginIn, TokenOut, UsuarioOut
from app.services.recaptcha import verificar_recaptcha
from app.services.seguranca import (
    LimiteTentativas,
    criar_token,
    decodificar_token,
    gerar_hash_senha,
    gerar_senha_aleatoria,
    verificar_senha,
)

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

# 5 logins errados por IP+CNPJ em 15 min e 10 cadastros por IP por hora (contados no banco).
_falhas_login = LimiteTentativas("login", maximo=5, janela_s=15 * 60)
_cadastros = LimiteTentativas("cadastro", maximo=10, janela_s=60 * 60)

ERRO_LOGIN = "CNPJ ou senha incorretos."


def _ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def _para_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id, cnpj=u.cnpj, nome_empresarial=u.nome_empresarial, email=u.email,
        representante_nome=u.representante_nome,
    )


def usuario_atual(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> Usuario:
    dados = decodificar_token(cred.credentials) if cred else None
    usuario = db.get(Usuario, int(dados["sub"])) if dados else None
    if usuario is None or not usuario.ativo:
        raise HTTPException(status_code=401, detail="Sessão expirada. Entre novamente.")
    return usuario


@router.post("/cadastro", response_model=TokenOut, status_code=201)
def cadastrar(payload: CadastroUsuarioIn, request: Request, db: Session = Depends(get_db)):
    """Cria o usuário: o login é o CNPJ; a senha é gerada aleatoriamente e mostrada uma só vez."""
    chave = _ip(request)
    if _cadastros.bloqueado(db, chave):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente mais tarde.")
    _cadastros.registrar(db, chave)

    ok, erro = verificar_recaptcha(payload.g_recaptcha_response)
    if not ok:
        raise HTTPException(status_code=422, detail=erro)

    if db.query(Usuario).filter(Usuario.cnpj == payload.cnpj).first():
        raise HTTPException(status_code=409, detail="Este CNPJ já possui cadastro. Use a tela de login.")

    senha = gerar_senha_aleatoria()
    usuario = Usuario(
        cnpj=payload.cnpj,
        nome_empresarial=payload.nome_empresarial,
        email=payload.email,
        representante_nome=payload.representante_nome,
        representante_cpf=payload.representante_cpf,
        senha_hash=gerar_hash_senha(senha),
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Este CNPJ já possui cadastro. Use a tela de login.")
    db.refresh(usuario)
    return TokenOut(
        access_token=criar_token(usuario.id, usuario.cnpj), usuario=_para_out(usuario), senha_gerada=senha
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    chave = f"{_ip(request)}|{payload.cnpj}"
    if _falhas_login.bloqueado(db, chave):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde 15 minutos e tente novamente.")

    ok, erro = verificar_recaptcha(payload.g_recaptcha_response)
    if not ok:
        raise HTTPException(status_code=422, detail=erro)

    usuario = db.query(Usuario).filter(Usuario.cnpj == payload.cnpj).first()
    senha_ok = verificar_senha(payload.senha, usuario.senha_hash if usuario else None)
    if not usuario or not usuario.ativo or not senha_ok:
        _falhas_login.registrar(db, chave)
        raise HTTPException(status_code=401, detail=ERRO_LOGIN)

    _falhas_login.zerar(db, chave)
    return TokenOut(access_token=criar_token(usuario.id, usuario.cnpj), usuario=_para_out(usuario))


@router.get("/me", response_model=UsuarioOut)
def me(usuario: Usuario = Depends(usuario_atual)):
    return _para_out(usuario)
