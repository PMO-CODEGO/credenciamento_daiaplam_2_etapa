"""Usuários da equipe da CODEGO (tela equipe.html).

Na VM (pasta do projeto):
    docker compose -f deploy/docker-compose.prod.yml --env-file .env exec backend python -m app.scripts.equipe criar --nome "Fulana de Tal" --email fulana@codego.com.br
    ... python -m app.scripts.equipe listar
    ... python -m app.scripts.equipe nova-senha --email fulana@codego.com.br
    ... python -m app.scripts.equipe desativar --email fulana@codego.com.br
    ... python -m app.scripts.equipe ativar --email fulana@codego.com.br

A senha é gerada aqui e mostrada uma única vez (no banco fica só o hash).
"""
import argparse
import re
import sys

from app.database import Base, SessionLocal, engine
from app.models.orm import Equipe
from app.services.seguranca import gerar_hash_senha, gerar_senha_aleatoria


def _email(valor: str) -> str:
    valor = valor.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", valor):
        raise argparse.ArgumentTypeError("e-mail inválido")
    return valor


def _buscar(db, email: str) -> Equipe:
    membro = db.query(Equipe).filter(Equipe.email == email).first()
    if membro is None:
        sys.exit(f"Nenhum usuário da equipe com o e-mail {email}.")
    return membro


def _mostrar_senha(email: str, senha: str) -> None:
    print()
    print(f"  Login: {email}")
    print(f"  Senha: {senha}")
    print()
    print("  Passe a senha para a pessoa por um meio seguro. Ela não aparece de novo.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Usuários da equipe da CODEGO (tela equipe.html).")
    sub = parser.add_subparsers(dest="acao", required=True)
    criar = sub.add_parser("criar", help="cria um usuário e mostra a senha gerada")
    criar.add_argument("--nome", required=True)
    criar.add_argument("--email", required=True, type=_email)
    sub.add_parser("listar", help="lista os usuários")
    for acao, ajuda in (("nova-senha", "gera uma senha nova"), ("desativar", "bloqueia o acesso"), ("ativar", "libera o acesso")):
        p = sub.add_parser(acao, help=ajuda)
        p.add_argument("--email", required=True, type=_email)
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)  # tabela equipe, se o servidor ainda não criou
    with SessionLocal() as db:
        if args.acao == "criar":
            if db.query(Equipe).filter(Equipe.email == args.email).first():
                sys.exit(f"Já existe usuário da equipe com o e-mail {args.email}.")
            senha = gerar_senha_aleatoria(14)
            db.add(Equipe(nome=" ".join(args.nome.split()), email=args.email, senha_hash=gerar_hash_senha(senha), ativo=True))
            db.commit()
            print(f"Usuário criado: {args.nome}")
            _mostrar_senha(args.email, senha)
        elif args.acao == "listar":
            membros = db.query(Equipe).order_by(Equipe.nome).all()
            if not membros:
                print("Nenhum usuário da equipe.")
            for m in membros:
                acesso = m.ultimo_acesso.strftime("%d/%m/%Y %H:%M") if m.ultimo_acesso else "nunca"
                print(f"{'ativo  ' if m.ativo else 'inativo'}  {m.email:<40} {m.nome}  (último acesso: {acesso})")
        elif args.acao == "nova-senha":
            membro = _buscar(db, args.email)
            senha = gerar_senha_aleatoria(14)
            membro.senha_hash = gerar_hash_senha(senha)
            db.commit()
            _mostrar_senha(args.email, senha)
        else:
            membro = _buscar(db, args.email)
            membro.ativo = args.acao == "ativar"
            db.commit()
            print(f"{args.email}: {'ativo' if membro.ativo else 'acesso bloqueado'}.")


if __name__ == "__main__":
    main()
