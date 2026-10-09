from dotenv import load_dotenv

load_dotenv()

from app.database import init_db
from app.routes.users import router as users_router
from app.routes.analyses import router as analyses_router
from app.routes.reports import router as reports_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from app.detector import analyze_message as analyze_rules
from app.ai_analyzer import analyze_with_gemini
from app.official_contacts import get_official_contact


app = FastAPI(
    title="ScamGuard API",
    description="ScamGuard AI Fraud Detection API",
    version="1.1.0",
)

# CORS: lokal frontend və yayımlanmış Vercel frontend

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://scamguard(-[a-z0-9-]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(analyses_router)
app.include_router(reports_router)


@app.on_event("startup")
def startup_event():
    init_db()


VALID_RISK_LEVELS = {
    "SAFE",
    "SUSPICIOUS",
    "DANGEROUS",
}


CONTACT_FALLBACK_MESSAGE = (
    "Bu qurum üçün etibarlı rəsmi əlaqə məlumatı təsdiqlənə bilmədi. "
    "Təşkilatla onun rəsmi saytında göstərilən əlaqə kanalı vasitəsilə "
    "əlaqə saxlayın. Mesajdakı link və telefon nömrələrini ayrıca yoxlayın."
)


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Mesaj boş ola bilməz.")

        return value


def safe_score(value):
    if isinstance(value, bool) or value is None:
        return None

    try:
        number = float(value)

        if not number.is_integer():
            return None

        if not 0 <= number <= 100:
            return None

        return int(number)

    except (ValueError, TypeError, OverflowError):
        return None


def clean_string(value, default=""):
    if isinstance(value, str):
        return value.strip() or default

    return default


def clean_list(value):
    if not isinstance(value, list):
        return []

    result = []
    seen = set()

    for item in value:
        if not isinstance(item, str):
            continue

        item = item.strip()
        normalized = " ".join(item.casefold().split())

        if item and normalized not in seen:
            seen.add(normalized)
            result.append(item)

    return result[:15]


def get_contact_safely(message):
    """
    Təşkilat əlaqələrini lokal JSON bazasından əldə edir.
    Əlaqə bazasında xəta olsa belə, əsas analiz davam edir.
    """
    try:
        contact = get_official_contact(message)

        if not isinstance(contact, dict):
            raise ValueError("Əlaqə bazasının cavabı düzgün deyil.")

        return contact

    except Exception as exc:
        print(
            f"Official contact lookup failed: "
            f"{type(exc).__name__}: {exc}"
        )

        return {
            "organization_found": False,
            "organization_name": None,
            "verification_status": "lookup_unavailable",
            "official_website": None,
            "contact_page": None,
            "phones": [],
            "emails": [],
            "user_message": CONTACT_FALLBACK_MESSAGE,
        }


def add_contact_information(response, message):
    """
    Mövcud analiz cavabına rəsmi əlaqə məlumatını əlavə edir.
    """
    response["official_contact"] = get_contact_safely(message)
    return response


def normalize_ai_result(result):
    """
    AI-nın risk balını və risk səviyyəsini saxlayır.
    Risk səviyyəsini bal əsasında yenidən hesablamır.
    """
    if not isinstance(result, dict):
        raise ValueError("AI nəticəsi düzgün formatda deyil.")

    score = safe_score(result.get("risk_score"))

    if score is None:
        raise ValueError("AI etibarlı risk balı qaytarmadı.")

    risk_level = result.get("risk_level")

    if not isinstance(risk_level, str):
        raise ValueError("AI risk səviyyəsi qaytarmadı.")

    risk_level = risk_level.strip().upper()

    if risk_level not in VALID_RISK_LEVELS:
        raise ValueError("AI etibarsız risk səviyyəsi qaytardı.")

    response = {
        "risk_level": risk_level,
        "risk_score": score,
        "category": clean_string(
            result.get("category"),
            "Ümumi analiz",
        ),
        "summary": clean_string(
            result.get("summary"),
            "AI mesajı təhlil etdi, lakin ətraflı xülasə qaytarmadı.",
        ),
        "indicators": clean_list(result.get("indicators")),
        "recommended_actions": clean_list(
            result.get("recommended_actions")
        ),
        "analysis_mode": "GEMINI_AI",
    }

    confidence = result.get("confidence")

    if (
        isinstance(confidence, (int, float))
        and not isinstance(confidence, bool)
        and 0 <= confidence <= 100
    ):
        response["confidence"] = confidence

    return response


def normalize_fallback(result):
    """
    Yalnız Gemini işləmədikdə qayda əsaslı analizdən istifadə edir.
    """
    if not isinstance(result, dict):
        raise ValueError("Qayda əsaslı analiz nəticəsi yoxdur.")

    score = safe_score(result.get("risk_score"))

    if score is None:
        raise ValueError("Fallback üçün etibarlı bal yoxdur.")

    if score >= 70:
        risk_level = "DANGEROUS"
    elif score >= 35:
        risk_level = "SUSPICIOUS"
    else:
        risk_level = "SAFE"

    return {
        "risk_level": risk_level,
        "risk_score": score,
        "category": clean_string(
            result.get("category"),
            "Qayda əsaslı analiz",
        ),
        "summary": clean_string(
            result.get("summary"),
            "Nəticə qayda əsaslı analizdən əldə edildi.",
        ),
        "indicators": clean_list(result.get("indicators")),
        "recommended_actions": clean_list(
            result.get("recommended_actions")
        ),
        "analysis_mode": "RULES_ONLY_FALLBACK",
        "warning": (
            "Gemini AI nəticə qaytarmadı. "
            "Risk qiymətləndirməsi qayda əsaslıdır "
            "və AI qərarı hesab edilmir."
        ),
    }


@app.get("/")
def root():
    return {"message": "ScamGuard API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/analyze/message")
def analyze_message_endpoint(request: MessageRequest):
    message = request.message

    # 1. Əsas analiz: Gemini AI
    try:
        ai_result = analyze_with_gemini(message)
        response = normalize_ai_result(ai_result)

        return add_contact_information(response, message)

    except Exception as exc:
        print(
            f"Gemini analysis failed: "
            f"{type(exc).__name__}: {exc}"
        )

    # 2. Gemini işləmədikdə qayda əsaslı fallback
    try:
        rules_result = analyze_rules(message)
        response = normalize_fallback(rules_result)

        return add_contact_information(response, message)

    except Exception as exc:
        print(
            f"Rules fallback failed: "
            f"{type(exc).__name__}: {exc}"
        )

    # 3. Hər iki analiz üsulu işləmədikdə
    response = {
        "risk_level": "SUSPICIOUS",
        "risk_score": None,
        "category": "ANALYSIS_UNAVAILABLE",
        "summary": (
            "Mesajı etibarlı şəkildə analiz etmək mümkün olmadı. "
            "Bu nəticə mesajın mütləq şübhəli olması demək deyil."
        ),
        "indicators": [],
        "recommended_actions": [
            "Bir qədər sonra yenidən cəhd edin.",
            "Yoxlanılmamış linkləri açmayın.",
            "Həssas məlumatları paylaşmayın.",
        ],
        "analysis_mode": "ANALYSIS_ERROR",
        "warning": (
            "AI və qayda əsaslı analiz nəticə qaytara bilmədi."
        ),
    }

    return add_contact_information(response, message)
