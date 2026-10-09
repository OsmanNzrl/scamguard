
import json

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.database import get_db
from app.models import SaveAnalysisRequest

router = APIRouter(prefix="/analyses", tags=["Analysis history"])


@router.post("", status_code=201)
def save_analysis(
    data: SaveAnalysisRequest,
    user: dict = Depends(get_current_user),
):
    result_json = json.dumps(
        data.result, ensure_ascii=False, default=str
    )

    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO analyses
                (user_id, input_type, input_text, risk_level,
                 risk_score, result_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                data.input_type,
                data.input_text,
                data.risk_level,
                data.risk_score,
                result_json,
            ),
        )
        analysis_id = cursor.lastrowid

        row = db.execute(
            """
            SELECT id, input_type, input_text, risk_level,
                   risk_score, created_at
            FROM analyses
            WHERE id = ? AND user_id = ?
            """,
            (analysis_id, user["id"]),
        ).fetchone()

    return dict(row)


@router.get("")
def list_analyses(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, input_type, input_text, risk_level,
                   risk_score, created_at
            FROM analyses
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (user["id"], limit, offset),
        ).fetchall()

    return {"items": [dict(row) for row in rows], "limit": limit, "offset": offset}


@router.get("/{analysis_id}")
def get_analysis(
    analysis_id: int,
    user: dict = Depends(get_current_user),
):
    with get_db() as db:
        row = db.execute(
            """
            SELECT id, input_type, input_text, risk_level,
                   risk_score, result_json, created_at
            FROM analyses
            WHERE id = ? AND user_id = ?
            """,
            (analysis_id, user["id"]),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Analiz tapılmadı.")

    result = dict(row)
    result["result"] = json.loads(result.pop("result_json"))
    return result


@router.delete("/{analysis_id}", status_code=204)
def delete_analysis(
    analysis_id: int,
    user: dict = Depends(get_current_user),
):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM analyses WHERE id = ? AND user_id = ?",
            (analysis_id, user["id"]),
        )

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Analiz tapılmadı.")

    return None