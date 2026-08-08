# 贵金属行情 · ICBC Gold Price

一个自托管的工商银行账户贵金属行情采集与可视化服务。项目定时采集黄金、白银、铂金、钯金的人民币和美元报价，保存到 SQLite，并提供实时看板和历史查询 API。

> 数据仅供展示，不构成投资建议。

## 功能概览

- 采集 8 个账户贵金属品种：人民币/美元账户黄金、白银、铂金、钯金。
- 后台默认每 30 秒拉取一次 ICBC 行情，支持超时、随机抖动和失败退避。
- 首页展示最新价格、涨跌幅、迷你走势及可交互历史图表。
- 支持明亮、黑暗和跟随系统三种主题，并在浏览器中保存选择。
- 支持中文、英文和自动检测浏览器语言；语言与主题偏好统一放在设置菜单中。
- 支持 `1h`、`6h`、`24h`、`7d`、`30d`、`90d` 和全部历史区间。
- 近期开盘明细与长期小时 OHLC 两级存储，控制 SQLite 数据规模。
- 历史查询由服务端自动降采样，避免长周期返回过多数据。
- 提供多阶段、多架构 Docker 镜像及 SQLite 在线备份脚本。

## 技术栈

- Next.js 15（App Router）与 React 19
- TypeScript
- Tailwind CSS
- SQLite 与 `better-sqlite3`
- `undici`，用于配置 ICBC 接口所需的旧版 TLS 兼容

## 快速开始

环境要求：

- Node.js 20+
- npm

安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

访问 <http://localhost:3000>。首次请求任意 `/api/prices/*` 接口时会启动后台采集器并立即执行一次采集，因此刚打开页面时可能短暂显示“等待采集”。

常用命令：

```bash
npm run dev       # 启动开发服务器
npm run lint      # 运行 Next.js lint
npm run build     # 创建生产构建
npm start         # 启动已构建的生产服务
```

运行时数据默认写入 `./data/gold.sqlite`。`data/`、备份、日志和本地环境变量文件均已被 Git 忽略。

## 系统架构

```text
ICBC 行情接口
      │
      ▼
poller：拉取、校验、标准化
      │
      ▼
SQLite
  ├─ price_snapshots：近期高频明细
  └─ price_hourly：长期小时 OHLC
      │
      ▼
Next.js Route Handlers
      │
      ▼
React 行情看板
```

采集器采用懒启动方式：API 路由导入 `src/lib/bootstrap.ts`，后者在当前 Node.js 进程中只启动一个轮询循环。构建阶段不会访问 ICBC。

默认保留最近 72 小时的高频明细。维护任务将所有已完成小时聚合为 OHLC 后，再清理超期明细；小时数据长期保留。SQLite 使用 WAL 模式，以支持采集写入期间的并发查询。

## 支持的品种

| Key | 品种 | 计价单位 |
| --- | --- | --- |
| `cny-gold` | 人民币账户黄金 | 元/克 |
| `cny-silver` | 人民币账户白银 | 元/克 |
| `cny-platinum` | 人民币账户铂金 | 元/克 |
| `cny-palladium` | 人民币账户钯金 | 元/克 |
| `usd-gold` | 美元账户黄金 | 美元/盎司 |
| `usd-silver` | 美元账户白银 | 美元/盎司 |
| `usd-platinum` | 美元账户铂金 | 美元/盎司 |
| `usd-palladium` | 美元账户钯金 | 美元/盎司 |

涨跌颜色遵循 A 股习惯：涨红、跌绿。

## HTTP API

所有接口均为动态响应，不使用 Next.js 缓存。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/prices/latest` | 最近一次持久化快照、迷你走势、品种元数据和库存统计 |
| GET | `/api/prices/now` | 直接请求 ICBC 的实时价格，不写入 SQLite |
| GET | `/api/prices/history?metal=cny-gold&range=24h` | 指定品种和区间的历史序列 |
| GET | `/api/prices/metals` | 品种元数据和库存统计 |

历史查询参数：

- `metal`：上表中的品种 Key，默认 `cny-gold`；未知值返回 HTTP 400。
- `range`：`1h | 6h | 24h | 7d | 30d | 90d | all`，无效值回退到 `24h`。

`/api/prices/now` 只用于页面的“立即刷新”。它不会改变已保存的最新快照，下一次普通自动刷新仍以采集器写入的数据为准。服务端默认缓存成功结果 10 秒，并合并同时发生的请求；上游失败后也会进入同样时长的冷却，期间返回 HTTP 503 和 `Retry-After`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `DATA_DIR` | `./data` | SQLite 文件目录；Docker 中为 `/app/data` |
| `DB_PATH` | `<DATA_DIR>/gold.sqlite` | 显式指定数据库文件路径 |
| `POLL_INTERVAL_SECONDS` | `30` | 采集间隔，最小 5 秒 |
| `POLL_TIMEOUT_MS` | `8000` | 单次上游请求超时 |
| `POLL_JITTER_RATIO` | `0.15` | 采集间隔随机抖动比例，范围 0～0.5 |
| `NOW_CACHE_SECONDS` | `10` | 实时接口缓存及失败冷却时长，范围 1～300 秒 |
| `RAW_RETENTION_HOURS` | `72` | 高频明细保留时长 |
| `MAINTENANCE_INTERVAL_MINUTES` | `60` | 聚合及清理周期 |
| `MAX_HISTORY_POINTS` | `400` | 历史接口目标最大点数 |
| `ICBC_URL` | ICBC 行情接口 | 覆盖上游地址，便于使用代理或测试服务 |
| `USER_AGENT` | 桌面 Chrome UA | 请求上游时使用的 User-Agent |
| `DISABLE_LEGACY_TLS` | `false` | 设为 `true` 时关闭旧版 TLS 兼容 |

数值配置会在 `src/lib/config.ts` 中进行合法性检查和上下限约束。

### ICBC TLS 兼容

默认 ICBC 接口需要 OpenSSL 的 legacy server connect。现代 Node.js 默认会拒绝这种旧版重协商，本项目通过全局 `undici` dispatcher 放开该兼容选项，但仍然校验证书。

只有当 `ICBC_URL` 指向支持现代 TLS 的代理或测试服务时，才应设置：

```bash
DISABLE_LEGACY_TLS=true
```

## Docker 部署

推荐使用 Compose，它会创建命名卷保存 SQLite 数据：

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

`docker compose down` 不会删除数据；`docker compose down -v` 会删除命名卷和其中的数据。

也可以手动运行：

```bash
docker build -t gold-price .
docker run -p 3000:3000 -v gold-data:/app/data gold-price
```

镜像以非 root 用户运行。Docker 健康检查每 30 秒请求一次 `/api/prices/latest`，因此也会在容器启动后触发采集器懒启动。

多架构构建：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/yourorg/gold-price:latest \
  --push .
```

