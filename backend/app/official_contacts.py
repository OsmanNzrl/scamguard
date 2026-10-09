
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
    """Təşkilatları JSON faylından təhlükəsiz oxuyur."""
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


def remove_urls(message: str) -> str:
    """
    URL-ləri və domenləri təşkilat axtarışından çıxarır.
    Məsələn, saxta linkdəki 'birbank' ABB seçimini dəyişməməlidir.
    """
    message = re.sub(
        r"https?://[^\s<>\"']+",
        " ",
        message,
        flags=re.IGNORECASE,
    )

    message = re.sub(
        r"\bwww\.[^\s<>\"']+",
        " ",
        message,
        flags=re.IGNORECASE,
    )

    # URL protokolu olmadan yazılmış domenləri də çıxarır.
    message = re.sub(
        r"(?<![@\w])(?:[\w-]+\.)+[a-z]{2,}(?:/[^\s<>\"']*)?",
        " ",
        message,
        flags=re.IGNORECASE,
    )

    return message


def find_organization(message: str) -> dict | None:
    """
    Təşkilat adını URL-lərdən kənar mətn əsasında müəyyən edir.

    Daha uzun ad uyğunluğu üstün tutulur. ABB və Birbank kimi
    adlar yalnız mesaj mətnində mövcud olduqda nəzərə alınır.
    """
    clean_message = remove_urls(message)
    text = f" {normalize_text(clean_message)} "

    matches = []

    for org in load_organizations():
        aliases = org.get("aliases", [])

        if not isinstance(aliases, list):
            aliases = []

        names = [org.get("name", ""), *aliases]
        best_length = 0
        matched_name_is_full_name = False

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
                is_full_name = (
                    normalized_name
                    == normalize_text(org.get("name", ""))
                )

                if (
                    len(normalized_name) > best_length
                    or (
                        len(normalized_name) == best_length
                        and is_full_name
                    )
                ):
                    best_length = len(normalized_name)
                    matched_name_is_full_name = is_full_name

        if best_length:
            matches.append(
                (
                    best_length,
                    matched_name_is_full_name,
                    len(normalize_text(org.get("name", ""))),
                    org,
                )
            )

    if not matches:
        return None

    matches.sort(
        key=lambda item: (item[0], item[1], item[2]),
        reverse=True,
    )

    return matches[0][3]


def is_https_url(value: str) -> bool:
    """URL-nin HTTPS istifadə etdiyini yoxlayır."""
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
    """Hostun qeyd edilmiş domenə aid olduğunu yoxlayır."""
    hostname = hostname.lower().rstrip(".")
    domain = domain.lower().strip().rstrip(".")

    return (
        hostname == domain
        or hostname.endswith("." + domain)
    )


def url_matches_domains(url: str, domains: list) -> bool:
    """URL-nin HTTPS və icazəli domenə uyğunluğunu yoxlayır."""
    if not is_https_url(url):
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
    Bazadakı statusu, saytın domenini və mənbə keçidlərini yoxlayır.

    Bu yoxlama məlumatın aktual olduğunu və telefonun işlədiyini
    avtomatik təsdiqləmir.
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
    """Mesajda adı çəkilən qurumun əlaqə məlumatlarını qaytarır."""
    org = find_organization(message)

    if org is None:
        return {
            "organization_found": False,
            "organization_name": None,
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

    phones = clean_string_list(org.get("phones", []))

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
        "phones": phones,
        "emails": emails,
        "source_urls": sources,
        "user_message": (
            "Bu məlumat bazada qeyd olunan mənbələrə əsaslanır. "
            "Məlumatların aktual olduğunu və mesajın həqiqətən həmin "
            "qurumdan gəldiyini ayrıca yoxlayın."
        ),
    }