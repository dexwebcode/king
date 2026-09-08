from decimal import Decimal, ROUND_HALF_UP

from backend.core.config import (
    KINGPROMOTION_MARKUP_PERCENT,
)
from backend.services.supplier import get_supplier_services


COMPARE_MARKUP_PERCENT = Decimal("75")
PROVIDER_PLATFORM_TYPES = {
    "dzen": "dzen",
    "max": "max",
    "rutube": "rutube",
    "tiktok": "tiktok",
    "twitch": "twitch",
    "twich": "twitch",
}
DIRECT_SERVICE_TYPES = {
    "auto": "auto",
    "comments": "comments",
    "custom comment": "comments",
    "followers": "followers",
    "friends": "friends",
    "likes": "likes",
    "livestream": "livestream",
    "poll": "polls",
    "premium": "premium",
    "reaction": "reactions",
    "views": "views",
}


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _music_platform(name: str) -> str | None:
    if name.startswith("vk ") or name.startswith("вк ") or "вконтакте" in name:
        return "vk"
    if "spotify" in name:
        return "spotify"
    if "apple music" in name:
        return "apple_music"
    if "shazam" in name:
        return "shazam"
    return None


def _platform(service: dict, provider_type: str, name: str) -> str | None:
    provider_soc = str(service.get("soc") or "").strip().lower()
    if provider_soc and provider_soc != "other":
        return provider_soc
    if provider_type == "music":
        return _music_platform(name)
    return PROVIDER_PLATFORM_TYPES.get(provider_type)


def _service_type_from_name(name: str) -> str | None:
    if "stories" in name or "истори" in name:
        return "stories"
    if "реферал" in name:
        return "referrals"
    if "прослуш" in name:
        return "listenings"
    if "подкаст" in name:
        return "podcasts"
    if "комментар" in name:
        return "comments"
    if "реакц" in name:
        return "reactions"
    if "репост" in name:
        return "reposts"
    if "голосован" in name or "опрос" in name:
        return "polls"
    if "сохран" in name or "избран" in name:
        return "saves"
    if "посещен" in name or "статистик" in name or "охват" in name:
        return "statistics"
    if "подпис" in name:
        return "followers"
    if "лайк" in name:
        return "likes"
    if (
        "просмотр" in name
        or "показ" in name
        or "дочитыван" in name
        or "зрител" in name
    ):
        return "views"
    if "в топ" in name:
        return "statistics"
    return None


def _service_type(provider_type: str, name: str) -> str | None:
    if provider_type == "music" or provider_type in PROVIDER_PLATFORM_TYPES:
        return _service_type_from_name(name)
    if provider_type == "other":
        return _service_type_from_name(name)
    return DIRECT_SERVICE_TYPES.get(provider_type)


def normalize_service(service: dict) -> dict | None:
    """Separate provider classification from the public catalog taxonomy."""
    provider_soc = str(service.get("soc") or "").strip().lower()
    provider_type = str(service.get("type") or "").strip().lower()
    provider_category = str(service.get("category") or "").strip()
    name = str(service.get("name") or "").strip().lower()
    platform = _platform(service, provider_type, name)
    service_type = _service_type(provider_type, name)

    # Keep ambiguous provider services out of the public catalog.
    if not platform or platform == "wibes" or not service_type:
        return None

    return {
        **service,
        "provider_service_id": service.get("service"),
        "provider_soc": provider_soc,
        "provider_type": str(service.get("type") or "").strip(),
        "provider_category": provider_category,
        "platform": platform,
        "service_type": service_type,
        # Existing order code still reads soc/type, so keep normalized aliases.
        "soc": platform,
        "type": service_type,
    }


def add_markup_to_service(service: dict) -> dict:
    base_rate = Decimal(str(service["rate"]))
    multiplier = Decimal("1") + (
        Decimal(str(KINGPROMOTION_MARKUP_PERCENT)) / Decimal("100")
    )
    compare_multiplier = Decimal("1") + (
        COMPARE_MARKUP_PERCENT / Decimal("100")
    )
    public_rate = base_rate * multiplier
    compare_rate = base_rate * compare_multiplier

    return {
        **service,
        "id": service.get("id", service.get("service")),
        "base_rate": _money(base_rate),
        "rate": _money(public_rate),
        "price_per_1000": _money(public_rate),
        "compare_rate": _money(compare_rate),
        "compare_price_per_1000": _money(compare_rate),
        "compare_markup_percent": float(COMPARE_MARKUP_PERCENT),
        "markup_percent": KINGPROMOTION_MARKUP_PERCENT,
    }


def _load_provider_services() -> list[dict]:
    return get_supplier_services()


def normalize_catalog(services: list[dict]) -> list[dict]:
    catalog = []
    for service in services:
        normalized = normalize_service(service)
        if normalized is not None:
            catalog.append(add_markup_to_service(normalized))
    return catalog


def get_price(platform: str | None = None) -> list[dict]:
    catalog = normalize_catalog(_load_provider_services())
    if not platform:
        return catalog

    expected_platform = platform.strip().lower()
    return [item for item in catalog if item["platform"] == expected_platform]


def get_service_by_id(service_id: str | int) -> dict | None:
    expected_id = str(service_id)
    return next(
        (
            service
            for service in get_price()
            if str(service.get("provider_service_id")) == expected_id
        ),
        None,
    )


def validate_service_quantity(service: dict, quantity: int) -> None:
    minimum = int(service.get("min", 100))
    maximum = int(service.get("max", 10000))
    if quantity < minimum or quantity > maximum:
        raise ValueError(
            f"Для этой услуги допустимо количество от {minimum} до {maximum}"
        )


def calculate_order_amount(service: dict, quantity: int) -> Decimal:
    rate_key = "price_per_1000" if quantity >= 1000 else "compare_price_per_1000"
    rate = Decimal(str(service[rate_key]))
    return (rate * Decimal(quantity) / Decimal("1000")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def calculate_supplier_order_cost(service: dict, quantity: int) -> Decimal:
    """Calculate supplier cost from base_rate, never from public pricing."""
    base_rate = Decimal(str(service["base_rate"]))
    return (base_rate * Decimal(quantity) / Decimal("1000")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
