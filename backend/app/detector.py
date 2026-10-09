
import re


def analyze_message(message: str) -> dict:
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Analiz ediləcək mesaj boş ola bilməz.")

    text = message.lower()
    indicators = []
    score = 0

    # 1. Təcili hərəkət tələb edən ifadələr
    urgency_patterns = [
        "təcili",
        "dərhal",
        "son şans",
        "hesabınız bloklanacaq",
        "hesabınız bağlanacaq",
        "account will be blocked",
        "urgent",
        "immediately",
    ]

    if any(p in text for p in urgency_patterns):
        score += 15
        indicators.append(
            "Təcili hərəkət tələb edən ifadələr var."
        )

    # 2. OTP / təsdiq kodu
    otp_patterns = [
        "otp",
        "təsdiq kodu",
        "sms kodu",
        "verification code",
        "confirmation code",
        "doğrulama kodu",
    ]

    if any(p in text for p in otp_patterns):
        score += 15
        indicators.append(
            "OTP və ya təsdiq kodu ilə bağlı məzmun var."
        )

    # 3. Şifrə və giriş məlumatları
    credential_patterns = [
        "şifrə",
        "parol",
        "password",
        "istifadəçi adı",
        "username",
        "giriş məlumatları",
    ]

    if any(p in text for p in credential_patterns):
        score += 15
        indicators.append(
            "Hesab və ya giriş məlumatları ilə bağlı məzmun var."
        )

    # 4. Bank / maliyyə konteksti
    bank_patterns = [
        "bank",
        "kart",
        "hesabınız",
        "kapital bank",
        "abb",
        "paşa bank",
        "unibank",
        "leobank",
        "bank of baku",
    ]

    if any(p in text for p in bank_patterns):
        score += 10
        indicators.append(
            "Bank və ya maliyyə mövzusu mövcuddur."
        )

    # 5. URL aşkarlanması
    url_pattern = (
        r"\b(?:https?://|www\.)[^\s<>]+"
        r"|(?<![@\w])"
        r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
        r"[a-z]{2,}(?:/[^\s<>]*)?"
    )

    urls = re.findall(url_pattern, text, flags=re.IGNORECASE)

    if urls:
        indicators.append(
            "Mesajda URL və ya domenə bənzər mətn var."
        )

        # Təkcə linkin olması yüksək risk yaratmamalıdır.
        score += 5

        # URL daxilində şübhəli ifadələr
        suspicious_url_patterns = [
            "verify",
            "login",
            "secure",
            "update",
            "confirm",
            "account",
            "password",
        ]

        if any(p in " ".join(urls) for p in suspicious_url_patterns):
            score += 10
            indicators.append(
                "URL daxilində giriş və ya təsdiqləmə ilə "
                "əlaqəli ifadələr var."
            )

    # 6. Kart məlumatları
    card_patterns = [
        "kart nömrəsi",
        "card number",
        "cvv",
        "cvc",
        "son istifadə tarixi",
        "expiry date",
    ]

    if any(p in text for p in card_patterns):
        score += 20
        indicators.append(
            "Kart məlumatları ilə bağlı ifadələr var."
        )

    # 7. Açıq şəkildə məlumat tələb edilməsi
    request_patterns = [
        "göndərin",
        "paylaşın",
        "daxil edin",
        "təsdiqləyin",
        "send us",
        "enter your",
        "provide your",
    ]

    sensitive_patterns = (
        otp_patterns + credential_patterns + card_patterns
    )

    if (
        any(p in text for p in sensitive_patterns)
        and any(p in text for p in request_patterns)
    ):
        score += 20
        indicators.append(
            "Həssas məlumatın təqdim edilməsi və ya "
            "təsdiqlənməsi tələb oluna bilər."
        )

    score = min(score, 100)

    if score >= 70:
        risk_level = "DANGEROUS"
        category = "POTENTIAL_PHISHING"
        summary = (
            "Mesajda bir neçə ciddi risk əlaməti aşkarlanıb. "
            "Məzmunu müstəqil şəkildə yoxlamaq lazımdır."
        )
        recommended_actions = [
            "Şübhəli linkləri açmayın.",
            "OTP, şifrə və kart məlumatlarını paylaşmayın.",
            "Göndərəni rəsmi əlaqə kanalı ilə yoxlayın.",
        ]

    elif score >= 35:
        risk_level = "SUSPICIOUS"
        category = "SUSPICIOUS_MESSAGE"
        summary = (
            "Mesajda əlavə yoxlama tələb edən əlamətlər var."
        )
        recommended_actions = [
            "Göndərəni və mesajın məqsədini yoxlayın.",
            "Şəxsi və maliyyə məlumatlarını paylaşmayın.",
            "Linki rəsmi mənbədən yoxlamadan açmayın.",
        ]

    else:
        risk_level = "SAFE"
        category = "SAFE_MESSAGE"
        summary = (
            "Qayda əsaslı yoxlama ciddi risk əlamətləri "
            "aşkarlamadı. Bu, mesajın tam təhlükəsiz "
            "olduğuna zəmanət vermir."
        )
        recommended_actions = [
            "Tanımadığınız şəxslərlə həssas məlumat paylaşmayın.",
            "Gözlənilməz mesajları diqqətlə yoxlayın.",
        ]

    if not indicators:
        indicators.append(
            "Tətbiq olunan qaydalara uyğun şübhəli əlamət tapılmadı."
        )

    return {
        "risk_level": risk_level,
        "risk_score": score,
        "category": category,
        "summary": summary,
        "indicators": indicators,
        "recommended_actions": recommended_actions,
    }