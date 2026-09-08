Ты работаешь над существующим проектом **KingPromotion**.

На этом этапе НИЧЕГО не переписывай и не вноси изменения без необходимости.

Твоя задача — провести **максимально глубокий технический аудит всего проекта** и найти все места, которые можно улучшить, чтобы кодовая база стала максимально качественной, чистой, безопасной, поддерживаемой и профессиональной.

Представь, что проект проходит серьёзный code review перед production-релизом и последующим масштабированием.

Я хочу получить не поверхностный список замечаний, а полноценный инженерный аудит.

---

# ГЛАВНАЯ ЦЕЛЬ

Прошерсти весь проект и найди:

* плохую архитектуру;
* потенциальные баги;
* небезопасный код;
* плохие зависимости между модулями;
* дублирование;
* мёртвый код;
* костыли;
* чрезмерно сложный код;
* неправильные abstraction layers;
* нарушение ответственности классов/функций;
* потенциальные race conditions;
* ошибки работы с БД;
* проблемы транзакций;
* проблемы авторизации;
* проблемы API;
* ошибки frontend architecture;
* проблемы React;
* проблемы производительности;
* проблемы масштабирования;
* плохую обработку ошибок;
* плохое логирование;
* неправильную работу с env;
* потенциальную утечку secrets;
* неправильную работу с async/sync;
* проблемы типов;
* плохие naming conventions;
* циклические зависимости;
* слишком большие функции;
* слишком большие файлы;
* функции с большим количеством обязанностей;
* плохую структуру папок;
* несогласованность архитектуры;
* места, которые усложнят разработку в будущем.

Твоя задача — найти максимум реальных проблем, а не придумывать улучшения ради улучшений.

---

# 1. СНАЧАЛА ИЗУЧИ ВЕСЬ ПРОЕКТ

Перед выводами внимательно изучи структуру проекта.

Проверь:

* backend;
* frontend;
* database;
* models;
* schemas;
* repositories;
* services;
* routers;
* dependencies;
* middleware;
* authentication;
* Telegram;
* VK;
* payments;
* orders;
* users;
* admin;
* configs;
* utils;
* bots;
* migrations;
* tests;
* React components;
* hooks;
* contexts;
* API clients;
* CSS;
* routing;
* environment configuration.

Построй мысленную карту проекта:

Frontend
→ API
→ Router
→ Service
→ Repository
→ Database.

Отдельно пойми:

* где находится бизнес-логика;
* где осуществляется validation;
* где создаются JWT;
* где выполняется доступ к БД;
* где вызываются внешние API;
* где хранятся состояния frontend;
* как работают background процессы;
* какие модули зависят друг от друга.

---

# 2. АРХИТЕКТУРА BACKEND

Проверь правильность разделения:

Router
→ Service
→ Repository
→ Model / Database.

Найди случаи, где router:

* напрямую выполняет SQL;
* содержит бизнес-логику;
* создаёт JWT;
* отправляет Telegram сообщения;
* работает с VK API;
* сам обрабатывает большие транзакции;
* знает слишком много деталей реализации.

Найди случаи, где Repository занимается:

* бизнес-логикой;
* validation;
* OAuth;
* JWT;
* форматированием HTTP responses.

Repository должен в основном заниматься persistence/data access.

Найди нарушения Single Responsibility Principle.

---

# 3. СЛИШКОМ БОЛЬШИЕ ФАЙЛЫ И ФУНКЦИИ

Найди:

* файлы, которые стали слишком большими;
* функции с большим количеством строк;
* функции с большим количеством if/else;
* deeply nested logic;
* большие try/except блоки;
* функции с большим количеством аргументов;
* классы, выполняющие слишком много задач.

Для каждого такого места объясни:

1. почему это проблема;
2. на какие части лучше разделить;
3. какой abstraction layer создать;
4. насколько критично это изменение.

---

# 4. ДУБЛИРОВАНИЕ

Найди одинаковую или почти одинаковую логику.

Например:

Telegram auth и VK auth.

register и login.

разные repositories.

несколько одинаковых validators.

одинаковые API response structures.

одинаковые try/except.

одинаковое получение user.

одинаковый код создания JWT.

одинаковые frontend requests.

одинаковые CSS blocks.

Если есть duplicate code — предложи общий reusable mechanism.

Но не создавай abstraction только ради сокращения двух строк.

---

# 5. DATABASE

Проведи полноценный аудит работы с БД.

Проверь:

