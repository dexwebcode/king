## backend/
```
├── auth/
│    ├── dependencies.py
│    ├── __init__.py
│    ├── repository.py
│    ├── router.py
│    ├── routers/
│    │    ├── auth.py
│    │    ├── __init__.py
│    │    ├── social.py
│    │    └─── telegram.py
│    │
│    ├── schemas.py
│    ├── security.py
│    ├── service.py
│    ├── social_accounts.py
│    └── telegram_sessions.py
│
├── bots/
│    ├── config.py
│    ├── __init__.py
│    ├── __main__.py
│    ├── run_bots.py
│    ├── telegram/
│    │    ├── bot.py
│    │    ├── __init__.py
│    │    └── __main__.py
│    │
│    └── vk/
│         ├── bot.py
│         ├── __init__.py
│         └── __main__.py
├── core/
│    ├── config.py
│    ├── database.py
│    └── __init__.py
├── __init__.py
│
├── main.py
├── migrations/
│    └── 001_yookassa_balance.sql
│
├── payments/
│    ├── __init__.py
│    ├── repository.py
│    ├── router.py
│    ├── schemas.py
│    ├── service.py
│    └── yookassa_service.py
│
├── services/
│    ├── get_price.py
│    ├── __init__.py
│    └── supplier.py
│
├── test.py
└── tests/
     ├── __init__.py
     ├── test_catalog_normalization.py
     └── test_payment_service.py

```
