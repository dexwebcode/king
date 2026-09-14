# KINGPROMOTION CODE AUDIT

Дата аудита: 10 сентября 2026 г.
Проект: `/home/ava/king`
Ветка и ревизия: `main`, `8d2321e`
Режим: только чтение; исходники, миграции и зависимости не изменялись.

## 4. P1 — High Priority

### AUD-002 — ЮKassa может удерживать worker до 30 минут

- **Статус:** подтверждённая проблема.
- **Проблема:** `configure_yookassa()` вызывает `Configuration.configure()` без `timeout`. У установленного `yookassa==3.12.1` default равен 1800 секундам.
- **Где:** `backend/payments/yookassa_service.py:21-31`, вызовы `Payment.create` на строках 44-67 и `Payment.find_one` на 76-78; dependency evidence: `.venv/.../yookassa/configuration.py:26,61`.
- **Почему:** create-payment и webhook могут занять worker/thread на полчаса; webhook endpoint объявлен `async`, но внутри синхронно вызывает SDK.
- **Риск:** исчерпание worker/thread pool, зависшие checkout/webhook, повторные запросы клиента, лавина незавершённых payment attempts и фактическая недоступность backend.
- **Как исправить:** задать короткие connect/read timeouts, например 3-5/10-15 секунд согласно SLA; вызывать синхронный SDK из обычного `def` endpoint/threadpool или заменить adapter на контролируемый HTTP client; отдельно определить безопасные retry только с тем же idempotence key.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-003 — Критический paid-order workflow не является durable

- **Статус:** подтверждённая проблема.
- **Проблема:** после успешного webhook `dispatch_order` добавляется в FastAPI `BackgroundTasks`; тот же механизм запускается из GET статуса. Нет отдельного постоянного worker/poller для `processed + not_started` и stale `sending`.
- **Где:** `backend/payments/router.py:129-148`, `283-292`, `358-364`; `backend/payments/service.py:484-499`; `backend/admin/service.py:58-94`.
- **Почему:** `BackgroundTasks` живёт в процессе web worker. Рестарт/kill между response и завершением теряет выполнение. Reconciliation зависит от того, что клиент откроет статус или администратор вручную заметит заказ.
- **Риск:** оплаченный заказ остаётся в `Ожидает отправки` неопределённо долго; stale `sending` требует ручной проверки; SLA зависит от пользовательского polling.
- **Как исправить:** без микросервисов: добавить один DB-backed periodic worker/management process, который атомарно claims `processed/not_started`, reconciles pending payment и поднимает stale состояния в очередь внимания. Webhook только фиксирует состояние и будит best-effort обработку; БД остаётся источником истины.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-004 — `cancel` и `refill` допускают повторную внешнюю операцию

- **Статус:** подтверждённая проблема.
- **Проблема:** endpoints вызывают supplier до локального claim; у refill нет idempotence key, локальной записи или сохранения `refill_id`. Два параллельных запроса оба пройдут `_owned_supplier_order()` и вызовут supplier.
- **Где:** `backend/payments/router.py:205-254`; `backend/payments/service.py:704-714`, `770-789`; `backend/services/supplier.py:232-248`.
- **Почему:** внешняя mutation не входит в DB-транзакцию и не защищена условным state transition. Timeout после отправки даёт неизвестный результат и провоцирует опасный retry.
- **Риск:** повторный refill/cancel, неоднозначное состояние, спор с клиентом/поставщиком, отсутствие аудита операции.
- **Как исправить:** отдельные `order_actions`/`refill_attempts` с idempotence key, статусами `creating/sent/unknown/completed`; atomic claim до API; сохранять внешний ID; запрещать автоматический retry после неоднозначного ответа.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-005 — Frontend фактически обходит серверную идемпотентность создания платежа

- **Статус:** подтверждённая проблема.
- **Проблема:** `crypto.randomUUID()` создаётся внутри каждого `handlePayment()`. Повтор после network error получает новый key. Быстрый double-click до rerender также может создать два запроса с разными keys.
- **Где:** `frontend/src/pages/Main/Main.jsx:92-120`, особенно 106.
- **Почему:** idempotence key должен идентифицировать один business intent, а не один HTTP attempt.
- **Риск:** несколько локальных orders/payment attempts и несколько активных ссылок ЮKassa для одного черновика; пользователь может оплатить не тот/оба платежа.
- **Как исправить:** генерировать key при создании/загрузке draft, хранить вместе с draft и повторно использовать до окончательного успеха/явной отмены; дополнительно синхронный ref guard на submit, а не только React state.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-006 — Публичный `/price` раскрывает закупочную цену и неконтролируемые supplier fields

- **Статус:** подтверждённая проблема.
- **Проблема:** `normalize_service` и `add_markup_to_service` распространяют `**service`; response содержит `base_rate`, `provider_*` и любые будущие поля supplier response.
- **Где:** `backend/services/get_price.py:103-151`; публикация `backend/main.py:45-50`.
- **Почему:** граница внешнего API одновременно стала публичным DTO. Изменение/добавление полей поставщиком автоматически меняет KingPromotion API.
- **Риск:** раскрытие маржи и внутренних данных поставщика; нестабильный frontend contract; потенциальная утечка новых supplier-only полей.
- **Как исправить:** explicit public `CatalogServiceResponse`/mapper с whitelist: public ID, name, platform/type, min/max/step, public prices, currency. `base_rate` хранить только во внутренней модели.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-007 — Публичный каталог синхронно бьёт supplier API на каждый запрос

- **Статус:** подтверждённая проблема.
- **Проблема:** каждый `/price` вызывает `get_supplier_services`; `get_service_by_id` снова строит весь каталог. Endpoint публичный и без rate limit.
- **Где:** `backend/main.py:45-50`; `backend/services/get_price.py:154-185`; `backend/services/supplier.py:72-111,171-177`.
- **Почему:** одна страница/заказ вызывает повторные полные загрузки. Supplier timeout равен 20 секундам; отказ поставщика напрямую роняет каталог.
- **Риск:** rate-limit поставщика, thread exhaustion, высокая latency и полная потеря каталога при кратком outage; дешёвый DoS на внешний аккаунт.
- **Как исправить:** небольшой in-process TTL cache 30-120 секунд с last-known-good значением и single-flight lock; ограничить частоту `/price`; для нескольких workers принять кратковременную рассинхронизацию либо позже перейти к DB snapshot. Redis сейчас не нужен.
- **Приоритет:** P1.
- **Сложность:** Small/Medium.