* модели;
* foreign keys;
* unique constraints;
* indexes;
* nullable;
* defaults;
* cascade;
* relationships;
* naming;
* data types;
* transactions.

Найди потенциальные:

* N+1 queries;
* лишние queries;
* запросы внутри циклов;
* отсутствие индексов;
* неправильные индексы;
* full table scans;
* SELECT *;
* ненужные JOIN;
* повторное получение одного объекта;
* отдельные commit на каждую операцию.

Особенно проверь таблицы:

users;
orders;
transactions;
payments;
social accounts;
auth/session;
Telegram;
VK.

---

# 6. TRANSACTIONS

Найди места, где несколько связанных DB операций выполняются без одной транзакции.

Например:

создание order
→ создание transaction
→ изменение balance.

Или:

создание user
→ создание social account.

Такие операции должны быть атомарными.

Проверь:

* commit;
* rollback;
* IntegrityError;
* exception handling;
* concurrent requests.

---

# 7. RACE CONDITIONS

Отдельно найди race conditions.

Особенно:

* регистрация;
* social auth;
* создание order;
* списание balance;
* пополнение balance;
* payment callback;
* создание transaction;
* повторный callback платёжной системы;
* Telegram/VK callbacks.

Не полагайся только на:

if not exists:
create()

без database constraint.

Покажи места, где два одновременных request могут создать некорректное состояние.

---

# 8. MONEY / BALANCE

Если проект работает с деньгами, проведи особенно строгий аудит.

Проверь:

* тип хранения денег;
* Decimal;
* float;
* rounding;
* currency;
* balance updates;
* transaction history;
* negative balance;
* double payment;
* double withdrawal;
* repeated callback;
* idempotency.

Использование `float` для денежных значений нужно отдельно отметить.

Проверь, может ли два параллельных заказа одновременно списать один и тот же balance.

---

# 9. AUTHENTICATION / AUTHORIZATION

Проведи security review всей auth системы.

Проверь:

* registration;
* login;
* password hashing;
* JWT;
* access token;
* refresh token;
* expiration;
* logout;
* social auth;
* Telegram;
* VK;
* password reset, если присутствует;
* token verification.

Проверь различие:

authentication — кто пользователь;

authorization — что пользователь имеет право делать.

Особенно найди endpoints, где пользователь авторизован, но отсутствует проверка, имеет ли он право менять конкретный ресурс.

Например:

`/orders/{id}`

нельзя позволять User A менять заказ User B только потому, что он авторизован.

---

# 10. IDOR

Отдельно ищи потенциальные IDOR vulnerabilities.

Проверь endpoints, принимающие:

* user_id;
* order_id;
* transaction_id;
* account_id;
* social_account_id.

Убедись, что backend проверяет ownership.

Frontend restrictions не считаются защитой.

---

# 11. INPUT VALIDATION

Проверь все внешние данные:

* JSON;
* query params;
* path params;
* headers;
* OAuth callbacks;
* Telegram;
* VK;
* payment callbacks.

Validation должна происходить на backend.

Frontend validation — только UX.

Найди случаи, где backend доверяет frontend.

---

# 12. SECURITY

Ищи потенциальные:

* SQL injection;
* XSS;
* CSRF;
* SSRF;
* open redirects;
* path traversal;
* insecure deserialization;
* command injection;
* mass assignment;
* insecure direct object references;
* brute force vulnerabilities;
* replay attacks;
* OAuth state problems.

Если что-то не применимо — не придумывай проблему.

---

# 13. SECRETS

Проверь проект на наличие:

* API keys;
* passwords;
* bot tokens;
* JWT secret;
* database password;
* OAuth secrets;
* payment secrets.

Они не должны быть захардкожены.

Проверь `.env`.

Проверь `.gitignore`.

Проверь случайные fallback secrets типа:

`SECRET_KEY = "secret"`

Это критическая проблема.

---

# 14. PASSWORDS

Проверь password hashing.

Найди:

* plaintext password;
* MD5;
* SHA1;
* простой SHA256 без salt/KDF;
* ручную реализацию hashing.

Если legacy-система использует старые hash, раздели замечания:

1. compatibility legacy;
2. что использовать для новых пользователей;
3. как постепенно мигрировать hash после успешного login.

---

# 15. JWT

Проверь:

* алгоритм;
* secret;
* expiration;
* claims;
* user ID;
* token verification;
* exception handling.

Проверь, не кладётся ли JWT:

* в logs;
* в URL;
* в analytics;
* куда-нибудь ещё небезопасно.

