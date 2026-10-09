
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class SaveAnalysisRequest(BaseModel):
    input_type: Literal["message", "screenshot", "url"] = "message"
    input_text: str = Field(min_length=1, max_length=20000)
    result: dict[str, Any]
    risk_level: str | None = Field(default=None, max_length=50)
    risk_score: int | None = Field(default=None, ge=0, le=100)


class ReportRequest(BaseModel):
    content: str = Field(min_length=3, max_length=20000)
    report_type: Literal["message", "url", "phone", "email"] = "message"
    description: str | None = Field(default=None, max_length=2000)