### AUD-008 — Состояние каталога не фиксируется, а цена поставщика повторно вычисляется после оплаты

- **Статус:** подтверждённый design risk; финансовый эффект нужно проверить на реальном supplier contract.
- **Проблема:** order хранит `service_id`, публичную сумму и параметры, но dispatch заново загружает service и считает текущий `base_rate`. Если service исчез — оплаченный заказ получает rejection; если закупочная цена выросла — система может исполнить заказ с отрицательной маржой.
- **Где:** `backend/payments/service.py:229-258`, затем повторно `532-587`; `backend/payments/repository.py:61-100`.
- **Почему:** payment intent и fulfillment используют разные версии volatile external catalog.
- **Риск:** оплаченная, но неисполняемая услуга; финансовый убыток; ручные возвраты/споры.
- **Как исправить:** сохранять нормализованный catalog snapshot/version и `supplier_cost_at_checkout`; перед dispatch сравнивать текущую доступность/стоимость с snapshot и отправлять существенный drift на controlled review/refund policy. Не использовать публичный price как supplier cost.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-009 — Нет rate limiting на auth и дорогостоящих публичных endpoints

- **Статус:** подтверждённая проблема.
- **Проблема:** отсутствуют лимиты для `/auth/login`, `/auth/register`, Telegram guest session/status, `/auth/vk/login`, `/price` и webhook.
- **Где:** `backend/auth/routers/auth.py:25-96`; `backend/auth/routers/telegram.py:42-178`; `backend/auth/routers/vkid.py:29-53`; `backend/main.py:45-50`; `backend/payments/router.py:324-365`.
- **Почему:** login выполняет дорогой PBKDF2, guest session пишет в БД, VK/price/webhook вызывают external APIs.
- **Риск:** password brute force/credential stuffing, CPU exhaustion, рост auth-session таблиц, сжигание supplier/VK/ЮKassa quota.
- **Как исправить:** лимиты по IP + account/identifier для auth, более строгие burst limits для session creation и webhook; generic login error сохранить; добавить security events без credentials.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-010 — Initial auth network error оставляет приложение пустым

- **Статус:** подтверждённая проблема.
- **Проблема:** `isAuth()` не ловит rejected `fetch`; `verifyAuth()` в `App` не имеет `try/finally`. При offline/CORS/backend outage `authChecked` остаётся false, а render возвращает `null`.
- **Где:** `frontend/src/pages/Landing/components/Hero/auth/authApi.js:100-120`; `frontend/src/App.jsx:16-53`.
- **Почему:** обычная временная сетевая ошибка превращается в бесконечный blank screen.
- **Риск:** весь frontend выглядит сломанным даже для публичного landing/catalog.
- **Как исправить:** catch/finally в bootstrap; установить `authChecked=true`, показать recoverable banner/loading error; различать 401 (удалить token) и network/5xx (не стирать сессию автоматически).
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-011 — Telegram polling не обрабатывает rejected request и допускает overlap

- **Статус:** подтверждённая проблема.
- **Проблема:** `checkTelegramStatus()` вызывает `getTelegramGuestStatus()` без try/catch; `setInterval(2500)` запускает новый запрос независимо от завершения предыдущего.
- **Где:** `frontend/src/pages/Landing/components/Hero/auth/LoginForm.jsx:57-101`.
- **Почему:** `sendRequest` не нормализует network errors. При медленной сети несколько polls идут параллельно; при outage возникают unhandled Promise rejections и UI остаётся в pending.
- **Риск:** шум/нагрузка, непредсказуемый UI, зависшая авторизация.
- **Как исправить:** recursive `setTimeout` после завершения запроса, AbortController, try/catch, backoff и terminal timeout по `expires_at`.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-012 — Список заказов не ограничен и порождает fan-out внешних запросов

- **Статус:** подтверждённая проблема.
- **Проблема:** `get_user_orders` возвращает все заказы. Router затем добавляет background sync для каждого активного заказа. Admin attention также не ограничен.
- **Где:** `backend/payments/repository.py:22-44,273-309`; `backend/payments/router.py:273-309`; `backend/admin/service.py:58-94`.
- **Почему:** объём response, DB scan, память и число supplier requests линейно растут с историей пользователя.
- **Риск:** один крупный пользователь создаёт сотни внешних запросов одним GET; rate-limit, slow response, memory/thread pressure.
- **Как исправить:** cursor pagination с server-side maximum; не синхронизировать весь список при чтении; worker обновляет активные orders пакетами с глобальной частотой.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-013 — Production-конфигурация привязана к временному ngrok URL и дублируется

- **Статус:** подтверждённая проблема.
- **Проблема:** backend defaults и frontend VK config содержат `monument-cuddly-outsell.ngrok-free.dev`; Vite allowedHosts также hardcoded. Frontend не использует env для VK app/redirect.
- **Где:** `backend/core/config.py:60-69`; `frontend/src/pages/Landing/components/Hero/auth/LoginForm.jsx:17-20,200-207`; `frontend/vite.config.js:10-20`.
- **Почему:** backend и frontend могут разъехаться, домен истечь или вести на чужой endpoint. Сборка не переносима между dev/staging/prod.
- **Риск:** сломанный VK login/CORS/return flow после deploy; случайное использование dev tunnel в production.
- **Как исправить:** обязательные production env `FRONTEND_URL`, `VITE_VK_APP_ID`, `VITE_VK_REDIRECT_URL`, `VITE_API_URL`; валидировать URL на startup/build; убрать небезопасные production defaults.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-014 — Репозиторий не может воспроизвести базовую БД

- **Статус:** подтверждённая проблема репозитория; фактическая schema runtime не проверена.
- **Проблема:** есть только два ручных SQL-файла, которые предполагают уже существующие `migration_temp.users/orders/transaction/expenses/referals`. Нет baseline, migration runner/version table, documented apply/rollback procedure.
- **Где:** `backend/migrations/001_yookassa_balance.sql`, `002_passwordless_social_auth.sql`; README не содержит reproducible DB setup.
- **Почему:** новый environment и CI невозможно поднять из source control; `CREATE TABLE IF NOT EXISTS` не подтверждает форму ранее созданной таблицы.
- **Риск:** schema drift, миграции в разном порядке, production-only ошибки колонок/constraints, невозможность disaster recovery.
- **Как исправить:** зафиксировать sanitized baseline legacy schema; подключить простой Alembic/другой versioned runner; документировать upgrade/backup/rollback; добавить schema smoke-test в CI.
- **Приоритет:** P1.
- **Сложность:** Large.

