
from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import get_db
from app.models import ReportRequest

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", status_code=201)
def create_report(data: ReportRequest, user: dict | None = None):
    # Bu endpoint-də qonaq bildirişlərinə də icazə verilir.
    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO reports
                (user_id, content, report_type, description)
            VALUES (?, ?, ?, ?)
            """,
            (
                user["id"] if user else None,
                data.content.strip(),
                data.report_type,
                data.description.strip() if data.description else None,
            ),
        )
        report_id = cursor.lastrowid

    return {
        "id": report_id,
        "status": "pending",
        "message": "Bildiriş qəbul edildi və yoxlanılmağı gözləyir.",
    }


@router.get("/mine")
def my_reports(user: dict = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT id, content, report_type, description,
                   status, created_at
            FROM reports
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (user["id"],),
        ).fetchall()

    return {"items": [dict(row) for row in rows]}


@router.get("/moderation/all")
def all_reports(user: dict = Depends(get_current_user)):
    # Bu sadə MVP versiyasında admin rolları yoxdur.
    # Admin autentifikasiyası əlavə edilənədək bu endpoint-i
    # aktivləşdirmək təhlükəlidir.
    from fastapi import HTTPException
    raise HTTPException(
        status_code=403,
        detail="Moderator icazəsi hələ konfiqurasiya edilməyib.",
    )