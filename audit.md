# Аудит зависимостей KingPromotion

Первая проверка: 2026-10-05
Все найденные замечания исправлены: 2026-10-05

Проект: `/home/ava/king`
Что смотрели: объявленные и установленные зависимости frontend и backend, их версии,
известные уязвимости, рассинхрон версий и lock-файлов, системные рантаймы.

Что **не** смотрели: содержимое `.env`, ключи, токены, пароли БД. Из `.env`
прочитана только строка `JWT_ALGORITHM` (она не секрет) — там `HS256`.
Ни один секрет в отчёт не попал.

---

## 1. Сводка (после исправлений)

| Область | Состояние | Статус |
| --- | --- | --- |
| Frontend | 4 прод-зависимости + 2 dev, lock v3, `node_modules` совпадает с lock | ✅ |
| Frontend — уязвимости | `npm audit` — 0 | ✅ |
| Frontend — версии | всё актуальное в рамках диапазонов (`npm outdated` пуст) | ✅ |
| Backend | `requirements.txt` — 11 прямых зависимостей, все с точной версией | ✅ |
| Backend — lock | `requirements.lock.txt` — 42 пакета | ✅ |
| Backend — уязвимости | `pip-audit` — чисто (было: `ecdsa` CVE-2024-23342) | ✅ |
| Рантаймы | Python 3.12.3 и Node зафиксированы в `.python-version` и `engines.node` | ✅ |
| БД | PostgreSQL 16.15 (запущена, принимает соединения) | ✅ |
| Веб-сервер | nginx 1.24.0, `nginx -t` проходит | ✅ |
| Проверка после правок | 221 тест backend — OK; frontend собирается; сайт и API отвечают | ✅ |

Критичных проблем не было и нет. Все пункты ниже — про воспроизводимость сборки
и про переезд на другой компьютер.

---

## 2. Что исправлено

### Frontend

| Было | Стало |
| --- | --- |
| `@vkid/sdk` объявлен в `frontend/package.json`, но в `frontend/node_modules` отсутствовал (`UNMET DEPENDENCY`); сборка держалась на пакете из корневого `node_modules` | пакет установлен в `frontend/node_modules`, резолвится оттуда: `/home/ava/king/frontend/node_modules/@vkid/sdk/dist-sdk/cjs/index.js` |
| 115 пакетов `extraneous` в `frontend/node_modules` (eslint, @babel, ajv и прочее) — остатки прошлых установок | 0 лишних пакетов, дерево совпадает с lock-файлом |
| `vite` и `@vitejs/plugin-react` в `dependencies` | перенесены в `devDependencies` |
| Корневой `package.json` + `package-lock.json` + `node_modules` с дублем `@vkid/sdk` | удалены; зависимость живёт только в `frontend/` |
| Корневой `node_modules` был закоммичен в git (366 файлов) | папка удалена, в `.gitignore` добавлено правило `node_modules/` |
| Версия Node нигде не зафиксирована | в `frontend/package.json` добавлено `engines.node: "^20.19.0 || >=22.12.0"` (требование Vite 8 и @vitejs/plugin-react 6) |
| Устаревшие версии | обновлены: vite 8.1.5 → **8.3.2**, @vitejs/plugin-react 6.0.3 → **6.1.2**, react 19.2.7 → **19.3.0**, react-dom 19.2.7 → **19.3.0**, react-router-dom 7.18.2 → **7.18.4** |

### Backend

| Было | Стало |
| --- | --- |
| `python-jose` тянул `ecdsa 0.19.2` с неустранимой уязвимостью PYSEC-2026-1325 / CVE-2024-23342 (Minerva timing attack), фикса нет | перешли на **PyJWT 2.15.1**; `python-jose`, `ecdsa`, `rsa`, `pyasn1`, `six` удалены из окружения. `pip-audit` чист |
| 9 из 11 зависимостей без версии | все 11 зафиксированы через `==` в `requirements.txt` |
| Lock-файла для Python не было | создан `requirements.lock.txt` (42 пакета, полный freeze) |
| `pip` в venv — 24.0 | обновлён до **26.2.1** |
| Версия Python нигде не зафиксирована | создан `.python-version` (`3.12.3`) |
| README указывал PyJWT, а код использовал python-jose | расхождение ушло само: теперь и в README, и в коде PyJWT |
| Устаревшие версии | обновлены: fastapi 0.141.1 → **0.142.2**, SQLAlchemy 2.1.1 → **2.1.3**, aiohttp 3.14.3 → **3.14.4**, python-dotenv 1.2.3 → **1.2.4** |

Код, затронутый миграцией JWT:

- `backend/auth/security.py`: `from jose import JWTError, jwt` → `import jwt`,
  обработка ошибок `except (JWTError, ValueError)` → `except (jwt.PyJWTError, ValueError)`.
- `backend/tests/test_token_version.py`: `from jose import jwt` → `import jwt`.

Подпись и формат токена не изменились (обычный JWT, HS256), поэтому уже выданные
токены продолжают работать — перелогин никому не нужен.

