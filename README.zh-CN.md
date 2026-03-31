<p align="center">
  <img src="./docs/assets/pocket-codex-hero.png" alt="Pocket Codex hero" width="960" />
</p>

<p align="center">
  <a href="https://github.com/stevenjinlong/PocketCodex/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Stars&color=0A66FF" />
  </a>
  <a href="https://github.com/stevenjinlong/PocketCodex/forks">
    <img alt="GitHub forks" src="https://img.shields.io/github/forks/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Forks&color=2563EB" />
  </a>
  <a href="https://github.com/stevenjinlong/PocketCodex/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/stevenjinlong/PocketCodex?style=for-the-badge&logo=github&label=Issues&color=0F766E" />
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

# Pocket Codex

Pocket Codex 是一个面向本地 Codex runtime 的 Web UI 和控制平面。

这个项目由四部分组成：

- `web`：浏览器前端
- `gateway`：HTTP + WebSocket 控制平面服务
- `agent`：运行在本地机器上的守护进程，负责连接 Codex 和工作目录
- `postgres`：数据库，用来存用户、主机、浏览器设备、配对信息和 relay session 元数据

这个项目最重要的设计点是：

- `web + gateway + postgres` 可以部署在一台服务器上
- `agent` 应该运行在真正持有代码仓库和 Codex runtime 的机器上

线程内容本身不是以产品数据库为事实来源存储的。数据库只保存控制平面数据。

## 截图

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./docs/assets/screenshots/dashboard-dark.png" alt="Pocket Codex dark workspace" />
    </td>
    <td width="50%" valign="top">
      <img src="./docs/assets/screenshots/dashboard-light.png" alt="Pocket Codex light workspace" />
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="./docs/assets/screenshots/auth-screen.png" alt="Pocket Codex authentication screen" />
    </td>
  </tr>
</table>

## 架构

```text
浏览器
  -> web
  -> gateway (HTTP + WebSocket)
  -> postgres

真实机器上的 Agent
  -> gateway (WebSocket)
  -> 本地 Codex runtime
  -> 本地文件系统 / git / shell
```

## 各服务职责

### `web`

- 用户登录
- 配对 UI
- 聊天 UI
- 运行时控制

### `gateway`

- 鉴权
- 浏览器 / 设备信任
- 主机注册
- pairing token 创建与认领
- 浏览器与 agent 间的 WebSocket relay
- 安全会话建立

### `agent`

- 将一台机器连接到 gateway
- 与本地 Codex runtime 通信
- 读取线程和 turn
- 在本地工作目录执行命令

### `postgres`

存储内容：

- users
- browser_devices
- hosts
- pairings
- relay_sessions
- gateway_config

## 运行要求

- Node.js 22+
- npm 10+
- Docker / Docker Compose，用于默认的 DB 模式
- 任意运行 `agent` 的机器上都需要有可用的 `codex` CLI/runtime

## 默认模式

gateway 默认后端是 `postgres`。

`json` 模式仍然保留，适合本地调试，但正常使用和部署都建议走 DB 模式。

## 快速开始

### 方案 A：最简单的本地启动

在当前机器上运行 `web + gateway + postgres`，然后在同一台机器上运行 `agent`。

```sh
npm install
cp .env.example .env
npm run stack:up
npm run start --workspace @pocket-codex/agent -- --pair
```

启动后会得到：

- web：`http://localhost:3000`
- gateway：`http://localhost:8787`
- postgres：`localhost:5432`

### 方案 B：数据库走 Docker，应用跑在宿主机

如果你希望 `web` 和 `gateway` 有热更新，可以用这个方式。

```sh
npm install
cp .env.example .env
npm run db:up
npm run dev:gateway
npm run dev:web
npm run start --workspace @pocket-codex/agent -- --pair
```

### 方案 C：传统 JSON 模式

如果你明确想绕过 Postgres：