Если frontend хранит token в `localStorage`, отметь security trade-off и возможную альтернативу через HttpOnly cookie.

Но учитывай текущую архитектуру и не предлагай огромный rewrite без причины.

---

# 16. EXTERNAL API

Проверь все внешние API:

* Telegram;
* VK;
* payment provider;
* другие сервисы.

Для каждого проверь:

* timeout;
* retry;
* error handling;
* rate limits;
* invalid response;
* connection failure;
* logging;
* API tokens.

Ни один внешний API request не должен бесконечно ждать без timeout.

---

# 17. RETRIES

Проверь повторные запросы.

Необходимо отличать безопасные retry от небезопасных.

Например GET обычно можно retry.

POST создания платежа — только при наличии idempotency.

Не предлагай автоматический retry там, где он может создать duplicate operation.

---

# 18. LOGGING

Проверь логирование.

Найди:

* `print()`;
* debug prints;
* огромные dumps;
* пароли;
* JWT;
* tokens;
* secrets;
* персональные данные.

Предложи structured logging.

Логи должны позволять понять:

request
→ service
→ external API
→ result/error.

Но не логировать секретные данные.

---

# 19. ERROR HANDLING

Найди:

`except Exception:`

`except:`

которые скрывают реальные ошибки.

Найди места, где exception просто проглатывается.

Проверь правильность HTTP statuses.

Например:

400 — invalid request;
401 — authentication;
403 — authorization;
404 — resource missing;
409 — conflict;
422 — validation;
500 — unexpected server problem.

Не обязательно механически применять именно эту схему, если framework использует свои conventions.

---

# 20. API DESIGN

Проверь API на последовательность.

Найди:

* разные naming styles;
* странные routes;
* verbs в URLs;
* разные response formats;
* неодинаковые error responses;
* неодинаковые pagination formats.

Например плохо:

`/get-user`
`/createOrder`
`/orders/delete`

Лучше иметь последовательный REST-style там, где он подходит.

Но не предлагай бессмысленный rewrite API, если он уже стабилен.

---

# 21. RESPONSE SCHEMAS

Проверь, не возвращает ли backend database rows напрямую.

API response должен быть контролируемым.

Нельзя случайно вернуть:

* password_hash;
* token;
* internal flags;
* secrets.

Используй schemas/DTO.

---

# 22. FRONTEND ARCHITECTURE

Теперь проведи такой же аудит frontend.

Проверь React:

* components;
* hooks;
* contexts;
* state;
* routing;
* API calls;
* forms;
* validation;
* authentication;
* loading;
* errors.

Найди компоненты, которые делают слишком много.

Например компонент одновременно:

* рендерит UI;
* вызывает API;
* обрабатывает auth;
* делает validation;
* преобразует данные;
* управляет routing.

Предложи разделение там, где оно реально улучшает поддержку.

---

# 23. REACT HOOKS

Проверь:

* useEffect dependencies;
* бесконечные renders;
* stale closures;
* unnecessary effects;
* unnecessary state;
* derived state;
* memory leaks;
* async useEffect;
* cleanup.

Найди useEffect, который можно заменить обычной вычисляемой переменной.

---

# 24. API CLIENT FRONTEND

Проверь, не вызывается ли `fetch`/`axios` хаотично из разных компонентов.

Если API calls сильно разбросаны — предложи единый client/service layer.

Например:

`api/auth.js`
`api/orders.js`
`api/users.js`

или существующую архитектуру проекта.

Не создавай лишние abstraction levels, если проект небольшой и текущая система чистая.

---

# 25. AUTH STATE FRONTEND

Проверь, нет ли нескольких источников истины:

* localStorage;
* React state;
* Context;
* Redux;
* cookie;
* user object.

Состояние авторизации должно быть предсказуемым.

Проверь refresh приложения.

Проверь expired token.

Проверь logout.

---

# 26. PERFORMANCE FRONTEND

Ищи:

* unnecessary rerenders;
* огромные components;
* expensive calculations;
* большие изображения;
* отсутствие lazy loading;
* огромный initial bundle;
* повторные API requests;
* запросы на каждый render;
* неправильные keys;
* большие списки без pagination/virtualization.

Не советуй memo/useMemo/useCallback повсюду.

Только там, где реально есть польза.

---

# 27. CSS

Проверь:

* дублирование CSS;
* глобальные styles;
* конфликтующие selectors;
* слишком высокая specificity;
* `!important`;
* magic numbers;
* повторяющиеся цвета;
* повторяющиеся spacing;
* отсутствие design tokens.