### AUD-015 — Конфигурационные ошибки обнаруживаются уже при обработке денег

- **Статус:** подтверждённая проблема.
- **Проблема:** `REFERRAL_REWARD_PERCENT` проверяется только внутри successful payment transaction; markup сначала превращается во `float` и не валидируется на finite/range. JWT algorithm/secret length и обязательные production URLs также не проверяются целиком на startup.
- **Где:** `backend/core/config.py:11-29,48-76`; `backend/payments/service.py:437-447`.
- **Почему:** bad deployment может стартовать успешно, принять платёж и затем откатывать локальную обработку каждого succeeded payment.
- **Риск:** деньги у клиента списаны, но attempt остаётся непроведённым; повторные webhooks продолжают падать.
- **Как исправить:** typed Settings; `Decimal` для процентов; startup validation диапазонов, finite, secret length, URLs и provider credentials; fail fast до readiness.
- **Приоритет:** P1.
- **Сложность:** Small.

### AUD-016 — Тестовый suite не завершается и не защищает release

- **Статус:** подтверждённая проблема.
- **Проблема:** 4 теста зависают: три в `backend/tests/test_order_flow.py` на выполнении Starlette `BackgroundTasks`, один `AdminSecurityTests` в `backend/tests/test_supplier.py` на ручном ASGI lifecycle. Нет глобального timeout/CI config.
- **Где:** `test_order_flow.py:59-137`; `test_supplier.py:134-200`.
- **Почему:** `python -m unittest discover` нельзя использовать как release gate; hang хуже явного failure.
- **Риск:** CI висит или отключается, регрессии webhook/admin проходят незамеченными.
- **Как исправить:** использовать поддерживаемый TestClient/httpx ASGI transport в одном event-loop, напрямую исполнять/инспектировать queued task там, где тестируется scheduling, поставить per-test/job timeout; добавить реальный PostgreSQL integration suite.
- **Приоритет:** P1.
- **Сложность:** Small/Medium.

### AUD-017 — Frontend payload слишком тяжёлый для landing

- **Статус:** подтверждённая проблема.
- **Проблема:** production build создаёт около 11 MiB assets. Отдельные PNG весят 1,2-1,65 MiB; route-level dynamic imports отсутствуют. VK SDK попадает в общий JS graph.
- **Где:** `frontend/src/assets/background/*.png`, `assets/icons/show.png`, `dont_show.png`; static imports в `App.jsx` и `LoginForm.jsx`; build evidence приведён в scope.
- **Почему:** изображения для первого экрана/секций доставляются в исходном тяжёлом формате; все страницы импортируются eager.
- **Риск:** медленный LCP/TTI на мобильной сети, лишний трафик, высокий bounce rate.
- **Как исправить:** конвертировать PNG в корректно сжатый WebP/AVIF и responsive variants, lazy-load below-the-fold images, route-level `React.lazy`, отдельно грузить VK SDK по клику/на auth route; затем измерить Lighthouse/Web Vitals.
- **Приоритет:** P1.
- **Сложность:** Medium.

### AUD-018 — `.env` доступен всем локальным пользователям ОС

- **Статус:** подтверждённая проблема.
- **Проблема:** `backend/.env` имеет mode `664`.
- **Где:** filesystem metadata `/home/ava/king/backend/.env`.
- **Почему:** в файле находятся DB password, JWT secret, supplier, Telegram и ЮKassa credentials.
- **Риск:** любой local account/process с доступом к host может прочитать все production-like secrets.
- **Как исправить:** `chmod 600`, отдельный service user, секреты через deployment secret store; не копировать `.env` в image/artifact.
- **Приоритет:** P1.
- **Сложность:** Small.

## 5. P2 — Medium Priority

### AUD-019 — JWT хранится в `localStorage`, CSP отсутствует, logout не отзывает token

- **Статус:** подтверждённая архитектура и её риск; XSS sink в текущем React-коде не найден.
- **Проблема:** bearer JWT доступен любому JS origin; token действует до 24 часов. `/auth/logout` ничего не отзывает.
- **Где:** `authApi.js:33-118`, `AppShell.jsx:19,75,109`, `backend/auth/security.py:80-117`, `auth/routers/auth.py:94-99`, `frontend/index.html`.
- **Почему:** будущая XSS/supply-chain компрометация извлечёт token; украденный token продолжит работать после logout.
- **Риск:** захват сессии до expiry.
- **Как исправить:** краткосрочно CSP, не логировать tokens, уменьшить TTL по risk appetite; далее рассмотреть HttpOnly Secure SameSite cookie + CSRF strategy или short access/rotating refresh token. Не нужен немедленный rewrite, но trade-off должен быть осознан.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-020 — Telegram one-time token передаётся в query string, а bot secret связан с JWT secret

- **Статус:** подтверждённая проблема.
- **Проблема:** browser polls `GET .../guest/status?token=...`; query может попасть в access logs/observability. Если `TELEGRAM_BOT_BACKEND_SECRET` не задан, используется `SECRET_KEY`; в текущем `.env` отдельный key отсутствует.
- **Где:** `authApi.js:72-78`; `auth/routers/telegram.py:61-70`; `core/config.py:54-58`.
- **Почему:** одноразовый token фактически авторизует выпуск JWT, а reuse secret расширяет blast radius.
- **Риск:** утечка token через URL logging; компрометация bot-to-backend secret становится компрометацией JWT signing.
- **Как исправить:** status через POST body либо redaction query в proxy/logging; обязательный независимый bot secret; ротировать его отдельно.
- **Приоритет:** P2.
- **Сложность:** Small.

### AUD-021 — Telegram redemption разбит на три commit и может застрять в `redeeming`

- **Статус:** подтверждённый crash-consistency risk.
- **Проблема:** claim commit → social user commit → finish commit. Process crash после первого/второго шага оставляет session `redeeming`; release выполняется только на пойманном exception.
- **Где:** `auth/telegram_sessions.py:111-177`; `auth/routers/telegram.py:61-147`; `auth/social_auth.py:23-80`.
- **Почему:** процессный crash не выполняет exception handler.
- **Риск:** пользователь навсегда видит processing до expiry; может появиться social account без выданного JWT.
- **Как исправить:** либо одна DB-транзакция для claim+user+consume, либо lease (`redeeming_at`) с безопасным возвратом stale claim; добавить crash-boundary integration tests.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-022 — Process-local throttles не работают глобально и растут без очистки

