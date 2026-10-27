#!/usr/bin/env python3
"""
Second Brain Plan Generator.
Быстрое создание нового плана реализации по шаблону template_plan.md.
Соблюдает строгий принцип Plan-First (Сначала план — потом код).

Использование:
    python agents/tools/new_plan.py --name "Аутентификация пользователей" --task "TASK-002"
Или просто:
    python agents/tools/new_plan.py (интерактивный режим)
"""

import sys
import os
import re
import argparse
from datetime import datetime
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

def slugify(text: str) -> str:
    """Преобразует строку в безопасный slug для имени файла."""
    # Транслитерация базовых кириллических символов для единообразия
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }
    lowered = text.lower()
    res = []
    for ch in lowered:
        if ch in translit_map:
            res.append(translit_map[ch])
        elif ch.isalnum() or ch in ("_", "-"):
            res.append(ch)
        elif ch.isspace():
            res.append("_")
    slug = "".join(res)
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "unnamed_plan"

def get_next_plan_number(plans_dir: Path) -> int:
    """Определяет следующий порядковый номер плана в папке plans/."""
    max_num = 0
    pattern = re.compile(r"^plan_(\d{3,})_", re.IGNORECASE)
    for p in plans_dir.glob("plan_*.md"):
        m = pattern.match(p.name)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num
    return max_num + 1

def create_plan(name: str, task_id: str, agent: str) -> Path:
    plans_dir = AGENTS_DIR / "plans"
    template_file = AGENTS_DIR / "templates" / "template_plan.md"

    if not template_file.is_file():
        raise FileNotFoundError(f"Шаблон не найден: {template_file}")

    next_num = get_next_plan_number(plans_dir)
    num_str = f"{next_num:03d}"
    slug_name = slugify(name)
    filename = f"plan_{num_str}_{slug_name}.md"
    target_file = plans_dir / filename

    if target_file.exists():
        raise FileExistsError(f"Файл плана уже существует: {target_file}")

    now_str = datetime.now().strftime("%Y-%m-%d")
    template_content = template_file.read_text(encoding="utf-8", errors="replace")

    # Подставляем переменные
    content = template_content.replace("{{PLAN_NAME}}", name)
    content = content.replace("PLAN-XXX", f"PLAN-{num_str}")
    content = content.replace("{{DATE}}", now_str)
    content = content.replace("{{AGENT_NAME}}", agent)
    content = content.replace("TASK-XXX", task_id)

    target_file.write_text(content, encoding="utf-8")
    return target_file

def main():
    parser = argparse.ArgumentParser(description="Second Brain Plan Creator")
    parser.add_argument("--name", help="Название плана или фичи", default=None)
    parser.add_argument("--task", help="ID связанной задачи (например: TASK-002)", default="TASK-001")
    parser.add_argument("--agent", help="Имя ответственного агента/разработчика", default="AI Assistant")

    args = parser.parse_args()
    name = args.name
    task_id = args.task
    agent = args.agent

    if not name:
        try:
            print("\n--- 📐 Создание Нового Плана Реализации (Plan-First) ---")
            name = input("Введите название плана / фичи: ").strip()
            if not name:
                print("❌ Название плана не может быть пустым.")
                sys.exit(1)
            task_id = input(f"Связанная задача [{task_id}]: ").strip() or task_id
            agent = input(f"Исполнитель / Агент [{agent}]: ").strip() or agent
        except (EOFError, KeyboardInterrupt):
            print("\nВвод прерван.")
            sys.exit(1)

    try:
        plan_path = create_plan(name=name, task_id=task_id, agent=agent)
        rel_path = plan_path.relative_to(PROJECT_ROOT) if PROJECT_ROOT in plan_path.parents else plan_path.name
        print(f"\n🎉 План успешно создан!")
        print(f"👉 Файл: {rel_path}")
        print("\nСледующие шаги:")
        print("1. Откройте созданный файл плана.")
        print("2. Заполните затронутые компоненты ([NEW], [MODIFY]) и пошаговый чек-лист.")
        print("3. Получите одобрение плана и только после этого приступайте к коду!\n")
    except Exception as e:
        print(f"❌ Ошибка при создании плана: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
