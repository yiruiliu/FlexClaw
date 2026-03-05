# FlexClaw

<p align="center">
  An AI assistant that runs agents securely in their own containers, with flexible support for any Anthropic-compatible model API. Lightweight, built to be easily understood and completely customized for your needs.
</p>

<p align="center">
  <a href="README_zh.md">中文</a>
</p>

Using Claude Code, FlexClaw can dynamically rewrite its code to customize its feature set for your needs.

**Key feature:** Switch between any Anthropic-compatible API provider (DashScope, Kimi, Together AI, Ollama, etc.) with a 3-line `.env` change — no code modifications needed.

**Also:** Supports [Agent Swarms](https://code.claude.com/docs/en/agent-teams). Spin up teams of agents that collaborate in your chat.

## Why I Built FlexClaw

FlexClaw is a fork of [FlexClaw](https://github.com/qwibitai/FlexClaw) (MIT) that adds a lightweight model proxy, making it possible to use any Anthropic-compatible API endpoint without modifying the SDK or the container.

The Claude Agent SDK hardcodes `claude-sonnet-4-5` as its model name. Third-party providers (DashScope, Kimi, etc.) reject this name, making them unusable out of the box. FlexClaw runs a local HTTP proxy on the host that intercepts SDK requests, rewrites the model name, and forwards to the configured endpoint — no SDK patching required. Switching providers is a 3-line `.env` change.

Everything else from FlexClaw is preserved: one process, a handful of source files, and agents running in isolated Linux containers.

## Quick Start

```bash
git clone https://github.com/yiruiliu/FlexClaw.git
cd FlexClaw
claude
```

Then run `/setup`. Claude Code handles everything: dependencies, authentication, container setup and service configuration.

> **Note:** Commands prefixed with `/` (like `/setup`, `/add-whatsapp`) are [Claude Code skills](https://code.claude.com/docs/en/skills). Type them inside the `claude` CLI prompt, not in your regular terminal.

## Philosophy

**Small enough to understand.** One process, a few source files and no microservices. If you want to understand the full FlexClaw codebase, just ask Claude Code to walk you through it.

**Secure by isolation.** Agents run in Linux containers (Apple Container on macOS, or Docker) and they can only see what's explicitly mounted. Bash access is safe because commands run inside the container, not on your host.

**Built for the individual user.** FlexClaw isn't a monolithic framework; it's software that fits each user's exact needs. Instead of becoming bloatware, FlexClaw is designed to be bespoke. You make your own fork and have Claude Code modify it to match your needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that it's safe to make changes.

**AI-native.**
- No installation wizard; Claude Code guides setup.
- No monitoring dashboard; ask Claude what's happening.
- No debugging tools; describe the problem and Claude fixes it.

**Skills over features.** Instead of adding features (e.g. support for Telegram) to the codebase, contributors submit [claude code skills](https://code.claude.com/docs/en/skills) like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

**Best harness, best model.** FlexClaw runs on the Claude Agent SDK, which means you're running Claude Code directly. Claude Code is highly capable and its coding and problem-solving capabilities allow it to modify and expand FlexClaw and tailor it to each user.

## What It Supports

- **Multi-channel messaging** - Talk to your assistant from WhatsApp, Telegram, Discord, Slack, or Gmail. Add channels with skills like `/add-whatsapp` or `/add-telegram`. Run one or many at the same time.
- **Isolated group context** - Each group has its own `CLAUDE.md` memory, isolated filesystem, and runs in its own container sandbox with only that filesystem mounted to it.
- **Main channel** - Your private channel (self-chat) for admin control; every group is completely isolated
- **Scheduled tasks** - Recurring jobs that run Claude and can message you back
- **Web access** - Search and fetch content from the Web
- **Container isolation** - Agents are sandboxed in Apple Container (macOS) or Docker (macOS/Linux)
- **Agent Swarms** - Spin up teams of specialized agents that collaborate on complex tasks. FlexClaw is the first personal AI assistant to support agent swarms.
- **Optional integrations** - Add Gmail (`/add-gmail`) and more via skills

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am (has access to my Obsidian vault folder)
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your self-chat), you can manage groups and tasks:
```
@Andy list all scheduled tasks across groups
@Andy pause the Monday briefing task
@Andy join the Family Chat group
```

## Customizing

FlexClaw doesn't use configuration files. To make changes, just tell Claude Code what you want:

- "Change the trigger word to @Bob"
- "Remember in the future to make responses shorter and more direct"
- "Add a custom greeting when I say good morning"
- "Store conversation summaries weekly"

Or run `/customize` for guided changes.

The codebase is small enough that Claude can safely modify it.

## Contributing

**Don't add features. Add skills.**

If you want to add Telegram support, don't create a PR that adds Telegram alongside WhatsApp. Instead, contribute a skill file (`.claude/skills/add-telegram/SKILL.md`) that teaches Claude Code how to transform a FlexClaw installation to use Telegram.

Users then run `/add-telegram` on their fork and get clean code that does exactly what they need, not a bloated system trying to support every use case.

### RFS (Request for Skills)

Skills we'd like to see:

**Communication Channels**
- `/add-signal` - Add Signal as a channel

**Session Management**
- `/clear` - Add a `/clear` command that compacts the conversation (summarizes context while preserving critical information in the same session). Requires figuring out how to trigger compaction programmatically via the Claude Agent SDK.

## Requirements

- macOS or Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download) — **required for setup and orchestration** (needs an Anthropic account)
- [Apple Container](https://github.com/apple/container) (macOS) or [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

> **Note on Anthropic dependency:** FlexClaw uses Claude Code for installation (`/setup`) and as the host-side orchestrator. Even when running agents on a third-party model (DashScope, Kimi, etc.), you still need an Anthropic account for Claude Code itself. FlexClaw lets you run the *agent* on a different model — it does not eliminate the Anthropic dependency entirely.

## Architecture

```
Channels --> SQLite --> Polling loop --> Container (Claude Agent SDK) --> Response
                                                    |
                                             Model Proxy (optional)
                                                    |
                                         Third-party API endpoint
```

Single Node.js process. Channels are added via skills and self-register at startup — the orchestrator connects whichever ones have credentials present. Agents execute in isolated Linux containers with filesystem isolation. Only mounted directories are accessible. Per-group message queue with concurrency control. IPC via filesystem.

An optional model proxy runs on the host and intercepts container SDK requests, replacing the hardcoded Claude model name with the configured `MODEL_ID` before forwarding to any Anthropic-compatible endpoint. This enables third-party providers without patching the SDK.

For the full architecture details, see [docs/SPEC.md](docs/SPEC.md).

Key files:
- `src/index.ts` - Orchestrator: state, message loop, agent invocation
- `src/channels/registry.ts` - Channel registry (self-registration at startup)
- `src/ipc.ts` - IPC watcher and task processing
- `src/router.ts` - Message formatting and outbound routing
- `src/group-queue.ts` - Per-group queue with global concurrency limit
- `src/container-runner.ts` - Spawns streaming agent containers
- `src/model-proxy.ts` - Optional HTTP proxy for third-party model endpoints
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations (messages, groups, sessions, state)
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Why Docker?**

Docker provides cross-platform support (macOS, Linux and even Windows via WSL2) and a mature ecosystem. On macOS, you can optionally switch to Apple Container via `/convert-to-apple-container` for a lighter-weight native runtime.

**Can I run this on Linux?**

Yes. Docker is the default runtime and works on both macOS and Linux. Just run `/setup`.

**Is this secure?**

Agents run in containers, not behind application-level permission checks. They can only access explicitly mounted directories. You should still review what you're running, but the codebase is small enough that you actually can. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize FlexClaw so that the code does exactly what they want, rather than configuring a generic system. If you prefer having config files, you can tell Claude to add them.

**Can I use third-party or open-source models?**

Yes. FlexClaw includes a lightweight model proxy that intercepts requests from the Claude Agent SDK, rewrites the model name, and forwards them to any Anthropic-compatible endpoint. Add these three lines to your `.env`:

```bash
API_BASE_URL=https://your-api-endpoint.com
API_KEY=your-api-key
MODEL_ID=your-model-id
```

When `API_BASE_URL` is set, the proxy starts automatically on a random port and all container SDK requests are routed through it. When it is absent, the proxy is skipped and standard Claude credentials (`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`) are used as before — fully backwards compatible.

This allows you to use:
- [DashScope](https://dashscope.aliyun.com) (Alibaba Cloud) with models like GLM or Qwen
- [Kimi](https://platform.moonshot.cn) or other Anthropic-compatible providers
- Open-source models hosted on [Together AI](https://together.ai), [Fireworks](https://fireworks.ai), etc.
- Local models via [Ollama](https://ollama.ai) with an Anthropic-compatible proxy

Switching providers is a 3-line `.env` change. The model must support the Anthropic Messages API format.

**How do I debug issues?**

Ask Claude Code. "Why isn't the scheduler running?" "What's in the recent logs?" "Why did this message not get a response?" That's the AI-native approach that underlies FlexClaw.

**Why isn't the setup working for me?**

If you have issues, during setup, Claude will try to dynamically fix them. If that doesn't work, run `claude`, then run `/debug`. If Claude finds an issue that is likely affecting other users, open a PR to modify the setup SKILL.md.

**What changes will be accepted into the codebase?**

Only security fixes, bug fixes, and clear improvements will be accepted to the base configuration. That's all.

Everything else (new capabilities, OS compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets every user customize their installation without inheriting features they don't want.

## Community

Questions? Ideas? [Join the Discord](https://discord.gg/VDdww8qS42).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for breaking changes and migration notes.

## License

MIT
