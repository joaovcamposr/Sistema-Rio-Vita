"""Data de pagamento escrita nas observações das vendas.

Nas vendas antigas a equipe anotava o recebimento no texto livre da
observação ("Pix17/03/2026", "Pagou $700,00 no pix dia 28/04/2026 ...") e o
sistema ficou com a data da própria venda como data de pagamento. Aqui só
extraímos a data — regra conservadora, pra não chutar em texto ambíguo.
"""
from __future__ import annotations

import re
from datetime import date

_DATA = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?")


def datas_da_observacao(obs: str | None, data_venda: date, hoje: date) -> list[date]:
    """Datas válidas citadas no texto. Válida = entre a data da venda e hoje.
    Data sem ano assume o ano da venda (ou o seguinte, se cairia antes dela).
    Isso descarta o que não pode ser pagamento (data anterior à venda, dia/mês
    impossível, futuro) em vez de adivinhar."""
    if not obs:
        return []
    achadas: list[date] = []
    for m in _DATA.finditer(obs):
        dia, mes = int(m.group(1)), int(m.group(2))
        ano = int(m.group(3)) if m.group(3) else None
        if ano is not None and ano < 100:
            ano += 2000
        try:
            if ano is None:
                d = date(data_venda.year, mes, dia)
                if d < data_venda:
                    d = date(data_venda.year + 1, mes, dia)
            else:
                d = date(ano, mes, dia)
        except ValueError:
            continue
        if data_venda <= d <= hoje:
            achadas.append(d)
    return achadas


def data_de_pagamento(obs: str | None, data_venda: date, hoje: date) -> date | None:
    """Venda quitada por vários pagamentos → vale a data do último. Sem data
    válida no texto → None (fica como está)."""
    datas = datas_da_observacao(obs, data_venda, hoje)
    return max(datas) if datas else None
