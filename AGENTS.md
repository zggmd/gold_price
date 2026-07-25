# Codex Development Guide

本文件是 Codex 及其他开发代理在本仓库中工作的项目级指南。README 面向使用者；这里重点记录代码边界、关键不变量、推荐工作流和验证要求。

## Project Goal

本项目采集工商银行账户贵金属报价，将近期高频数据和长期小时聚合写入 SQLite，并通过 Next.js API 与 React 看板提供查询和展示。

除非任务明确要求，不要把项目扩展成交易系统、投资建议系统或通用行情平台。上游 ICBC 接口、8 个固定品种和轻量单机部署是当前设计边界。

## Runtime Model

- Next.js App Router 同时承载前端和 Route Handlers。
- 所有价格路由运行在 Node.js runtime；`better-sqlite3` 不能用于 Edge runtime。
- `src/lib/bootstrap.ts` 通过模块副作用启用 TLS 兼容并启动采集器。
- 采集器在第一次请求 `/api/prices/*` 时启动，而不是在 `next build` 时启动。
- `globalThis.__goldBootstrapped` 用于避免开发环境 HMR 创建重复轮询器。
- 一个服务进程只应存在一个采集循环。当前架构不适合无协调地启动多个副本写同一个数据库。

## Code Map

| 路径 | 职责 |
| --- | --- |
| `src/lib/config.ts` | 读取、校验和限制运行时配置 |
| `src/lib/legacy-tls.ts` | 配置全局 `undici` dispatcher |
| `src/lib/icbc.ts` | 请求并校验 ICBC 原始响应 |
| `src/lib/metals.ts` | 将 ICBC `dataId` 映射为稳定品种 Key 和展示元数据 |
| `src/lib/poller.ts` | 定时采集、超时、抖动、失败退避、维护调度 |
| `src/lib/db.ts` | schema、事务写入、查询、降采样、小时聚合和清理 |
| `src/lib/bootstrap.ts` | Node 进程级初始化 |
| `src/app/api/prices/*` | HTTP API 边界 |
| `src/app/page.tsx` | 首页状态、自动刷新和数据编排 |
| `src/components/*` | 无服务端副作用的展示组件 |
| `scripts/backup.mjs` | SQLite 在线备份 |

## Domain Invariants

修改采集、存储或 API 时必须保持以下约束：

1. 稳定标识使用 `<currency>-<metal>`，例如 `cny-gold`，不要使用上游中文名称作为数据库关联键。
2. 时间戳统一为 Unix epoch 毫秒。
3. 一个成功采集批次中的所有品种共享同一个 `fetched_at`。
4. 整批快照必须在 SQLite 事务中写入。
5. 无法识别的品种、非数字价格或结构异常的响应不能写入数据库。
6. 当前小时未结束前不能写入小时聚合。
7. 删除超期明细前，必须确保对应的已完成小时已经完成聚合。
8. `price_snapshots` 是近期数据的权威来源；`price_hourly.close` 用于补足较早历史。
9. `/api/prices/now` 是只读实时查询，不写数据库；持久化只由采集器负责。必须保留服务端缓存、并发请求合并及失败冷却，避免客户端绕过轮询周期打击上游。
10. 历史响应必须受 `MAX_HISTORY_POINTS` 控制，并保留序列首尾点。
11. ICBC TLS 兼容只放开旧版重协商，不应关闭证书校验。
12. 价格涨跌展示遵循涨红跌绿。

## Storage Notes

数据库包含两张业务表：

- `price_snapshots`：每次轮询、每个品种一行，默认只保留 72 小时。
- `price_hourly`：每个品种、每个完整小时一行，保存 OHLC 和样本数。

SQLite 使用 WAL、`synchronous=NORMAL` 和 5 秒 `busy_timeout`。开发或测试数据库结构时：

- 使用新的临时 `DATA_DIR` 或 `DB_PATH`。
- 不要提交 `.sqlite`、`-wal`、`-shm` 或备份文件。
- 不要直接复制正在运行的 WAL 数据库；使用 `scripts/backup.mjs`。
- schema 目前通过 `CREATE TABLE IF NOT EXISTS` 初始化，没有迁移框架。任何不向后兼容的 schema 修改都必须同时设计升级路径。

## Upstream Etiquette

ICBC 是外部上游，不要在开发验证中制造高频请求。

- 保持 `POLL_INTERVAL_SECONDS` 最小值为 5 秒。
- 保留请求超时、随机抖动和失败退避。
- 保持 `/api/prices/now` 的 `NOW_CACHE_SECONDS` 冷却和并发请求合并。
- UI 自动刷新读取本地持久化数据，不应每 30 秒直接请求 ICBC。
- 可重复的开发验证优先通过 `ICBC_URL` 指向本地 fixture/mock 服务。
- 不要把真实上游响应、Cookie、访问令牌或个人数据提交到仓库。

