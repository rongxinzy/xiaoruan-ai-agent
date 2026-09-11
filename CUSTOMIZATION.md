# 定制版说明

## AISphere 模型绑定

模型设置仅允许填写 HTTP 或 HTTPS 的 AISphere 根地址。客户端按顺序调用 `/v1/agent/is_aisphere` 和 `/v1/agent/models`，仅在两个响应均有效时替换绑定。模型调用使用目录中原样下发的完整 `url`、`name` 和独立 `api_key`；凭据仅保存在主进程内存，不进入前端配置或日志。

前端和智能体通过带随机凭据的本机网关调用模型；主进程排除旧提供商、本地模型和外部地址覆盖。目录短暂缓存 30 秒，刷新失败后禁止新请求，并在 5 秒后自动重试；连续失败时逐步延长重试间隔，最高 60 秒。恢复后自动更新模型列表与连接状态，不自动重发已失败的任务或消息，下架模型不自动替换。更换平台需要先停止任务，并轮换网关凭据。工具能力依据实际响应判断，平台能力声明不作为工具调用的强制禁用开关。

按定制要求，平台发现及模型请求支持 HTTP，以及证书校验失败的 HTTPS。证书兼容仅限这些请求，不修改全局 TLS 设置，禁止跟随重定向。`max_input/max_output: 0` 按未声明限制处理；正的输出上限由网关限制，输入 token 上限由平台按其分词器校验。非空工具模板不执行，思考参数不根据未知模板自动拼装。

以上限制针对应用内置模型调用链，不构成对用户终端脚本或自定义 MCP 网络访问的操作系统级隔离。

当前平台识别只校验 `/v1/agent/is_aisphere` 返回的 `data` 是否为 `ok`，再校验模型目录格式；尚无平台签名或其他身份认证。兼容接口的模拟服务也能通过识别。因此当前保证的是“内置模型请求仅使用所绑定服务下发的模型”；如验收要求“只能连接交付方真实部署的 AISphere”，还需增加平台身份认证并另行验收。

## 上游基线

本版从 `rongxinzy/RongxinAI` 的 `cc7bf4ef66312f88ad06058d58e8ec8ec00167ac`（`feat(runtime): pass model thinking level maps to Pi (#727)`）切出，移植原晓软定制版的品牌、产品边界与独立发布配置。

## 安装包存储

