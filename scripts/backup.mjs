// Online (hot) backup of the SQLite database using better-sqlite3's native
// backup API, which produces a consistent snapshot while the poller keeps
// writing. Safer than copying gold.sqlite by hand, because in WAL mode the
// latest writes live in gold.sqlite-wal until checkpointed.
//
// Run inside the app image (it already bundles better-sqlite3). The volume with
// the live DB and a host directory for the backup file are both mounted.
// Run as your host UID (--user) so the image's non-root `nextjs` user can write
// the backup into your host-owned directory:
//
//   mkdir -p backups
//   docker run --rm --user "$(id -u):$(id -g)" \
//     -v gold-data:/app/data \
//     -v "$PWD/scripts/backup.mjs:/app/backup.mjs:ro" \
//     -v "$PWD/backups:/backup" \
//     gold-price:latest node /app/backup.mjs /backup/gold.sqlite
//
// To restore: stop the service, then copy the file back into the volume as
// gold.sqlite (and delete any gold.sqlite-wal / gold.sqlite-shm):
//   docker run --rm -v gold-data:/app/data -v "$PWD/backups:/backup" alpine \
//     sh -c 'cp /backup/gold.sqlite /app/data/gold.sqlite && rm -f /app/data/gold.sqlite-wal /app/data/gold.sqlite-shm'

import Database from 'better-sqlite3';

const src = process.env.DB_PATH || '/app/data/gold.sqlite';
const dest = process.argv[2];

if (!dest) {
  console.error('usage: node backup.mjs <destination.sqlite>');
  process.exit(1);
}

const db = new Database(src, { readonly: true, fileMustExist: true });
try {
  // better-sqlite3's backup() is async (v11+) — it walks the source in
  // setImmediate chunks so the poller can keep writing. Await it before close.
  await db.backup(dest);
  const rows = db.prepare('SELECT COUNT(*) AS n FROM price_snapshots').get();
  console.log(`backup ok: ${src} -> ${dest} (snapshots: ${rows.n})`);
} finally {
  db.close();
}