- **Статус:** подтверждённая проблема.
- **Проблема:** `_status_sync_started_at` — неограниченный dict; Lock/cache существуют только внутри одного worker. В multi-worker deployment каждый процесс выполнит sync независимо.
- **Где:** `backend/payments/service.py:63-65,753-767`; `backend/admin/service.py:12-31`.
- **Почему:** control-plane состояние не разделяется и не очищается.
- **Риск:** memory growth по числу order IDs, duplicate supplier status calls, непредсказуемый rate limit при масштабировании workers.
- **Как исправить:** перенести due/claim timestamp в БД и чистить записи; admin display cache можно оставить process-local, документировав семантику.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-023 — Payment service и repository стали слишком крупными

- **Статус:** подтверждённая проблема maintainability.
- **Проблема:** `payments/service.py` — 789 строк; функции `create_order_payment` 125 строк, `process_verified_payment` 114, `dispatch_order` 159. `repository.py` — 773 строки и смешивает account queries, payment attempts, accounting и dispatch state machine.
- **Где:** указанные файлы и функции.
- **Почему:** большое число состояний/исключений и три внешних/DB boundary усложняют локальное доказательство корректности.
- **Риск:** изменения payment creation задевают accounting/dispatch; сложнее тестировать failure boundaries.
- **Как исправить:** после P0/P1 разделить по use cases: `checkout_service`, `payment_processing_service`, `dispatch_service`; repositories `orders`, `payment_attempts`, `ledger`. State transitions держать явными и не добавлять generic abstraction framework.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-024 — Frontend не имеет единого API/error/auth слоя

- **Статус:** подтверждённая проблема.
- **Проблема:** `API_URL`, Authorization header, JSON parsing и 401 handling дублируются минимум в 7 файлах. Auth имеет несколько источников истины: localStorage, `App` state, custom DOM event, локальные `hasSession`/token variables.
- **Где:** `authApi.js`, `App.jsx`, `AppShell.jsx`, `Admin.jsx`, `Main.jsx`, `Catalog.jsx`, `Payment.jsx`, OrderCard.
- **Почему:** поведение network error/401 различается: где-то error swallowed, где-то token удаляется, где-то UI остаётся authenticated.
- **Риск:** stale auth UI, дублирующиеся запросы `/api/me` и `/api/admin/me`, трудное изменение storage/cookie strategy.
- **Как исправить:** маленький `api/client.js` с parse/error/timeout/abort/401 policy и `AuthProvider/useAuth`; domain wrappers `auth`, `orders`, `admin`, `catalog`. Не вводить Redux без другой причины.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-025 — API contracts и routes непоследовательны

- **Статус:** подтверждённая проблема.
- **Проблема:** два endpoint текущего пользователя (`/auth/me` с `{success,user}` и `/api/me` с flat object/balance), отдельный `/api/my-balance`, смешаны `/price`, `/auth`, `/api`. Большинство responses не имеют response model.
- **Где:** `auth/routers/auth.py:48-58`; `payments/router.py:257-321`; `main.py:45-50`.
- **Почему:** frontend должен знать несколько форматов одной сущности; accidental response drift не ловится OpenAPI/Pydantic.
- **Риск:** runtime undefined/None ошибки и утечка поля при будущих изменениях.
- **Как исправить:** определить DTO и единый envelope/error convention; постепенно оставить один account endpoint. Стабильные публичные routes менять только через совместимый deprecation period.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-026 — Статусы и legacy dates являются неявными magic strings

- **Статус:** подтверждённая проблема.
- **Проблема:** payment/dispatch/order statuses разбросаны русскими и английскими строками; даты order/transaction/expense формируются как `"%H:%M:%S %d.%m.%Y"`.
- **Где:** `payments/service.py:92-93,385-474,717-723`; `payments/repository.py:433-773`; `router.py:96-109`; frontend status matching.
- **Почему:** опечатка создаёт новое состояние; строковую дату нельзя надёжно сортировать, индексировать и сравнивать по timezone.
- **Риск:** stuck state и неправильная сортировка/аналитика.
- **Как исправить:** enum/constants + transition table; новые timestamps как `TIMESTAMPTZ`, legacy parsing только на migration boundary; API отдаёт ISO 8601.
- **Приоритет:** P2.
- **Сложность:** Medium/Large.

### AUD-027 — Индексы session/payment queries не соответствуют основным access patterns

- **Статус:** подтверждено для миграций; фактические legacy indexes нужно проверить runtime.
- **Проблема:** cleanup auth sessions фильтрует `expires_at` без создаваемого индекса; attention query фильтрует `status + dispatch_status` и сортирует `updated_at`, но миграция создаёт только индекс `status`. Индекс `orders(user_id,id desc)` в репозитории не описан.
- **Где:** `telegram_sessions.py:37-43`; `vk_sessions.py:21`; `payments/repository.py:22-44,273-309`; migrations 001/002.
- **Почему:** таблицы будут сканироваться по мере роста.
- **Риск:** latency/locks при session creation, my-orders и admin queue.
- **Как исправить:** после `EXPLAIN ANALYZE` добавить `expires_at`, `(user_id,id DESC)` и partial/composite index для attention states; не создавать индексы вслепую.
- **Приоритет:** P2.
- **Сложность:** Small/Medium.

### AUD-028 — Нет централизованной observability и безопасной log policy

- **Статус:** подтверждённая проблема.
- **Проблема:** нет logging configuration, request/correlation ID, latency/status metrics или global exception mapping. Часть bot/frontend использует `print`/`console.log`; supplier error text сохраняется/логируется, а точный supplier balance пишется на INFO.
- **Где:** `backend/main.py`; `services/supplier.py:65-69,186`; `payments/service.py:615-669`; `bots/telegram/bot.py:103-113`; Login/Register forms.
- **Почему:** цепочку request → payment → DB → supplier трудно восстановить, а redaction ограничена только API key.
- **Риск:** медленная диагностика финансовых инцидентов; возможное попадание recipient links/PII из provider error в logs.
- **Как исправить:** structured JSON logging, request_id/payment_attempt_id/order_id, redaction policy, error tracking; не логировать JWT, raw webhook/body, credentials и provider responses целиком.
- **Приоритет:** P2.
- **Сложность:** Medium.

