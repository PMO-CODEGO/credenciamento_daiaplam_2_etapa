"""Ciência da empresa nos anexos só de leitura (I, II, III, VIII, X, XI e XIII)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.orm import Usuario
from app.routers.auth import usuario_atual
from app.schemas.ciencias import CienciaAnexoIn, CienciasOut
from app.services import ciencias

router = APIRouter()


@router.get("/anexos/ciencias", response_model=CienciasOut)
def listar(usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return CienciasOut(anexos=ciencias.listar(db, usuario))


@router.put("/anexos/{anexo}/ciencia", response_model=CienciasOut)
def registrar(anexo: str, payload: CienciaAnexoIn,
              usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if anexo not in ciencias.TITULOS:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")
    ciencias.registrar(db, usuario, anexo, payload.ciente)
    return CienciasOut(anexos=ciencias.listar(db, usuario))
