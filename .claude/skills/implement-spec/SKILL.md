---
name: implement-spec
description: Implement tasks from an approved BearLink spec file. Use when asked to implement a spec or work through spec tasks.
disable-model-invocation: true
---

Implement tasks from a BearLink spec file.

Arguments: `$ARGUMENTS`

Parse the arguments as follows:

- First token: path to the spec file (required), e.g. `spec/password-reset.md`
- Second token: task number (optional integer), e.g. `3`

---

## Step 1 — Read the spec

Read the spec file provided in the arguments. Understand:

- The Goal and Requirements
- The full task list in the Tasks section
- Which tasks are already checked (`- [x]`) vs unchecked (`- [ ]`)
- Which service(s) are affected
- Which docs need updating (openapi.yaml, asyncapi.yaml)

## Step 2 — Check for tasks; generate if missing

Check whether the spec has a `## Tasks` section with at least one task entry
(`### Task`).

If the Tasks section is absent or empty:

- Use the Agent tool to invoke the `generate-tasks` skill on this spec file.
  Pass the spec path as the argument, e.g.:
  `Agent(subagent_type="general", prompt="Use the generate-tasks skill on spec/my-feature.md")`
- Wait for the agent to finish, then re-read the spec file to pick up the generated tasks.
- If the spec status is `draft`, stop and ask the user to get the spec approved before implementing.

## Step 3 — Determine what to implement

If a task number was provided in the arguments:

- Implement only that specific task, then stop.

If no task number was provided:

- Find the first unchecked task (`- [ ]`).
- Implement it, mark it done, then move to the next unchecked task.
- Keep going until all tasks are checked off.

If all tasks are already done, report that and stop.

## Step 4 — Branch setup

Check the current git branch.

- If already on a `feat/<spec-name>` branch, continue on it.
- If on any other branch (including master), create and switch to `feat/<spec-name>` where `<spec-name>` is the spec filename without the `.md` extension (e.g. `spec/password-reset.md` → `feat/password-reset`).
- Never implement directly on master.

## Step 5 — Implement each task

For each task being implemented:

1. Read relevant existing code before writing anything. Understand current patterns in the affected service(s).
2. Implement the task following existing conventions:
   - Most of the backend services use Express + Prisma ORM (JavaScript/CommonJS)
   - For Express framework shared auth middleware lives in `shared/middlewares/auth.js`
   - RabbitMQ helpers live in `shared/events/`
   - Tests use Vitest; follow the patterns in existing `*.test.js` files in the service
3. Write or update tests to cover the new behaviour.
4. Run the tests for the affected service to confirm they pass.
5. If the task touches REST endpoints, update `docs/openapi.yaml`.
6. If the task touches RabbitMQ events or queues, update `docs/asyncapi.yaml`.
7. After the task is complete, mark it done in the spec file by changing `- [ ]` to `- [x]` for that task.

## Step 6 — When all tasks are done

After the final task is marked done:

1. If you created a new service, create a CLAUDE.md and README.md in the new service directory
2. If you updated a service, update the CLAUDE.md and README.md in the service directory
3. If the implemented feature affects other parts of the project update CLAUDE.md and README.md in the project root
4. Update the spec's status front-matter from `in-progress` to `done`.
5. Move the spec file to `spec/done/<filename>.md`.
6. Report a summary of everything implemented.

---

## Rules

- Never skip reading existing code before implementing — always understand the pattern first.
- Never implement on master. Always use a `feat/` branch.
- Always run tests after implementing a task. If tests fail, fix them before moving on.
- Keep implementations minimal — do not add features beyond what the task describes.
- Do not add comments or docstrings to code you did not change.
- Use plain ASCII only in any markdown files you write or update (no Unicode box-drawing characters).