### AUD-029 — CORS и runtime profiles не разделены

- **Статус:** подтверждённая проблема.
- **Проблема:** localhost origins всегда разрешены; allow methods/headers `*`; нет явных development/testing/production settings.
- **Где:** `backend/main.py:26-38`; `core/config.py`.
- **Почему:** production inherits development exceptions; будущий cookie-auth повысит риск.
- **Риск:** лишняя cross-origin поверхность и deployment mistakes. Текущая комбинация не содержит `allow_origins=["*"]`, поэтому критической CORS-ошибки сейчас нет.
- **Как исправить:** environment-specific allowlist; startup validation production profile; ограничить methods/headers фактически используемыми.
- **Приоритет:** P2.
- **Сложность:** Small.

### AUD-030 — Dependencies Python почти не зафиксированы, tooling отсутствует

- **Статус:** подтверждённая проблема.
- **Проблема:** 9 из 10 Python direct dependencies без версии; нет lock/constraints, lint/type/security tooling и CI definition. Frontend Vite/plugin находятся в runtime dependencies.
- **Где:** `requirements.txt:1-10`; `frontend/package.json:11-19`.
- **Почему:** одинаковый commit ставит разные dependency graphs в разные дни.
- **Риск:** неожиданные breaking changes, нерепродуцируемый deploy; Python CVE scan не выполнен автоматически.
- **Как исправить:** pin/lock проверенный graph, Dependabot/Renovate с тестами, ruff + type checker на критичных модулях, pip-audit; Vite/plugin переместить в devDependencies при следующем controlled lock update.
- **Приоритет:** P2.
- **Сложность:** Small/Medium.

### AUD-031 — Backend typing слаб на DB/API boundaries

- **Статус:** подтверждённая проблема.
- **Проблема:** repository functions возвращают неаннотированные RowMapping, service принимает generic `dict`, payment SDK objects не типизированы; множество `.get` и `[...]` не проверяются static analysis.
- **Где:** `auth/repository.py`, `social_accounts.py`, `payments/repository.py`, `payments/service.py`.
- **Почему:** contract между SQL alias, service и response существует только неявно.
- **Риск:** изменение column alias даёт runtime `KeyError`/None errors в финансовом flow.
- **Как исправить:** TypedDict/dataclass/Protocol на границах, explicit return types, mypy/pyright сначала для payment/auth; не строить ORM rewrite только ради типов.
- **Приоритет:** P2.
- **Сложность:** Medium.

## 6. P3 — Improvements

### AUD-032 — Подтверждённый dead/legacy code и assets

- **Статус:** подтверждённая проблема.
- **Проблема:** неиспользуемые `backend/auth/vk_sessions.py`, `exchange_vk_code()` в `vk_oauth.py`, debug `backend/test.py`, placeholder VK bot, duplicate `Hero/Stats`, старый OrderCard CSS tree (1 508 строк), 17 неиспользуемых изображений (11,38 MiB source assets).
- **Где:** перечисленные файлы; `frontend/src/pages/Landing/components/OrderCard/css/**`; `frontend/src/assets/**`.
- **Почему:** старый server-side PKCE flow сосуществует с frontend SDK flow; текущий OrderCard импортирует только `gpttest/order.css`.
- **Риск:** разработчик исправляет неактивную реализацию; repo и review шумят.
- **Как исправить:** удалить отдельным cleanup commit после подтверждения product owner, что server-side VK flow не планируется; переименовать `gpttest` в production-neutral directory; build/smoke-test после удаления.
- **Приоритет:** P3.
- **Сложность:** Small.

### AUD-033 — Метаданные каталога и CSS tokens дублируются

- **Статус:** подтверждённая проблема.
- **Проблема:** platform names/icons/order и service labels определены в `catalogMeta.js`, `Catalog.jsx`, `Hero.jsx`, `shared.jsx`; основные gold/text colors повторяются десятки раз несмотря на два `:root` token set.
- **Где:** `frontend/src/ui/catalogMeta.js`; `pages/Catalog/Catalog.jsx:24-136`; `Hero.jsx:28-41`; `Landing.css:3-14`; component CSS.
- **Почему:** уже есть расхождения (`apple`/`apple_music`, разные cleanServiceName).
- **Риск:** разные названия/иконки/цены на разных экранах, дорогой redesign.
- **Как исправить:** один `platformMeta/catalogMeta`; согласовать `--kp-*` tokens и постепенно заменить самые повторяемые literals. Не абстрагировать уникальные декоративные значения.
- **Приоритет:** P3.
- **Сложность:** Small/Medium.

### AUD-034 — Репозиторий хранит root `node_modules`

- **Статус:** подтверждённая проблема.
- **Проблема:** 366 файлов root `node_modules` tracked; `.gitignore` содержит ошибочный `.node_modules/`, но не `/node_modules/`. Root package дублирует VK SDK из frontend. `.git` занимает около 105 MiB.
- **Где:** `.gitignore:16`; root `package.json`, `package-lock.json`, `node_modules`.
- **Почему:** vendored dependency раздувает history и создаёт два источника версии SDK.
- **Риск:** большие clone/diff, случайное использование не того package tree.
- **Как исправить:** добавить `/node_modules/`, удалить tracked tree и root manifest, если он не имеет отдельной роли; историю переписывать только вместе с AUD-001.
- **Приоритет:** P3.
- **Сложность:** Small.

### AUD-035 — Документация уже расходится с кодом

- **Статус:** подтверждённая проблема.
- **Проблема:** backend doc перечисляет отсутствующие Telegram endpoints и не показывает migration 002/admin; frontend doc перечисляет удалённые TelegramAuth/VkAuth пути и старую структуру.
- **Где:** `docs/backend/01-ARCHITECTURE.md`, `docs/frontend/01-ARCHITECTURE.md`.
- **Почему:** документация не может служить onboarding/runbook.
- **Риск:** неверные изменения и ручные операции по устаревшей карте.
- **Как исправить:** генерировать route list из OpenAPI, обновить architecture docs и добавить deployment/migration/runbook разделы.
- **Приоритет:** P3.
- **Сложность:** Small.

### AUD-036 — Несколько frontend UX/accessibility хвостов

