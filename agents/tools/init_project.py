#!/usr/bin/env python3
"""
Second Brain Project Initializer.
Автоматический скрипт инициализации проекта и замены плейсхолдеров.
Использование:
    python agents/tools/init_project.py --name "My App" --desc "Description" --stack "FastAPI + React"
Или просто:
    python agents/tools/init_project.py (интерактивный режим)
"""

import sys
import os
import argparse
from datetime import datetime
from pathlib import Path

# Обеспечиваем поддержку UTF-8 в консоли Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).resolve().parent
AGENTS_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = AGENTS_DIR.parent

def init_project(name: str, desc: str, stack: str, agent: str):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    replacements = {
        "{{PROJECT_NAME}}": name,
        "{{PROJECT_DESCRIPTION}}": desc,
        "{{TECH_STACK}}": stack,
        "{{AGENT_NAME}}": agent,
        "{{LAST_UPDATED}}": now_str,
    }

    print("\n🚀 Инициализация шаблона Второго Мозга...")
    print(f"   Проект:       {name}")
    print(f"   Описание:     {desc}")
    print(f"   Стек:         {stack}")
    print(f"   Агент:        {agent}")
    print(f"   Дата:         {now_str}\n")

    files_modified = 0

    # Сканируем markdown файлы в agents/ и корневой AGENTS.md
    scan_targets = list(AGENTS_DIR.rglob("*.md"))
    root_agents = PROJECT_ROOT / "AGENTS.md"
    if root_agents.is_file():
        scan_targets.append(root_agents)

    templates_dir = AGENTS_DIR / "templates"
    for file_path in scan_targets:
        # Пропускаем бланки шаблонов (agents/templates/), чтобы сохранить их в чистоте для будущих планов и задач
        if templates_dir in file_path.parents or file_path.parent == templates_dir:
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
            has_placeholder = any(k in content for k in replacements.keys())
            if has_placeholder:
                for k, v in replacements.items():
                    content = content.replace(k, v)
                file_path.write_text(content, encoding="utf-8")
                files_modified += 1
                try:
                    rel = file_path.relative_to(PROJECT_ROOT)
                except ValueError:
                    rel = file_path.name
                print(f"  ✓ Обновлен: {rel}")
        except Exception as e:
            print(f"  ✗ Ошибка при обработке {file_path}: {e}")

    # Создаем карточку агента в registry если ее нет
    slug_agent = "".join(c if c.isalnum() else "_" for c in agent.lower()).strip("_")
    registry_file = AGENTS_DIR / "registry" / f"agent_{slug_agent}.md"
    if not registry_file.exists():
        template_reg = AGENTS_DIR / "registry" / "agent_profile_template.md"
        reg_content = f"""# 👤 Профиль Агента: {agent}

- **Имя / Позывной:** {agent}
- **Модель:** {agent}
- **Среда разработки:** IDE / CLI
- **Дата первого подключения:** {now_str[:10]}
- **Операционная система:** {sys.platform}

---

## 🛠️ Роль в проекте
- Первичная инициализация проекта и настройка шаблона «Второго Мозга».
"""
        registry_file.write_text(reg_content, encoding="utf-8")
        print(f"  ✓ Создан профиль агента: agents/registry/agent_{slug_agent}.md")

    print(f"\n🎉 Инициализация завершена! Обновлено файлов: {files_modified}.")
    print("Запускаем проверку целостности...\n")

    # Импортируем и запускаем проверку
    sys.path.insert(0, str(SCRIPT_DIR))
    from check_integrity import run_integrity_check
    run_integrity_check()

def main():
    parser = argparse.ArgumentParser(description="Second Brain Project Initializer")
    parser.add_argument("--name", help="Название проекта", default=None)
    parser.add_argument("--desc", help="Краткое описание проекта", default=None)
    parser.add_argument("--stack", help="Технологический стек (например: Python, React, Docker)", default=None)
    parser.add_argument("--agent", help="Имя ответственного агента/модели", default="AI Assistant")

    args = parser.parse_args()

    name = args.name
    desc = args.desc
    stack = args.stack
    agent = args.agent

    if not name:
        try:
            print("\n--- 🧠 Настройка Нового Проекта ---")
            default_name = PROJECT_ROOT.name if PROJECT_ROOT.name else "My Project"
            name = input(f"Введите название проекта [{default_name}]: ").strip() or default_name
            desc = input("Введите краткое описание проекта: ").strip() or "Проект в разработке"
            stack = input("Введите технологический стек [Python / TypeScript]: ").strip() or "Python / Web"
            agent = input(f"Имя агента/модели [{agent}]: ").strip() or agent
        except (EOFError, KeyboardInterrupt):
            print("\nВвод прерван. Использованы значения по умолчанию.")
            name = name or "New Project"
            desc = desc or "Project description"
            stack = stack or "Universal Stack"

    init_project(name=name, desc=desc, stack=stack, agent=agent)

if __name__ == "__main__":
    main()
