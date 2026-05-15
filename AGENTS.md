# AGENTS.md

## Iron Suit 🦾

**One skill. Full pipeline. Ship faster.**

When building features, fixing bugs, or implementing changes, activate the `iron-suit` skill. It orchestrates the entire development lifecycle:

| Phase | Skill | When |
|-------|-------|------|
| 0. Brainstorm | `brainstorming` | Vague idea |
| 1. Spec | `kapy-spec` | New feature/major change |
| 2. Plan | `writing-plans` | Multi-step implementation |
| 3. TDD Build | `test-driven-development`, `systematic-debugging` | Always |
| 4. QA Review | `qa-review` | Before shipping |
| 5. Ship | `verification-before-completion` | Always |

**How to use:** Say "suit up", "iron suit", "let's build this", or describe what you want to implement. The skill assesses which phases are needed and skips what's unnecessary.

- **Bug fix (cause known)?** Skip to Phase 3 (TDD Build)
- **Bug fix (cause unknown)?** Phase 3 + `systematic-debugging`
- **Small feature (1-2 files)?** Skip to Phase 3 with brief plan
- **Medium feature?** Phase 1 (Spec) or Phase 2 (Plan)
- **Large feature?** Start at Phase 0 (Brainstorm)
- **Code review only?** Phase 4 (QA Review)

Additional skills available as-needed: `programming-philosophy` (code quality principles), `dispatching-parallel-agents` (concurrent tasks), `context-mode` (large output processing).

---

## Codebase Wiki

This project has an auto-maintained knowledge base at `.codebase-wiki/`.

### Keeping the Wiki Updated

- **After making code changes**, run `wiki_ingest` with source `commits` or `smart` to update affected pages.
- **After refactoring or adding modules**, run `wiki_ingest` with source `tree` to sync the file tree.
- **Periodically run `wiki_lint`** to catch contradictions, orphans, and stale pages.
- **When you create an ADR or major design decision**, use `wiki_decision` to record it.
- **When you add a cross-cutting pattern**, use `wiki_concept` to document it.
- **When you need context**, use `wiki_query` instead of grepping source files.

### Wiki Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| entity | `entities/` | Code modules, services, and components |
| concept | `concepts/` | Cross-cutting patterns and architectural themes |
| decision | `decisions/` | Architecture Decision Records (ADRs) |
| evolution | `evolution/` | Feature change history traced from git |
| query | `queries/` | Filed search queries for cross-referencing |

### Workflow

1. **Initialize**: `/wiki-init` creates `.codebase-wiki/` with SCHEMA.md, templates, and INDEX.md.
2. **Populate**: `wiki_ingest` with `tree` (initial), `commits` (incremental), `smart` (enrich), or `llm` (agent-written).
3. **Query**: `wiki_query` searches pages and files good queries back as new wiki pages.
4. **Lint**: `wiki_lint` checks for contradictions, orphans, stale pages, broken links.
5. **Evolve**: `wiki_evolve` traces how a feature changed over time from git history.

Pages are tracked in SQLite (`.codebase-wiki/meta/wiki.db`) and versioned in git.
Edit pages by hand or via tools — the wiki respects hand-edited content and won't overwrite it with stubs.