- **Статус:** подтверждённая проблема низкого риска.
- **Проблема:** нет wildcard/404 route; modal dialogs не имеют focus trap/return focus; `scrollRestoration="manual"` не восстанавливается при unmount; frontend password max 20, backend max 100; frontend запрещает Gmail, backend принимает.
- **Где:** `App.jsx:55-82`; Catalog/Order modal markup; `Landing.jsx:41-74`; `validatePassword.js:12-14`; `validateEmail.js:34-39`; `auth/schemas.py:90-144`.
- **Почему:** непоследовательный UX и accessibility.
- **Риск:** blank unknown route, keyboard trap, пользователь видит ограничения, которых нет на server.
- **Как исправить:** 404 route, accessible modal primitive, restore global browser setting, единые UX rules с backend как источником истины.
- **Приоритет:** P3.
- **Сложность:** Small.

## 7. Security Audit

### Что сделано хорошо

- SQL параметры bind-ятся; найденные f-strings в repository вставляют только внутренне выбранный `FOR UPDATE`, поэтому подтверждённой SQL injection нет.
- React не использует `dangerouslySetInnerHTML`/`innerHTML`; пользовательские/provider строки рендерятся с React escaping. Подтверждённой XSS нет.
- Recipient URL не запрашивается backend, а передаётся поставщику; подтверждённой SSRF в KingPromotion нет.
- File upload отсутствует, поэтому path traversal/upload MIME issues неприменимы.
- Order sync/cancel/refill сначала получают order по `(order_id,user_id)`; IDOR для пользовательских заказов не найден. Admin router целиком защищён `get_current_admin`.
- ЮKassa webhook не доверяет payload amount/metadata: по payment ID выполняется server-to-server lookup, затем сверяются attempt/order/user/amount/currency. Отсутствие локальной проверки signature/source поэтому не является подтверждённым способом подделать оплату.
- Telegram browser token хранится в БД только как SHA-256 hash; claim выполняется atomic update. Bot secret сравнивается constant-time.
- Social account uniqueness обеспечена БД по `(provider, provider_user_id)` и `(user_id, provider)`; race при создании обработана.

### Основные риски

Критичны AUD-001, затем AUD-009, AUD-018, AUD-019 и AUD-020. Дополнительно:

- login возвращает одинаковое сообщение, но timing для отсутствующего пользователя намного короче PBKDF2 verify; rate limiting важнее искусственного sleep;
- JWT содержит только `sub/exp`; `iss`, `aud`, `iat`, `jti` и token type отсутствуют. Для одного monolith это допустимо, но усложняет rotation/revocation;
- `ACCESS_TOKEN_EXPIRE_MINUTES=1440` увеличивает окно украденного token;
- открытые Swagger/ReDoc endpoints следует осознанно включать/выключать production profile, хотя сами по себе они не являются P0;
- локальные dev origins в production CORS следует убрать. `allow_origins=["*"]` вместе с credentials в проекте не найден.

## 8. Database Audit

### Подтверждённо хорошо

- `payment_attempts.amount` — `NUMERIC(10,2)` с `CHECK amount > 0`; Python accounting использует `Decimal` и `ROUND_HALF_UP`.
- Unique: provider/idempotence key, provider/payment ID, transaction ID, order ID; partial unique для ЮKassa transaction external ID и supplier order ID.
- Успешный payment processing использует одну `session.begin()`, locks attempt/user/order и атомарно пишет transaction, две expense entries, balance, order и payment status.
- Повторный processed webhook возвращается до создания второй transaction.
- Social create user + link выполняется в одной transaction; IntegrityError race восстанавливается по winning account.

### Проблемы и проверки runtime

- AUD-014, AUD-026, AUD-027 — главные DB gaps.
- Реальный тип `users.balance`, FK/unique/check в legacy tables, indexes `orders.user_id`, `expenses.user_id/order_id`, `transaction.user_id` не удалось подтвердить: DB не запущена и baseline отсутствует.
- В migrations нет явного `CHECK users.balance >= 0`; application lock защищает текущий flow, но invariant лучше подтвердить/зафиксировать БД после анализа legacy данных.
- `add_referral_reward()` не проверяет rowcount. Если referral row отсутствует, reward молча исчезает. Семантику `referals.user_id` нужно сверить с бизнес-моделью до изменения (`payments/repository.py:415-430`).
- `SELECT *` встречается в internal repository (`payment_attempts`, `orders`). Injection/сам по себе full scan здесь не следует из `*`, но contract становится чувствительным к schema changes; для locked rows лучше explicit columns.
- SQL N+1 внутри repository не найден; найден внешний API fan-out в list endpoint (AUD-012).
- `001` выполняет `COMMIT`, а `VALIDATE CONSTRAINT` — уже после него. Это допустимый online migration pattern, но failure validation оставляет частично применённую migration; runner должен фиксировать это состояние.

## 9. Backend Architecture Audit

Router/service/repository разделение в auth и payments уже заметно и в целом полезно. Routers не содержат raw SQL; repository не формирует HTTP responses. Основное нарушение границ — session lifecycle: часть services создаёт `SessionLocal`, часть получает session из FastAPI dependency, а session modules сами делают commit. Из-за этого составные операции Telegram трудно сделать атомарными.

Рекомендованная целевая форма без overengineering:

```text
router (HTTP mapping + schemas)
  → use-case service (transaction boundary)
      → narrow repositories (без commit)
      → provider adapters (timeout + normalized errors)
```

Commit/rollback должен принадлежать use case. Supplier/ЮKassa adapters не должны знать HTTP. Сначала разбить только три большие payment use cases и Telegram redemption; остальные небольшие файлы уже приемлемы.

## 10. Frontend Architecture Audit

Компоненты Landing секционированы неплохо, а Order wizard отделён от checkout confirmation. Но `Catalog.jsx` (406 строк), `LoginForm.jsx` (396), `RegisterForm.jsx` (323) и Order wizard (354) совмещают data fetching, provider SDK, polling, storage, navigation, validation и UI.

Практичное разделение:

- `api/client` и domain API modules;
- `AuthProvider` как единственный reactive auth source;
- `useTelegramLogin` и lazy-loaded `useVkLogin`;
- `useCatalog`/catalog meta;
- Order wizard reducer/state hook и небольшие step components;
- route-level lazy loading для Admin/Main/Payment и provider SDK.

Не нужно добавлять Redux: текущего Context + hooks достаточно. `memo/useMemo/useCallback` массово добавлять не нужно; текущие expensive catalog filters можно оставить до измерений либо мемоизировать после разделения.

## 11. Performance Audit

