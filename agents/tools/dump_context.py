#!/usr/bin/env python3
"""
Second Brain Context Dumper.
Собирает ключевой контекст проекта (статус, активную задачу, карту кодовой базы,
последнюю сессию) в один компактный блок текста и копирует его в буфер обмена.
Идеально для передачи контекста в веб-чаты ChatGPT, Claude.ai, DeepSeek или Gemini.
"""

import sys
import os
import subprocess
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

def copy_to_clipboard(text: str) -> bool:
    """Пытается скопировать текст в буфер обмена кроссплатформенно."""
    try:
        if sys.platform == "win32":
            process = subprocess.Popen(["clip"], stdin=subprocess.PIPE, shell=True)
            process.communicate(text.encode("utf-16le"))
            return True
        elif sys.platform == "darwin":
            process = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
            process.communicate(text.encode("utf-8"))
            return True
        else:
            process = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
            process.communicate(text.encode("utf-8"))
            return True
    except Exception:
        return False

def build_context_dump() -> str:
    lines = []
    lines.append("# 🧠 PROJECT CONTEXT SNAPSHOT (Second Brain)")
    lines.append("> Этот снимок сгенерирован автоматически для передачи полного контекста проекта в AI чат.\n")

    files_to_pack = [
        ("📊 СТАТУС ПРОЕКТА", AGENTS_DIR / "STATUS.md"),
        ("📋 АКТИВНАЯ ЗАДАЧА", AGENTS_DIR / "tasks" / "active_task.md"),
        ("🗺️ КАРТА КОДОВОЙ БАЗЫ", AGENTS_DIR / "architecture" / "CODEBASE_MAP.md"),
        ("🎯 ТРЕБОВАНИЯ К ПРОДУКТУ (PRD)", AGENTS_DIR / "product" / "PRD.md"),
        ("📖 ГЛОССАРИЙ ТЕРМИНОВ", AGENTS_DIR / "GLOSSARY.md"),
        ("📏 ПРАВИЛА АГЕНТА", AGENTS_DIR / "rules" / "AGENT_RULES.md"),
    ]

    for title, path in files_to_pack:
        if path.is_file():
            content = path.read_text(encoding="utf-8", errors="replace").strip()
            lines.append(f"## {title} (`{path.name}`)\n")
            lines.append("```markdown")
            lines.append(content)
            lines.append("```\n")

    # Ищем активный план реализации в plans/
    plans_dir = AGENTS_DIR / "plans"
    plan_files = sorted(
        [f for f in plans_dir.glob("plan_*.md") if f.name != "README.md"],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    if plan_files:
        # Проверяем первый файл или ищем IN_PROGRESS
        active_plan = plan_files[0]
        for pf in plan_files:
            try:
                txt = pf.read_text(encoding="utf-8", errors="replace")
                if "IN_PROGRESS" in txt or "APPROVED" in txt:
                    active_plan = pf
                    break
            except Exception:
                pass
        plan_content = active_plan.read_text(encoding="utf-8", errors="replace").strip()
        lines.append(f"## 📐 ПЛАН РЕАЛИЗАЦИИ (Plan-First) (`plans/{active_plan.name}`)\n")
        lines.append("```markdown")
        lines.append(plan_content)
        lines.append("```\n")

    # Ищем последний лог сессии
    history_files = sorted(
        [f for f in (AGENTS_DIR / "history").glob("*.md") if f.name != "README.md"],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    if history_files:
        latest = history_files[0]
        content = latest.read_text(encoding="utf-8", errors="replace").strip()
        lines.append(f"## 📝 ПОСЛЕДНЯЯ СЕССИЯ (`history/{latest.name}`)\n")
        lines.append("```markdown")
        lines.append(content)
        lines.append("```\n")

    return "\n".join(lines)

def main():
    print("\n📦 Сборка контекста проекта из каталога agents/...")
    dump = build_context_dump()
    dump_len = len(dump)
    dump_lines = dump.count("\n")

    # Сохраняем в файл для резервной копии
    dump_file = SCRIPT_DIR / "context_dump.md"
    dump_file.write_text(dump, encoding="utf-8")

    copied = copy_to_clipboard(dump)

    print(f"✓ Контекст успешно сформирован! (Строк: {dump_lines}, Символов: {dump_len})")
    print(f"✓ Сохранен в резервный файл: {dump_file.relative_to(PROJECT_ROOT) if PROJECT_ROOT in dump_file.parents else dump_file.name}")
    
    if copied:
        print("\n🎉 ТЕКСТ УСПЕШНО СКОПИРОВАН В БУФЕР ОБМЕНА!")
        print("👉 Просто откройте окно чата (ChatGPT / Claude / DeepSeek) и нажмите Ctrl + V!\n")
    else:
        print("\n💡 Скопируйте содержимое вручную из файла agents/tools/context_dump.md\n")

if __name__ == "__main__":
    main()
