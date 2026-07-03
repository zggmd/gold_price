# 贵金属行情 · ICBC Gold Price

定期采集工商银行账户贵金属实时报价（黄金 / 白银 / 铂金 / 钯金，人民币 & 美元），本地持久化，
对外提供历史查询 API 与可视化看板。基于 **Next.js (App Router) + TypeScript + Tailwind**，
数据存储采用 **SQLite (better-sqlite3)**，提供多架构 Dockerfile。

## 功能

- **定时采集**：后台轮询 ICBC 接口，默认每 30 秒一次，写入 SQLite。
- **两级存储（轻量 + 可扩展）**：
  - `price_snapshots`：高频原始明细，按 `RAW_RETENTION_HOURS`（默认 72h）滚动清理，体积有上限。
  - `price_hourly`：按小时聚合成 OHLC，永久保存，每年仅约 7 万行——即便运行数年也不膨胀。
  - 维护任务周期性把已完成的小时明细折叠进聚合表，再清理过期明细。
- **历史查询 API**：按品种 + 时间区间查询，服务端自动降采样，长周期也不会返回海量点。
- **可视化看板**：八张实时价格卡片（含迷你走势线）、可交互的历史 K 线（自定义 SVG，鼠标悬停显示价格与时间）、品种与区间切换、自动刷新与「立即刷新」拉取实时价。
- **反爬友好**：真实浏览器 UA / 中文 Accept-Language / Referer、请求抖动（jitter）、失败指数退避、单请求超时。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/prices/latest` | 最近一次采集快照（全部品种）+ 迷你走势 + 库存统计 |
| GET | `/api/prices/now` | 实时透传 ICBC（不走采集，供「立即刷新」） |
| GET | `/api/prices/history?metal=cny-gold&range=24h` | 历史时序，`range` ∈ `1h 6h 24h 7d 30d 90d all` |
| GET | `/api/prices/metals` | 品种元数据 + 库存统计 |

`metal` 取值：`cny-gold cny-silver cny-platinum cny-palladium usd-gold usd-silver usd-platinum usd-palladium`。

## 本地开发

```bash
npm install
npm run dev          # http://localhost:3000
```

采集器在**首次请求接口时**自动启动（见 `src/lib/bootstrap.ts`，由 API 路由以副作用方式引入）。
因此打开页面或访问任意 `/api/prices/*` 即会触发首次采集，随后按间隔轮询。

构建生产包：

```bash
npm run build        # 采集器在首次请求时才启动，构建期间不会联网
npm start
```

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `DATA_DIR` | `./data` | SQLite 文件目录（Docker 中挂载为卷） |
| `DB_PATH` | `<DATA_DIR>/gold.sqlite` | 显式指定数据库文件路径 |
| `POLL_INTERVAL_SECONDS` | `30` | 采集间隔（秒），下限 5s，防止误配置打爆上游 |
| `POLL_TIMEOUT_MS` | `8000` | 单次请求超时 |
| `POLL_JITTER_RATIO` | `0.15` | ±15% 随机抖动，避免固定节奏被识别为恶意 |
| `RAW_RETENTION_HOURS` | `72` | 原始明细保留时长（小时），超期折叠为小时聚合后清理 |
| `MAINTENANCE_INTERVAL_MINUTES` | `60` | 聚合 / 清理任务执行间隔 |
| `MAX_HISTORY_POINTS` | `400` | 历史 API 返回点数上限（服务端降采样） |
| `ICBC_URL` | 工行接口 | 可替换为代理地址 |
| `USER_AGENT` | 桌面 Chrome | 请求 UA |
| `DISABLE_LEGACY_TLS` | `false` | 设为 `true` 关闭对 ICBC 旧版 TLS 重协商的兼容（仅当 ICBC_URL 指向现代代理时使用） |

> **关于 TLS**：ICBC 的接口需要 OpenSSL 的「legacy server connect」(unsafe legacy renegotiation)，
> 现代 Node 默认关闭，直接 `fetch` 会报 `ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`。
> 本项目通过全局 undici dispatcher 启用该选项（仍校验证书，仅放开旧版重协商），见 `src/lib/legacy-tls.ts`。

## Docker

> **数据持久化**：数据存在 SQLite 文件里，**不在镜像中**。重新 `docker build` 不会丢数据；
> 但 **删除/重建容器**（`docker rm`、`docker run --rm`）默认会丢——因为不显式挂载时
> Dockerfile 的 `VOLUME ["/app/data"]` 会建一个随容器销毁的**匿名卷**。
> 所以一定要显式挂载命名卷或绑定挂载（见下方 `docker-compose.yml`）。

推荐用 compose（自带命名卷 + 重启策略）：

```bash
docker compose up -d --build    # 构建并启动，数据落在 gold-data 命名卷
docker compose down             # 停止，数据保留（除非加 -v）
```

手动 `docker run` 时记得挂卷：

```bash
docker build -t gold-price .
# 命名卷（推荐，容器删了数据还在）
docker run -p 3000:3000 -v gold-data:/app/data gold-price
# 或绑定挂载到宿主机目录，方便直接拷贝
docker run -p 3000:3000 -v /opt/gold-data:/app/data gold-price
```

**备份与恢复**（在线热备，WAL 模式下比直接拷文件安全）：

```bash
mkdir -p backups
docker run --rm --user "$(id -u):$(id -g)" \
  -v gold-data:/app/data \
  -v "$PWD/scripts/backup.mjs:/app/backup.mjs:ro" \
  -v "$PWD/backups:/backup" \
  gold-price node /app/backup.mjs /backup/gold.sqlite
```

`--user` 让容器以你的宿主机 UID 运行，这样非 root 的镜像才能把备份写进你拥有的目录。

恢复时停掉服务，把备份覆盖回卷里的 `gold.sqlite`（并删掉 `-wal`/`-shm`），见 `scripts/backup.mjs` 注释。

多架构构建并推送（需要 buildx）：

```bash
docker buildx create --use --name multiarch   # 仅首次
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/yourorg/gold-price:latest \
  --push .
```

- 镜像采用多阶段构建 + Next.js `standalone` 输出，运行镜像精简。
- `better-sqlite3` 原生模块在构建阶段按目标架构编译，arm64 经 buildx 处理。
- **外置存储**：把 SQLite 文件放到网络盘/云盘只需挂载该目录并设 `DB_PATH`
  （如 NFS / 阿里云 NAS / AWS EFS）。当前不支持独立的 Postgres/MySQL 服务，需要时可在此基础上加存储抽象层。

## 目录结构

```
src/
  app/
    api/prices/{latest,now,history,metals}/route.ts   接口
    layout.tsx page.tsx globals.css                    页面
  components/   PriceCard / HistoryChart / Sparkline / RangeTabs
  lib/          config / types / metals / db / icbc / poller / legacy-tls / format / bootstrap
  bootstrap.ts         首次请求时配置 TLS 并拉起后台采集器（替代 instrumentation，兼容 dev）
Dockerfile              多阶段、多架构
```

## 说明

- 价格涨跌配色遵循 A 股惯例：**涨红跌绿**（与 ICBC 返回的 `textColor` 语义一致）。
- 数据仅供展示，不构成投资建议。
- 主要代码通过 Claude Code 配合 GLM-5.2 生成
