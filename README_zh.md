# FlexClaw

<p align="center">
  一个在独立容器中安全运行智能体的 AI 助手，灵活支持任何兼容 Anthropic 格式的模型 API。轻巧易懂，可根据您的个人需求完全定制。
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

通过 Claude Code，FlexClaw 可以动态重写自身代码，根据您的需求定制功能。

**核心特性：** 只需修改 `.env` 中的 3 行配置，即可切换到任意兼容 Anthropic 格式的 API 提供商（DashScope、Kimi、Together AI、Ollama 等），无需修改任何代码。

**同时支持：** [智能体集群（Agent Swarms）](https://code.claude.com/docs/en/agent-teams)。可在您的聊天中组建多个智能体团队协作完成任务。

## 为什么创建 FlexClaw

FlexClaw 是 [NanoClaw](https://github.com/qwibitai/NanoClaw)（MIT 协议）的 Fork，新增了一个轻量级模型代理，使得无需修改 SDK 或容器即可使用任意兼容 Anthropic 格式的 API 端点。

Claude Agent SDK 将模型名称硬编码为 `claude-sonnet-4-5`，而第三方提供商（DashScope、Kimi 等）会拒绝此名称，导致无法直接使用。FlexClaw 在宿主机上运行一个本地 HTTP 代理，拦截 SDK 请求，重写模型名称后转发到配置的端点——无需修改 SDK。切换提供商只需改 3 行 `.env` 配置。

其余一切继承自 NanoClaw：单一进程，少量源文件，智能体在隔离的 Linux 容器中运行。

## 快速开始

```bash
git clone https://github.com/yiruiliu/FlexClaw.git
cd FlexClaw
claude
```

然后运行 `/setup`。Claude Code 会处理一切：依赖安装、身份验证、容器设置、服务配置。

> **注意：** 以 `/` 开头的命令（如 `/setup`、`/add-whatsapp`）是 [Claude Code 技能](https://code.claude.com/docs/en/skills)。请在 `claude` CLI 提示符中输入，而非在普通终端中。

## 设计哲学

**小巧易懂：** 单一进程，少量源文件，无微服务。如果您想了解完整的 FlexClaw 代码库，直接让 Claude Code 带您浏览即可。

**通过隔离保障安全：** 智能体运行在 Linux 容器中（macOS 上使用 Apple Container，或 Docker），只能访问被明确挂载的内容。Bash 访问是安全的，因为命令在容器内执行，不直接操作您的宿主机。

**为单一用户打造：** FlexClaw 不是一个通用框架，而是完全符合每位用户需求的软件。您可以 Fork 本项目，然后让 Claude Code 根据您的精确需求进行修改。

**定制即代码修改：** 没有繁杂的配置文件。想要不同的行为？直接修改代码。代码库足够小，这样做是安全的。

**AI 原生：**
- 无安装向导——由 Claude Code 引导安装
- 无监控仪表盘——直接询问 Claude 了解系统状况
- 无调试工具——描述问题，Claude 会修复它

**技能优于功能：** 贡献者不应向代码库添加新功能（如 Telegram 支持），而应贡献像 `/add-telegram` 这样的 [Claude Code 技能](https://code.claude.com/docs/en/skills)，这些技能可改造您的 Fork。最终您得到的是只做您需要事情的整洁代码。

**最好的运行时，最好的模型：** FlexClaw 运行在 Claude Agent SDK 之上，即直接运行 Claude Code。Claude Code 高度强大，其编码和问题解决能力使其能够修改和扩展 FlexClaw，为每个用户量身定制。

## 功能支持

- **多渠道消息** - 通过 WhatsApp、Telegram、Discord、Slack 或 Gmail 与助手对话。使用 `/add-whatsapp` 或 `/add-telegram` 等技能添加渠道，可同时运行一个或多个。
- **隔离的群组上下文** - 每个群组拥有独立的 `CLAUDE.md` 记忆和隔离的文件系统，在各自的容器沙箱中运行，仅挂载所需的文件系统。
- **主频道** - 您的私有频道（self-chat），用于管理控制；其他所有群组完全隔离。
- **计划任务** - 运行 Claude 的周期性作业，可向您回发消息。
- **网络访问** - 搜索和抓取网页内容。
- **容器隔离** - 智能体在 Apple Container (macOS) 或 Docker (macOS/Linux) 的沙箱中运行。
- **智能体集群（Agent Swarms）** - 启动多个专业智能体团队，协作完成复杂任务。
- **可选集成** - 通过技能添加 Gmail (`/add-gmail`) 等更多功能。

## 使用方法

使用触发词（默认为 `@Andy`）与助手对话：

```
@Andy 每周一到周五早上9点，给我发一份销售渠道的概览（需要访问我的 Obsidian vault 文件夹）
@Andy 每周五回顾过去一周的 git 历史，如果与 README 有出入，就更新它
@Andy 每周一早上8点，从 Hacker News 和 TechCrunch 收集关于 AI 发展的资讯，然后发给我一份简报
```

在主频道（您的 self-chat）中，可以管理群组和任务：
```
@Andy 列出所有群组的计划任务
@Andy 暂停周一简报任务
@Andy 加入"家庭聊天"群组
```

## 定制

FlexClaw 不使用配置文件。直接告诉 Claude Code 您想要什么：

- "把触发词改成 @Bob"
- "记住以后回答要更简短直接"
- "当我说早上好的时候，加一个自定义的问候"
- "每周存储一次对话摘要"

或者运行 `/customize` 进行引导式修改。

代码库足够小，Claude 可以安全地修改它。

## 贡献

**不要添加功能，而是添加技能。**

如果您想添加 Telegram 支持，不要创建一个同时添加 Telegram 和 WhatsApp 的 PR。而是贡献一个技能文件（`.claude/skills/add-telegram/SKILL.md`），教 Claude Code 如何改造一个 FlexClaw 安装以使用 Telegram。

然后用户在自己的 Fork 上运行 `/add-telegram`，就能得到只做他们需要事情的整洁代码，而不是一个试图支持所有用例的臃肿系统。

### RFS（技能征集）

我们希望看到的技能：

**通信渠道**
- `/add-signal` - 添加 Signal 作为渠道

**会话管理**
- `/clear` - 添加一个 `/clear` 命令，用于压缩会话（在同一会话中总结上下文，同时保留关键信息）。这需要研究如何通过 Claude Agent SDK 以编程方式触发压缩。

## 系统要求

- macOS 或 Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download) — **安装和编排所必需**（需要 Anthropic 账号）
- [Apple Container](https://github.com/apple/container) (macOS) 或 [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

> **关于 Anthropic 依赖的说明：** FlexClaw 使用 Claude Code 进行安装（`/setup`）并作为宿主端编排器。即使将智能体运行在第三方模型上（DashScope、Kimi 等），您仍然需要 Anthropic 账号来运行 Claude Code 本身。FlexClaw 允许您在不同模型上运行*智能体*，但并非完全消除对 Anthropic 的依赖。

## 架构

```
渠道 --> SQLite --> 轮询循环 --> 容器 (Claude Agent SDK) --> 响应
                                          |
                                   模型代理（可选）
                                          |
                                  第三方 API 端点
```

单一 Node.js 进程。渠道通过技能添加，启动时自注册——编排器连接具有凭据的渠道。智能体在具有文件系统隔离的 Linux 容器中执行，仅可访问被明确挂载的目录。每个群组的消息队列带有并发控制。通过文件系统进行 IPC。

可选的模型代理运行在宿主机上，拦截容器 SDK 的请求，将硬编码的 Claude 模型名称替换为配置的 `MODEL_ID`，再转发到任意兼容 Anthropic 格式的端点。这无需修改 SDK 即可支持第三方提供商。

完整架构详情请见 [docs/SPEC.md](docs/SPEC.md)。

关键文件：
- `src/index.ts` - 编排器：状态管理、消息循环、智能体调用
- `src/channels/registry.ts` - 渠道注册表（启动时自注册）
- `src/ipc.ts` - IPC 监听与任务处理
- `src/router.ts` - 消息格式化与出站路由
- `src/group-queue.ts` - 带全局并发限制的群组队列
- `src/container-runner.ts` - 生成流式智能体容器
- `src/model-proxy.ts` - 第三方模型端点的可选 HTTP 代理
- `src/task-scheduler.ts` - 运行计划任务
- `src/db.ts` - SQLite 操作（消息、群组、会话、状态）
- `groups/*/CLAUDE.md` - 各群组的记忆

## FAQ

**为什么是 Docker？**

Docker 提供跨平台支持（macOS、Linux，甚至通过 WSL2 支持 Windows）和成熟的生态系统。在 macOS 上，您可以选择通过运行 `/convert-to-apple-container` 切换到 Apple Container，以获得更轻量级的原生运行时体验。

**我可以在 Linux 上运行吗？**

可以。Docker 是默认的容器运行时，在 macOS 和 Linux 上都可以使用。只需运行 `/setup`。

**这个项目安全吗？**

智能体在容器中运行，而不是在应用级别的权限检查之后。它们只能访问被明确挂载的目录。您仍然应该审查您运行的代码，但这个代码库小到您真的可以做到。完整的安全模型请见 [docs/SECURITY.md](docs/SECURITY.md)。

**为什么没有配置文件？**

我们不希望配置泛滥。每个用户都应该定制 FlexClaw，让代码完全符合他们的需求，而不是去配置一个通用的系统。如果您喜欢用配置文件，告诉 Claude 让它加上。

**我可以使用第三方或开源模型吗？**

可以。FlexClaw 内置了一个轻量级模型代理，可拦截 Claude Agent SDK 的请求，重写模型名称后转发到任意兼容 Anthropic 格式的端点。在 `.env` 文件中添加以下三行：

```bash
API_BASE_URL=https://your-api-endpoint.com
API_KEY=your-api-key
MODEL_ID=your-model-id
```

设置 `API_BASE_URL` 后，代理会自动在随机端口启动，所有容器 SDK 请求都会通过它路由。未设置时，代理跳过，直接使用标准 Claude 凭据（`ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`）——完全向后兼容。

支持的提供商包括：
- [DashScope](https://dashscope.aliyun.com)（阿里云）的 GLM、Qwen 等模型
- [Kimi](https://platform.moonshot.cn) 或其他兼容 Anthropic 格式的提供商
- 托管在 [Together AI](https://together.ai)、[Fireworks](https://fireworks.ai) 等平台上的开源模型
- 通过 [Ollama](https://ollama.ai) 配合 Anthropic 兼容代理运行的本地模型

切换提供商只需改 3 行 `.env` 配置。模型需支持 Anthropic Messages API 格式。

**我该如何调试问题？**

问 Claude Code。"为什么计划任务没有运行？" "最近的日志里有什么？" "为什么这条消息没有得到回应？" 这就是 FlexClaw 的 AI 原生方法。

**为什么我的安装不成功？**

如果遇到问题，安装过程中 Claude 会尝试动态修复。如果问题仍然存在，运行 `claude`，然后运行 `/debug`。如果 Claude 发现一个可能影响其他用户的问题，请开一个 PR 来修改 setup SKILL.md。

**什么样的代码更改会被接受？**

只接受安全修复、bug 修复，以及对基础配置的明确改进。仅此而已。

其他一切（新功能、操作系统兼容性、硬件支持、增强功能）都应该作为技能来贡献。

这使得基础系统保持最小化，并让每个用户可以定制他们的安装，而无需继承他们不想要的功能。

## 社区

有任何疑问或建议？[加入 Discord 社区](https://discord.gg/VDdww8qS42)与我们交流。

## 更新日志

破坏性变更和迁移说明请见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

MIT
