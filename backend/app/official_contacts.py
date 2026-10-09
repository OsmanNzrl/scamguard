import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

DATA_FILE = Path(__file__).parent / "data" / "official_contacts.json"

SAFE_FALLBACK = (
    "Bu qurum üçün etibarlı rəsmi əlaqə məlumatı təsdiqlənə bilmədi. "
    "Təşkilatla onun rəsmi saytında göstərilən əlaqə kanalı vasitəsilə "
    "əlaqə saxlayın. Mesajdakı link və telefon nömrələrini ayrıca yoxlayın."
)

VERIFIED_STATUSES = {
    "verified_from_official_source",
    "verified_from_regulator",
}


def normalize_text(value: str) -> str:
    """Mətni müqayisə üçün normallaşdırır."""
    value = unicodedata.normalize("NFKC", value).casefold()
    value = re.sub(r"[^\w\s.-]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def load_organizations() -> list[dict]:
    """Təşkilatları JSON faylından oxuyur."""
    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, dict):
            return []

        organizations = data.get("organizations", [])

        if not isinstance(organizations, list):
            return []

        return [
            org for org in organizations
            if isinstance(org, dict)
        ]

    except (OSError, json.JSONDecodeError):
        return []


def extract_urls(message: str) -> list[str]:
    """Mesajdan HTTP/HTTPS və www URL-lərini çıxarır."""
    pattern = (
        r"""(?i)\b(?:https?://|www\.)[^\s<>"']+"""
    )

    urls = re.findall(pattern, message)

    # URL sonundakı cümlə durğu işarələrini təmizlə.
    return [
        url.rstrip(".,!?;:)]}")
        for url in urls
    ]


def remove_urls(message: str) -> str:
    """URL-ləri mesaj mətnindən çıxarır."""
    message = re.sub(
        r"""(?i)\bhttps?://[^\s<>"']+""",
        " ",
        message,
    )

    message = re.sub(
        r"""(?i)\bwww\.[^\s<>"']+""",
        " ",
        message,
    )

    # Protokolsuz domenləri çıxarır.
    message = re.sub(
        r"""(?i)(?<![@\w])(?:[\w-]+\.)+[a-z]{2,}(?:/[^\s<>"']*)?""",
        " ",
        message,
    )

    return message


def find_organization(message: str) -> dict | None:
    """
    Əvvəlcə mesaj mətnində, sonra URL-də təşkilat axtarır.
    URL-də brendin tapılması göndərənin həqiqiliyini təsdiqləmir.
    """
    clean_message = remove_urls(message)
    text = f" {normalize_text(clean_message)} "
    url_text = f" {normalize_text(message)} "

    matches = []

    for org in load_organizations():
        aliases = org.get("aliases", [])

        if not isinstance(aliases, list):
            aliases = []

        names = [org.get("name", ""), *aliases]
        best_length = 0
        matched_in_message = False

        for name in names:
            if not isinstance(name, str):
                continue

            normalized_name = normalize_text(name)

            if not normalized_name:
                continue

            pattern = (
                r"(?<!\w)"
                + re.escape(normalized_name)
                + r"(?!\w)"
            )

            if re.search(pattern, text):
                if len(normalized_name) > best_length:
                    best_length = len(normalized_name)
                    matched_in_message = True

            elif re.search(pattern, url_text):
                if len(normalized_name) > best_length:
                    best_length = len(normalized_name)
                    matched_in_message = False

        if best_length:
            matches.append(
                (matched_in_message, best_length, org)
            )

    if not matches:
        return None

    # Mətn uyğunluğu URL uyğunluğundan üstündür.
    matches.sort(
        key=lambda item: (item[0], item[1]),
        reverse=True,
    )

    return matches[0][2]


def is_https_url(value: str) -> bool:
    """URL-nin etibarlı formatda HTTPS olduğunu yoxlayır."""
    if not isinstance(value, str):
        return False

    try:
        parsed = urlparse(value)

        return (
            parsed.scheme.lower() == "https"
            and bool(parsed.hostname)
            and not parsed.username
            and not parsed.password
        )

    except ValueError:
        return False


