#!/usr/bin/env python3
"""
🧠 Second Brain Unified CLI (brain.py)
Единый инструмент управления экосистемой «Второго Мозга».

Команды:
    python agents/tools/brain.py status              - Показать дашборд проекта в терминале
    python agents/tools/brain.py plan <name>         - Создать новый PLAN-XXX (Plan-First)
    python agents/tools/brain.py bug <title>         - Создать новый BUG-XXX (Баг-репорт)
    python agents/tools/brain.py adr <title>         - Создать новый ADR-XXX (Архитектурное решение)
    python agents/tools/brain.py task <title>        - Создать карточку задачи TASK-XXX
    python agents/tools/brain.py dump                - Скопировать контекст в буфер обмена для AI-чатов
    python agents/tools/brain.py check [--fix]       - Проверить целостность (с авто-исправлением)
    python agents/tools/brain.py end                 - Завершить сессию и сформировать отчет
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

# Цвета ANSI
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"

SCRIPT_DIR = Path(__file__).resolve().parent
AGENTS_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = AGENTS_DIR.parent

# Импортируем существующие утилиты
sys.path.insert(0, str(SCRIPT_DIR))
from check_integrity import run_integrity_check
from dump_context import build_context_dump, copy_to_clipboard
from new_plan import create_plan, slugify
from end_session import end_session, extract_completed_tasks_from_active
from init_project import init_project

# -----------------------------------------------------------------------------
# Вспомогательные функции нумерации
# -----------------------------------------------------------------------------

def get_next_number(directory: Path, prefix: str) -> int:
    """Определяет следующий порядковый номер для файлов PREFIX_XXX_*."""
    max_num = 0
    pattern = re.compile(rf"^{prefix}_?(\d{{3,}})_", re.IGNORECASE)
    for p in directory.glob(f"{prefix}*.md"):
        m = pattern.match(p.name)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num
    return max_num + 1

# -----------------------------------------------------------------------------
# Генераторы сущностей: BUG, ADR, TASK
# -----------------------------------------------------------------------------

def create_bug_report(title: str, component: str, agent: str) -> Path:
    bugs_dir = AGENTS_DIR / "bugs_and_fixes"
    template_file = AGENTS_DIR / "templates" / "template_bug_report.md"
    if not template_file.is_file():
        raise FileNotFoundError("Шаблон template_bug_report.md не найден!")

    next_num = get_next_number(bugs_dir, "BUG")
    num_str = f"{next_num:03d}"
    slug = slugify(title)
    filename = f"BUG_{num_str}_{slug}.md"
    target = bugs_dir / filename

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    content = template_file.read_text(encoding="utf-8", errors="replace")
    content = content.replace("# 🐛 Шаблон отчета об ошибке (Bug Report Template)", f"# 🐛 Баг-репорт: BUG-{num_str} — {title}")
    content = content.replace("BUG-XXX", f"BUG-{num_str}")
    content = content.replace("YYYY-MM-DD HH:MM", now_str)
    content = content.replace("[Имя агента и модель]", agent)
    content = content.replace("[Например: backend/main.py, static/js/app.js]", component or "Общий компонент")
    content = content.replace("[🟡 В ПРОЦЕССЕ / 🟢 РЕШЕНО]", "🟡 В ПРОЦЕССЕ")

    target.write_text(content, encoding="utf-8")
    return target

def create_adr_record(title: str, agent: str) -> Path:
    adr_dir = AGENTS_DIR / "decisions"
    template_file = AGENTS_DIR / "templates" / "template_adr.md"
    if not template_file.is_file():
        raise FileNotFoundError("Шаблон template_adr.md не найден!")

    next_num = get_next_number(adr_dir, "ADR")
    num_str = f"{next_num:03d}"
    slug = slugify(title)
    filename = f"ADR_{num_str}_{slug}.md"
    target = adr_dir / filename

    now_str = datetime.now().strftime("%Y-%m-%d")
    content = template_file.read_text(encoding="utf-8", errors="replace")
    content = content.replace("# 🏛️ Шаблон архитектурного решения (ADR Template)", f"# 🏛️ Архитектурное решение: ADR-{num_str} — {title}")
    content = content.replace("ADR-XXX", f"ADR-{num_str}")
    content = content.replace("[Например: Выбор единого сервера FastAPI + aiogram вместо микросервисов]", title)
    content = content.replace("YYYY-MM-DD", now_str)
    content = content.replace("[Имена агентов]", agent)
    content = content.replace("[PROPOSED / ACCEPTED / DEPRECATED / SUPERSEDED]", "PROPOSED")

    target.write_text(content, encoding="utf-8")
    return target

def create_task_card(title: str, priority: str, agent: str) -> Path:
    tasks_dir = AGENTS_DIR / "tasks"
    template_file = AGENTS_DIR / "templates" / "template_task.md"
    if not template_file.is_file():
        raise FileNotFoundError("Шаблон template_task.md не найден!")

    next_num = get_next_number(tasks_dir, "task")
    num_str = f"{next_num:03d}"
    slug = slugify(title)
    filename = f"task_{num_str}_{slug}.md"
    target = tasks_dir / filename

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    content = template_file.read_text(encoding="utf-8", errors="replace")
    content = content.replace("# 📋 Шаблон карточки задачи (Task Template)", f"# 📋 Карточка задачи: TASK-{num_str} — {title}")
    content = content.replace("TASK-XXX", f"TASK-{num_str}")
    content = content.replace("[Краткое и емкое название задачи]", title)
    content = content.replace("[LOW / MEDIUM / HIGH / CRITICAL]", priority.upper())
    content = content.replace("[⚪ PLANNED / 🟡 IN_PROGRESS / 🟢 COMPLETED / 🔴 BLOCKED]", "⚪ PLANNED")
    content = content.replace("YYYY-MM-DD", now_str[:10])
    content = content.replace("[Имя агента]", agent)

    target.write_text(content, encoding="utf-8")
    return target

def create_walkthrough(title: str, plan_id: str, task_id: str, agent: str) -> Path:
    wt_dir = AGENTS_DIR / "walkthroughs"
    template_file = AGENTS_DIR / "templates" / "template_walkthrough.md"
    if not template_file.is_file():
        raise FileNotFoundError("Шаблон template_walkthrough.md не найден!")

    # Нумерация: WT_001, WT_002...
    max_num = 0
    pattern = re.compile(r"^WT_(\d{3,})_", re.IGNORECASE)
    for p in wt_dir.glob("WT_*.md"):
        m = pattern.match(p.name)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num
    next_num = max_num + 1
    num_str = f"{next_num:03d}"
    slug = slugify(title)
    filename = f"WT_{num_str}_{slug}.md"
    target = wt_dir / filename

    now_str = datetime.now().strftime("%Y-%m-%d")
    content = template_file.read_text(encoding="utf-8", errors="replace")
    content = content.replace("{{FEATURE_NAME}}", title)
    content = content.replace("{{DATE}}", now_str)
    content = content.replace("{{AGENT_NAME}}", agent)
    content = content.replace("PLAN-XXX", plan_id)
    content = content.replace("TASK-XXX", task_id)

    target.write_text(content, encoding="utf-8")
    return target

# -----------------------------------------------------------------------------
# Дашборд состояния проекта (brain status)
# -----------------------------------------------------------------------------

def show_status():
    status_file = AGENTS_DIR / "STATUS.md"
    active_file = AGENTS_DIR / "tasks" / "active_task.md"

    proj_name = "Не инициализирован"
    stack = "Не указан"
    last_upd = "Неизвестно"
    curr_agent = "Не указан"

    if status_file.is_file():
        text = status_file.read_text(encoding="utf-8", errors="replace")
        m_name = re.search(r"\*\*Проект:\*\*\s*(.+)", text)
        if m_name: proj_name = m_name.group(1).strip()
        m_stack = re.search(r"\*\*Технологический стек:\*\*\s*(.+)", text)
        if m_stack: stack = m_stack.group(1).strip()
        m_upd = re.search(r"\*\*Последнее обновление:\*\*\s*(.+)", text)
        if m_upd: last_upd = m_upd.group(1).strip()
        m_ag = re.search(r"\*\*Ответственный агент:\*\*\s*(.+)", text)
        if m_ag: curr_agent = m_ag.group(1).strip()

    # Анализ активной задачи
    active_task_title = "Нет активной задачи"
    total_steps = 0
    done_steps = 0
    if active_file.is_file():
        act_text = active_file.read_text(encoding="utf-8", errors="replace")
        m_title = re.search(r"^#\s*📋\s*Активная задача:\s*(.+)$", act_text, re.MULTILINE)
        if m_title: active_task_title = m_title.group(1).strip()
        all_boxes = re.findall(r"^\s*[-*]\s*\[([ xX])\]", act_text, re.MULTILINE)
        total_steps = len(all_boxes)
        done_steps = sum(1 for b in all_boxes if b.lower() == 'x')

    pct = int((done_steps / total_steps * 100)) if total_steps > 0 else 0
    bar_len = 20
    filled = int(bar_len * pct / 100)
    progress_bar = f"[{'█' * filled}{'░' * (bar_len - filled)}] {pct}% ({done_steps}/{total_steps})"

    # Подсчет артефактов
    plans_count = len([f for f in (AGENTS_DIR / "plans").glob("plan_*.md") if f.name != "README.md"])
    bugs_count = len([f for f in (AGENTS_DIR / "bugs_and_fixes").glob("BUG_*.md") if f.name != "README.md"])
    adrs_count = len([f for f in (AGENTS_DIR / "decisions").glob("ADR_*.md") if f.name != "README.md"])
    sessions_count = len([f for f in (AGENTS_DIR / "history").glob("*.md") if f.name != "README.md"])
    walkthroughs_count = len([f for f in (AGENTS_DIR / "walkthroughs").glob("*.md") if f.name != "README.md"])
    tasks_count = len([f for f in (AGENTS_DIR / "tasks").glob("task_*.md")])

    # Проверка плейсхолдеров
    placeholder_warn = False
    for pf in [AGENTS_DIR / "STATUS.md", AGENTS_DIR / "architecture" / "CODEBASE_MAP.md", AGENTS_DIR / "GLOSSARY.md"]:
        if pf.is_file():
            txt = pf.read_text(encoding="utf-8", errors="replace")
            if re.search(r"\{\{[A-Z_]+\}\}", txt):
                placeholder_warn = True
                break

    print(f"\n{BOLD}{CYAN}╔══════════════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{BOLD}{CYAN}║               🧠 SECOND BRAIN PROJECT DASHBOARD                      ║{RESET}")
    print(f"{BOLD}{CYAN}╚══════════════════════════════════════════════════════════════════════╝{RESET}")

    print(f"\n{BOLD}📌 Проект:{RESET}       {BOLD}{GREEN}{proj_name}{RESET}")
    print(f"{BOLD}🛠️ Стек:{RESET}         {stack}")
    print(f"{BOLD}🕒 Обновлено:{RESET}    {last_upd}")
    print(f"{BOLD}👤 Агент:{RESET}        {curr_agent}")

    if placeholder_warn:
        print(f"\n{BOLD}{YELLOW}⚠️  Проект не инициализирован! Запустите: python agents/tools/brain.py init{RESET}")

    print(f"\n{BOLD}{BLUE}──────────────────────────────────────────────────────────────────────{RESET}")
    print(f"{BOLD}📋 Активная задача:{RESET} {YELLOW}{active_task_title}{RESET}")
    print(f"{BOLD}📊 Прогресс шагов:{RESET}  {GREEN if pct == 100 else CYAN}{progress_bar}{RESET}")

    print(f"\n{BOLD}{BLUE}──────────────────────────────────────────────────────────────────────{RESET}")
    print(f"{BOLD}📚 База знаний и артефакты:{RESET}")
    print(f"  • 📐 Планов реализации (plans/):        {BOLD}{plans_count}{RESET}")
    print(f"  • 🐛 Зафиксированных багов (bugs/):     {BOLD}{bugs_count}{RESET}")
    print(f"  • 🏛️ Архитектурных решений (ADR):      {BOLD}{adrs_count}{RESET}")
    print(f"  • 📝 Записей сессий (history/):          {BOLD}{sessions_count}{RESET}")
    print(f"  • 📋 Карточек задач (tasks/):            {BOLD}{tasks_count}{RESET}")
    print(f"  • 🚶 Walkthrough-отчётов:               {BOLD}{walkthroughs_count}{RESET}")
    print(f"{BOLD}{BLUE}──────────────────────────────────────────────────────────────────────{RESET}\n")

# -----------------------------------------------------------------------------
# Главный диспетчер
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="🧠 Second Brain Unified Management CLI",
        formatter_class=argparse.RawTextHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", help="Доступные команды")

    # status
    subparsers.add_parser("status", help="Показать дашборд состояния проекта")

    # plan
    plan_parser = subparsers.add_parser("plan", help="Создать новый план реализации (Plan-First)")
    plan_parser.add_argument("name", nargs="?", help="Название плана или фичи", default=None)
    plan_parser.add_argument("--task", help="ID связанной задачи", default="TASK-001")
    plan_parser.add_argument("--agent", help="Имя ответственного агента", default="AI Assistant")

    # bug
    bug_parser = subparsers.add_parser("bug", help="Зафиксировать баг-репорт в базе знаний")
    bug_parser.add_argument("title", nargs="?", help="Краткое описание ошибки", default=None)
    bug_parser.add_argument("--component", help="Компонент системы", default="Core")
    bug_parser.add_argument("--agent", help="Имя автора", default="AI Assistant")

    # adr
    adr_parser = subparsers.add_parser("adr", help="Зафиксировать архитектурное решение (ADR)")
    adr_parser.add_argument("title", nargs="?", help="Суть архитектурного решения", default=None)
    adr_parser.add_argument("--agent", help="Имя автора", default="AI Assistant")

    # task
    task_parser = subparsers.add_parser("task", help="Создать карточку задачи")
    task_parser.add_argument("title", nargs="?", help="Название задачи", default=None)
    task_parser.add_argument("--priority", help="Приоритет (HIGH/MEDIUM/LOW)", default="MEDIUM")
    task_parser.add_argument("--agent", help="Исполнитель", default="AI Assistant")

    # dump
    subparsers.add_parser("dump", help="Собрать контекст проекта в буфер обмена для AI-чатов")

    # check
    check_parser = subparsers.add_parser("check", help="Запустить валидатор целостности Второго Мозга")
    check_parser.add_argument("--fix", action="store_true", help="Автоматически восстановить отсутствующие каталоги")

    # end
    end_parser = subparsers.add_parser("end", help="Завершить сессию и обновить историю")
    end_parser.add_argument("--agent", help="Имя агента", default="AI Assistant")
    end_parser.add_argument("--task", help="ID задачи", default="TASK-001")
    end_parser.add_argument("--done", help="Выполненные действия (через ';')", default=None)
    end_parser.add_argument("--next", help="Инструкция для следующего агента", default=None)

    # init
    init_parser = subparsers.add_parser("init", help="Инициализировать проект (заполнить плейсхолдеры)")
    init_parser.add_argument("--name", help="Название проекта", default=None)
    init_parser.add_argument("--desc", help="Описание проекта", default=None)
    init_parser.add_argument("--stack", help="Технологический стек", default=None)
    init_parser.add_argument("--agent", help="Имя агента", default="AI Assistant")

    # walkthrough
    wt_parser = subparsers.add_parser("walkthrough", help="Создать Walkthrough-отчёт о демонстрации")
    wt_parser.add_argument("title", nargs="?", help="Название фичи / демо", default=None)
    wt_parser.add_argument("--plan", help="ID связанного плана", default="PLAN-001")
    wt_parser.add_argument("--task", help="ID связанной задачи", default="TASK-001")
    wt_parser.add_argument("--agent", help="Имя агента", default="AI Assistant")

    args = parser.parse_args()

    if not args.command or args.command == "status":
        show_status()
        return

    if args.command == "plan":
        name = args.name
        if not name:
            name = input("Введите название плана / фичи: ").strip()
        if not name:
            print("❌ Название не может быть пустым.")
            return
        p = create_plan(name=name, task_id=args.task, agent=args.agent)
        rel = p.relative_to(PROJECT_ROOT) if PROJECT_ROOT in p.parents else p.name
        print(f"🎉 План создан: {GREEN}{rel}{RESET}")

    elif args.command == "bug":
        title = args.title
        if not title:
            title = input("Введите краткое описание бага: ").strip()
        if not title:
            print("❌ Описание не может быть пустым.")
            return
        p = create_bug_report(title=title, component=args.component, agent=args.agent)
        rel = p.relative_to(PROJECT_ROOT) if PROJECT_ROOT in p.parents else p.name
        print(f"🐛 Баг-репорт создан: {YELLOW}{rel}{RESET}")

    elif args.command == "adr":
        title = args.title
        if not title:
            title = input("Введите название архитектурного решения: ").strip()
        if not title:
            print("❌ Название не может быть пустым.")
            return
        p = create_adr_record(title=title, agent=args.agent)
        rel = p.relative_to(PROJECT_ROOT) if PROJECT_ROOT in p.parents else p.name
        print(f"🏛️ ADR создан: {BLUE}{rel}{RESET}")

    elif args.command == "task":
        title = args.title
        if not title:
            title = input("Введите название задачи: ").strip()
        if not title:
            print("❌ Название не может быть пустым.")
            return
        p = create_task_card(title=title, priority=args.priority, agent=args.agent)
        rel = p.relative_to(PROJECT_ROOT) if PROJECT_ROOT in p.parents else p.name
        print(f"📋 Карточка задачи создана: {MAGENTA}{rel}{RESET}")

    elif args.command == "dump":
        dump = build_context_dump()
        dump_file = SCRIPT_DIR / "context_dump.md"
        dump_file.write_text(dump, encoding="utf-8")
        copied = copy_to_clipboard(dump)
        print(f"✓ Контекст сформирован ({len(dump)} символов).")
        if copied:
            print(f"{GREEN}🎉 Контекст скопирован в буфер обмена! Нажмите Ctrl+V в чате AI.{RESET}")
        else:
            print("Сохранено в agents/tools/context_dump.md")

    elif args.command == "check":
        run_integrity_check(fix=args.fix)

    elif args.command == "end":
        auto_done = extract_completed_tasks_from_active()
        done_items = [d.strip() for d in args.done.split(";")] if args.done else (auto_done if auto_done else ["Работы выполнены."])
        next_step = args.next or "Продолжить по плану."
        end_session(agent=args.agent, task_id=args.task, done_items=done_items, next_steps=next_step)

    elif args.command == "init":
        name = args.name
        if not name:
            try:
                default_name = PROJECT_ROOT.name if PROJECT_ROOT.name else "My Project"
                name = input(f"Название проекта [{default_name}]: ").strip() or default_name
                desc = input("Описание проекта: ").strip() or "Проект в разработке"
                stack = input("Технологический стек [Python]: ").strip() or "Python"
                agent = input(f"Имя агента [{args.agent}]: ").strip() or args.agent
            except (EOFError, KeyboardInterrupt):
                print("\nВвод прерван.")
                return
        else:
            desc = args.desc or "Проект в разработке"
            stack = args.stack or "Python"
            agent = args.agent
        init_project(name=name, desc=desc, stack=stack, agent=agent)

    elif args.command == "walkthrough":
        title = args.title
        if not title:
            title = input("Введите название фичи / демо: ").strip()
        if not title:
            print("❌ Название не может быть пустым.")
            return
        p = create_walkthrough(title=title, plan_id=args.plan, task_id=args.task, agent=args.agent)
        rel = p.relative_to(PROJECT_ROOT) if PROJECT_ROOT in p.parents else p.name
        print(f"🚀 Walkthrough-отчёт создан: {GREEN}{rel}{RESET}")

if __name__ == "__main__":
    main()
