#!/usr/bin/env python3
"""
Second Brain Git Hook Installer.
Устанавливает pre-commit хук в .git/hooks/pre-commit,
гарантирующий проверку целостности Второго Мозга перед каждым коммитом.
"""

import sys
import os
import stat
from pathlib import Path

# Поддержка UTF-8 в консоли Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
AGENTS_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = AGENTS_DIR.parent

HOOK_CONTENT = """#!/bin/sh
# Second Brain Git Pre-Commit Integrity Hook
echo "🧠 [Second Brain] Проверка целостности перед коммитом..."

python agents/tools/check_integrity.py
STATUS=$?

if [ $STATUS -ne 0 ]; then
    echo "❌ Ошибка: Нарушена целостность 'agents/'. Коммит отклонен."
    echo "👉 Запустите: python agents/tools/check_integrity.py --fix"
    exit 1
fi

echo "✅ [Second Brain] Проверка пройдена успешно!"
exit 0
"""

def install_hook():
    git_dir = PROJECT_ROOT / ".git"
    if not git_dir.is_dir():
        print(f"❌ Каталог .git не найден в {PROJECT_ROOT}. Инициализируйте git репозиторий.")
        return False

    hooks_dir = git_dir / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_file = hooks_dir / "pre-commit"

    hook_file.write_text(HOOK_CONTENT, encoding="utf-8")

    # Делаем исполняемым (для Linux/macOS/Git Bash)
    try:
        st = os.stat(hook_file)
        os.chmod(hook_file, st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass

    print(f"🎉 Git pre-commit хук успешно установлен: {hook_file.relative_to(PROJECT_ROOT)}")
    print("Теперь перед каждым 'git commit' будет автоматически запускаться check_integrity.py!")
    return True

if __name__ == "__main__":
    install_hook()
