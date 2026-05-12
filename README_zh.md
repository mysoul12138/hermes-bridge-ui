<p align="center">
  <strong>Hermes Bridge UI</strong>
  <a href="./README.md">English</a>
</p>

<p align="center">
  <code>mysoul12138/hermes-bridge-ui</code> 的部署仓库。<br/>
  这是当前在 WSL 运行环境中实际部署的自定义 Web UI 版本。
</p>

<p align="center">
  <a href="https://github.com/mysoul12138/hermes-bridge-ui">GitHub 仓库</a>
</p>

---

## 项目定位

这个仓库不是上游原仓库，而是当前实际部署版本：

- 上游参考：`EKKOLearnAI/hermes-web-ui`
- 当前部署仓库：`mysoul12138/hermes-bridge-ui`
- 当前常用部署环境：WSL（`Ubuntu-Hermes`）
- 当前常用发布方式：本地构建 -> 替换 WSL 全局 dist -> 手动重启

这里包含了你们自己的 bridge 适配、会话行为修复，以及部署流程相关修改。

这个项目本身不是只支持 WSL。按原则，上游原本支持的常规运行方式，这里也应继续支持；README 这里只是突出你们当前最常用的部署路径。

## 本地开发

```bash
npm install
npm run dev
```

- 前端：`http://localhost:5173`
- BFF 服务：`http://localhost:8648`

## 生产构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## WSL 运行时替换

在当前实际部署工作流里，构建后的 `dist/` 会替换到 WSL 全局安装位置。

替换命令沿用现有脚本：

```powershell
powershell.exe -Command "E:\BaiduNetdiskDownload\auto\HermesWebUi_fork_main_latest\scripts\replace-wsl-dist.ps1"
```

替换后，由用户手动在 WSL 里重启：

```bash
hermes-web-ui stop
hermes-web-ui
```

## 运行说明

- Hermes 数据一般在 `~/.hermes`
- Web UI 运行时数据一般在 `~/.hermes-web-ui`
- 这个仓库是部署目标仓库，不应再直接照搬上游 README 的安装/发布说明
- 上游原本支持的运行目标仍然有参考价值，这里只是把你们当前最常用的部署方式写得更明确

## 仓库职责

这个仓库用于：

- 部署可运行源码
- 自定义 bridge / 会话修复
- 给 WSL 运行环境产出构建

这个仓库不用于：

- 上游合并中转
- 原样保留上游宣传和发布文案

## 架构

```text
浏览器 -> BFF (Koa, :8648) -> Hermes 网关 (:8642)
                |
                +-> Hermes CLI / 本地 DB / bridge 适配
                +-> ~/.hermes/config.yaml
                +-> ~/.hermes/auth.json
                +-> ~/.hermes-web-ui
```

## 上游同步说明

上游修复和功能会先评估，再按当前项目的运行方式和工作流有选择地吸收。

不要默认把上游 README、Docker、发布说明整段照搬到这个仓库里。
