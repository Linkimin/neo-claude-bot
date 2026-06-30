# claude-bot

**English** · [Русский](README.ru.md)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522-43853d)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

Drive your **desktop Claude Code** (Anthropic Agent SDK) from your phone over Telegram. You send a prompt into a project's forum topic, Claude Code runs it on your PC, and the streamed answer comes back to the chat — with inline approval buttons, an interrupt button, per-project settings, resumable sessions, rate-limit handling, and an optional failover model provider.

> Personal project, Windows-first (the always-online service uses Windows Task Scheduler). The bot core is plain TypeScript and runs anywhere Node does.

---

## Features

- **Per-project forum topics** — each project is a Topic in a Telegram supergroup; messages route to the right working directory.
- **Live streaming** — assistant text streams into the message; tool calls are shown as they happen.
- **Approvals** — in `default` mode, risky tools (Write/Edit/Bash) ask for permission via inline buttons; a reminder fires if a request sits unanswered.
- **Interrupt** — stop a running prompt with the ⏹ button or `/stop` (real `Query.interrupt()` over a streaming session, not just a kill).
- **Settings per project** — permission mode, model (Opus / Sonnet / Haiku), thinking effort, provider, failover model.
- **Sessions** — conversations resume per project; `/new` starts fresh.
- **Rate limits** — detects Claude usage limits, queues the request, and auto-continues when the window resets; proactively pings you when limits come back.
- **Model failover** *(optional)* — when Claude limits are hit, auto-switch to a secondary OpenAI-format provider (via [claude-code-router](https://github.com/musistudio/claude-code-router)) and switch back on reset.
- **Spend tracking** *(optional)* — `/spend` shows today's estimated cost per project plus your provider balance; daily-spend and low-balance alerts.
- **Always online** — runs as a Windows service that starts before login and auto-restarts on crash.

## How it works

```
Telegram (phone)
   │  prompt in a project topic
   ▼
grammY bot  ──►  Core  ──►  runner  ──►  @anthropic-ai/claude-agent-sdk  ──►  Claude Code (your PC)
   ▲                │                          (streaming input + canUseTool)
   └── streamed ◄───┘
       answer / approvals / status
```

- **Bot** (`src/bot.ts`) — thin Telegram layer: routing, keyboards, approvals, commands.
- **Core** (`src/core.ts`) — orchestrates a run, owns provider selection and interrupts.
- **runner** (`src/runner.ts`) — calls the Agent SDK in streaming-input mode, normalizes events, wires the approval callback.
- **Stores** — SQLite (`data/claud-bot.sqlite`) for sessions, limits, runs and spend.
- **Failover** — `CcrProcess` manages a local claude-code-router proxy that bridges an OpenAI-format provider to the Anthropic protocol.

## Requirements

- **Node.js ≥ 22**
- **Desktop Claude Code**, logged in once (`claude` → `/login`). The bot inherits `~/.claude/.credentials.json`; there is no API key in this project.
- A **Telegram bot** (from [@BotFather](https://t.me/BotFather)) and a **forum supergroup** (a group with *Topics* enabled) where you are an admin.
- Windows is required only for the always-online service; development works on any OS.

## Setup

```bash
npm install
cp .env.example .env      # fill in the values below
npm start                 # foreground run
```

In Telegram:

1. Add the bot to your forum supergroup as an admin (allow it to manage topics).
2. Send `/setup` — it creates one Topic per project from `config/projects.json`.
3. Open a project's topic and send a prompt.

### Environment (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | BotFather token. |
| `TELEGRAM_USER_ID` | ✅ | Your numeric Telegram id — the only allowed user. |
| `TELEGRAM_GROUP_ID` | ✅ | Forum supergroup id (negative, e.g. `-1001234567890`). |
| `SETTINGS_PIN` | ✅ | PIN to unlock auto/bypass mode (`/auto <PIN>`). |
| `ROUTERAI_API_KEY` | — | Enables failover to a secondary provider. |
| `ROUTERAI_BASE_URL` | — | Provider base URL (OpenAI-format). |
| `CCR_PORT` | — | Local claude-code-router port (default `3456`). |
| `SPEND_ALERT_USD` | — | Daily estimated-spend alert threshold. |
| `ROUTERAI_BALANCE_MIN` | — | Low-balance alert threshold. |

### Projects (`config/projects.json`)

```json
[
  { "name": "myapp", "dir": "D:/work/myapp", "defaultMode": "acceptEdits" }
]
```

`defaultMode` is one of `default` (ask before risky tools), `acceptEdits` (auto-accept edits), or `bypassPermissions` (run everything — unlock from the bot with `/auto <PIN>`).

## Commands

| Command | What it does |
|---|---|
| `/setup` | Create a forum topic per project. |
| `/status` | Projects, current model/mode/effort, running state. |
| `/settings` | Inline menu: mode, model, effort, provider, failover. |
| `/new` | Start a fresh session in this topic. |
| `/stop` | Interrupt the running prompt (same as the ⏹ button). |
| `/limits` | Remaining Claude usage limits. |
| `/spend` | Today's estimated spend + provider balance. |
| `/auto <PIN>` | Enable bypass-permissions mode for this project. |

## Run as a Windows service (always online)

From an **Administrator** PowerShell, in the project directory:

```powershell
npm run install-service                  # install (start at boot, auto-restart)
Start-ScheduledTask -TaskName ClaudBot   # start now (also starts on boot)
npm run uninstall-service                # remove
```

- Runs **before login** under your account (S4U), so Claude authentication works.
- Log: `data\bot.log`. Status: `Get-ScheduledTask -TaskName ClaudBot`.
- A supervisor wrapper respawns the bot if it exits.

## Development

```bash
npm test            # vitest
npx tsc --noEmit    # type-check
```

Source is small, focused modules under `src/` with co-located `*.test.ts`. Pure logic (rendering, normalization, routing, stores) is unit-tested; live Telegram/SDK paths are verified manually.

## Security model

- **Single-user allowlist** — only `TELEGRAM_USER_ID` may interact; everyone else is rejected.
- **PIN-gated bypass** — `bypassPermissions` (run any tool without asking) requires `/auto <PIN>`.
- **No secrets in the repo** — credentials live in `.env` (git-ignored) and `~/.claude`.

Treat the bot as a remote shell into your machine: only run it on a chat you control, and keep `bypassPermissions` for projects you trust.

## Roadmap

- Add/remove/rename projects from the bot (directory browser, folder creation), with the registry moving fully into SQLite.
- Richer output rendering (Markdown, diffs, long-output pagination).
- Plugin & skill management per project.

## License

[GNU AGPL-3.0](LICENSE) © 2026 Matvey Bakhmatov.

If you run a modified version as a network service, the AGPL requires you to make your source available to its users.