Если цветов вроде:

`#ffd15d`
`#f2ad25`
`#131313`

очень много в проекте — предложи CSS variables/theme tokens.

Например:

`--color-primary`
`--color-primary-dark`
`--color-bg`.

---

# 28. MAGIC VALUES

Найди magic numbers и magic strings.

Например:

`86400`
`3600`
`100`
`0.15`

или строки типа:

`"telegram"`
`"vk"`
`"admin"`

разбросанные по проекту.

Если значение является domain constant — вынеси в config/constants/enums.

Но не превращай каждую строку в constant.

---

# 29. CONFIGURATION

Проверь конфигурацию environments.

Должно быть понятное разделение:

development;
testing;
production.

Проверь:

* DEBUG;
* CORS;
* database;
* logging;
* external API;
* secrets.

Production не должен случайно запускаться с debug settings.

---

# 30. CORS

Проверь CORS configuration.

Не должно быть без необходимости:

`allow_origins=["*"]`

в production вместе с credentials.

Проверь реальные frontend origins.

---

# 31. DEPENDENCIES

Проверь dependencies проекта.

Найди:

* неиспользуемые;
* дублирующие друг друга;
* deprecated;
* подозрительные;
* слишком тяжёлые зависимости для простой задачи.

Проверь package.json и requirements/pyproject.

Не обновляй версии автоматически.

Просто отметь риски.

---

# 32. TYPES

Если используется Python typing — оцени его качество.

Найди:

* чрезмерное `Any`;
* Optional без обработки;
* неверные return types;
* функции без типов в критичных местах;
* игнорирование None.

Frontend:

* если JS — найди места, где runtime ошибки вероятны;
* если TS — проверь misuse `any`, unsafe assertions.

---

# 33. NONE / NULL

Особенно внимательно ищи:

`obj["id"]`

после функции, которая может вернуть `None`.

Найди потенциальные:

`NoneType is not subscriptable`;
`Cannot read properties of undefined`.

---

# 34. NAMING

Проверь naming consistency.

Backend:

snake_case.

React components:

PascalCase.

hooks:

useSomething.

Проверь опечатки в:

* файлах;
* variables;
* functions;
* database fields;
* API routes.

Но не предлагай rename публичного API без оценки последствий.

---

# 35. DEAD CODE

Найди:

* unused functions;
* unused imports;
* старые routes;
* старые components;
* закомментированные огромные блоки;
* старые implementations;
* abandoned code;
* временные files;
* копии вроде:
  `file_old.py`
  `file2.py`
  `service_new.py`.

Отдельно перечисли legacy-код, который безопасно удалить.

---

# 36. TODO / FIXME

Найди:

* TODO;
* FIXME;
* HACK;
* temporary;
* later;
* quick fix.

Для каждого выясни, актуален ли он.

---

# 37. ASYNC

Если backend использует async, проверь правильность.

Найди:

* blocking I/O внутри async function;
* sync HTTP requests внутри async;
* sync database operations внутри event loop;
* `time.sleep()` внутри async;
* CPU-heavy work.

И наоборот — не предлагай async там, где он ничего не даст.

---

# 38. BACKGROUND TASKS

Проверь background jobs/bots.

Например Telegram bot.

Найди:

* бесконечные циклы;
* отсутствие graceful shutdown;
* отсутствие reconnect;
* отсутствие backoff;
* отсутствие exception handling;
* task leakage.

---

# 39. DATABASE CONNECTIONS

Проверь lifecycle DB connections/sessions.

Найди:

* session leaks;
* незакрытые connections;
* неправильный dependency lifecycle;
* commit/rollback inconsistencies.

---

# 40. PAGINATION

Если есть списки:

* users;
* orders;
* transactions;
* services;

проверь pagination.

Нельзя в production бесконечно делать:

`SELECT * FROM orders`

для всего аккаунта.

---

# 41. LIMITS

Найди endpoints без разумных limits.

Например:

* search;
* pagination size;
* text length;
* username;
* comments;
* URLs.

Это важно и для безопасности, и для производительности.

---

# 42. CACHE

Оцени места, где caching действительно даст пользу.

Но не предлагай Redis просто потому, что он существует.

Покажи конкретно:

* что кешировать;
* почему;
* TTL;
* invalidation.

---

# 43. DATABASE CONSTRAINTS > APPLICATION CHECKS

Ищи конструкции:

`if user_exists(): ...`

но без UNIQUE constraint.

Критичные invariants должны обеспечиваться БД.

Например:

