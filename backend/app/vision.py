"""
Leitura das fichas fotografadas (arraçoamento/produção) via Gemini —
o modelo recebe a foto + um schema JSON e devolve os campos já
estruturados, sem gravar nada: quem decide o que vale é sempre o
operador, na tela de conferência.
"""
from __future__ import annotations

import base64
import json
from typing import Any

import httpx
from fastapi import HTTPException

from .config import get_settings

_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def ler_ficha(imagem_bytes: bytes, mime_type: str, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(422, "Leitura de ficha por foto não está configurada (falta GEMINI_API_KEY).")

    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(imagem_bytes).decode("ascii")}},
            ],
        }],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": schema,
        },
    }
    url = _URL_TEMPLATE.format(model=settings.gemini_model)
    try:
        resp = httpx.post(url, params={"key": settings.gemini_api_key}, json=body, timeout=45)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Não foi possível falar com o serviço de leitura: {exc}") from exc

    if resp.status_code != 200:
        raise HTTPException(502, f"Serviço de leitura recusou a foto: {resp.text[:300]}")

    data = resp.json()
    try:
        texto = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(texto)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise HTTPException(502, f"Resposta inesperada do serviço de leitura: {exc}") from exc
