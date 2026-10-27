# GitHub Copilot Custom Instructions

All AI operations in this repository are governed by the **Second Brain** structure in `agents/`.

- Always review `AGENTS.md` and `agents/AGENT_GUIDE.md` for architectural context.
- **MANDATORY PLAN-FIRST RULE**: Always create/update a detailed implementation plan in `agents/plans/` or `agents/tasks/active_task.md` BEFORE writing or modifying any code. Blind coding without a plan is strictly forbidden.
- Adhere strictly to `agents/rules/ANTI_PATTERNS.md` (no hardcoded secrets, no breaking changes without context).
- Keep track of active tasks in `agents/tasks/active_task.md`.
- Document new bugs and resolutions in `agents/bugs_and_fixes/`.