unique login;
unique email;
unique provider+provider_user_id;
unique payment ID.

---

# 44. IDEMPOTENCY

Проверь места, которые могут вызываться повторно:

* payment callback;
* webhook;
* Telegram callback;
* VK callback;
* order creation.

Покажи, где нужна idempotency.

---

# 45. WEBHOOK SECURITY

Если используются webhooks:

проверь signature verification.

Нельзя доверять request только потому, что он пришёл на секретный URL.

---

# 46. FILE UPLOAD

Если есть upload файлов:

проверь:

* type;
* MIME;
* extension;
* size;
* filename;
* path;
* executable content.

Если upload отсутствует — пропусти.

---

# 47. TESTABILITY

Оцени, насколько код легко тестировать.

Найди функции, которые невозможно нормально тестировать, потому что они напрямую:

* читают env;
* используют global state;
* вызывают API;
* открывают DB;
* отправляют Telegram.

Предлагай dependency injection только там, где это реально имеет смысл.

---

# 48. TESTS

Изучи существующие tests.

Покажи, какие критичные части вообще не покрыты.

Приоритет:

1. auth;
2. permissions;
3. payments;
4. balance;
5. orders;
6. social login;
7. database transactions.

---

# 49. OBSERVABILITY

Оцени, насколько production-проблемы можно диагностировать.

Нужны ли:

* request ID;
* correlation ID;
* structured logging;
* error tracking;
* metrics.

Не внедряй сложный observability stack без необходимости, но отметь важные пробелы.

---

# 50. PRODUCTION READINESS

Представь, что завтра на сайт приходит большое количество пользователей.

Найди вещи, которые могут привести к:

* падению backend;
* exhaustion connection pool;
* memory leak;
* overload database;
* rate limit external API;
* duplicate orders;
* duplicate payments;
* stuck requests;
* огромным логам.

---

# 51. SCALABILITY

Отдельно выдели вещи, которые:

### сейчас нормально

но

### станут проблемой при росте.

Не нужно преждевременно усложнять систему.

Раздели:

`исправить сейчас`

и

`исправить позже при масштабировании`.

---

# 52. НЕ ДЕЛАЙ OVERENGINEERING

Это очень важно.

Не предлагай:

* microservices;
* Kubernetes;
* Kafka;
* event sourcing;
* CQRS;
* Redis;
* RabbitMQ;
* GraphQL;

просто потому, что они существуют.

Каждое архитектурное изменение должно иметь конкретную причину в существующем проекте.

Для MVP хорошо написанный modular monolith предпочтительнее бессмысленной сложной архитектуры.

---

# 53. НЕ ОЦЕНИВАЙ СТИЛЬ РАДИ СТИЛЯ

Не нужно писать сотни замечаний типа:

"эту функцию можно сделать на одну строку короче".

Сосредоточься на вещах, которые реально улучшают:

* reliability;
* readability;
* maintainability;
* security;
* performance;
* testability.

---

# 54. КАТЕГОРИИ КРИТИЧНОСТИ

Каждую найденную проблему оцени:

### P0 — CRITICAL

Можно привести к:

* потере денег;
* компрометации аккаунтов;
* утечке данных;
* повреждению БД;
* серьёзной security vulnerability.

### P1 — HIGH

Высокая вероятность багов или серьёзные архитектурные проблемы.

### P2 — MEDIUM

Технический долг, который заметно мешает поддержке проекта.

### P3 — LOW

Хорошее улучшение качества, но не срочное.

---

# 55. ДЛЯ КАЖДОГО ЗАМЕЧАНИЯ

Пиши:

### Проблема

Что конкретно не так.

### Где

Точный файл.

Функция/класс.

По возможности строки.

### Почему это проблема

Не общая теория, а применительно к этому проекту.

### Риск

Что реально может произойти.

### Как исправить

Конкретный вариант.

### Приоритет

P0 / P1 / P2 / P3.

### Сложность

Small / Medium / Large.

---

# 56. НЕ ВЫДУМЫВАЙ

Если ты не можешь подтвердить проблему из кода — не называй её найденным багом.

Разделяй:

**Подтверждённая проблема**

и

**Потенциальный риск / нужно проверить runtime.**

---

# 57. ИЩИ ROOT CAUSE

Если находишь 10 одинаковых проблем, попробуй определить одну архитектурную причину.

Например вместо:

"в 8 компонентах одинаковый fetch"

напиши:

"в проекте отсутствует единый API client layer, из-за чего появились следующие 8 duplicates".

