<!--
SYNC IMPACT REPORT
==================
Version change: (none, first ratification) → 1.0.0
Modified principles: N/A (initial ratification; all five principles newly defined)
Added sections:
  - Core Principles (I. 上游基线与定制边界; II. 交付平台约束;
    III. 质量验证优先 (NON-NEGOTIABLE); IV. 安全与凭据边界; V. 简单性与可追溯性)
  - 交付与发布约束
  - 开发工作流与质量门禁（含大文件修改注释约束）
  - Governance
Removed sections: N/A
Follow-up TODOs:
  - RATIFICATION_DATE 采用今天日期 2026-09-16（项目无更早采纳记录）。
  - 后续如新增或删减原则，按 Governance 的语义化版本规则递增版本号。
-->
# 晓软Agent 定制版 Constitution

## Core Principles

### I. 上游基线与定制边界

本项目是知远智能体（`rongxinzy/RongxinAI`）的公开定制版，基线 commit 为
`cc7bf4ef66312f88ad06058d58e8ec8ec00167ac`。所有改动 MUST 以"移植定制"而非重写的方式
进行：上游版权、AGPL-3.0-only 许可证及第三方运行时来源不因换牌而转移。产品身份统一为
「晓软智能体」（应用 ID `com.xiaoruan.agent`，数据目录 `XiaoruanAgent` / `xiaoruan.sqlite`），
身份文案 MUST 由 `src/main/productIdentity.ts` 统一管理，不得从源码、仓库或依赖推断公司归属。
上游的产品账号登录、游客认证、官方免费模型、自动更新等能力已移除，MUST NOT 在定制开发中
重新引入或复活其入口。

### II. 交付平台约束

内置模型调用 MUST 仅使用客户绑定的 AISphere 服务下发的模型目录：按顺序校验
`/v1/agent/is_aisphere` 与 `/v1/agent/models`，模型凭据仅保存在主进程内存，不进入前端配置
或日志。平台识别当前仅校验发现响应与目录结构（无密码学认证），这一边界 MUST 在交付文档中
如实说明，不得宣称"仅能连接交付方真实部署的 AISphere"。允许为 AISphere 请求放行 HTTP 与
证书校验失败的 HTTPS，但 MUST NOT 修改全局 TLS 设置或跟随重定向。交付平台为 Windows x64
安装包；macOS/Linux 源码支持不构成交付验收。联网搜索、消息渠道、远程 MCP 等外部资源依赖
MUST 在交付时逐项盘点并说明。

### III. 质量验证优先 (NON-NEGOTIABLE)
每次修改代码之后要检验下是否有冗余代码，如有冗余代码则要进行剔除；
提交代码前 MUST 通过本地质量门禁：`npm run lint`（oxlint + 主题检查/审计）与 `npm test`。
改动主题或品牌资源后 MUST 运行 `bun run theme:generate` 并通过 `theme:check` 与
`theme:audit`。涉及渲染器打包体积的改动 MUST 满足 bundle budget 检查
（`npm run test:bundle-budget`）。源码 CI 通过不等于交付验收：每次正式交付 MUST 重新记录
实际源码 commit、构建运行链接、安装包公开链接及 SHA-256、Windows 验证记录（全新安装、启动、
覆盖安装、数据保留、卸载）和客户 AISphere 联调结果；本地模拟验证不能替代真实平台与
安装包验收。

### IV. 安全与凭据边界

安装包只上传到专用 R2 桶 `xiaoruan-releases`，凭据 MUST 是仅允许该桶 Object Read & Write
的最小权限密钥，MUST NOT 复用原官网存储凭据，MUST NOT 向本仓库复制上游发布密钥。公开下载
地址与上传凭据分离，下载者无需 R2 凭据；缺少凭据时构建 MUST 在打包前报错，不得回退到其他
存储。R2 访问仅通过 GitHub Environment `xiaoruan-release`（仅 main 分支）。在线更新已关闭
（`publish: null`，无更新 IPC/UI），MUST NOT 重新引入自动更新通道。

### V. 简单性与可追溯性

发布流程保持两步：Windows x64 构建并检查 → 直接上传独立 R2；不设候选晋级、官网桶、
stable 清单或更新 feed。每次交付 MUST 可追溯：对象键包含源码 commit、运行编号与重试编号，
`packages.json` 记录 commit、文件大小、SHA-256 与 `downloadUrl`，上传后 MUST 复核远端
元数据。不把旧运行的下载链接当作最新版本分发。实现遵循 YAGNI：不确定的需求先澄清再落码，
不预留没有交付依据的功能开关。

## 交付与发布约束

- 打包入口：main 分支手动运行 [Build Xiaoruan Windows package to R2 (manual)](
  https://github.com/rongxinzy/xiaoruan-ai-agent/actions/workflows/build-platforms.yml)；
  普通 push/PR 仅做质量验证。上传中断时通过 [Store Xiaoruan packages in R2](
  https://github.com/rongxinzy/xiaoruan-ai-agent/actions/workflows/upload-custom-packages.yml)
  以 `source-run-id` 复传，仅复用 `windows-build` 制品。
- 本地打包使用 `npm run dist:win`（等价于 `dist:win:offline`），产物在 `release/` 目录；
  本地产物同样 MUST 记录版本、commit 与 SHA-256 后再分发。
- 分发材料 MUST 附：产品版本、完整源码 commit、构建运行链接、安装包公开链接及 SHA-256、
  Windows 验证记录、客户 AISphere 联调结果和已知限制。
- 交付验收快照记录于 `CUSTOMIZATION.md`（交付验收记录），每版更新，不做自动滚动结论。

## 开发工作流与质量门禁

- 环境按 README 固定：Git、Node.js 24.x、Bun（版本以 `package.json` `packageManager`
  为准）；依赖安装使用 `bun install --frozen-lockfile`。
- 日常验证：`npm run lint`、`npm test`；主题/品牌改动追加 `theme:check`、`theme:audit`；
  渲染器体积改动追加 `npm run test:bundle-budget`。
- **大文件修改注释（强制）**：每次对大文件（新增大量代码或对既有逻辑做大幅修改）进行
  修改时，MUST 在修改处添加注释，格式为 `年/月/日 作者 修改描述`，例如：
  `// 2026/09/16 lixiang 重构会话选择器以支持定时任务会话名显示`。缺少该注释的改动
  视为未完成，不得提交。
- 提交信息与 PR MUST 描述定制边界内的改动；涉及 `src/main/productIdentity.ts`、品牌资源、
  AISphere 调用链或安装器配置的改动 MUST 在 PR 描述中显式指出影响面。
- 行尾遵循仓库已有的 LF 规范化约定（CI 会跨平台归一化文本行尾）。

## Governance

- 本 Constitution 是项目治理的最高约定，与其他文档（README、CUSTOMIZATION.md、DESIGN.md）
  冲突时以本文为准；但本文不覆盖上游许可证义务。
- 修订流程：提出修订 → 在 PR 中说明变更内容与理由 → 通过 `npm run lint` 与 `npm test`
  → 合并后生效。版本号按语义化递增：原则删除或实质重定义为 MAJOR；新增原则或实质扩充为
  MINOR；措辞澄清与非语义修订为 PATCH。
- 所有 PR 与代码审查 MUST 核对是否符合 Core Principles；无法判定的边界问题在 PR 中
  显式列出，不默认放行。
- 运行时开发指引以 README 与 CUSTOMIZATION.md 为准；本文只承载治理规则。


**Version**: 1.0.0 | **Ratified**: 2026-09-16 | **Last Amended**: 2026-09-16