def hostname_matches_domain(hostname: str, domain: str) -> bool:
    """Hostun domenə və ya onun subdomeninə aid olduğunu yoxlayır."""
    hostname = hostname.lower().rstrip(".")
    domain = domain.lower().strip().rstrip(".")

    return (
        hostname == domain
        or hostname.endswith("." + domain)
    )


def url_matches_domains(url: str, domains: list) -> bool:
    """HTTPS URL-nin icazəli domenə uyğunluğunu yoxlayır."""
    if not isinstance(url, str) or not is_https_url(url):
        return False

    try:
        hostname = urlparse(url).hostname
    except ValueError:
        return False

    if not hostname:
        return False

    return any(
        isinstance(domain, str)
        and hostname_matches_domain(hostname, domain)
        for domain in domains
    )


def verified_contact_data(org: dict) -> bool:
    """
    Bazadakı statusu, rəsmi domeni və mənbə URL-lərini yoxlayır.
    Bu yoxlama mənbələrin hazırda əlçatan olduğunu və əlaqə
    məlumatlarının aktual olduğunu avtomatik təsdiqləmir.
    """
    if org.get("verification_status") not in VERIFIED_STATUSES:
        return False

    domains = org.get("official_domains", [])
    sources = org.get("source_urls", [])

    if not isinstance(domains, list) or not domains:
        return False

    if not isinstance(sources, list) or not sources:
        return False

    official_sources = [
        url for url in sources
        if url_matches_domains(url, domains)
    ]

    if not official_sources:
        return False

    website = org.get("official_website")

    if not url_matches_domains(website, domains):
        return False

    contact_page = org.get("contact_page")

    if contact_page and not url_matches_domains(
        contact_page, domains
    ):
        return False

    return True


def clean_string_list(value) -> list[str]:
    """Siyahıdakı boş olmayan mətnləri qaytarır."""
    if not isinstance(value, list):
        return []

    return [
        item.strip()
        for item in value
        if isinstance(item, str) and item.strip()
    ]


def get_official_contact(message: str) -> dict:
    """
    Mesajda adı çəkilən və ya URL-də təqlid olunan təşkilatı tapır.
    Rəsmi əlaqə məlumatlarını yalnız bazadakı yoxlamalar keçdikdə verir.
    """
    if not isinstance(message, str):
        message = ""

    org = find_organization(message)

    if org is None:
        return {
            "organization_found": False,
            "organization_name": None,
            "category": None,
            "verification_status": "not_found",
            "official_website": None,
            "contact_page": None,
            "phones": [],
            "emails": [],
            "source_urls": [],
            "user_message": SAFE_FALLBACK,
        }

    if not verified_contact_data(org):
        return {
            "organization_found": True,
            "organization_name": org.get("name"),
            "category": org.get("category"),
            "verification_status": "needs_verification",
            "official_website": None,
            "contact_page": None,
            "phones": [],
            "emails": [],
            "source_urls": [],
            "user_message": SAFE_FALLBACK,
        }

    domains = org.get("official_domains", [])

    # E-poçt yalnız rəsmi domenə uyğun gələndə göstərilir.
    emails = []

    for email in clean_string_list(org.get("emails", [])):
        if "@" not in email:
            continue

        email_domain = email.rsplit("@", 1)[1].lower()

        if any(
            isinstance(domain, str)
            and hostname_matches_domain(email_domain, domain)
            for domain in domains
        ):
            emails.append(email)

    sources = [
        url
        for url in clean_string_list(org.get("source_urls", []))
        if url_matches_domains(url, domains)
    ]

    return {
        "organization_found": True,
        "organization_name": org.get("name"),
        "category": org.get("category"),
        "verification_status": org.get("verification_status"),
        "official_website": org.get("official_website"),
        "contact_page": org.get("contact_page"),
        "phones": clean_string_list(org.get("phones", [])),
        "emails": emails,
        "source_urls": sources,
        "user_message": (
            "Bu məlumat bazada qeyd olunan mənbələrə əsaslanır. "
            "Məlumatların aktual olduğunu və mesajın həqiqətən həmin "
            "qurumdan gəldiyini ayrıca yoxlayın."
        ),
    }