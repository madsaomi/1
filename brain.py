#!/usr/bin/env python3
"""
🧠 Second Brain Root Launcher.
Позволяет запускать brain.py прямо из корня проекта:
    python brain.py status
    python brain.py plan "My Plan"
    python brain.py check
"""
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BRAIN_TOOL = ROOT_DIR / "agents" / "tools" / "brain.py"

if __name__ == "__main__":
    if not BRAIN_TOOL.is_file():
        print(f"❌ Ошибка: Не найден {BRAIN_TOOL}")
        sys.exit(1)
    
    # Запускаем целевой скрипт
    sys.path.insert(0, str(BRAIN_TOOL.parent))
    from brain import main
    main()