## Common Change Paths

### 增加或修改品种

1. 更新 `src/lib/types.ts` 中的领域类型（如果需要）。
2. 更新 `src/lib/metals.ts` 的代码映射、单位、精度、颜色和静态顺序。
3. 检查页面筛选和展示逻辑。
4. 验证最新价、历史接口及数据库 Key 保持一致。

不要仅修改前端名称；采集归一化和数据库 Key 才是数据链路的入口。

### 修改 ICBC 响应解析

1. 先调整 `IcbcItem`/`IcbcResponse` 类型。
2. 在 `src/lib/icbc.ts` 校验响应级错误。
3. 在 `src/lib/poller.ts` 和 `/api/prices/now` 保持相同的价格及涨跌幅转换语义。
4. 用 mock `ICBC_URL` 验证合法、缺字段、非数字和上游错误响应。

若解析逻辑继续增长，应提取共享的 normalization 函数，避免 poller 与 `now` 路由出现分歧。

### 修改历史查询或保留策略

重点检查：

- 原始数据与小时数据的边界是否重复或缺失。
- 小时 bucket 是否仍按 epoch 小时起点计算。
- 聚合 SQL 的 open/close 顺序是否由 `fetched_at` 决定。
- 降采样后是否保留最后一个点。
- `all` 区间在只有 raw、只有 hourly 及二者混合时是否正常。

### 修改前端

- `src/app/page.tsx` 是 client component，负责请求与刷新状态。
- 展示组件不要直接访问 SQLite、环境变量或 ICBC。
- 保持 loading、空数据、上游失败和中止请求路径可用。
- 响应式布局至少检查窄屏和桌面宽度。
- 图表颜色、单位和精度必须来自 `MetalMeta`，不要在组件中按名称推断。

### 修改启动或部署

`better-sqlite3` 是原生依赖。修改 Next.js 或 Docker 配置时必须确认：

- `serverExternalPackages` 仍包含 `better-sqlite3`。
- standalone 输出包含原生 `.node` binding。
- 运行镜像继续使用非 root 用户。
- `/app/data` 对运行用户可写并通过卷持久化。
- 构建阶段不会启动采集器或访问网络上游。

## Local Workflow

```bash
npm install
npm run dev
```

推荐为运行验证使用隔离目录：

```bash
DATA_DIR=/tmp/gold-price-dev npm run dev
```

不要在脚本或代码中假设开发端口固定可用；`PORT` 可以覆盖默认值。

## Validation

仓库当前没有自动化测试套件。根据改动范围执行相称的验证。

所有代码改动的最低要求：

```bash
npm run lint
npm run build
```

涉及 API、采集或数据库时，还要验证：

1. 使用临时 `DATA_DIR` 启动服务。
2. 请求 `/api/prices/latest` 能触发初始化且返回合法 JSON。
3. 使用 mock 上游时确认一个成功批次原子写入全部已识别品种。
4. 请求 `/api/prices/history` 验证合法和非法参数。
5. 运行维护逻辑后检查小时聚合与明细清理边界。
6. 确认关闭进程时数据库句柄能够正常释放。

涉及 UI 时，还要检查：

- 初次无数据状态。
- 价格卡选择和品种标签切换。
- 全部时间区间。
- 自动刷新开关与“立即刷新”。
- 上游失败提示。
- 图表 hover、单位、精度和涨跌颜色。

涉及 Docker 时执行：

```bash
docker build -t gold-price .
docker run --rm -p 3000:3000 -v gold-price-test:/app/data gold-price
```

不要在未经明确授权时删除真实数据卷。

## Documentation Rules

行为、配置或接口发生变化时，同一改动中更新：

- `README.md`：用户可见的功能、接口、环境变量和部署方式。
- `AGENTS.md`：开发流程、架构约束或验证方式。
- 源代码注释：只记录难以从代码本身看出的原因和约束。

文档中的默认值应以 `src/lib/config.ts` 为准，接口行为应以对应 Route Handler 为准。

## Delivery Checklist

完成任务前检查：

- 改动没有意外包含数据库、日志、备份或环境文件。
- 没有修改与任务无关的用户工作区内容。
- lint 和 build 已通过，或清楚说明未运行/失败原因。
- 数据模型、API 或配置变化已经同步到文档。
- 交付说明包含改动摘要、验证结果和剩余风险。
