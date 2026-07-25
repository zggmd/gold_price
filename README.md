# ICBC Precious Metals Price

[中文文档](./README.zh-CN.md)

A self-hosted ICBC account precious-metals price collector and dashboard. It periodically collects CNY and USD quotes for gold, silver, platinum, and palladium, stores them in SQLite, and exposes both a real-time dashboard and historical price APIs.

> The data is provided for informational purposes only and does not constitute investment advice.

## Features

- Collects 8 account precious-metal products: gold, silver, platinum, and palladium quoted in both CNY and USD.
- Polls ICBC every 30 seconds by default, with request timeouts, randomized jitter, and failure backoff.
- Displays current prices, change rates, sparklines, and an interactive historical chart.
- Supports `1h`, `6h`, `24h`, `7d`, `30d`, `90d`, and all-time ranges.
- Uses recent high-frequency snapshots plus long-term hourly OHLC storage to keep SQLite compact.
- Downsamples historical responses on the server to avoid oversized payloads.
- Provides short-lived server-side caching and request coalescing for direct live-price requests.
- Includes a multi-stage, multi-architecture Docker image and an online SQLite backup script.

## Technology

- Next.js 15 with the App Router
- React 19
- TypeScript
- Tailwind CSS
- SQLite with `better-sqlite3`
- `undici` for ICBC legacy TLS compatibility

## Quick Start

Requirements:

- Node.js 20 or later
- npm

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The background poller starts when an `/api/prices/*` endpoint is requested for the first time and immediately performs an initial poll. The dashboard may briefly show that it is waiting for data.

Available commands:

```bash
npm run dev       # Start the development server
npm run lint      # Run the configured Next.js lint command
npm run build     # Create a production build
npm start         # Start the production server
```

Runtime data is written to `./data/gold.sqlite` by default. The `data/` directory, backups, logs, and local environment files are ignored by Git.

## Architecture

```text
ICBC price endpoint
        │
        ▼
poller: fetch, validate, normalize
        │
        ▼
SQLite
  ├─ price_snapshots: recent high-frequency data
  └─ price_hourly: long-term hourly OHLC data
        │
        ▼
Next.js Route Handlers
        │
        ▼
React dashboard
```

The poller uses lazy initialization. API routes import `src/lib/bootstrap.ts`, which enables TLS compatibility and starts one polling loop in the current Node.js process.

By default, high-frequency snapshots are retained for 72 hours. A maintenance task rolls completed hours into OHLC records before deleting expired snapshots. Hourly records are retained indefinitely. SQLite runs in WAL mode to support reads while the poller writes.

## Supported Products

| Key | Product | Unit |
| --- | --- | --- |
| `cny-gold` | CNY account gold | CNY/gram |
| `cny-silver` | CNY account silver | CNY/gram |
| `cny-platinum` | CNY account platinum | CNY/gram |
| `cny-palladium` | CNY account palladium | CNY/gram |
| `usd-gold` | USD account gold | USD/ounce |
| `usd-silver` | USD account silver | USD/ounce |
| `usd-platinum` | USD account platinum | USD/ounce |
| `usd-palladium` | USD account palladium | USD/ounce |

The UI follows the convention commonly used in Chinese markets: red indicates an increase and green indicates a decrease.

## HTTP API