### Система

| Было | Стало |
| --- | --- |
| `nginx -t -c nginx/king.conf` падал: `open() "/var/log/nginx/access.log" failed (13: Permission denied)` — в конфиге не был задан `access_log` | в блок `http` добавлено `access_log /tmp/king-nginx-access.log;`, `nginx -t` проходит успешно |

Остаётся предупреждение `the "user" directive makes sense only if the master process
runs with super-user privileges, ignored` — это нормально: `nginx -t` запускается
не от root, а сам nginx в проекте стартует с нужными правами.

---

## 3. Текущее состояние

### Frontend

`frontend/package.json` (`kingpromotion-layout@1.0.0`):

```
dependencies:
  @vkid/sdk         2.6.8
  react             ^19.3.0
  react-dom         ^19.3.0
  react-router-dom  ^7.18.4
devDependencies:
  @vitejs/plugin-react  ^6.1.2
  vite                  ^8.3.2
engines: node ^20.19.0 || >=22.12.0
```

Установлено ровно: @vkid/sdk 2.6.8, react 19.3.0, react-dom 19.3.0,
react-router-dom 7.18.4, vite 8.3.2, @vitejs/plugin-react 6.1.2.
Лишних пакетов нет, `npm audit` — 0 уязвимостей, `npm outdated` — пусто.

Проверено: в собранном бандле VKID присутствует, `@vkid/sdk` резолвится из
`frontend/node_modules` (а не сверху), сборка проходит.

### Backend

`requirements.txt` (прямые зависимости, все с точной версией):

```
sqlalchemy==2.1.3
psycopg[binary]==3.3.6
python-dotenv==1.2.4
fastapi==0.142.2
uvicorn==0.54.0
PyJWT==2.15.1
email-validator==2.3.0
aiogram==3.31.0
aiohttp==3.14.4
yookassa==3.12.1
heleket-sdk==0.3.0
```

`requirements.lock.txt` — 42 пакета (полный freeze окружения `venv`).

Сверка импортов в `backend/**/*.py` с объявленным списком: всё, что импортируется,
объявлено; лишних зависимостей нет.

### Система

| Компонент | Версия |
| --- | --- |
| Python | 3.12.3 (зафиксировано в `.python-version`) |
| Node.js | 22.23.3 (диапазон зафиксирован в `engines.node`) |
| npm | 10.9.9 (доступен 12.2.0 — обновление необязательно) |
| PostgreSQL | 16.15, сервер запущен, соединения принимаются |
| nginx | 1.24.0, свой конфиг `nginx/king.conf`, порт 8080 |

---

## 4. Что осталось сделать руками

1. **Закоммитить удаление корневого `node_modules`.** Папка была в git (366 файлов),
   сейчас удалена с диска — в `git status` это удаления. Их надо закоммитить,
   иначе они вернутся при `git checkout`. Правило `node_modules/` в `.gitignore`
   уже добавлено, так что заново папка в индекс не попадёт.

2. **Перезапустить backend**, чтобы он поднялся уже на новых версиях
   (FastAPI, SQLAlchemy, aiohttp, PyJWT). Сейчас в памяти работает процесс
   со старыми пакетами — он не сломается, но и обновления не увидит.

3. **Обновить npm при желании** (`npm i -g npm@12.2.0`) — не обязательно.

---

## 5. Как проверять дальше

```bash
# Frontend: уязвимости и устаревшие версии
cd /home/ava/king/frontend
npm audit
npm outdated
npm ls --depth=0          # не должно быть UNMET и extraneous

# Backend: уязвимости
cd /home/ava/king
./venv/bin/pip freeze > requirements.lock.txt      # обновить lock после установок
python3 -m venv /tmp/auditvenv
/tmp/auditvenv/bin/pip install pip-audit
/tmp/auditvenv/bin/pip-audit -r requirements.lock.txt

# Backend: тесты
./venv/bin/python -m unittest discover -s backend/tests -t .

# Система
python3 --version; node --version; npm --version
psql --version; pg_isready
nginx -t -c /home/ava/king/nginx/king.conf
```

Отдельно про `pip-audit`: ставить его в `venv` проекта не нужно — он тянет
за собой много лишнего. Удобнее держать отдельное окружение, как в командах выше.

---

## 6. Проверка результата

После всех правок прогнано:

- `npm install` + `npm update` + `npm run build` во frontend — сборка успешна,
  бандл ссылается на актуальные ассеты.
- `./venv/bin/pip check` — `No broken requirements found`.
- `./venv/bin/python -m unittest discover -s backend/tests -t .` —
  **221 тест пройден**, 17 пропущено, ошибок нет.
- `./venv/bin/python -c "import backend.main"` — приложение импортируется.
- Круговой тест JWT: токен создаётся, декодируется в те же `(user_id, version)`,
  битый токен возвращает `None`.
- `curl http://127.0.0.1:8080/price` → 200, 278 услуг; главная страница → 200.
- Рендер в браузере: `/catalog`, `/main`, `/reviews` открываются, ошибок в консоли нет.
