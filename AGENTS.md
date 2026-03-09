# Gleam Working Rules

## Commit cadence
- Commit early and often. Prefer small, checkpoint-style commits over large mixed diffs.
- Make a commit after each meaningful completed step: setup, refactor, schema change, API change, UI change, or review workflow change.
- Keep `npm run check:types` green before each commit unless the user explicitly asks for a WIP checkpoint.

## Change boundaries
- Avoid bundling unrelated cleanup into feature commits.
- If a task has a natural split, commit the backend and frontend parts separately.
- Do not commit `.env.local` or secrets.

## Collaboration defaults
- Before a substantial refactor, inspect the current code path first.
- Prefer updating existing planning docs in `docs/` when decisions are locked.
- When possible, leave the repo in a runnable state after each commit.