Исправить сейчас:

- ЮKassa 1800-second timeout (AUD-002);
- catalog cache/rate limit (AUD-007);
- pagination и удаление sync fan-out из list read (AUD-012);
- 11 MiB frontend assets и eager routes (AUD-017);
- indexes после `EXPLAIN ANALYZE` (AUD-027).

При росте:

- process-local throttle/cache (AUD-022);
- DB pool имеет только defaults (`pool_pre_ping=True`); измерить pool wait и установить `pool_size/max_overflow/pool_timeout/recycle` под число workers и лимит PostgreSQL, а также statement timeout;
- supplier catalog можно сохранять в БД snapshot, если несколько workers начнут существенно дублировать refresh;
- длинные order/admin lists требуют cursor pagination, не virtualization как первый шаг.

## 12. Dead Code

Можно удалить отдельным проверяемым cleanup commit:

1. `backend/test.py` — debug print и прямой supplier call.
2. `backend/auth/vk_sessions.py` и `exchange_vk_code()` — не импортируются; текущий flow обменивает code на frontend через VK SDK.
3. `backend/bots/vk/bot.py` — только placeholder, если VK bot действительно не планируется.
4. `frontend/src/pages/Landing/components/Hero/Stats/**` — duplicate, активный Hero импортирует sibling `components/Stats`.
5. `frontend/src/pages/Landing/components/OrderCard/css/**` — 1 508 строк legacy CSS; active export ведёт в `gpttest/order.jsx`, который импортирует `gpttest/order.css`.
6. 17 assets без ссылок из JS/JSX/CSS, суммарно 11,38 MiB: старые benefit icons, `ChatGPT Image...png`, `telegram-black.svg`, `yandex-music.png`, `background/1.png`, `background/x.png` и др.
7. Игнорируемые `__pycache__` содержат следы уже удалённых `payments/guest.py`, `auth/routers/social.py`; это local cleanup, не Git change.

Перед удалением server-side VK flow следует подтвердить, что он не планируется как замена frontend token exchange.

## 13. Duplicated Code

Главные root causes:

- отсутствует единый frontend API client: 7 определений `API_URL`, повторяются bearer header/JSON/error handling;
- catalog metadata определена минимум в `catalogMeta.js`, `Catalog.jsx`, `Hero.jsx`, `shared.jsx`;
- auth/account/admin requests повторяются в `App`, `AppShell`, `Catalog`, `Main`;
- supplier error mapping дублируется в payment/admin routers;
- payment repository повторяет state update pairs `orders + payment_attempts`; это лучше выразить узкими named transition functions/state table, а не универсальным generic updater;
- два набора theme variables (`--kp-*` и landing `--gold/--panel/...`) и десятки literal copies.

## 14. Testing Gaps

Текущее покрытие полезно проверяет hash migration, social race, Telegram single redemption, Decimal/accounting calls, idempotent processed webhook, supplier parsing и concurrent dispatch claim. Но почти все DB operations замоканы.

Обязательные пробелы:

1. PostgreSQL integration tests реальных transactions/constraints/row locks и двух параллельных connections.
2. Реальный duplicate webhook concurrency, не последовательный mock.
3. Crash boundaries payment processed → dispatch и Telegram claim → consume.
4. Idempotency create-payment: same key/same body, same key/different body, concurrent same key, failed provider response then retry.
5. Refill/cancel concurrency и unknown outcome.
6. Ownership/IDOR для status/sync/cancel/refill; admin allow/deny через стабильный ASGI client.
7. YooKassa metadata/payment method/status matrix и timeouts.
8. Schema migration from clean baseline and from previous production version.
9. Frontend component tests auth bootstrap/network error, Telegram polling, double submit, expired token/logout.
10. E2E happy path local login/social login/order/payment callback/dispatch с provider fakes.

CI minimum: backend tests with hard timeout, frontend build, ESLint, Python lint/type check, secret scan, dependency audits.

## 15. Production Risks

Наиболее вероятные инциденты завтра при росте трафика:

- leaked JWT/DB secret используется до ротации;
- несколько медленных ЮKassa запросов блокируют workers на 30 минут;
- `/price` или forged/irrelevant webhook traffic истощает внешнюю quota и thread pool;
- restart теряет dispatch оплаченного заказа;
- user double submit создаёт несколько payment links;
- duplicate refill выполняет внешнюю mutation повторно;
- один account с большой историей порождает unbounded response и supplier fan-out;
- bad referral config ломает каждый succeeded payment после списания на стороне ЮKassa;
- frontend outage/CORS issue показывает blank screen;
- диагностика затягивается из-за отсутствия request/order correlation ID.

До публичного release обязательны AUD-001—005, 007, 009, 010, 013, 015, 016 и минимальный вариант AUD-003.

## 16. Scalability Risks

### Исправить сейчас

- rate limits, timeouts, durable reconciliation, idempotency mutations;
- DTO каталога + короткий cache;
- pagination orders/admin;
- image optimization/lazy chunks;
- startup config validation и reproducible migrations.

### Исправить позже при подтверждённом росте

- вынести catalog snapshot/cache в БД или shared cache, если multi-worker duplication станет измеримой;
- отдельный worker pool с bounded concurrency для supplier status sync;
- настроить DB pool по метрикам;
- CDN для static assets;
- table partitioning/archival для ledger/orders только после измерения объёма;
- Redis/RabbitMQ не нужны сейчас: DB-backed worker/leases достаточно для MVP.

## 17. ТОП-20 УЛУЧШЕНИЙ ПО IMPACT / EFFORT

