
from fastapi import APIRouter, HTTPException, Depends
import sqlite3

from app.database import get_db
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.models import RegisterRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
def register(data: RegisterRequest):
    email = str(data.email).strip().lower()

    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="Bu email ilə hesab artıq mövcuddur.",
            )

        try:
            cursor = db.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, hash_password(data.password)),
            )
            user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409, detail="Bu email artıq qeydiyyatdadır."
            )

        user = db.execute(
            "SELECT id, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    return {
        "message": "Hesab yaradıldı.",
        "access_token": create_access_token(user_id),
        "token_type": "bearer",
        "user": dict(user),
    }


@router.post("/login")
def login(data: LoginRequest):
    email = str(data.email).strip().lower()

    with get_db() as db:
        user = db.execute(
            "SELECT id, email, password_hash, created_at "
            "FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if user is None or not verify_password(
        data.password, user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Email və ya şifrə yanlışdır.",
        )

    return {
        "access_token": create_access_token(user["id"]),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
    }


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": user}