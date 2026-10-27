# BUG-024 — DNS GitHub недоступен из Git

Дата: 2026-10-27. Автор: Codex. Статус: ВНЕШНЕЕ ОГРАНИЧЕНИЕ, PLAN-032.

## Симптом
`git ls-remote origin refs/heads/main` в sandbox и при разрешенном require_escalated завершился: `fatal: unable to access 'https://github.com/madsaomi/1.git/': Could not resolve host: github.com`. Python getaddrinfo github.com/api.github.com возвращает11001. GitHub connector get_repo также недоступен: Unknown tool github.get_repo.

## Причина
Сетевое DNS-окружение команды не разрешает GitHub; это не отказ пароля и не ошибка проекта. HTTP(S)/ALL_PROXY не заданы. Remote корректный и уже существовал. Секреты/credentials не запрашивались и не печатались.

## Решение и границы
Подготовить полный проверенный commit и попробовать обычный push. Не утверждать успешную отправку без exit0 и remote-подтверждения. Не менять системный DNS/proxy, remote или credentials ради обхода. При восстановлении сети повторить `git push origin main`; без force. Итог push фиксируется в walkthrough/pre-push отчете.

## Дополнительные события
Первая попытка заменить deployment runbook одним apply_patch Delete+Add того же пути была атомарно отклонена как duplicate target; исправлена обычной записью уже прочитанного документа. Secret-scan нашел5credential-URL в отрицательных test fixtures; это тестовые значения для проверки запрета URL credentials, не реальные доступы.
