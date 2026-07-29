"""
Autenticação por login (JWT). Todo endpoint do sistema (exceto /health e
/auth/login) exige um usuário logado — ver main.py, onde essa dependência
é aplicada a cada router. Por enquanto papel não restringe telas, só a
criação de outros usuários exige papel='gerente'.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .schemas import UsuarioOut

_bearer = HTTPBearer(auto_error=False)


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha.encode("utf-8"), senha_hash.encode("utf-8"))


def criar_token(usuario_id: int) -> str:
    settings = get_settings()
    payload = {
        "sub": str(usuario_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_dias_validade),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> UsuarioOut:
    if credentials is None:
        raise HTTPException(401, "não autenticado")
    settings = get_settings()
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "token inválido ou expirado")

    row = db.execute(
        text("SELECT id, nome, email, papel, ativo FROM usuario WHERE id = :id"),
        {"id": int(payload["sub"])},
    ).mappings().first()
    if row is None or not row["ativo"]:
        raise HTTPException(401, "usuário inválido ou inativo")
    return UsuarioOut(**row)


def exigir_gerente(usuario: UsuarioOut = Depends(get_current_user)) -> UsuarioOut:
    if usuario.papel != "gerente":
        raise HTTPException(403, "só usuários com papel gerente podem fazer isso")
    return usuario
