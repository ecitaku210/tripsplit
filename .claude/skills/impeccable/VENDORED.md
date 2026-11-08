# Impeccable, vendored as instructions only

The source is [pbakaus/impeccable](https://github.com/pbakaus/impeccable) at commit `695cea5` (v4.8.0), from
`.claude/skills/impeccable/`, under the Apache-2.0 licence in `LICENSE`. Third-party notices are in `NOTICE.md`.

## What is here

- `SKILL.md` and `reference/`, copied unchanged, except for one line in `SKILL.md`'s frontmatter:
  `disable-model-invocation: true`. The skill runs only when someone types `/impeccable <command>`, never on its own.
  Its own description would otherwise load it for almost any UI change in this repo.

## What was left out, and why

- **`scripts/`**: the launcher and its native engine binary, which is downloaded on first run. Running downloaded code
  is what this project avoids. Every step that calls `scripts/impeccable …` fails, and `SKILL.md` then follows its
  own "Launcher unavailable" rule: it reads PRODUCT.md and DESIGN.md directly and carries on.
- **Hooks** (`.claude/settings.json`) and **sub-agents** (`.claude/agents/`): nothing runs automatically.
  `reference/degraded/` holds the fallbacks the skill uses when sub-agents are absent.
- **Telemetry**: it lives in the engine, so with no engine nothing is sent.

## Don't use

- `live` and `generate`: they need the engine. Upstream, live mode can also launch an AI agent with permission checks off.
- `hooks` and `doctor`: they manage the engine's hooks and files.

## Useful here

`harden`, `critique`, `audit`, `clarify`, `onboard` and `document`. TripSplit is an "Operate" surface in
Impeccable's terms: an app where scanability and native expectations outrank expression.
