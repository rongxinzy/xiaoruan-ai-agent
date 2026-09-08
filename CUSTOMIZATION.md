# 定制版说明

## 安装包存储

- 手动运行 `Build Xiaoruan Windows package to private R2 (manual)`，当前仅构建 Windows x64；普通 push/PR 继续只做质量验证。
- 如构建已完成但上传中断，可手动运行 `Store Xiaoruan packages in private R2`，填写原构建的 `source-run-id`；校验来源及 Windows 构建、运行时检查和制品保存步骤成功后，仅复用 `windows-build` 上传。
- 打包验证通过后，安装包上传到独立私有 R2 桶 `xiaoruan-releases`，路径为 `builds/<commit>/<run-id>/<attempt>/<artifact>/<filename>`。同目录 `packages.json` 记录大小和 SHA-256，上传后复核远端元数据。GitHub Actions 保留临时制品供排查。
- 候选构建、候选晋级、官网发布和官网 R2 清理工作流已删除。打包流程仅两步：Windows x64 构建并检查 → 直接上传独立 R2，无需晋级；不写官网桶、stable 清单、更新 feed 或 Pages。
- GitHub Environment `xiaoruan-release` 仅允许 main 分支。变量 `XIAORUAN_R2_ACCOUNT_ID` 指定账户；Secrets `XIAORUAN_R2_ACCESS_KEY_ID`、`XIAORUAN_R2_SECRET_ACCESS_KEY` 必须是只允许 `xiaoruan-releases` 的 Object Read & Write 凭据。禁止复用原官网存储凭据。
- 不启用 r2.dev 公开访问或官网域名。通过 R2 控制台或经过授权的 S3 客户端取包。缺少专用凭据时，普通打包工作流在构建前报错，不回退到其他存储。

本仓库是晓软AI智能体的公开定制版本，源自知远智能体。上游版权、许可证及第三方运行时来源不因换牌而转移。

## 已移除

产品账号登录、登录回调、会话令牌刷新、游客认证、官方免费模型注册及聊天/任务执行路由、官方自动更新 IPC 与 UI、原产品官网与公司宣传入口。

## 保留的在线资源

模型目录（models.rongxzyai.com）、搜索网关（search.rongxzyai.com）、本地推理运行时镜像（rongxinai.krli.org/llamacpp）以及 GitHub 上的技能、渠道和记忆运行时依赖仍沿用上游来源。这些属于资源/可选功能服务，不是本版本提供的免费推理额度；如客户要求完全独立部署，应另行替换其服务地址和资源仓库。第三方模型及渠道登录仍由用户自行配置。

## 发布

在线更新已关闭：启动时不检查更新，关于页和托盘没有检查、下载或安装更新入口，主进程和 preload 不提供更新 IPC，安装器配置为 `publish: null`。版本升级通过人工分发并安装新包完成。

此仓库默认触发的 GitHub Actions 仅执行源码检查；手动打包仅生成 Windows x64 安装包，检查通过后直接存入专用 R2。候选与官网发布工作流已删除。不要向本仓库复制上游发布密钥。

## 品牌资源

产品名称为「晓软AI智能体」。应用、托盘、启动页和安装器使用用户提供的晓软科技 R 形标志。原图保存在 `public/brand/xiaoruan-source.jpg`；`public/xiaoruan-mark.png` 是去除底部文字后的白底应用标志。运行 `node scripts/generate-xiaoruan-brand.cjs` 可重新生成各平台图标与字标，需通过 `XIAORUAN_BRAND_FONT` 指定中文字体（macOS 默认使用黑体）。

默认采用浅色政务红，深色与跟随系统仍可选。主题源文件位于 `src/renderer/theme/themes/`，修改后运行 `bun src/renderer/theme/scripts/generate-css.ts`，同时同步 `css/shadcn-token-bridge.css`。启动欢迎页无需登录，展示完整产品名，就绪后淡出；减少动态效果时立即退出。

## 身份文案与交付工作区

任务、IM 对话/任务及新建工作区的默认身份统一由 `src/main/productIdentity.ts` 管理。自我介绍只使用本产品名称，公司归属依据经核实的交付信息回答，不从源码、仓库或依赖推断。随包系统提示词和技能说明已去除上游品牌宣传；网站仅在法律版权行保留上游作者署名。

新建默认对话目录为 `~/.xiaoruan/scratch`，任务目录标识为 `.xiaoruan-tasks`，缺少项目路径的记录使用 `~/xiaoruan/project`。不迁移或删除原版目录；已有用户指定路径继续保留。

已有客户自定义系统提示词、`IDENTITY.md` 和历史会话不会被自动重写。交付新客户应使用新工作区；曾运行旧测试版本的工作区可能保留当时保存的身份文案。协议名、数据库表名、依赖目录等内部标识，以及上述资源服务域名继续保留。
