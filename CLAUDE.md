# Claude Code & Claude Assistant Guidelines

This repository strictly follows the **Second Brain** engineering methodology located in the `agents/` directory.

## Core Protocols & Mandatory Rules
- **Entrypoint:** Read `AGENTS.md` and `agents/AGENT_GUIDE.md` first before any actions.
- **PLAN-FIRST RULE (MANDATORY):** NEVER write or edit code without an existing or newly drafted implementation plan in `agents/plans/` (using `agents/templates/template_plan.md`) or an atomic checklist in `agents/tasks/active_task.md`. Blind coding is strictly prohibited.
- **Rules & Prohibitions:** Study `agents/rules/AGENT_RULES.md` and `agents/rules/ANTI_PATTERNS.md` (no hardcoded credentials, no silent error swallowing, no destroying history).
- **Project State:** Inspect `agents/STATUS.md` and `agents/tasks/active_task.md` before making edits. Mark progress `[x]` as you complete steps.
- **Code Standards:** Adhere to `agents/rules/CODING_STANDARDS.md`.
- **Known Bugs:** Inspect `agents/bugs_and_fixes/` before troubleshooting and document new resolutions there.
- **Session Continuity:** Always append a new session summary to `agents/history/` at the end of work. Never overwrite existing history files.
- **Integrity Validation:** Run `python agents/tools/check_integrity.py` before finalizing any task.
