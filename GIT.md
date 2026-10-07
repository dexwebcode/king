# 📘 Инструкция: ветки для разработки с `develop`

## Схема веток

```
main                  ← только релизы, стабильно
 └── develop          ← постоянная ветка разработки
      ├── feature/profile
      ├── feature/settings
      └── fix/login
```

- **`main`** — сюда попадает только готовый, проверенный код (релизы)
- **`develop`** — постоянная ветка, куда сливаются все фичи
- **`feature/*`, `fix/*`** — временные ветки под конкретные задачи

---

## 🔧 Первоначальная настройка (делается один раз)

### 1. Создать ветку `develop` от `main`

```bash
git switch main
git pull
git switch -c develop
git push -u origin develop
```

Готово — теперь у тебя есть постоянная ветка разработки.

---

## 🚀 Ежедневный рабочий цикл

### 2. Начать новую фичу

Всегда ветвись **от `develop`**, а не от `main`:

```bash
git switch develop
git pull

git switch -c feature/название-фичи
```

Примеры имён:
- `feature/profile`
- `feature/settings`
- `fix/login-validation`

### 3. Работать над фичей

```bash
# ...редактируешь файлы...

git add .
git commit -m "feat: добавил страницу профиля"

git push -u origin feature/название-фичи
```

### 4. Периодически подтягивать свежий `develop` в свою фичу

Чтобы не накопить конфликты к концу работы:

```bash
git switch feature/название-фичи
git merge develop
```

### 5. Фича готова → мерж в `develop`

**Через PR на GitHub/GitLab (рекомендуется)** — создай Pull Request из `feature/*` в `develop`.

**Или локально:**

```bash
git switch develop
git pull
git merge --no-ff feature/название-фичи
git push
```

`--no-ff` создаёт явный merge-коммит — в истории видно, что это была отдельная фича.

### 6. Удалить фичу после мержа

```bash
git branch -d feature/название-фичи
git push origin --delete feature/название-фичи
```

---

## 📦 Релиз: `develop` → `main`

Когда в `develop` накопилось готовое и проверенное:

```bash
git switch main
git pull
git merge --no-ff develop
git tag v1.0.0          # опционально, но полезно
git push
git push --tags
```

---

## 🔥 Хотфикс (срочный фикс в проде)

Если в `main` нашли баг, который надо починить срочно:

```bash
git switch main
git switch -c hotfix/название-бага
# ...фикс...
git add .
git commit -m "fix: срочное исправление"

# мерж в main
git switch main
git merge --no-ff hotfix/название-бага
git push

# ВАЖНО: мерж и в develop, чтобы фикс не потерялся в разработке
git switch develop
git merge --no-ff hotfix/название-бага
git push

# удалить хотфикс
git branch -d hotfix/название-бага
```

---

## ✅ Правила, чтобы не сломать схему

1. **Никогда не коммить напрямую в `main` и `develop`** — только через фичи и PR
2. **`feature/*` всегда от `develop`**, не от `main`
3. **`main` обновляется только из `develop`** (или из `hotfix/*`)
4. **Фичи короткоживущие** — 1–3 дня. Долгие фичи = боль при мерже
5. **Регулярно подтягивай `develop`** в свою фичу (`git merge develop`)
6. **После мержа — удаляй ветку** (и локально, и на сервере)

---

## 🧭 Шпаргалка команд

```bash
# Начать новую фичу
git switch develop
git pull
git switch -c feature/что-то

# Работа и коммиты
git add .
git commit -m "feat: описание"
git push -u origin feature/что-то

# Подтянуть свежий develop в фичу
git switch feature/что-то
git merge develop

# Фича готова → в develop (локально)
git switch develop
git pull
git merge --no-ff feature/что-то
git push

# Удалить фичу после мержа
git branch -d feature/что-то
git push origin --delete feature/что-то

# Релиз
git switch main
git pull
git merge --no-ff develop
git tag v1.0.0
git push
git push --tags

# Хотфикс
git switch main
git switch -c hotfix/баг
# ...фикс...
git switch main
git merge --no-ff hotfix/баг && git push
git switch develop
git merge --no-ff hotfix/баг && git push
git branch -d hotfix/баг
```

---

## ⚠️ Оговорка

Если проект **маленький и ты работаешь один** — `develop` часто избыточна. В таком случае проще:

```
main
 ├── feature/profile
 └── fix/login
```

То есть фичи ветвятся прямо от `main`, и `develop` не нужна. Модель с `develop` оправдана, когда:
- есть команда
- есть релизы отдельно от разработки
- нужно держать `main` всегда стабильной

---

Сохрани эту инструкцию — она закрывает весь цикл: настройка → фичи → релиз → хотфикс. Когда будешь готов настраивать `develop`, скажи — помогу проверить, что всё сделано правильно.