- 在 main 分支手动运行 [Build Xiaoruan Windows package to R2 (manual)](https://github.com/rongxinzy/xiaoruan-ai-agent/actions/workflows/build-platforms.yml)，当前仅构建 Windows x64；普通 push/PR 继续只做质量验证。
- 如构建已完成但上传中断，可在 main 分支手动运行 [Store Xiaoruan packages in R2](https://github.com/rongxinzy/xiaoruan-ai-agent/actions/workflows/upload-custom-packages.yml)，填写原构建的 `source-run-id`；校验来源及 Windows 构建、运行时检查和制品保存步骤成功后，仅复用 `windows-build` 上传。
- 打包验证通过后，安装包上传到独立 R2 桶 `xiaoruan-releases`。对象键包含源码 commit、运行编号、重试编号和文件路径；以该次上传回执中的 `key` 为准。`packages.json` 记录源码 commit、来源构建、文件大小、SHA-256 和每个安装包的 `downloadUrl`，上传后复核远端元数据。GitHub Actions 保留临时制品供排查。
- 候选构建、候选晋级、官网发布和官网 R2 清理工作流已删除。打包流程仅两步：Windows x64 构建并检查 → 直接上传独立 R2，无需晋级；不写官网桶、stable 清单、更新 feed 或 Pages。
- GitHub Environment `xiaoruan-release` 仅允许 main 分支。变量 `XIAORUAN_R2_ACCOUNT_ID` 指定账户；Secrets `XIAORUAN_R2_ACCESS_KEY_ID`、`XIAORUAN_R2_SECRET_ACCESS_KEY` 必须是只允许 `xiaoruan-releases` 的 Object Read & Write 凭据。禁止复用原官网存储凭据。
- 安装包通过 `https://pub-d84d8bc650334c12afc7ce47bc8fcdda.r2.dev` 公开下载，下载者无需 R2 凭据。公开读取与上传写入权限分离，上传仍使用上述专用凭据；缺少凭据时在构建前报错，不回退到其他存储。
- 获取链接：打开成功构建或补传运行的 Summary，找到 `Xiaoruan installer downloads`；上传步骤日志也会打印 `Public download:`。还可下载该运行的 `xiaoruan-r2-upload-receipt` 制品，读取 `packages.json` 中的 `downloadUrl`。分发时附上同一回执中的 commit、文件大小和 SHA-256；不要把旧运行的链接当作最新版本。公开地址不是目录列表，也不是自动更新 feed。

本仓库是晓软智能体的公开定制版本，源自知远智能体。上游版权、许可证及第三方运行时来源不因换牌而转移。

## 已移除

产品账号登录、登录回调、会话令牌刷新、游客认证、官方免费模型注册及聊天/任务执行路由、官方自动更新 IPC 与 UI、原产品官网与公司宣传入口。

## 保留的在线资源

| 资源 | 用途与交付边界 |
| --- | --- |
| AISphere | 由交付方提供客户可达的地址和部署环境，提供模型目录、凭据和推理服务。客户端不附赠模型额度。 |
| 搜索网关 `search.rongxzyai.com` | 联网搜索仍沿用上游服务。仅部署内网 AISphere 不代表联网搜索可离线运行。 |
| GitHub 技能、渠道和记忆运行时资源 | 构建、资源安装或相关功能仍可能访问上游资源仓库；随包提供哪些资源，以具体安装包验证结果为准。 |
| 消息渠道、邮箱、远程 MCP | 由用户配置对应服务和授权，需要客户环境能访问这些服务。 |

模型仅来自 AISphere，模型市场和本地模型入口不开放。当前版本不承诺完全离线运行或全部外部资源独立部署；如客户有这些要求，需盘点网络访问、替换对应服务或预置资源后单独验收。

## 发布

在线更新已关闭：启动时不检查更新，关于页和托盘没有检查、下载或安装更新入口，主进程和 preload 不提供更新 IPC，安装器配置为 `publish: null`。版本升级通过人工分发并安装新包完成。

此仓库默认触发的 GitHub Actions 仅执行源码检查；手动打包仅生成 Windows x64 安装包，检查通过后直接存入专用 R2。候选与官网发布工作流已删除。不要向本仓库复制上游发布密钥。

## 交付验收记录

以下是 **2026-09-11** 的检查快照，不是后续版本的自动验收结论：

| 项目 | 已有证据 | 待完成事项 |
| --- | --- | --- |
| 源码与 CI | 主分支 `8c379df4` 的 [Custom edition CI](https://github.com/rongxinzy/xiaoruan-ai-agent/actions/runs/34565719909) 通过，已包含 AISphere 修复及上游 PR #757、#758 的移植。 | 每次交付重新记录实际源码 commit 和对应检查结果。 |
| 模拟平台验证 | 本地模拟服务及 Electron 已验证平台识别、模型列表、流式对话和自动恢复；用户已完成本地模拟验证。 | 模拟回复不代表真实大模型或工具调用的验收结果。 |
| 客户 AISphere | 当前开发环境未完成客户内网平台联调。 | 在客户网络验证实际模型、凭据、流式响应、工具调用、超时和断网恢复。 |
| Windows 安装包 | 最近已核对的成功构建为 [34311772130](https://github.com/rongxinzy/xiaoruan-ai-agent/actions/runs/34311772130)，源码为 `e8f65b35`，不包含后续 AISphere 和品牌改动。 | 从待交付 main 提交重新构建，完成全新安装、启动、覆盖安装、数据保留与卸载验证，并验证公开链接和下载文件哈希。 |
| 平台身份约束 | 已限制应用内置模型路由，平台身份校验范围见本文首节。 | 如真实平台身份是硬性验收项，需要实现认证并通过验收。 |

正式交付时应附：产品版本、完整源码 commit、构建运行链接、安装包公开链接及 SHA-256、Windows 验证记录、客户 AISphere 联调结果和已知限制。源码 CI 通过或本地模拟通过，均不能替代安装包与客户环境验收。

## 品牌资源

产品名称为「晓软智能体」。应用、托盘、启动页和安装器使用用户提供的晓软科技 R 形标志。原图保存在 `public/brand/xiaoruan-source.jpg`；`public/xiaoruan-mark.png` 是去除底部文字后的白底应用标志。运行 `node scripts/generate-xiaoruan-brand.cjs` 可重新生成各平台图标与字标，需通过 `XIAORUAN_BRAND_FONT` 指定中文字体（macOS 默认使用黑体）。

默认采用「晓软红」主题包的浅色外观，深色与跟随系统仍可选。品牌色通过 `src/renderer/theme/themes/xiaoruan.ts` 定义，在 `themes/plugins.ts` 注册，遵循统一 token 和组件外观契约；不修改其他主题或通用语义桥接色。修改后运行 `bun run theme:generate`，并通过 `theme:check` 和 `theme:audit`。启动欢迎页无需登录，展示完整产品名，就绪后淡出；减少动态效果时立即退出。

## 身份文案与交付工作区

任务、IM 对话/任务及新建工作区的默认身份统一由 `src/main/productIdentity.ts` 管理。自我介绍只使用本产品名称，公司归属依据经核实的交付信息回答，不从源码、仓库或依赖推断。随包系统提示词和技能说明已去除上游品牌宣传；网站仅在法律版权行保留上游作者署名。

新建默认对话目录为 `~/.xiaoruan/scratch`，任务目录标识为 `.xiaoruan-tasks`，缺少项目路径的记录使用 `~/xiaoruan/project`。不迁移或删除原版目录；已有用户指定路径继续保留。

已有客户自定义系统提示词、`IDENTITY.md` 和历史会话不会被自动重写。交付新客户应使用新工作区；曾运行旧测试版本的工作区可能保留当时保存的身份文案。协议名、数据库表名、依赖目录等内部标识，以及上述资源服务域名继续保留。
