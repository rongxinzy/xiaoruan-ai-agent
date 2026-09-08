# 晓软AI智能体

晓软AI智能体是面向研究、文档、表格、代码、浏览器操作、消息渠道、技能、MCP 集成和定时任务的桌面 AI 工作台。

本版本无需产品账号登录，不提供内置免费模型或官方模型额度。首次使用请在设置中配置自己的模型服务地址和 API Key，或启动本地模型。

## 定制版边界

- 产品名称：晓软AI智能体（Xiaoruan AI Agent）。
- 启动欢迎页、关于页、安装器和默认主题使用晓软科技标志与政务红；支持深色及跟随系统。
- 独立应用标识：`com.xiaoruan.agent`。
- 数据保存在 `XiaoruanAgent`，数据库为 `xiaoruan.sqlite`。不读取或迁移上游应用数据。
- 已移除上游账号认证、游客令牌、免费模型提供商、产品登录回调和自动更新链路。
- 保留用户自行配置的第三方模型授权、本地推理、任务、技能、MCP 和消息渠道能力。
- Windows 安装包存放在私有 `xiaoruan-releases` R2 桶中。请通过交付方授权的控制台或客户端获取；更新器不会拉取公共 manifest。

## 可以完成的工作

| 场景 | 工作方式 |
| --- | --- |
| 资料研究 | 检索网页、阅读本地资料，整理带来源的研究结果 |
| 文档与表格 | 制作演示文稿，处理 Word、PDF、Excel，分析数据并生成文件 |
| 代码工作 | 选择项目目录，阅读仓库、修改代码、运行命令并检查产物 |
| 日常任务 | 用待办记录工作，通过定时任务安排简报、报告和其他重复流程 |
| 浏览器操作 | 让智能体在浏览器中查找信息、操作页面，并展示执行进度 |
| 消息协作 | 配置微信、企业微信、钉钉、飞书/Lark、QQ 或邮箱，在已接入的渠道中使用智能体 |

专家提供面向具体工作的预设；技能封装可复用的方法和工具；MCP 用于连接外部服务。

## 开始使用

1. 通过交付方授权的控制台或客户端获取安装包，安装包来自私有 `xiaoruan-releases` R2 桶。文档中的 GitHub 链接仅用于源码和项目历史。
2. 打开应用，在设置中配置自己的模型服务、API Key 或本地模型。
3. 选择项目目录，描述任务，并按需附上资料。
4. 查看执行过程、处理授权请求，检查生成结果后继续追问或修改。

桌面工程支持 macOS、Windows 和 Linux。本地推理使用 GGUF 模型，并提供上下文长度、GPU 分配、线程等设置。联网搜索、模型下载、远程 MCP 和消息渠道仍需要对应网络服务。

## 工作台外观

主题以插件形式定义在 `src/renderer/theme`。晓软版本默认使用政务红，并保留上游 Codex、大明风华、长安风物和未央金石主题包。在「设置 → 外观」选择主题以及浅色、深色或跟随系统；背景、字体、圆角、控件与交互状态由整套主题统一定义。

主题开发请参考[主题开发文档](src/renderer/theme/README.md)和[设计规范](DESIGN.md)。

## 开发者快速开始

需要 Git、Node.js **24.x** 和 [`package.json`](package.json) 指定的 Bun。原生依赖无法使用预编译包时，需要 Python 与 C/C++ 构建工具。

```bash
git clone https://github.com/rongxinzy/RongxinAI.git XiaoruanAgent
cd XiaoruanAgent
bun install --frozen-lockfile
npm run electron:dev
```

验证命令：

```bash
npm run lint
npm test
npm run build
```

平台打包命令为 `bun run dist:mac`、`bun run dist:win`、`bun run dist:linux`。运行时资源与部分可选在线功能仍可能使用上游资源服务，详见 [CUSTOMIZATION.md](CUSTOMIZATION.md)。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| [`src/renderer`](src/renderer) | 工作台、会话、设置、本地推理等 React 界面 |
| [`src/shared`](src/shared) | 共享 UI、类型与通信契约 |
| [`src/main`](src/main) | 桌面生命周期、任务执行、存储与系统服务 |
| [`src/renderer/theme`](src/renderer/theme) | 主题契约、组件外观、背景与生成器 |
| [`SKILLs`](SKILLs) / [`MCPs`](MCPs) | 内置技能与工具集成 |

技术栈包括 Electron、React、TypeScript、Vite、Tailwind CSS、Redux Toolkit 和 SQLite。

## 来源与许可证

本版本基于 [知远智能体](https://github.com/rongxinzy/RongxinAI) 并保留上游历史。项目采用 [AGPL-3.0-only](LICENSE)，第三方组件保留各自许可证与署名。
