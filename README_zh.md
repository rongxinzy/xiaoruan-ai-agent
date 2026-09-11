# 晓软智能体

晓软智能体是面向研究、文档、表格、代码、浏览器操作、消息渠道、技能、MCP 集成和定时任务的桌面 AI 工作台。

本版本无需产品账号登录，不提供内置免费模型或官方模型额度。首次使用请在「设置 → 模型」填写交付方提供的「AISphere地址」，连接成功后选择平台返回的模型，无需手动填写 API Key。

## 定制版边界

- 产品名称：晓软智能体（晓软Agent）。
- 启动欢迎页、关于页、安装器和默认主题使用晓软科技标志与晓软红；支持深色及跟随系统。
- 独立应用标识：`com.xiaoruan.agent`。
- 数据保存在 `XiaoruanAgent`，数据库为 `xiaoruan.sqlite`。不读取或迁移上游应用数据。
- 已移除上游账号认证、游客令牌、免费模型提供商、产品登录回调和自动更新链路。
- 内置模型调用仅使用所绑定 AISphere 服务返回的模型；第三方提供商配置和本地模型入口不开放。保留任务、技能、MCP 和消息渠道能力。
- Windows x64 安装包存放在独立 `xiaoruan-releases` R2 桶，通过公开链接下载，无需存储凭据。在线更新已关闭，版本升级由交付方人工分发新包。

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

1. 使用交付方提供的公开安装包链接下载，并按随包说明核对版本与 SHA-256。开发者可从成功构建的 Actions Summary 或上传回执获取链接，详见 [安装包存储](CUSTOMIZATION.md#安装包存储)。
2. 打开应用，在「设置 → 模型」填写「AISphere地址」，点击「连接并获取模型」，再选择默认模型。
3. 选择项目目录，描述任务，并按需附上资料。
4. 查看执行过程、处理授权请求，检查生成结果后继续追问或修改。

AISphere 地址支持 HTTP、HTTPS；按本定制版要求，HTTPS 证书校验失败也允许连接，兼容范围仅限 AISphere 请求。平台识别、身份认证边界及离线恢复行为见 [定制版说明](CUSTOMIZATION.md#aisphere-模型绑定)。

当前交付流水线只生成 Windows x64 安装包。源码保留 macOS、Linux 的开发能力，不代表这些平台已经完成交付验收。联网搜索、远程 MCP、消息渠道及部分资源安装仍需要对应网络服务，依赖范围见 [保留的在线资源](CUSTOMIZATION.md#保留的在线资源)。

## 工作台外观

主题以插件形式定义在 `src/renderer/theme`。晓软版本默认使用晓软红，并保留上游 Codex、大明风华、长安风物和未央金石主题包。在「设置 → 外观」选择主题以及浅色、深色或跟随系统；背景、字体、圆角、控件与交互状态由整套主题统一定义。

主题开发请参考[主题开发文档](src/renderer/theme/README.md)和[设计规范](DESIGN.md)。

## 开发者快速开始

需要 Git、Node.js **24.x** 和 [`package.json`](package.json) 指定的 Bun。原生依赖无法使用预编译包时，需要 Python 与 C/C++ 构建工具。

```bash
git clone https://github.com/rongxinzy/xiaoruan-ai-agent.git XiaoruanAgent
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

正式分发请从 main 分支运行 Windows 手动打包工作流，并保留源码、构建与安装包回执。交付状态和待验收项目见 [交付验收记录](CUSTOMIZATION.md#交付验收记录)。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| [`src/renderer`](src/renderer) | 工作台、会话、AISphere 设置等 React 界面 |
| [`src/shared`](src/shared) | 共享 UI、类型与通信契约 |
| [`src/main`](src/main) | 桌面生命周期、任务执行、存储与系统服务 |
| [`src/renderer/theme`](src/renderer/theme) | 主题契约、组件外观、背景与生成器 |
| [`SKILLs`](SKILLs) / [`MCPs`](MCPs) | 内置技能与工具集成 |

技术栈包括 Electron、React、TypeScript、Vite、Tailwind CSS、Redux Toolkit 和 SQLite。

## 来源与许可证

本版本基于 [知远智能体](https://github.com/rongxinzy/RongxinAI) 并保留上游历史。项目采用 [AGPL-3.0-only](LICENSE)，第三方组件保留各自许可证与署名。
