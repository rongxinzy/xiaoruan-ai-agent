# 晓软Agent

晓软Agent is a desktop AI workspace for research, documents, spreadsheets, code, browser tasks, messaging channels, skills, MCP integrations, and recurring tasks.

This edition does not require a product account and does not provide a built-in free model or official model quota. Configure your own provider and API key in Settings, or run a local model.

## Custom edition boundaries

- Product name: 晓软Agent (晓软智能体).
- Xiaoruan branding is used across the welcome screen, About page, installer, and default government-red theme. Dark and system modes remain available.
- Application ID: `com.xiaoruan.agent`.
- Data is stored under `XiaoruanAgent`, using `xiaoruan.sqlite`. Upstream application data is not read or migrated.
- Upstream account authentication, guest tokens, free-model providers, product login callbacks, and automatic update flows are not part of this edition.
- User-configured third-party providers, local inference, tasks, skills, MCP, and messaging channels remain available.
- Windows packages are delivered through the private `xiaoruan-releases` R2 bucket. Obtain installers from the delivery provider's authorized console or client; the updater does not fetch a public manifest.

## What you can do

| Task | Workflow |
| --- | --- |
| Research | Search the web, read local material, and organize findings with sources |
| Documents and data | Create presentations, work with Word, PDF, and Excel, and produce files from analysis |
| Code | Select a project directory, explore a repository, edit code, run commands, and inspect artifacts |
| Everyday work | Track work in Todos and schedule briefings, reports, and other recurring tasks |
| Browser tasks | Find information and operate web pages while following the agent's progress |
| Messaging | Connect WeChat, WeCom, DingTalk, Feishu/Lark, QQ, or email through configured channels |

Experts provide presets for specific kinds of work. Skills package reusable methods and tools. MCP connects external services.

## Get started

1. Obtain an installer from the delivery provider's authorized console or client, backed by the private `xiaoruan-releases` R2 bucket. GitHub links in this document are for source code and project history only.
2. Open the app and configure your own model provider, API key, or local model in Settings.
3. Select a project directory, describe the task, and attach relevant material when needed.
4. Follow progress, respond to approval requests, inspect results, and continue with feedback.

The desktop project supports macOS, Windows, and Linux. Local inference uses GGUF models and exposes context length, GPU allocation, threads, and other service options. Web search, model downloads, remote MCP services, and messaging channels require their respective network services.

## Workspace appearance

Themes are provided as plugins under `src/renderer/theme`. The Xiaoruan edition uses a government-red default style and retains the upstream Codex, Daming Fenghua, Changan Fengwu, and Weiyang Jinshi theme packages. Choose a theme and light, dark, or system mode in **Settings → Appearance**. Backgrounds, typography, shapes, controls, and interaction states belong to the complete theme package.

See the [theme authoring guide](src/renderer/theme/README.md) and [design specification](DESIGN.md) when creating a theme.

## Developer quick start

Install Git, Node.js **24.x**, and Bun as pinned in [`package.json`](package.json). Native dependencies may require Python and a C/C++ toolchain.

```bash
git clone https://github.com/rongxinzy/RongxinAI.git XiaoruanAgent
cd XiaoruanAgent
bun install --frozen-lockfile
npm run electron:dev
```

Useful checks:

```bash
npm run lint
npm test
npm run build
```

Platform packaging uses `bun run dist:mac`, `bun run dist:win`, or `bun run dist:linux`. Runtime resources and optional online services may use upstream resource services; see [CUSTOMIZATION.md](CUSTOMIZATION.md).

## Project map

| Path | Responsibility |
| --- | --- |
| [`src/renderer`](src/renderer) | React workspace, conversations, settings, and local inference UI |
| [`src/shared`](src/shared) | Shared UI, types, and communication contracts |
| [`src/main`](src/main) | Desktop lifecycle, task execution, storage, and system services |
| [`src/renderer/theme`](src/renderer/theme) | Theme contracts, component appearance, backgrounds, and generation |
| [`SKILLs`](SKILLs) / [`MCPs`](MCPs) | Bundled skills and tool integrations |

The stack includes Electron, React, TypeScript, Vite, Tailwind CSS, Redux Toolkit, and SQLite.

## Source and license

This edition is based on [ZhiYuan Agent](https://github.com/rongxinzy/RongxinAI) and preserves the upstream history. It is licensed under [AGPL-3.0-only](LICENSE); third-party components retain their own licenses and attribution.