```env
POCKET_CODEX_STORAGE_BACKEND=json
DATABASE_URL=
DATABASE_URL_DOCKER=
```

然后执行以下任意一种：

```sh
npm run dev:gateway:json
```

或：

```sh
npm run stack:up:json
```

## 常用命令

### 整个工作区

```sh
npm install
npm run build
npm run typecheck
```

### Docker 整套服务

```sh
npm run stack:up
npm run stack:up:postgres
npm run stack:up:json
npm run stack:down
npm run stack:logs
```

### 只操作数据库

```sh
npm run db:up
npm run db:down
npm run db:logs
npm run db:reset
```

### 宿主机原生开发

```sh
npm run dev:web
npm run dev:gateway
npm run dev:gateway:json
npm run dev:agent
```

### 指定 workspace 的例子

```sh
npm run build --workspace @pocket-codex/gateway
npm run typecheck --workspace @pocket-codex/web
npm run start --workspace @pocket-codex/agent -- --pair
```

## 如何配对一台主机

用 `--pair` 启动 agent：

```sh
npm run start --workspace @pocket-codex/agent -- --pair
```

agent 会打印出：

- QR code
- 原始 pairing payload JSON
- 一个短时有效的 `pair_...` token

然后在浏览器里：

1. 登录账号
2. 打开 setup / pairing 面板
3. 粘贴 pairing payload 或 token
4. 绑定这台 host

pairing token 的特点：

- 绑定到一台具体 host
- 有效期 10 分钟
- 只能使用一次
- 通过 gateway 完成认领

## 推荐部署模型

如果别人想把这个项目部署成一个真正的网站，推荐这样拆分：

### 服务器端

在一台服务器上运行：

- `web`
- `gateway`
- `postgres`
- 可选的反向代理，例如 `nginx` 或 `caddy`

### 用户机器

每个真实用户自己的电脑上运行：

- `agent`

这意味着：

- 网站是共享的
- gateway 是共享的
- 数据库是共享的
- 但每个用户仍然在自己的机器上执行真实任务

## 在一台服务器上部署 `web + gateway + postgres`

推荐的域名拆分：

- `app.example.com` -> `web`
- `gateway.example.com` -> `gateway`

一个示例 `.env`：

```env
NEXT_PUBLIC_GATEWAY_HTTP_URL=https://gateway.example.com
NEXT_PUBLIC_GATEWAY_WS_URL=wss://gateway.example.com/ws/browser
POCKET_CODEX_WEB_ORIGIN=https://app.example.com

POCKET_CODEX_STORAGE_BACKEND=postgres

DATABASE_URL=postgres://pocket_codex:YOUR_PASSWORD@localhost:5432/pocket_codex
DATABASE_URL_DOCKER=postgres://pocket_codex:YOUR_PASSWORD@postgres:5432/pocket_codex

POSTGRES_DB=pocket_codex
POSTGRES_USER=pocket_codex
POSTGRES_PASSWORD=YOUR_PASSWORD
POSTGRES_PORT=5432
```

启动服务器侧服务：

```sh
npm install
docker compose up -d --build
```

健康检查：

```sh
curl http://localhost:8787/health
```

## 在另一台机器上运行 `agent`

在远程机器上执行：

```sh
git clone <your-fork-or-repo>
cd PocketCodex
npm install

POCKET_CODEX_GATEWAY_WS_URL=wss://gateway.example.com/ws/agent \
npm run start --workspace @pocket-codex/agent -- --pair
```

agent 使用的 WebSocket 路径是：

- 浏览器：`/ws/browser`
- agent：`/ws/agent`

所以 agent 的地址应该类似：

```text
wss://gateway.example.com/ws/agent
```

只要浏览器和 agent 指向同一个 gateway，pairing token 就能正常工作。

## 示例：宿主机 + 虚拟机联调

如果你想本地模拟“主机跑服务，虚拟机跑 agent”，可以这么做。

### 宿主机

执行：

