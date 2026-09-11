# 晓软Agent

晓软Agent is a desktop AI workspace for research, documents, spreadsheets, code, browser tasks, messaging channels, skills, MCP integrations, and recurring tasks.

This edition does not require a product account and does not provide a built-in free model or official model quota. Enter the AISphere address supplied by your delivery provider in **Settings → Model**, connect, and select a model returned by the platform. No manual API key entry is required.

## Custom edition boundaries

- Product name: 晓软Agent (晓软智能体).
- Xiaoruan branding is used across the welcome screen, About page, installer, and default Xiaoruan Red theme. Dark and system modes remain available.
- Application ID: `com.xiaoruan.agent`.
- Data is stored under `XiaoruanAgent`, using `xiaoruan.sqlite`. Upstream application data is not read or migrated.
- Upstream account authentication, guest tokens, free-model providers, product login callbacks, and automatic update flows are not part of this edition.
- Built-in model requests use only models returned by the bound AISphere service. Third-party provider settings and local-model entry points are unavailable. Tasks, skills, MCP, and messaging channels remain available.
- Windows x64 installers are stored in the dedicated `xiaoruan-releases` R2 bucket and distributed through public download links without storage credentials. Automatic updates are disabled; upgrades require a newly distributed installer.

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

1. Download the installer using the public link supplied by the delivery provider and verify its version and SHA-256. Developers can obtain links from the successful build's Actions Summary or upload receipt; see [package storage](CUSTOMIZATION.md#安装包存储).
2. Open **Settings → Model**, enter the **AISphere address**, connect to fetch models, and choose the default model.
3. Select a project directory, describe the task, and attach relevant material when needed.
4. Follow progress, respond to approval requests, inspect results, and continue with feedback.

AISphere supports HTTP and HTTPS. This edition intentionally permits certificate-invalid HTTPS for AISphere requests only. Platform identification currently validates the expected discovery response and catalog structure; it does not cryptographically authenticate the platform. See [AISphere binding](CUSTOMIZATION.md#aisphere-模型绑定) for the scope and automatic recovery behavior.

The delivery workflow builds Windows x64 only. macOS and Linux development support in the source tree does not establish delivery acceptance for those platforms. Web search, remote MCP, messaging, and some resource installations require external services; see [retained online resources](CUSTOMIZATION.md#保留的在线资源).

## Workspace appearance

Themes are provided as plugins under `src/renderer/theme`. The Xiaoruan edition uses Xiaoruan Red by default and retains the upstream Codex, Daming Fenghua, Changan Fengwu, and Weiyang Jinshi theme packages. Choose a theme and light, dark, or system mode in **Settings → Appearance**. Backgrounds, typography, shapes, controls, and interaction states belong to the complete theme package.

See the [theme authoring guide](src/renderer/theme/README.md) and [design specification](DESIGN.md) when creating a theme.

## Developer quick start

Install Git, Node.js **24.x**, and Bun as pinned in [`package.json`](package.json). Native dependencies may require Python and a C/C++ toolchain.

```bash
git clone https://github.com/rongxinzy/xiaoruan-ai-agent.git XiaoruanAgent
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

For distribution, run the manual Windows package workflow on main and retain its source, build, and artifact receipts. The dated [delivery acceptance record](CUSTOMIZATION.md#交付验收记录) distinguishes completed checks from pending Windows and customer-platform verification.

## Project map

| Path | Responsibility |
| --- | --- |
| [`src/renderer`](src/renderer) | React workspace, conversations, and AISphere settings |
| [`src/shared`](src/shared) | Shared UI, types, and communication contracts |
| [`src/main`](src/main) | Desktop lifecycle, task execution, storage, and system services |
| [`src/renderer/theme`](src/renderer/theme) | Theme contracts, component appearance, backgrounds, and generation |
| [`SKILLs`](SKILLs) / [`MCPs`](MCPs) | Bundled skills and tool integrations |

The stack includes Electron, React, TypeScript, Vite, Tailwind CSS, Redux Toolkit, and SQLite.

## Source and license

This edition is based on [ZhiYuan Agent](https://github.com/rongxinzy/RongxinAI) and preserves the upstream history. It is licensed under [AGPL-3.0-only](LICENSE); third-party components retain their own licenses and attribution.