Покажи конкретные примеры.

---

# 58. ОЦЕНИВАЙ ПО ПРОЕКТУ, А НЕ ПО ИДЕАЛЬНОМУ ENTERPRISE

KingPromotion не нужно превращать в банковскую систему или Google.

Нужно добиться:

простоты + безопасности + понятности + надёжности.

Лучшее решение — самое простое решение, которое корректно решает реальную проблему.

---

# 59. СНАЧАЛА ТОЛЬКО АУДИТ

На этом этапе:

НЕ начинай массовый refactoring.

НЕ меняй архитектуру.

НЕ удаляй файлы.

НЕ обновляй dependencies.

НЕ создавай migrations.

НЕ исправляй найденные проблемы автоматически.

Мне нужен именно отчёт, чтобы мы потом могли исправлять проблемы последовательно.

Можно исправить только очевидную критическую проблему, если продолжение анализа невозможно без исправления, но сначала объясни это.

---

# 60. ФОРМАТ ИТОГОВОГО ОТЧЁТА

После полного анализа создай отчёт следующего вида.

# KINGPROMOTION CODE AUDIT

## 1. Executive Summary

Краткая оценка проекта.

Что уже сделано хорошо.

Главные слабые места.

---

## 2. Architecture overview

Опиши текущую архитектуру проекта.

Например:

React
↓
API Client
↓
FastAPI
↓
Routers
↓
Services
↓
Repositories
↓
PostgreSQL

И отдельно:

Telegram;
VK;
Payments;
Bots.

---

## 3. P0 — Critical

Все критические проблемы.

Если их нет — прямо напиши:

`P0 проблем не обнаружено.`

---

## 4. P1 — High Priority

Все важные проблемы.

---

## 5. P2 — Medium Priority

Архитектурный/технический долг.

---

## 6. P3 — Improvements

Необязательные улучшения.

---

## 7. Security Audit

Отдельный security review.

---

## 8. Database Audit

Отдельный DB review.

---

## 9. Backend Architecture Audit

---

## 10. Frontend Architecture Audit

---

## 11. Performance Audit

---

## 12. Dead Code

Что можно удалить.

---

## 13. Duplicated Code

Что можно объединить.

---

## 14. Testing Gaps

Каких тестов не хватает.

---

## 15. Production Risks

Что может сломаться в production.

---

## 16. Scalability Risks

Что станет проблемой при росте.

---

# 61. ТОП-20 УЛУЧШЕНИЙ

После полного аудита выбери **20 наиболее важных изменений**.

Отсортируй их по соотношению:

impact / effort.

Для каждого:

1. название;
2. проблема;
3. файлы;
4. приоритет;
5. сложность;
6. ожидаемый эффект.

---

# 62. ROADMAP

После этого создай конкретный roadmap рефакторинга.

Например:

### Этап 1 — Security / P0

Что исправить первым.

### Этап 2 — Auth / Database

Что исправить после.

### Этап 3 — Architecture cleanup

### Этап 4 — Frontend cleanup

### Этап 5 — Tests

### Этап 6 — Performance

Не смешивай десятки изменений одновременно.

Каждый этап должен оставлять проект рабочим.

---

# 63. ОЦЕНКА КОДОВОЙ БАЗЫ

В самом конце поставь оценки от 0 до 10:

* Architecture;
* Backend code quality;
* Frontend code quality;
* Database design;
* Security;
* Error handling;
* Maintainability;
* Testability;
* Performance;
* Production readiness.

Для каждой оценки дай короткое объяснение.

Затем поставь:

**Overall codebase score: X/10**

Не завышай оценку.

---

# 64. ЦЕЛЕВОЕ СОСТОЯНИЕ

После аудита коротко опиши, как должен выглядеть KingPromotion после исправления найденных проблем.

Цель не в том, чтобы код выглядел "умнее".

Цель:

* каждый модуль имеет понятную ответственность;
* бизнес-логика находится в правильном слое;
* БД гарантирует критичные invariants;
* ошибки обрабатываются предсказуемо;
* security mechanisms нельзя случайно обойти;
* frontend имеет понятный data flow;
* новые функции легко добавлять;
* код легко тестировать;
* новый разработчик может быстро разобраться в проекте;
* production issues можно диагностировать;
* проект можно развивать без постоянного появления новых костылей.

Главный принцип:

**Не пытайся сделать код сложным. Сделай его настолько простым, понятным и надёжным, насколько это возможно.**

Начинай с полного изучения проекта и только после этого составляй аудит.
