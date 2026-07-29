from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import criar_token, exigir_gerente, get_current_user, hash_senha, verificar_senha
from ..db import get_db
from ..schemas import TrocarSenhaIn, UsuarioIn, UsuarioLoginIn, UsuarioLoginOut, UsuarioOut

router = APIRouter(prefix="/auth", tags=["auth"])

_COLUNAS_USUARIO = "id, nome, email, papel, ativo"


@router.post("/login", response_model=UsuarioLoginOut)
def login(body: UsuarioLoginIn, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, nome, email, senha_hash, papel, ativo FROM usuario WHERE lower(email) = lower(:email)"),
        {"email": body.email},
    ).mappings().first()
    if row is None or not row["ativo"] or not verificar_senha(body.senha, row["senha_hash"]):
        raise HTTPException(401, "e-mail ou senha inválidos")
    return UsuarioLoginOut(
        token=criar_token(row["id"]), id=row["id"], nome=row["nome"], email=row["email"], papel=row["papel"],
    )


@router.get("/me", response_model=UsuarioOut)
def me(usuario: UsuarioOut = Depends(get_current_user)):
    return usuario


@router.patch("/senha", status_code=204)
def trocar_senha(
    body: TrocarSenhaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    """Cada usuário troca a própria senha — não exige papel gerente, só
    saber a senha atual."""
    senha_hash = db.execute(
        text("SELECT senha_hash FROM usuario WHERE id = :id"), {"id": usuario.id}
    ).scalar_one()
    if not verificar_senha(body.senha_atual, senha_hash):
        raise HTTPException(422, "senha atual incorreta")
    db.execute(
        text("UPDATE usuario SET senha_hash = :h WHERE id = :id"),
        {"h": hash_senha(body.senha_nova), "id": usuario.id},
    )
    db.commit()


@router.get("/usuarios", response_model=list[UsuarioOut])
def listar_usuarios(db: Session = Depends(get_db), _gerente: UsuarioOut = Depends(exigir_gerente)):
    rows = db.execute(text(f"SELECT {_COLUNAS_USUARIO} FROM usuario ORDER BY nome")).mappings().all()
    return [UsuarioOut(**r) for r in rows]


@router.post("/usuarios", response_model=UsuarioOut, status_code=201)
def criar_usuario(body: UsuarioIn, db: Session = Depends(get_db), _gerente: UsuarioOut = Depends(exigir_gerente)):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO usuario (nome, email, senha_hash, papel)
                VALUES (:nome, :email, :senha_hash, :papel)
                RETURNING {_COLUNAS_USUARIO}
            """),
            {"nome": body.nome, "email": body.email, "senha_hash": hash_senha(body.senha), "papel": body.papel},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "já existe um usuário com esse e-mail") from exc
    return UsuarioOut(**row)


@router.patch("/usuarios/{usuario_id}/ativo", response_model=UsuarioOut)
def alternar_usuario_ativo(
    usuario_id: int, ativo: bool, db: Session = Depends(get_db), _gerente: UsuarioOut = Depends(exigir_gerente),
):
    row = db.execute(
        text(f"UPDATE usuario SET ativo = :ativo WHERE id = :id RETURNING {_COLUNAS_USUARIO}"),
        {"ativo": ativo, "id": usuario_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "usuário não encontrado")
    return UsuarioOut(**row)
