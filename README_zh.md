# 晓软政务办公智能体

面向定制交付的桌面 AI 助手，支持任务执行、对话、技能、MCP、定时任务和本地模型。

本版本无需产品账号登录，不提供内置免费模型或官方模型额度。首次使用请在设置中配置自己的模型服务地址和 API Key，或启动本地模型。

## 定制版边界

- 产品名称：晓软政务办公智能体（Xiaoruan Government Office Agent）。
- 使用晓软科技标志，默认浅色政务红，支持深色及跟随系统；启动欢迎页、关于页与安装器统一品牌。
- 独立应用标识：`com.xiaoruan.agent`。
- 独立数据目录：系统应用数据目录下的 `XiaoruanAgent`，数据库为 `xiaoruan.sqlite`。不读取或迁移上游应用数据。
- 已移除上游账号认证、游客令牌、免费模型提供商、产品登录回调和自动更新链路。
- 保留用户自行配置的第三方模型授权、本地推理、任务、技能、MCP 和渠道能力。
- 后续安装包通过本仓库 Releases 手动发布和安装。

## 开发

要求 Node.js 24、Bun 1.3 及以上。

```bash
bun install --frozen-lockfile
npm run electron:dev
```

```bash
npm run lint
npm test
npm run build
```

平台打包命令见 `package.json`。运行时资源下载与部分可选在线功能仍使用上游资源服务，详见 [CUSTOMIZATION.md](CUSTOMIZATION.md)。本仓库不含上游账号或发布凭据。

## 来源与许可

基于 [知远智能体](https://github.com/rongxinzy/RongxinAI) 的 `4b09981f7f7c454664ce212f06311c7a54682596` 创建，保留原有 Git 历史。

项目沿用 [AGPL-3.0-only](LICENSE)，第三方组件保留各自许可证与署名。产品品牌变更不改变这些许可。
