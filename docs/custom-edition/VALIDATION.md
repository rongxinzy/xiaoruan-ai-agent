# 定制版验证

基线：`4b09981f7f7c454664ce212f06311c7a54682596`。验证日期：2026-09-07。

- 17 个相关测试文件、282 项测试通过，覆盖模型注册、可用模型列表、任务模型代理、应用身份隔离及安装器引用等。
- `npm run lint`、渲染进程 TypeScript、主进程 TypeScript、`npm run build` 通过。
- Electron 使用临时数据目录启动，不修改系统登录项。生产构建能够进入首页、打开设置和关于页，页面无未捕获渲染错误。
- preload 的 `auth`、`modelPool`、`appUpdate` 均不存在。首次启动无产品登录按钮。
- React 与 React DOM 使用 Vite 的 `resolve.dedupe` 统一解析，避免首次启动的重复 React 实例错误。

截图：[首页](home.png)、[关于](about.png)。

未验证：真实付费 API 请求、外部渠道收发、Windows/Linux 安装包、代码签名与公证。独立副本尚未下载可选的渠道、记忆和 Python 运行时，启动日志会提示其缺失；这不影响本次验证的首页与设置流程。构建仍有上游大分块和第三方 `import.meta` 的打包警告。
