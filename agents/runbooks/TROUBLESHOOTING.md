# 🚑 Аварийный Справочник Инцидентов (TROUBLESHOOTING.md)

Инструкции по экспресс-диагностике и устранению типовых технических сбоев.

---

## 🔴 Сбой 1: Порт уже занят (`Address already in use` / `WinError 10048`)

### Симптом:
Сервер падает при запуске с сообщением `[Errno 48] Address already in use` или `[WinError 10048] Only one usage of each socket address...`.

### Решение:
1. **Windows (PowerShell):**
   ```powershell
   # Найти PID процесса, занимающего порт (например, 8000):
   Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
   # Завершить процесс по PID:
   Stop-Process -Id <PID> -Force
   ```
2. **Linux / macOS:**
   ```bash
   lsof -ti:8000 | xargs kill -9
   ```

---

## 🔴 Сбой 2: Ошибка подключения к Базе Данных (`Connection Refused` / `Database Locked`)

### Симптом:
Приложение не может подключиться к БД или SQLite выдает `database is locked`.

### Решение:
1. **Для PostgreSQL / MySQL в Docker:**
   - Проверьте, запущен ли контейнер: `docker compose ps`.
   - Проверьте доступность порта: `nc -zv localhost 5432`.
   - Проверьте соответствие учетных данных в `.env` и в `docker-compose.yml`.
2. **Для SQLite:**
   - Убедитесь, что нет параллельных процессов, удерживающих транзакцию записи.
   - Включите режим WAL (Write-Ahead Logging): `PRAGMA journal_mode=WAL;`.

---

## 🔴 Сбой 3: Отсутствуют или некорректны переменные окружения (`KeyError` / `ValidationError`)

### Симптом:
Приложение падает на этапе старта при инициализации конфигурации.

### Решение:
1. Проверьте наличие локального файла `.env` в корне проекта.
2. Сверьте его с `.env.example`: возможно, добавилась новая обязательная переменная.
3. Убедитесь, что в значениях нет лишних пробелов, непарных кавычек или спецсимволов.

---

## 🔴 Сбой 4: Windows PowerShell Script Execution Policy (`PSSecurityException`)

### Симптом:
При попытке активировать виртуальное окружение `venv\Scripts\Activate.ps1` возникает ошибка: `execution of scripts is disabled on this system`.

### Решение:
Запустите команду в текущей сессии:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```
Или активируйте через cmd: `venv\Scripts\activate.bat`.
