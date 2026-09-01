# 01-ARCHITECTURE
## Общая архитектура backend
```
├── auth/
│    ├── __init__.py
│    │
│    ├── dependencies.py
│    │    └── Получение и проверка текущего пользователя
│    │
│    ├── repository.py
│    │    └── Работа с пользователями в PostgreSQL
│    │
│    ├── router.py
│    │    └── Главный роутер модуля авторизации
│    │
│    ├── routers/
│    │   ├── __init__.py
│    │   │    └── Экспорт роутеров
│    │   ├── auth.py
│    │   │    └── Базовая авторизация
│    │   ├── social.py
│    │   │    └── Социальные аккаунты и VK ID
│    │   └── telegram.py
│    │        └── Авторизация через Telegram
│    │
│    ├── schemas.py Валидация входящих данных авторизации
│    │    └── Валидация входящих данных авторизации
│    │
│    ├── security.py
│    │    └── Пароли и JWT
│    │
│    ├── service.py
│    │    └── Бизнес-логика базовой авторизации
│    │
│    ├── social_accounts.py
│    │    └── Работа с привязанными социальными аккаунтами
│    │
│    └── telegram_sessions.py
│         └── Работа с временными Telegram-сессиями
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
├── main.py ----> Точка входа в приложение
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
## Примечание

Файлы архитектуры будут разбираться, отталкиваясь от главной точки входа — `main.py`.

Сначала рассматривается сам `main.py`, после чего отдельно и по порядку разбираются подключаемые им модули. После рассматриваются остальные части проекта.

> В каждом модуле будет отражена иерархия папок с дальнейшими коментариями по коду.

## main.py

`main.py` является точкой входа и точкой сборки backend-приложения.

В этом файле создаётся и настраивается объект FastAPI-приложения `app`.
К нему подключаются общая конфигурация, middleware и роутеры отдельных модулей.

### Подключенные модули

```text
     main.py
     ├── Авторизация
     ├── Оплата
     └── Получение цен
```

## Авторизация
>В данном модуле будет рассматриваться папка `../backend/auth`

### Архитектура модуля
```
auth/
├── __init__.py
│
├── dependencies.py
│    └── Получение и проверка текущего пользователя
│
├── repository.py
│    └── Работа с пользователями в PostgreSQL
│
├── router.py
│    └── Главный роутер модуля авторизации
│
├── routers/
│   ├── __init__.py
│   │    └── Экспорт роутеров
│   ├── auth.py
│   │    └── Базовая авторизация
│   ├── social.py
│   │    └── Социальные аккаунты и VK ID
│   └── telegram.py
│        └── Авторизация через Telegram
│
├── schemas.py Валидация входящих данных авторизации
│    └── Валидация входящих данных авторизации
│
├── security.py
│    └── Пароли и JWT
│
├── service.py
│    └── Бизнес-логика базовой авторизации
│
├── social_accounts.py
│    └── Работа с привязанными социальными аккаунтами
│
└── telegram_sessions.py
     └── Работа с временными Telegram-сессиями
```
### dependencies.py

### repository.py

### router.py

### routers/ --> Папка роутеров модуля

#### auth.py

#### social.py

#### telegram.py

### schemas.py

### security.py

### service.py

### social_accounts.py

### telegram_sessions.py