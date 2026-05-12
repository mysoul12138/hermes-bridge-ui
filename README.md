<p align="center">
  <strong>Hermes Bridge UI</strong>
  <a href="./README_zh.md">中文</a>
</p>

<p align="center">
  Deployment repository for <code>mysoul12138/hermes-bridge-ui</code>.<br/>
  This is the actively deployed custom Web UI variant used in our WSL runtime.
</p>

<p align="center">
  <a href="https://github.com/mysoul12138/hermes-bridge-ui">GitHub Repository</a>
</p>

---

## Overview

This repository is the active deployment target for our customized Hermes Web UI.

- Upstream reference: `EKKOLearnAI/hermes-web-ui`
- Deployment repository: `mysoul12138/hermes-bridge-ui`
- Common deployment environment in our workflow: WSL (`Ubuntu-Hermes`)
- Main release path in our workflow: local build -> replace WSL global dist -> manual restart

It includes custom bridge behavior, session handling fixes, and deployment-specific adaptations that do not belong in the upstream project.

The project itself is not WSL-only. In principle, runtime modes supported by upstream are still intended to be supported here unless a custom adaptation explicitly narrows that behavior.

## Local Development

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- BFF server: `http://localhost:8648`

## Production Build

```bash
npm run build
```

Build artifacts are written to `dist/`.

## WSL Runtime Replacement

In our current deployment workflow, the built `dist/` is copied into the WSL global install path.

Replacement is done with the existing script:

```powershell
powershell.exe -Command "E:\BaiduNetdiskDownload\auto\HermesWebUi_fork_main_latest\scripts\replace-wsl-dist.ps1"
```

After replacement, restart is done manually in WSL:

```bash
hermes-web-ui stop
hermes-web-ui
```

## Runtime Notes

- Hermes runtime data is typically stored under `~/.hermes`
- Web UI runtime data is typically stored under `~/.hermes-web-ui`
- This repository is the deployment-facing codebase; upstream installation and release instructions do not fully apply here
- Upstream-supported runtime targets are still relevant; this README only emphasizes the deployment path we actually use most often

## Repository Role

This repository is for:

- deployment-ready source
- custom session / bridge fixes
- release builds used by the WSL runtime

This repository is not for:

- upstream merge staging
- preserving upstream marketing/documentation as-is

## Architecture

```text
Browser -> BFF (Koa, :8648) -> Hermes Gateway (:8642)
                |
                +-> Hermes CLI / local DB / bridge adaptations
                +-> ~/.hermes/config.yaml
                +-> ~/.hermes/auth.json
                +-> ~/.hermes-web-ui
```

## Upstream Sync Note

Upstream fixes and features are reviewed selectively, then absorbed here only when they fit our custom runtime and workflow.

Do not assume that every upstream README change, Docker change, or release instruction should be mirrored directly into this repository.