All endpoints are dynamic and opt out of Next.js response caching.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/prices/latest` | Latest persisted snapshot, sparklines, product metadata, and storage coverage |
| GET | `/api/prices/now` | Direct live-price request with a short server-side cache; does not write to SQLite |
| GET | `/api/prices/history?metal=cny-gold&range=24h` | Historical series for a product and time range |
| GET | `/api/prices/metals` | Product metadata and storage coverage |

History parameters:

- `metal`: one of the product keys listed above; defaults to `cny-gold`. Unknown values return HTTP 400.
- `range`: `1h | 6h | 24h | 7d | 30d | 90d | all`. Invalid values fall back to `24h`.

`/api/prices/now` is used by the dashboard's “refresh now” action. It does not update the persisted latest snapshot. Successful results are cached for 10 seconds by default, and concurrent requests share a single upstream request. After an upstream failure, the endpoint enters a cooldown for the same duration and returns HTTP 503 with a `Retry-After` header.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | SQLite directory; `/app/data` in Docker |
| `DB_PATH` | `<DATA_DIR>/gold.sqlite` | Explicit SQLite database path |
| `POLL_INTERVAL_SECONDS` | `30` | Polling interval; minimum 5 seconds |
| `POLL_TIMEOUT_MS` | `8000` | Timeout for an upstream request |
| `POLL_JITTER_RATIO` | `0.15` | Random polling jitter ratio, from 0 to 0.5 |
| `NOW_CACHE_SECONDS` | `10` | Live endpoint cache and failure cooldown, from 1 to 300 seconds |
| `RAW_RETENTION_HOURS` | `72` | High-frequency snapshot retention |
| `MAINTENANCE_INTERVAL_MINUTES` | `60` | Aggregation and cleanup interval |
| `MAX_HISTORY_POINTS` | `400` | Target maximum number of historical response points |
| `ICBC_URL` | ICBC price endpoint | Override the upstream URL for a proxy or test service |
| `USER_AGENT` | Desktop Chrome UA | User-Agent sent to ICBC |
| `DISABLE_LEGACY_TLS` | `false` | Set to `true` to disable legacy TLS compatibility |

Numeric configuration is validated and clamped to safe ranges in `src/lib/config.ts`.

### ICBC TLS Compatibility

The default ICBC endpoint requires OpenSSL legacy server connect. Modern Node.js versions reject this old renegotiation mode by default. This project enables the compatibility option through a global `undici` dispatcher while continuing to validate the server certificate.

Only disable the compatibility option when `ICBC_URL` points to a proxy or test service with modern TLS:

```bash
DISABLE_LEGACY_TLS=true
```

## Docker

Docker Compose is recommended because it creates a named volume for SQLite:

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

`docker compose down` preserves the data. `docker compose down -v` deletes the named volume and its data.

You can also run the image directly:

```bash
docker build -t gold-price .
docker run -p 3000:3000 -v gold-data:/app/data gold-price
```

The image runs as a non-root user. Its health check requests `/api/prices/latest` every 30 seconds, which also triggers lazy poller initialization after the container starts.

Build and push a multi-architecture image:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/yourorg/gold-price:latest \
  --push .
```

## Backup and Restore

The service uses SQLite WAL mode, so do not copy only the main database file while the service is running. Use the online backup script:

```bash
mkdir -p backups
docker run --rm --user "$(id -u):$(id -g)" \
  -v gold-data:/app/data \
  -v "$PWD/scripts/backup.mjs:/app/backup.mjs:ro" \
  -v "$PWD/backups:/backup" \
  gold-price node /app/backup.mjs /backup/gold.sqlite
```

To restore a backup, stop the service, replace `gold.sqlite` in the data volume, and remove old `gold.sqlite-wal` and `gold.sqlite-shm` files. See `scripts/backup.mjs` for additional checks and restore notes.

## Project Layout

```text
src/
  app/
    api/prices/        API Route Handlers
    page.tsx           Dashboard page
    globals.css        Global styles
  components/          Price cards, charts, and range controls
  lib/
    bootstrap.ts       TLS setup and lazy poller initialization
    config.ts          Environment configuration
    db.ts              SQLite schema, queries, aggregation, and cleanup
    icbc.ts            ICBC API client
    metals.ts          Product mapping and display metadata
    poller.ts          Background polling and failure backoff
scripts/
  backup.mjs           Online SQLite backup
AGENTS.md              Codex/development-agent guide
README.zh-CN.md        Chinese documentation
Dockerfile             Production image
docker-compose.yml     Container deployment
```

## Development

See [AGENTS.md](./AGENTS.md) for code navigation, architectural constraints, common change paths, and the delivery checklist.

The repository currently has no automated test suite. Before submitting code changes, run:

```bash
npx tsc --noEmit
npm run build
```

For changes involving collection, storage, or APIs, use a separate temporary `DATA_DIR` during runtime verification to avoid modifying real price data.

## License

[MIT](./LICENSE)