| # | Изменение | Проблема / файлы | Приоритет | Сложность | Ожидаемый эффект |
|---:|---|---|---|---|---|
| 1 | Ротировать DB/JWT secrets и очистить Git history | AUD-001, historical `backend/.env` | P0 | Medium | Закрывает полный compromise DB/accounts |
| 2 | Задать timeout ЮKassa | `yookassa_service.py` | P1 | Small | Убирает 30-минутные stuck workers |
| 3 | Сохранять checkout idempotence key в draft | `Main.jsx` | P1 | Small | Убирает duplicate orders/payment links |
| 4 | Исправить auth bootstrap `catch/finally` | `App.jsx`, `authApi.js` | P1 | Small | Убирает blank screen при outage |
| 5 | Ввести explicit public catalog DTO | `get_price.py`, `main.py` | P1 | Small | Скрывает закупочную цену и стабилизирует API |
| 6 | Добавить startup config validation | `core/config.py` | P1 | Small | Bad deploy не принимает платежи |
| 7 | Убрать ngrok hardcodes в env | backend config, LoginForm, Vite | P1 | Small | Переносимый и предсказуемый deploy |
| 8 | Кешировать catalog 30-120 sec + last-good | `get_price.py`, supplier adapter | P1 | Small/Medium | Резко снижает latency/quota и outage impact |
| 9 | Rate-limit auth/session/catalog/webhook | FastAPI middleware/dependencies | P1 | Medium | Защита CPU, DB и external quota |
| 10 | Durable DB-backed paid-order worker | payment state machine | P1 | Medium | Оплаченные заказы не зависят от web process |
| 11 | Idempotent cancel/refill attempts | router/service/repository | P1 | Medium | Исключает duplicate supplier mutations |
| 12 | Catalog snapshot и price-drift guard | checkout/dispatch/schema | P1 | Medium | Защищает от paid-but-unfulfillable и отрицательной маржи |
| 13 | Pagination + убрать sync fan-out из GET | orders repository/router | P1 | Medium | Ограниченная нагрузка при росте истории |
| 14 | Починить 4 hanging tests и включить CI timeout | backend tests | P1 | Small/Medium | Рабочий release gate |
| 15 | Сжать изображения и lazy-load routes/VK SDK | frontend assets/App/Login | P1 | Medium | Снижение initial transfer с ~11 MiB |
| 16 | Закрыть permissions `.env` до 600 | filesystem/deploy | P1 | Small | Снижает local secret exposure |
| 17 | Ввести baseline + migration runner | migrations/docs | P1 | Large | Воспроизводимая БД и recovery |
| 18 | Единый API client + AuthProvider | frontend | P2 | Medium | Одинаковые network/401 semantics, меньше дублей |
| 19 | Structured logging + request/order correlation | backend/main/adapters | P2 | Medium | Диагностика payment incidents без утечки secrets |
| 20 | Typed statuses, TIMESTAMPTZ и targeted indexes | DB/payment modules | P2 | Medium/Large | Меньше stuck states, корректная аналитика и queries |

## 18. ROADMAP

### Этап 0 — Incident response (сразу)

1. Ротация PostgreSQL credentials и JWT `SECRET_KEY`; проверить доступы.
2. `chmod 600 backend/.env`; независимый Telegram backend secret.
3. Очистить Git history и включить secret scanning.

Критерий выхода: старые credentials не работают, все старые JWT недействительны, remote history очищена/доступ ограничен.

### Этап 1 — Payment safety и availability

1. ЮKassa timeout и error taxonomy.
2. Startup validation config.
3. Checkout idempotence key живёт вместе с draft.
4. Idempotent action records для refill/cancel.
5. DB-backed worker для processed orders/pending reconciliation.

Критерий: повтор/timeout/restart не создаёт duplicate mutation и не теряет оплаченный заказ.

### Этап 2 — Auth и abuse protection

1. Rate limits.
2. Исправить auth bootstrap/Telegram polling.
3. Разделить JWT и bot secrets; token query redaction/POST.
4. CSP и documented token strategy.

Критерий: outage не ломает публичный UI, brute-force/session floods ограничены.

### Этап 3 — Database reproducibility

1. Snapshot фактической schema и `EXPLAIN` ключевых queries.
2. Baseline + versioned runner.
3. Pagination indexes/session cleanup indexes.
4. Проверить FK/checks/ledger/referral semantics и migrate string dates.

Критерий: clean DB поднимается из repo; upgrade воспроизводим и тестируется.

### Этап 4 — Architecture cleanup

1. Разделить payment use cases/repositories и выровнять transaction ownership.
2. Public response DTOs.
3. Catalog cache + snapshot/drift policy.
4. Structured logs/metrics/request ID.

Критерий: каждый финансовый use case имеет один явный transaction boundary и тестируемые provider adapters.

### Этап 5 — Frontend cleanup/performance

1. API client/AuthProvider.
2. Catalog metadata consolidation.
3. Разделение крупных auth/wizard components.
4. WebP/AVIF, lazy routes/provider SDK.
5. Dead CSS/assets/code отдельным commit.

Критерий: measured LCP/bundle budget, единое auth/error поведение.

### Этап 6 — Tests и release gate

1. Исправить hangs.
2. PostgreSQL integration/concurrency suite.
3. Frontend tests и critical E2E.
4. CI: tests/build/lint/types/secret/dependency scans.

Критерий: один deterministic command/CI workflow завершается и блокирует release при regression.

## 19. ОЦЕНКА КОДОВОЙ БАЗЫ

| Категория | Оценка | Обоснование |
|---|---:|---|
| Architecture | 6.0/10 | Хороший modular-monolith direction, но transaction boundaries и critical background workflow не оформлены до конца. |
| Backend code quality | 6.0/10 | Параметризованный SQL, adapters и meaningful errors; payment service/repository перегружены. |
| Frontend code quality | 5.0/10 | Рабочая компонентная структура, но крупные components, duplicated API/meta и fragile auth state. |
| Database design | 5.5/10 | Сильные payment unique/locks/Decimal; отсутствуют baseline и подтверждение legacy constraints/indexes. |
| Security | 3.5/10 | Хорошие ownership/webhook/password меры перечёркиваются действующими secrets в remote history и отсутствием rate limits. |
| Error handling | 5.5/10 | Provider errors в основном классифицированы; auth bootstrap/polling и broad exceptions остаются проблемой. |
| Maintainability | 5.0/10 | Код читаем, но дубли, stale docs/dead files и magic state strings повышают цену изменений. |
| Testability | 5.0/10 | 56 содержательных unit tests, но DB замокана, frontend tests отсутствуют, full suite зависает. |
| Performance | 4.5/10 | 11 MiB frontend, supplier call на каждый catalog read, unbounded order fan-out и 1800-second payment timeout. |
| Production readiness | 3.5/10 | До запуска обязательны secret rotation, durable processing, timeouts, rate limits, migrations и рабочий CI. |

**Overall codebase score: 5.0/10**

Оценка не означает, что проект нужно переписывать. Большинство максимальных рисков закрывается несколькими точечными этапами: incident response, timeout/idempotency/durable worker, rate limiting, reproducible DB и исправление frontend network state. После них текущий modular monolith можно безопасно развивать без микросервисов и тяжёлой инфраструктуры.
