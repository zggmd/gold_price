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

首次启动会立即采集一次，随后按间隔轮询。开发模式下 `instrumentation` 同样会启动采集器。

构建生产包：

```bash
npm run build        # 构建期间自动屏蔽采集器（DISABLE_GOLD_POLLER），不会联网
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
| `DISABLE_GOLD_POLLER` | `false` | 设为 `true` 不启动后台采集（构建时自动使用） |

> **关于 TLS**：ICBC 的接口需要 OpenSSL 的「legacy server connect」(unsafe legacy renegotiation)，
> 现代 Node 默认关闭，直接 `fetch` 会报 `ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`。
> 本项目通过全局 undici dispatcher 启用该选项（仍校验证书，仅放开旧版重协商），见 `src/lib/legacy-tls.ts`。

## Docker

单架构本地构建：

```bash
docker build -t gold-price .
docker run -p 3000:3000 -v gold-data:/app/data gold-price
```

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
- `/app/data` 声明为卷，持久化 SQLite；请挂载命名卷以保留历史数据。

## 目录结构

```
src/
  app/
    api/prices/{latest,now,history,metals}/route.ts   接口
    layout.tsx page.tsx globals.css                    页面
  components/   PriceCard / HistoryChart / Sparkline / RangeTabs
  lib/          config / types / metals / db / icbc / poller / legacy-tls / format
  instrumentation.ts      启动时配置 TLS 并拉起后台采集器
Dockerfile              多阶段、多架构
```

## 说明

- 价格涨跌配色遵循 A 股惯例：**涨红跌绿**（与 ICBC 返回的 `textColor` 语义一致）。
- 数据仅供展示，不构成投资建议。
