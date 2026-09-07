# 定制版说明

本仓库是晓软政务办公智能体的公开定制版本，源自知远智能体。上游版权、许可证及第三方运行时来源不因换牌而转移。

## 已移除

产品账号登录、登录回调、会话令牌刷新、游客认证、官方免费模型注册及聊天/任务执行路由、官方自动更新 IPC 与 UI、原产品官网与公司宣传入口。

## 保留的在线资源

模型目录（models.rongxzyai.com）、搜索网关（search.rongxzyai.com）、本地推理运行时镜像（rongxinai.krli.org/llamacpp）以及 GitHub 上的技能、渠道和记忆运行时依赖仍沿用上游来源。这些属于资源/可选功能服务，不是本版本提供的免费推理额度；如客户要求完全独立部署，应另行替换其服务地址和资源仓库。第三方模型及渠道登录仍由用户自行配置。

## 发布

自动更新已完全断开，继承的上游工作流已改为仅手动触发。此仓库默认触发的 GitHub Actions 仅执行源码检查；安装包签名、跨平台打包和 Releases 发布应使用本产品自己的配置和凭据。不要向本仓库复制上游发布密钥。

## 品牌资源

产品名称为「晓软政务办公智能体」。应用、托盘、启动页和安装器使用用户提供的晓软科技 R 形标志。原图保存在 `public/brand/xiaoruan-source.jpg`；`public/xiaoruan-mark.png` 是去除底部文字后的白底应用标志。运行 `node scripts/generate-xiaoruan-brand.cjs` 可重新生成各平台图标与字标，需通过 `XIAORUAN_BRAND_FONT` 指定中文字体（macOS 默认使用黑体）。

默认采用浅色政务红，深色与跟随系统仍可选。主题源文件位于 `src/renderer/theme/themes/`，修改后运行 `bun src/renderer/theme/scripts/generate-css.ts`，同时同步 `css/shadcn-token-bridge.css`。启动欢迎页无需登录，展示完整产品名，就绪后淡出；减少动态效果时立即退出。
