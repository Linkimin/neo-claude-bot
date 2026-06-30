# claude-bot

Telegram-бот для управления проектами в Claude Code Desktop с телефона: промпт в тему проекта → Claude Code выполняет на ПК → ответ обратно. Forum-топики на проект, настройки (режим/модель/effort), апрувы, сессии, лимиты с авто-продолжением, фолбэк-надёжность.

Дизайн и планы — в `docs/superpowers/`.

## Запуск (разработка)

    npm install
    cp .env.example .env   # заполнить TELEGRAM_BOT_TOKEN / USER_ID / GROUP_ID / SETTINGS_PIN
    npm start

## Запуск как службы (Windows, всегда онлайн)

Из PowerShell **от администратора**, в каталоге проекта:

    npm run install-service                   # установить (старт при загрузке, авто-рестарт)
    Start-ScheduledTask -TaskName ClaudBot    # запустить сейчас (или после ребута сам)
    npm run uninstall-service                 # удалить

- Служба запускается **до входа в систему** под твоим аккаунтом (S4U) — Claude-авторизация работает (проверено спайком).
- Лог: `data\bot.log`. Статус задачи: `Get-ScheduledTask -TaskName ClaudBot`.
- При краше Windows перезапускает задачу каждую 1 минуту.

## Тесты

    npm test          # vitest
    npx tsc --noEmit  # типы