```sh
npm install
cp .env.example .env
npm run stack:up
```

### 虚拟机

不要用 `localhost`，要用宿主机 IP：

```sh
POCKET_CODEX_GATEWAY_WS_URL=ws://HOST_IP:8787/ws/agent \
npm run start --workspace @pocket-codex/agent -- --pair
```

要点：

- 虚拟机里的 `localhost` 指的是虚拟机自己
- 虚拟机必须连宿主机 IP，而不是 `localhost`

## 环境变量

完整变量见 [.env.example](./.env.example)。

最重要的是这些：

| 变量 | 用于 | 作用 |
| --- | --- | --- |
| `NEXT_PUBLIC_GATEWAY_HTTP_URL` | web | 浏览器访问 gateway 的 HTTP 地址 |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | web | 浏览器访问 gateway 的 WebSocket 地址 |
| `POCKET_CODEX_WEB_ORIGIN` | gateway | 允许的浏览器来源 |
| `POCKET_CODEX_STORAGE_BACKEND` | gateway | `postgres` 或 `json` |
| `DATABASE_URL` | 宿主机原生 gateway | 本地进程模式下的 Postgres 地址 |
| `DATABASE_URL_DOCKER` | Docker 内 gateway | Compose 网络中的 Postgres 地址 |
| `POCKET_CODEX_GATEWAY_WS_URL` | agent | agent 连接 gateway 的 WebSocket 地址 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_PORT` | postgres | 数据库配置 |

## 为什么有两个数据库 URL

这是正常的：

```env
DATABASE_URL=postgres://pocket_codex:pocket_codex@localhost:5432/pocket_codex
DATABASE_URL_DOCKER=postgres://pocket_codex:pocket_codex@postgres:5432/pocket_codex
```

原因：

- `DATABASE_URL` 给运行在宿主机上的进程使用
- `DATABASE_URL_DOCKER` 给 Docker Compose 里的 `gateway` 容器使用

在 Compose 里，`postgres` 是服务名。  
如果在 `gateway` 容器里用 `localhost`，那只会指向容器自己，而不是数据库容器。

## 存储模式

### `postgres`

- 默认模式
- 推荐模式
- 正式部署必须使用

### `json`

- 只适合本地 fallback
- 适合调试
- 不推荐用于真实多用户部署

## 验证方式

构建和类型检查：

```sh
npm run typecheck
npm run build
```

gateway 健康检查：

```sh
curl http://localhost:8787/health
```

查看数据库表：

```sh
docker exec pocketcodex-postgres-1 psql -U pocket_codex -d pocket_codex -c '\dt'
```

## 故障排查

### `localhost:3000` 显示的还是旧 UI

通常是你还在看旧的 Docker 容器，或者旧的本地 dev 进程。

可以尝试：

- 重建 `web` 容器
- 或停止旧容器后执行 `npm run dev:web`

### gateway 在 Docker 里连不上 Postgres

请使用：

```env
DATABASE_URL_DOCKER=postgres://...@postgres:5432/...
```

不要在 `gateway` 容器里使用 `localhost`。

### pairing token 不能用

检查：

- token 是否过期
- token 是否由连接到同一 gateway 的 agent 生成
- 浏览器是否登录到了同一个部署
- 这台 host 是否已被其他账号绑定

### 另一台机器上的 agent 连不上

检查：

- 防火墙规则
- gateway 主机名 / IP 是否正确
- `POCKET_CODEX_GATEWAY_WS_URL`
- 这台机器是否真的能访问 `8787`

## 本地 agent 状态文件

agent 身份信息保存在：

```text
~/.pocket-codex/agent.json
```

里面包含：

- `hostId`
- `hostSecret`
- `displayName`

不要随意提交或分享这个文件。

## License

仓库目前还没有附带 license 文件。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=stevenjinlong/PocketCodex&type=Date)](https://www.star-history.com/#stevenjinlong/PocketCodex&Date)
