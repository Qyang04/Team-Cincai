# Codex Agent Setup

This repository includes a project-specific Codex skill at `.codex/skills/team-cincai-fullstack-dev`.

Use this guide to keep the skill repo-scoped and shareable through GitHub without installing a global copy.

## What This Skill Does

The skill is intended for development work in this monorepo:

- frontend work in `apps/web`
- backend work in `apps/api`
- shared contracts and schemas in `packages/shared`

It also tells the agent to read:

- `master-plan.md` for the overall product direction
- the repo-local skill references for workflow and structure guidance

## Recommended Usage

Invoke the skill explicitly in the prompt:

```text
Use $team-cincai-fullstack-dev to implement ...
```

You can also reference the path directly:

```text
Use the skill at .codex/skills/team-cincai-fullstack-dev for this task.
```

## Repo-Local Setup

Keep the skill in:

```text
.codex/skills/team-cincai-fullstack-dev
```

Then invoke it explicitly in prompts.

This keeps the skill versioned with the repository and avoids affecting other projects.

## Suggested Team Workflow

1. Commit changes to `.codex/skills/team-cincai-fullstack-dev` in the repo.
2. Tell teammates to open the repo before using the skill.
3. Have teammates invoke the skill explicitly in prompts.

## Notes

- Do not assume a skill auto-loads just because the folder exists in the repo.
- This repo intentionally does not rely on a global Codex skill install.
- Keep project-specific guidance in the repo skill so it evolves with the codebase.
