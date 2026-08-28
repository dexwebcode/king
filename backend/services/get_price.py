# ФАЙЛ: backend/services/get_price.py
# КОМЕНТАРИЙ: Сервис для полчения прайсов

# PYTHON ИПОРТЫ
import urllib.parse
import urllib.request
import json
from decimal import Decimal, ROUND_HALF_UP

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.core.config import (
    KINGPROMOTION_API_KEY,
    KINGPROMOTION_API_URL,
    KINGPROMOTION_MARKUP_PERCENT,
)

OTHER_PLATFORMS = {
    "dzen",
    "max",
    "music",
    "rutube",
    "tiktok",
    "twitch",
    "wibes",
}

COMPARE_MARKUP_PERCENT = Decimal("75")


def _money(value: Decimal) -> str:
    return str(
        value.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    )


def normalize_service(service: dict) -> dict:
    normalized = dict(service)

    if service.get("soc") != "other":
        return normalized

    supplier_type = service.get("type")

    if supplier_type not in OTHER_PLATFORMS:
        return normalized

    name = str(service.get("name", "")).lower()

    normalized["soc"] = supplier_type

    if "подпис" in name:
        normalized["type"] = "followers"
    elif "лайк" in name:
        normalized["type"] = "likes"
    elif "просмотр" in name or "показ" in name or "дочитыван" in name:
        normalized["type"] = "views"
    elif "комментар" in name:
        normalized["type"] = "comments"
    elif "реакц" in name:
        normalized["type"] = "reaction"
    elif "репост" in name:
        normalized["type"] = "reposts"
    else:
        normalized["type"] = "other"

    return normalized


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


def get_price():
    if not KINGPROMOTION_API_KEY:
        raise RuntimeError(
            "KINGPROMOTION_API_KEY не задан в backend/.env"
        )

    params = urllib.parse.urlencode({
        "action": "services",
        "key": KINGPROMOTION_API_KEY,
    })

    url = f"{KINGPROMOTION_API_URL}?{params}"

    with urllib.request.urlopen(url, timeout=15) as response:
        raw_data = response.read().decode("utf-8")

    data = json.loads(raw_data)

    return [
        add_markup_to_service(normalize_service(service))
        for service in data
    ]


def get_service_by_id(service_id: str | int) -> dict | None:
    expected_id = str(service_id)

    return next(
        (
            service
            for service in get_price()
            if str(service.get("id", service.get("service"))) == expected_id
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
    rate_key = (
        "price_per_1000"
        if quantity >= 1000
        else "compare_price_per_1000"
    )
    rate = Decimal(str(service[rate_key]))

    return (rate * Decimal(quantity) / Decimal("1000")).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