## GitHub Actions 自动部署

推送到 `main` 后，[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) 会构建 amd64/arm64 镜像并发布到 GHCR，然后通过 SSH 按不可变的镜像 digest 更新服务。部署会等待健康检查，失败时自动回滚到更新前的镜像。镜像还包含 SBOM 和 provenance。

先在 GitHub 仓库创建名为 `production` 的 Environment（建议开启 required reviewers），再添加以下 Environment secrets：

| 名称 | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 部署服务器域名或 IP |
| `DEPLOY_USER` | 仅拥有该服务部署权限的系统用户 |
| `DEPLOY_SSH_KEY` | 专用 SSH 私钥，不要复用个人主密钥 |
| `DEPLOY_KNOWN_HOSTS` | 通过其他可信渠道核验过的服务器 host key；不要在 CI 中临时生成 |

最后创建 Repository variable `DEPLOY_ENABLED=true` 才会启用部署 job；未设置时，推送只构建和发布镜像，不连接服务器。可选 Environment variables 为 `DEPLOY_PORT`（默认 `22`）和 `DEPLOY_PATH`（默认 `/opt/gold-price`，必须是不含空格的绝对路径）。建议先完成服务器、密钥和 Environment protection 配置，最后再打开此开关。

服务器需安装 Docker 和 Compose v2，部署用户需能运行 `docker compose`。如果 GHCR package 是私有的，在服务器上使用一个仅有 `read:packages` 权限的凭据执行一次 `docker login ghcr.io`，不要把凭据写入仓库或 Actions 日志。运行时配置可保存在部署目录的 `.env` 中，权限会被设为 `600`；Actions 只在文件不存在时创建空文件，不会覆盖内容。生产 Compose 默认只监听 `127.0.0.1:3000`，应由同机反向代理提供 HTTPS；可在服务器 `.env` 中设置 `GOLD_PRICE_PORT` 改变宿主端口。若已有服务使用的 Docker 卷不叫 `gold-data`，首次部署前必须在 `.env` 中用 `GOLD_PRICE_VOLUME=现有卷名` 指向它，避免切换到新的空数据库。

发布 job 只使用 GitHub 自动生成的短期 `GITHUB_TOKEN`，权限限制为 `contents: read` 和 `packages: write`；SSH 密钥只提供给受 `production` Environment 保护的部署 job。启用前还应保护默认分支，并限制可修改 workflow 文件的人员。

## 备份与恢复

服务使用 SQLite WAL 模式，运行期间不要只复制主数据库文件。使用项目提供的在线备份脚本：

```bash
mkdir -p backups
docker run --rm --user "$(id -u):$(id -g)" \
  -v gold-data:/app/data \
  -v "$PWD/scripts/backup.mjs:/app/backup.mjs:ro" \
  -v "$PWD/backups:/backup" \
  gold-price node /app/backup.mjs /backup/gold.sqlite
```

恢复时先停止服务，将备份覆盖到数据卷中的 `gold.sqlite`，并移除旧的 `gold.sqlite-wal` 和 `gold.sqlite-shm`。具体检查和恢复提示见 `scripts/backup.mjs`。

## 目录结构

```text
src/
  app/
    api/prices/        API Route Handlers
    page.tsx           行情看板页面
    globals.css        全局样式
  components/          价格卡、走势图、区间切换等组件
  lib/
    bootstrap.ts       TLS 初始化及采集器懒启动
    config.ts          环境变量配置
    db.ts              SQLite schema、读写、聚合及清理
    icbc.ts            ICBC 请求客户端
    metals.ts          品种映射和展示元数据
    poller.ts          后台轮询与失败退避
scripts/
  backup.mjs           SQLite 在线备份
AGENTS.md              Codex/开发代理工作指南
Dockerfile             生产镜像
docker-compose.yml     本地容器部署
deploy/docker-compose.yml  自动部署使用的生产 Compose 定义
.github/workflows/deploy.yml  GHCR 构建与生产部署流水线
```

## 开发说明

详细的代码导航、关键不变量、常见修改路径和交付前验证清单见 [AGENTS.md](./AGENTS.md)。

当前仓库没有自动化测试套件。提交修改前至少运行：

```bash
npm run lint
npm run build
```

涉及采集、数据库或 API 的改动还应使用独立的临时 `DATA_DIR` 做一次运行验证，避免污染真实行情数据。

## License

[MIT](./LICENSE)
